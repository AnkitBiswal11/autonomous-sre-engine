const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();

const corsOriginValidator = (origin, callback) => {
  if (
    !origin ||
    origin === 'http://localhost:5173' ||
    origin === 'https://autonomous-sre-engine.vercel.app' ||
    origin.endsWith('.vercel.app')
  ) {
    callback(null, true);
  } else {
    callback(new Error('Blocked by CORS policy'));
  }
};

app.use(cors({
  origin: corsOriginValidator,
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOriginValidator,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'incident_engine_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' 
    ? { rejectUnauthorized: false } 
    : undefined
});

app.get('/', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'autonomous-sre-gateway',
    timestamp: new Date()
  });
});

let activeFailureService = null;
let isAutonomousMode = false;
let simulateRemediationFailure = false;

let isChaosSchedulerActive = false;
const CHAOS_INTERVAL_SECONDS = 45;
let chaosCountdown = CHAOS_INTERVAL_SECONDS;

const METRIC_HISTORY_WINDOW = 30;
const rollingMetrics = [];
let anomalyStreak = 0;
let dynamicIncidentCooldown = false;

const SERVICE_DEPENDENCY_GRAPH = {
  DATABASE_CORE: { dependsOn: [], upstream: ['PAYMENT_SERVICE', 'AUTH_SERVICE'] },
  AUTH_SERVICE: { dependsOn: ['DATABASE_CORE'], upstream: ['ORDER_SERVICE', 'PAYMENT_SERVICE'] },
  PAYMENT_SERVICE: { dependsOn: ['AUTH_SERVICE', 'DATABASE_CORE'], upstream: ['ORDER_SERVICE'] },
  ORDER_SERVICE: { dependsOn: ['AUTH_SERVICE', 'PAYMENT_SERVICE'], upstream: [] }
};

const SERVICE_ID_MAP = {
  DATABASE_CORE: 1,
  AUTH_SERVICE: 2,
  PAYMENT_SERVICE: 3,
  ORDER_SERVICE: 4
};

const CHAOS_SCENARIOS = [
  {
    id: 'INC-101',
    serviceName: 'PAYMENT_SERVICE',
    errorSummary: 'HTTP 500: Database connection pool exhausted under load',
    label: 'Payment Service: DB Pool Exhaustion'
  },
  {
    id: 'INC-204',
    serviceName: 'AUTH_SERVICE',
    errorSummary: 'HTTP 504: Expired token refresh deadlock in Redis cluster',
    label: 'Auth Service: Redis Lock Timeout'
  },
  {
    id: 'INC-308',
    serviceName: 'ORDER_SERVICE',
    errorSummary: 'HTTP 502: Bad Gateway, upstream inventory latency > 5000ms',
    label: 'Order Service: Upstream Cascading Latency'
  }
];

function calculateBlastRadius(failedService) {
  if (!failedService || !SERVICE_DEPENDENCY_GRAPH[failedService]) return [];
  const visited = new Set();
  const queue = [...SERVICE_DEPENDENCY_GRAPH[failedService].upstream];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!visited.has(current)) {
      visited.add(current);
      if (SERVICE_DEPENDENCY_GRAPH[current]) {
        queue.push(...SERVICE_DEPENDENCY_GRAPH[current].upstream);
      }
    }
  }
  return Array.from(visited);
}

const NOTIFICATION_WEBHOOK_URL = process.env.NOTIFICATION_WEBHOOK_URL || '';

async function dispatchExternalAlert({ title, description, color, fields }) {
  if (!NOTIFICATION_WEBHOOK_URL) return;

  try {
    const payload = {
      embeds: [
        {
          title,
          description,
          color: color || 15158332,
          fields: fields || [],
          timestamp: new Date().toISOString(),
          footer: { text: "Autonomous SRE Platform • Auto-Diagnostic Engine" }
        }
      ]
    };

    await axios.post(NOTIFICATION_WEBHOOK_URL, payload, { timeout: 5000 });
  } catch (err) {
    console.warn('[NOTIFICATION ERROR] Failed to send outbound webhook:', err.message);
  }
}

function calculateStats(values) {
  if (values.length < 5) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { mean, stdDev };
}

async function verifyServiceRecovery(serviceName, incidentId) {
  const probes = [
    { step: 1, name: 'Pod Liveness & Readiness Check', endpoint: '/healthz' },
    { step: 2, name: 'Downstream Connection Handshake', endpoint: '/ready' },
    { step: 3, name: 'Synthetic Traffic Latency Baseline', endpoint: '/metrics/p99' }
  ];

  io.emit('agent:step', {
    incidentId,
    stepLog: `[VERIFICATION] Initiating automated synthetic canary probes for ${serviceName}...`,
    status: 'VERIFYING',
    timestamp: new Date()
  });

  for (const probe of probes) {
    await new Promise((res) => setTimeout(res, 800));

    io.emit('probe:update', {
      incidentId,
      step: probe.step,
      name: probe.name,
      status: 'RUNNING'
    });

    await new Promise((res) => setTimeout(res, 600));

    if (simulateRemediationFailure && probe.step === 2) {
      io.emit('probe:update', {
        incidentId,
        step: probe.step,
        name: probe.name,
        status: 'FAILED'
      });

      io.emit('agent:step', {
        incidentId,
        stepLog: `[PROBE ${probe.step}/3 FAILED] ${probe.name} check failed on${probe.endpoint}.`,
        status: 'FAILED',
        timestamp: new Date()
      });

      return false;
    }

    io.emit('probe:update', {
      incidentId,
      step: probe.step,
      name: probe.name,
      status: 'PASSED'
    });

    io.emit('agent:step', {
      incidentId,
      stepLog: `[PROBE ${probe.step}/3 PASSED]${probe.name} responded OK.`,
      status: 'VERIFYING',
      timestamp: new Date()
    });
  }

  return true;
}

async function executeRemediation(id) {
  let serviceName = 'PAYMENT_SERVICE';
  try {
    const [incRows] = await pool.query(
      'SELECT i.id, s.name as service_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id WHERE i.id = ?',
      [id]
    );
    if (incRows.length > 0 && incRows[0].service_name) {
      serviceName = incRows[0].service_name;
    }
  } catch (err) {
    console.warn('[REMEDIATION DB LOOKUP ERROR]:', err.message);
  }

  const actions = {
    PAYMENT_SERVICE: 'git revert b78d21c --no-edit && kubectl rollout restart deployment/payment-service',
    AUTH_SERVICE: 'redis-cli -h cluster-02 FLUSHDB && git revert a14f92e --no-edit',
    ORDER_SERVICE: 'kubectl set env deployment/order-service CLIENT_TIMEOUT_MS=10000 && kubectl rollout restart deployment/order-service'
  };
  const executedCommand = actions[serviceName] || `kubectl rollout restart deployment/${serviceName.toLowerCase()}`;

  io.emit('agent:step', {
    incidentId: id,
    stepLog: `[REMEDIATION] Applying playbook: \`${executedCommand}\``,
    status: 'REMEDIATING',
    timestamp: new Date()
  });

  const recoveryVerified = await verifyServiceRecovery(serviceName, id);

  if (recoveryVerified) {
    try {
      await pool.query(
        'UPDATE incidents SET status = ?, resolved_at = NOW() WHERE id = ?',
        ['RESOLVED', id]
      );
      await pool.query(
        'UPDATE rca_reports SET approval_status = ? WHERE incident_id = ?',
        ['APPROVED', id]
      );
    } catch (dbErr) {
      console.error('[DB UPDATE ERROR ON RESOLUTION]:', dbErr.message);
    }

    activeFailureService = null;
    io.emit('incident:resolved', { incidentId: id, status: 'RESOLVED', action: executedCommand });

    dispatchExternalAlert({
      title: `✅ Remediation & Canary Verified: ${id}`,
      description: `Target service ${serviceName} passed all synthetic canary checks. Service restored to baseline.`,
      color: 3066993,
      fields: [
        { name: "Service", value: serviceName, inline: true },
        { name: "Execution Mode", value: isAutonomousMode ? "Autonomous (Zero-Touch)" : "Human-in-the-Loop", inline: true },
        { name: "Canary Probes", value: "3/3 Healthy", inline: true },
        { name: "Executed Action", value: `\`${executedCommand}\``, inline: false }
      ]
    });

    return executedCommand;
  } else {
    const rollbackCommand = `kubectl rollout undo deployment/${serviceName.toLowerCase()} && docker-compose restart${serviceName.toLowerCase()}`;

    io.emit('agent:step', {
      incidentId: id,
      stepLog: `[CIRCUIT BREAKER TRIPPED] Canary failed! Auto-rolling back: \`${rollbackCommand}\``,
      status: 'ROLLING_BACK',
      timestamp: new Date()
    });

    try {
      await pool.query(
        'UPDATE incidents SET status = ?, resolved_at = NULL WHERE id = ?',
        ['ESCALATED', id]
      );
      await pool.query(
        'UPDATE rca_reports SET approval_status = ? WHERE incident_id = ?',
        ['REJECTED', id]
      );
    } catch (dbErr) {
      console.error('[DB UPDATE ERROR ON ESCALATION]:', dbErr.message);
    }

    io.emit('incident:escalated', {
      incidentId: id,
      status: 'ESCALATED',
      reason: 'Synthetic canary check failed at dependency handshake phase',
      rollbackAction: rollbackCommand
    });

    dispatchExternalAlert({
      title: `🚨 EMERGENCY ESCALATION: Canary Failed on ${id}`,
      description: `Auto-healing failed synthetic verification. Circuit-breaker executed emergency rollback: \`${rollbackCommand}\`. Immediate SRE intervention required.`,
      color: 15158332,
      fields: [
        { name: "Service", value: serviceName, inline: true },
        { name: "Circuit Breaker", value: "TRIPPED (Rollback Applied)", inline: true },
        { name: "Rollback Command", value: `\`${rollbackCommand}\``, inline: false }
      ]
    });

    throw new Error('Canary probe verification failed; emergency rollback executed.');
  }
}

async function triggerIncident(incidentId, serviceName, errorSummary) {
  activeFailureService = serviceName;
  const blastRadius = calculateBlastRadius(serviceName);
  const serviceId = SERVICE_ID_MAP[serviceName] || 3;

  try {
    await pool.query(
      `INSERT INTO incidents (id, service_id, error_summary, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, NOW(), NULL)
       ON DUPLICATE KEY UPDATE 
         service_id = VALUES(service_id),
         error_summary = VALUES(error_summary),
         status = VALUES(status),
         created_at = NOW(),
         resolved_at = NULL`,
      [incidentId, serviceId, errorSummary, 'INVESTIGATING']
    );
  } catch (dbErr) {
    console.warn('[DB WARN] Could not update incident start state:', dbErr.message);
  }

  io.emit('incident:triggered', {
    incidentId,
    serviceName,
    errorSummary,
    blastRadius,
    timestamp: new Date()
  });

  dispatchExternalAlert({
    title: `🚨 Outage Alert: ${incidentId} [${serviceName}]`,
    description: `Critical failure detected. Autonomous AI investigation has been initiated.`,
    color: 15158332,
    fields: [
      { name: "Target Service", value: serviceName, inline: true },
      { name: "Severity", value: "P1_CRITICAL", inline: true },
      { name: "Blast Radius", value: blastRadius.length > 0 ? blastRadius.join(', ') : "Isolated to service", inline: true },
      { name: "Policy Mode", value: isAutonomousMode ? "Autonomous Auto-Heal ON" : "Human Approval Needed", inline: true },
      { name: "Error Summary", value: errorSummary || "N/A" }
    ]
  });

  axios.post(`${process.env.AI_ENGINE_URL || 'http://localhost:8000'}/api/analyze`, {
    incident_id: incidentId,
    service_name: serviceName,
    incidentId: incidentId,
    serviceName: serviceName
  }).catch((err) => console.error("Failed to reach AI engine:", err.message));
}

io.on('connection', (socket) => {
  socket.emit('policy:mode', { isAutonomousMode });
  socket.emit('policy:fail_mode', { simulateRemediationFailure });
  socket.emit('policy:chaos_scheduler', { isChaosSchedulerActive, countdown: chaosCountdown });
});

app.post('/api/policy/toggle-mode', (req, res) => {
  const { enabled } = req.body;
  isAutonomousMode = Boolean(enabled);
  io.emit('policy:mode', { isAutonomousMode });
  res.json({ success: true, isAutonomousMode });
});

app.post('/api/policy/toggle-fail-mode', (req, res) => {
  const { enabled } = req.body;
  simulateRemediationFailure = Boolean(enabled);
  io.emit('policy:fail_mode', { simulateRemediationFailure });
  res.json({ success: true, simulateRemediationFailure });
});

app.post('/api/policy/toggle-chaos-scheduler', (req, res) => {
  const { enabled } = req.body;
  isChaosSchedulerActive = Boolean(enabled);
  chaosCountdown = CHAOS_INTERVAL_SECONDS;
  io.emit('policy:chaos_scheduler', { isChaosSchedulerActive, countdown: chaosCountdown });
  res.json({ success: true, isChaosSchedulerActive });
});

app.get('/api/chaos/scenarios', (req, res) => {
  res.json(CHAOS_SCENARIOS);
});

app.post('/api/alerts/webhook', async (req, res) => {
  const { incidentId, serviceName, errorSummary } = req.body;
  await triggerIncident(incidentId, serviceName, errorSummary);
  res.status(202).json({ status: 'ACCEPTED', incidentId });
});

app.post('/api/internal/agent-trace', (req, res) => {
  const { incidentId, stepLog, status } = req.body;
  io.emit('agent:step', { incidentId, stepLog, status, timestamp: new Date() });
  res.sendStatus(200);
});

app.post('/api/internal/rca-report', async (req, res) => {
  const { incidentId, reportMarkdown, culpritCommit, suggestedFix } = req.body;

  try {
    const query = `
      INSERT INTO rca_reports (incident_id, report_markdown, culprit_commit, suggested_fix, approval_status, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        report_markdown = VALUES(report_markdown),
        culprit_commit = VALUES(culprit_commit),
        suggested_fix = VALUES(suggested_fix),
        updated_at = NOW()
    `;

    await pool.query(query, [
      incidentId,
      reportMarkdown,
      culpritCommit || 'UNKNOWN',
      suggestedFix || 'Refer to report markdown',
      'PENDING'
    ]);

    dispatchExternalAlert({
      title: `📋 Root Cause Identified: ${incidentId}`,
      description: `Autonomous agent completed diagnostics and isolated culprit commit.`,
      color: 15844367,
      fields: [
        { name: "Culprit Commit", value: `\`${culpritCommit || 'UNKNOWN'}\``, inline: true },
        { name: "Approval Status", value: isAutonomousMode ? "⚡ Autonomous Auto-Heal Initiating..." : "Pending SRE Review", inline: true }
      ]
    });

    if (isAutonomousMode) {
      io.emit('policy:auto_healing_scheduled', { incidentId, delayMs: 3000 });

      setTimeout(async () => {
        try {
          await executeRemediation(incidentId);
        } catch (err) {
          console.error('[AUTO-HEAL FAIL / ESCALATED]:', err.message);
        }
      }, 3000);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[DB RCA SAVE ERROR]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/incidents/:id/approve', async (req, res) => {
  const { id } = req.params;
  try {
    const executedCommand = await executeRemediation(id);
    res.json({ success: true, message: `Playbook executed: ${executedCommand}` });
  } catch (err) {
    console.error('[DB APPROVAL / PROBE ERROR]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/incidents/:id/generate-pr', async (req, res) => {
  const { id } = req.params;
  try {
    const [incRows] = await pool.query(
      'SELECT i.id, s.name as service_name, r.report_markdown, r.culprit_commit FROM incidents i JOIN services s ON i.service_id = s.id LEFT JOIN rca_reports r ON i.id = r.incident_id WHERE i.id = ?',
      [id]
    );

    if (incRows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const inc = incRows[0];
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

    const aiRes = await axios.post(`${aiEngineUrl}/api/generate-fix-pr`, {
      incident_id: inc.id,
      service_name: inc.service_name,
      rca_context: inc.report_markdown || 'Root cause analyzed.',
      culprit_commit: inc.culprit_commit || 'b78d21c'
    });

    res.json(aiRes.data);
  } catch (err) {
    console.error('[PR GENERATION ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to generate pull request draft' });
  }
});

app.get('/api/incidents', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        i.id,
        COALESCE(s.name, 'PAYMENT_SERVICE') AS service_name,
        i.error_summary,
        i.status,
        i.created_at,
        i.resolved_at,
        TIMESTAMPDIFF(SECOND, i.created_at, i.resolved_at) AS resolution_seconds
      FROM incidents i
      LEFT JOIN services s ON i.service_id = s.id
      ORDER BY i.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[DB AUDIT FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch incident audit history' });
  }
});

app.get('/api/incidents/:id/rca', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT incident_id, culprit_commit, suggested_fix, report_markdown, approval_status, created_at, updated_at FROM rca_reports WHERE incident_id = ?',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No RCA post-mortem found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[DB RCA FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to retrieve RCA report' });
  }
});

app.get('/api/analytics/metrics', async (req, res) => {
  try {
    const [summaryRows] = await pool.query(`
      SELECT 
        COUNT(*) as total_incidents,
        COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) as resolved_incidents,
        COUNT(CASE WHEN status = 'ESCALATED' THEN 1 END) as escalated_incidents,
        AVG(CASE WHEN status = 'RESOLVED' THEN TIMESTAMPDIFF(SECOND, created_at, resolved_at) END) as avg_mttr_seconds,
        SUM(CASE WHEN status = 'RESOLVED' THEN TIMESTAMPDIFF(SECOND, created_at, resolved_at) ELSE 0 END) as total_outage_seconds
      FROM incidents
    `);

    const [serviceBreakdown] = await pool.query(`
      SELECT 
        s.name as service_name,
        COUNT(i.id) as incident_count
      FROM services s
      LEFT JOIN incidents i ON s.id = i.service_id
      GROUP BY s.name
    `);

    const summary = summaryRows[0] || {};
    const totalOutageSecs = Number(summary.total_outage_seconds || 0);
    const slaCompliance = Math.max(95.0, Number((100 - (totalOutageSecs / 2592000) * 100).toFixed(2)));

    res.json({
      totalIncidents: Number(summary.total_incidents || 0),
      resolvedIncidents: Number(summary.resolved_incidents || 0),
      escalatedIncidents: Number(summary.escalated_incidents || 0),
      avgMttrSeconds: Math.round(summary.avg_mttr_seconds || 0),
      slaCompliance,
      serviceBreakdown
    });
  } catch (err) {
    console.error('[ANALYTICS ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to aggregate MTTR analytics' });
  }
});

setInterval(async () => {
  if (!isChaosSchedulerActive) return;

  if (activeFailureService) {
    chaosCountdown = CHAOS_INTERVAL_SECONDS;
    io.emit('policy:chaos_countdown', { countdown: chaosCountdown, paused: true });
    return;
  }

  chaosCountdown -= 1;
  io.emit('policy:chaos_countdown', { countdown: chaosCountdown, paused: false });

  if (chaosCountdown <= 0) {
    chaosCountdown = CHAOS_INTERVAL_SECONDS;
    const scenario = CHAOS_SCENARIOS[Math.floor(Math.random() * CHAOS_SCENARIOS.length)];
    await triggerIncident(scenario.id, scenario.serviceName, `[AUTONOMOUS CHAOS] ${scenario.errorSummary}`);
  }
}, 1000);

setInterval(async () => {
  const isDown = Boolean(activeFailureService);
  const currentLatency = isDown
    ? Math.floor(4500 + Math.random() * 1200)
    : Math.floor(45 + Math.random() * 30);
  const currentErrorRate = isDown
    ? Number((28.5 + Math.random() * 14).toFixed(1))
    : Number((0.02 + Math.random() * 0.05).toFixed(2));

  rollingMetrics.push(currentLatency);
  if (rollingMetrics.length > METRIC_HISTORY_WINDOW) {
    rollingMetrics.shift();
  }

  const { mean, stdDev } = calculateStats(rollingMetrics);
  const upperThreshold = stdDev > 0 ? Math.round(mean + 2.5 * stdDev) : 150;
  const zScore = stdDev > 0 ? ((currentLatency - mean) / stdDev).toFixed(2) : 0;
  const isAnomaly = zScore > 2.5 && currentLatency > 300;

  const dataPoint = {
    time: new Date().toLocaleTimeString(),
    latency: currentLatency,
    errorRate: currentErrorRate,
    threshold: upperThreshold,
    zScore: Number(zScore),
    isAnomaly,
    activeService: activeFailureService || 'ALL_HEALTHY'
  };

  io.emit('telemetry:tick', dataPoint);

  if (isAnomaly && !dynamicIncidentCooldown && !activeFailureService) {
    anomalyStreak += 1;
    if (anomalyStreak >= 2) {
      dynamicIncidentCooldown = true;
      anomalyStreak = 0;

      const dynamicId = `INC-AUTO-${Date.now().toString().slice(-4)}`;
      const detectedService = 'PAYMENT_SERVICE';

      try {
        await pool.query(
          `INSERT INTO incidents (id, service_id, error_summary, status, created_at)
           VALUES (?, 3, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE status = ?, created_at = NOW(), resolved_at = NULL`,
          [
            dynamicId,
            `Autonomous Alert: Metric deviation Z-Score ${zScore} exceeded baseline.`,
            'INVESTIGATING',
            'INVESTIGATING'
          ]
        );
      } catch (dbErr) {
        console.warn('[ANOMALY DB WARN]:', dbErr.message);
      }

      await triggerIncident(dynamicId, detectedService, `Statistical Anomaly: P99 Latency (${currentLatency}ms) breached baseline (+${zScore}σ)`);

      setTimeout(() => {
        dynamicIncidentCooldown = false;
      }, 30000);
    }
  } else if (!isAnomaly) {
    anomalyStreak = 0;
  }
}, 2000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Gateway listening on port ${PORT}`));