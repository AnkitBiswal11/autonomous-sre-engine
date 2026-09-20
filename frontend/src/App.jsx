import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const socket = io('http://localhost:5000');

export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [activeIncident, setActiveIncident] = useState(null);
  const [traceLogs, setTraceLogs] = useState([]);
  const [rcaReport, setRcaReport] = useState('');
  const [incidentStatus, setIncidentStatus] = useState('IDLE');
  const [telemetryData, setTelemetryData] = useState([]);
  const [auditLedger, setAuditLedger] = useState([]);
  const [isGatewayOnline, setIsGatewayOnline] = useState(socket.connected);

  // Autonomous Self-Healing Mode State
  const [isAutonomousMode, setIsAutonomousMode] = useState(false);
  const [autoHealCountdown, setAutoHealCountdown] = useState(null);

  // Background Chaos Monkey Scheduler State
  const [isChaosSchedulerActive, setIsChaosSchedulerActive] = useState(false);
  const [chaosNextStrikeCountdown, setChaosNextStrikeCountdown] = useState(null);
  const [isChaosPaused, setIsChaosPaused] = useState(false);

  // Circuit Breaker Failure Simulation State
  const [simulateFailMode, setSimulateFailMode] = useState(false);
  const [escalationDetails, setEscalationDetails] = useState(null);

  // Blast Radius State
  const [blastRadiusServices, setBlastRadiusServices] = useState([]);

  // Synthetic Canary Probes State
  const [canaryProbes, setCanaryProbes] = useState([]);

  // SRE Follow-up Diagnostic Chat State (Multi-Turn)
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);

  // Historical RCA Post-Mortem Modal State
  const [selectedAuditReport, setSelectedAuditReport] = useState(null);

  // Automated Remediation PR State
  const [prDraft, setPrDraft] = useState(null);
  const [isGeneratingPR, setIsGeneratingPR] = useState(false);

  // Executive MTTR & SLA Analytics State
  const [analytics, setAnalytics] = useState({
    totalIncidents: 0,
    resolvedIncidents: 0,
    escalatedIncidents: 0,
    avgMttrSeconds: 0,
    slaCompliance: 99.95,
    serviceBreakdown: []
  });

  useEffect(() => {
    fetchScenarios();
    fetchAuditLedger();
    fetchAnalytics();

    if (socket.connected) {
      setIsGatewayOnline(true);
    }

    socket.on('connect', () => setIsGatewayOnline(true));
    socket.on('disconnect', () => setIsGatewayOnline(false));

    socket.on('policy:mode', (data) => {
      setIsAutonomousMode(data.isAutonomousMode);
    });

    socket.on('policy:fail_mode', (data) => {
      setSimulateFailMode(data.simulateRemediationFailure);
    });

    socket.on('policy:chaos_scheduler', (data) => {
      setIsChaosSchedulerActive(data.isChaosSchedulerActive);
      setChaosNextStrikeCountdown(data.countdown);
    });

    socket.on('policy:chaos_countdown', (data) => {
      setChaosNextStrikeCountdown(data.countdown);
      setIsChaosPaused(data.paused);
    });

    socket.on('policy:auto_healing_scheduled', (data) => {
      let secondsLeft = 3;
      setAutoHealCountdown(secondsLeft);
      const timer = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft <= 0) {
          clearInterval(timer);
          setAutoHealCountdown(null);
        } else {
          setAutoHealCountdown(secondsLeft);
        }
      }, 1000);
    });

    socket.on('probe:update', (probe) => {
      setCanaryProbes((prev) => {
        const existing = prev.filter((p) => p.step !== probe.step);
        return [...existing, probe].sort((a, b) => a.step - b.step);
      });
    });

    socket.on('telemetry:tick', (point) => {
      setTelemetryData((prev) => [...prev.slice(-15), point]);
    });

    socket.on('incident:triggered', (data) => {
      setActiveIncident(data);
      setIncidentStatus('INVESTIGATING');
      setTraceLogs([]);
      setRcaReport('');
      setChatHistory([]);
      setAutoHealCountdown(null);
      setCanaryProbes([]);
      setEscalationDetails(null);
      setPrDraft(null);
      setBlastRadiusServices(data.blastRadius || []);
    });

    socket.on('agent:step', (data) => {
      setTraceLogs((prev) => [...prev, data.stepLog]);
      if (data.status === 'COMPLETED' && data.stepLog.startsWith('Conclusion:')) {
        const markdown = data.stepLog.replace('Conclusion:', '').trim();
        setRcaReport(markdown);
        setIncidentStatus('WAITING_APPROVAL');
      } else if (data.status === 'REMEDIATING') {
        setIncidentStatus('REMEDIATING');
        setAutoHealCountdown(null);
      } else if (data.status === 'VERIFYING') {
        setIncidentStatus('VERIFYING');
      } else if (data.status === 'ROLLING_BACK') {
        setIncidentStatus('ROLLING_BACK');
      }
    });

    socket.on('incident:resolved', () => {
      setIncidentStatus('RESOLVED');
      setAutoHealCountdown(null);
      setBlastRadiusServices([]);
      fetchAuditLedger();
      fetchAnalytics();
    });

    socket.on('incident:escalated', (data) => {
      setIncidentStatus('ESCALATED');
      setAutoHealCountdown(null);
      setEscalationDetails(data);
      fetchAuditLedger();
      fetchAnalytics();
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('policy:mode');
      socket.off('policy:fail_mode');
      socket.off('policy:chaos_scheduler');
      socket.off('policy:chaos_countdown');
      socket.off('policy:auto_healing_scheduled');
      socket.off('probe:update');
      socket.off('telemetry:tick');
      socket.off('incident:triggered');
      socket.off('agent:step');
      socket.off('incident:resolved');
      socket.off('incident:escalated');
    };
  }, []);

  const fetchScenarios = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/chaos/scenarios');
      setScenarios(res.data);
      if (res.data.length > 0) setSelectedScenario(res.data[0].id);
    } catch (err) {
      console.error('Failed to load scenarios:', err.message);
    }
  };

  const fetchAuditLedger = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/incidents');
      setAuditLedger(res.data);
    } catch (err) {
      console.error('Failed to load audit ledger:', err.message);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/analytics/metrics');
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to load analytics:', err.message);
    }
  };

  const toggleAutonomousMode = async () => {
    try {
      const nextMode = !isAutonomousMode;
      await axios.post('http://localhost:5000/api/policy/toggle-mode', { enabled: nextMode });
      setIsAutonomousMode(nextMode);
    } catch (err) {
      console.error('Failed to toggle policy mode:', err.message);
    }
  };

  const toggleFailMode = async () => {
    try {
      const nextMode = !simulateFailMode;
      await axios.post('http://localhost:5000/api/policy/toggle-fail-mode', { enabled: nextMode });
      setSimulateFailMode(nextMode);
    } catch (err) {
      console.error('Failed to toggle failure test mode:', err.message);
    }
  };

  const toggleChaosScheduler = async () => {
    try {
      const nextMode = !isChaosSchedulerActive;
      await axios.post('http://localhost:5000/api/policy/toggle-chaos-scheduler', { enabled: nextMode });
      setIsChaosSchedulerActive(nextMode);
    } catch (err) {
      console.error('Failed to toggle chaos scheduler:', err.message);
    }
  };

  const triggerChaos = async () => {
    const scenario = scenarios.find((s) => s.id === selectedScenario);
    if (!scenario) return;

    try {
      await axios.post('http://localhost:5000/api/alerts/webhook', {
        incidentId: scenario.id,
        serviceName: scenario.serviceName,
        errorSummary: scenario.errorSummary
      });
    } catch (err) {
      console.error('Trigger failure:', err.message);
    }
  };

  const approveRemediation = async () => {
    if (!activeIncident) return;
    try {
      await axios.post(`http://localhost:5000/api/incidents/${activeIncident.incidentId}/approve`);
    } catch (err) {
      console.warn('Remediation error or circuit breaker triggered:', err.message);
    }
  };

  const downloadReport = () => {
    if (!rcaReport) return;
    const blob = new Blob([rcaReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeIncident?.incidentId || 'RCA'}-postmortem.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAskAgent = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !rcaReport || isQuerying) return;

    const userMsg = chatInput;
    const updatedHistory = [...chatHistory, { role: 'user', content: userMsg }];

    setChatInput('');
    setChatHistory(updatedHistory);
    setIsQuerying(true);

    try {
      const res = await axios.post('http://localhost:8000/api/chat', {
        incident_id: activeIncident?.incidentId || 'INC-GENERAL',
        context_rca: rcaReport,
        question: userMsg,
        history: updatedHistory
      });
      setChatHistory((prev) => [...prev, { role: 'assistant', content: res.data.answer }]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to retrieve diagnostic response from engine.' }
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleGeneratePR = async (incidentId) => {
    setIsGeneratingPR(true);
    try {
      const res = await axios.post(`http://localhost:5000/api/incidents/${incidentId}/generate-pr`);
      setPrDraft(res.data);
    } catch (err) {
      alert('Failed to generate PR draft: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsGeneratingPR(false);
    }
  };

  const openIncidentModal = async (incidentId) => {
    try {
      const res = await axios.get(`http://localhost:5000/api/incidents/${incidentId}/rca`);
      setSelectedAuditReport(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'No saved RCA found for this incident record.');
    }
  };

  const closeIncidentModal = () => {
    setSelectedAuditReport(null);
  };

  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined) return 'In Progress';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const remSecs = seconds % 60;
    if (mins < 60) return `${mins}m ${remSecs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const services = [
    { name: 'AUTH_SERVICE', label: 'AUTH_SERVICE' },
    { name: 'ORDER_SERVICE', label: 'ORDER_SERVICE' },
    { name: 'PAYMENT_SERVICE', label: 'PAYMENT_SERVICE' },
    { name: 'DATABASE_CORE', label: 'DATABASE_CORE' }
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0b0f19', color: '#f3f4f6', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header with Policy Toggles & Gateway Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 'bold', margin: 0 }}>Autonomous SRE RCA Engine</h1>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '4px 0 0 0' }}>Microservice Incident Diagnostics & Self-Healing Pipeline</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Chaos Monkey Scheduler Toggle */}
            <button
              onClick={toggleChaosScheduler}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: isChaosSchedulerActive ? '1px solid #f59e0b' : '1px solid #4b5563',
                backgroundColor: isChaosSchedulerActive ? '#78350f' : '#1f2937',
                color: isChaosSchedulerActive ? '#fef3c7' : '#9ca3af',
                transition: 'all 0.2s ease'
              }}
            >
              <span>{isChaosSchedulerActive ? '🐒 Chaos Monkey: ON' : '🐒 Chaos Monkey: OFF'}</span>
            </button>

            {/* Circuit Breaker Probe Failure Mode Toggle */}
            <button
              onClick={toggleFailMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: simulateFailMode ? '1px solid #ef4444' : '1px solid #4b5563',
                backgroundColor: simulateFailMode ? '#450a0a' : '#1f2937',
                color: simulateFailMode ? '#fca5a5' : '#9ca3af',
                transition: 'all 0.2s ease'
              }}
            >
              <span>{simulateFailMode ? '⚠️ Fail Simulation: ACTIVE' : '⚙️ Healthy Verification'}</span>
            </button>

            {/* Autonomous Auto-Healing Mode Toggle */}
            <button
              onClick={toggleAutonomousMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: isAutonomousMode ? '1px solid #10b981' : '1px solid #4b5563',
                backgroundColor: isAutonomousMode ? '#064e3b' : '#1f2937',
                color: isAutonomousMode ? '#a7f3d0' : '#9ca3af',
                transition: 'all 0.2s ease'
              }}
            >
              <span>{isAutonomousMode ? '⚡ Auto-Heal: ON' : '🛡️ Human Review: ON'}</span>
            </button>

            <span style={{
              fontSize: '0.75rem',
              padding: '6px 12px',
              borderRadius: '9999px',
              fontWeight: 600,
              backgroundColor: isGatewayOnline ? '#064e3b' : '#7f1d1d',
              color: isGatewayOnline ? '#34d399' : '#f87171'
            }}>
              {isGatewayOnline ? '● Gateway Online' : '○ Gateway Offline'}
            </span>
          </div>
        </div>

        {/* Chaos Monkey Scheduler Live Countdown Banner */}
        {isChaosSchedulerActive && (
          <div style={{
            background: '#1c1917',
            border: '1px solid #78350f',
            borderRadius: '6px',
            padding: '8px 16px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '0.8rem', color: '#fef3c7', fontWeight: 600 }}>
              🐒 Chaos Monkey Background Automation Active
            </span>
            <span style={{ fontSize: '0.8rem', color: isChaosPaused ? '#9ca3af' : '#fbbf24', fontWeight: 700 }}>
              {isChaosPaused
                ? '⏸️ Paused (Handling active outage / recovery)'
                : `Next Autonomous Strike in: ${chaosNextStrikeCountdown ?? 45}s`}
            </span>
          </div>
        )}

        {/* Executive MTTR & SLA Analytics Panel */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>AVERAGE MTTR</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#60a5fa', marginTop: '4px' }}>
              {formatDuration(analytics.avgMttrSeconds)}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Autonomous recovery speed</div>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>SLA AVAILABILITY</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
              {analytics.slaCompliance}%
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Target: 99.9% Uptime</div>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>RESOLVED INCIDENTS</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a7f3d0', marginTop: '4px' }}>
              {analytics.resolvedIncidents} <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>/ {analytics.totalIncidents}</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Auto-healed / Verified</div>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 }}>ESCALATIONS (CIRCUIT BREAKER)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: analytics.escalatedIncidents > 0 ? '#f87171' : '#9ca3af', marginTop: '4px' }}>
              {analytics.escalatedIncidents}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Manual SRE fallbacks</div>
          </div>
        </div>

        {/* Chaos Controller Bar */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: '#111827', border: '1px solid #1f2937', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
          <select
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value)}
            style={{ flex: 1, background: '#1f2937', color: '#fff', border: '1px solid #374151', padding: '8px 12px', borderRadius: '6px', fontSize: '0.9rem' }}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={triggerChaos}
            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            Simulate Outage Alert (Chaos Trigger)
          </button>
        </div>

        {/* Incident Status Banner */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 600 }}>Incident Status: </span>
          <span style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: incidentStatus === 'RESOLVED' ? '#34d399' :
                   incidentStatus === 'INVESTIGATING' ? '#f59e0b' :
                   incidentStatus === 'WAITING_APPROVAL' ? '#60a5fa' :
                   incidentStatus === 'VERIFYING' ? '#38bdf8' :
                   incidentStatus === 'ROLLING_BACK' ? '#fb923c' :
                   incidentStatus === 'ESCALATED' ? '#f87171' : '#9ca3af'
          }}>
            {incidentStatus}
          </span>
          {autoHealCountdown !== null && (
            <div style={{ marginTop: '6px', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600 }}>
              ⚡ Autonomous self-healing executing in {autoHealCountdown}s...
            </div>
          )}
        </div>

        {/* Circuit Breaker Emergency Alert Card */}
        {incidentStatus === 'ESCALATED' && escalationDetails && (
          <div style={{
            background: '#450a0a',
            border: '2px solid #ef4444',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#fca5a5', fontSize: '1rem' }}>
                🚨 CIRCUIT BREAKER TRIPPED: STAGED ROLLBACK EXECUTED
              </span>
              <span style={{ fontSize: '0.75rem', background: '#991b1b', color: '#fee2e2', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                ESCALATED TO ON-CALL
              </span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.85rem', color: '#fecaca' }}>
              <strong>Reason:</strong> {escalationDetails.reason}
            </div>
            <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#fed7aa', fontFamily: 'monospace' }}>
              <strong>Executed Rollback:</strong> <code>{escalationDetails.rollbackAction}</code>
            </div>
          </div>
        )}

        {/* Live Telemetry Monitors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 }}>P99 LATENCY (ms)</span>
                {telemetryData[telemetryData.length - 1]?.isAnomaly && (
                  <span style={{ fontSize: '0.65rem', background: '#7f1d1d', color: '#fca5a5', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    ANOMALY DETECTED (+{telemetryData[telemetryData.length - 1]?.zScore}σ)
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.85rem', color: (telemetryData[telemetryData.length - 1]?.latency || 0) > 1000 ? '#f87171' : '#34d399', fontWeight: 700 }}>
                {telemetryData[telemetryData.length - 1]?.latency || 0} ms
              </span>
            </div>
            <div style={{ height: '110px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 6000]} hide />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '4px', fontSize: '0.75rem' }} />
                  <Area type="monotone" dataKey="latency" stroke="#ef4444" fill="#7f1d1d" fillOpacity={0.3} isAnimationActive={false} />
                  <Line type="monotone" dataKey="threshold" stroke="#f59e0b" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 }}>ERROR RATE (%)</span>
              <span style={{ fontSize: '0.85rem', color: (telemetryData[telemetryData.length - 1]?.errorRate || 0) > 5 ? '#f87171' : '#34d399', fontWeight: 700 }}>
                {telemetryData[telemetryData.length - 1]?.errorRate || 0} %
              </span>
            </div>
            <div style={{ height: '110px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, 50]} hide />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '4px', fontSize: '0.75rem' }} />
                  <Area type="monotone" dataKey="errorRate" stroke="#f59e0b" fill="#78350f" fillOpacity={0.3} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Microservice Mesh Topology & Cascading Blast Radius */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#9ca3af', margin: 0 }}>
              Microservice Mesh & Cascading Blast Radius
            </h2>
            {blastRadiusServices.length > 0 && incidentStatus !== 'RESOLVED' && (
              <span style={{ fontSize: '0.75rem', background: '#78350f', color: '#fef3c7', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                Cascade Impact: {blastRadiusServices.length} Upstream Services Degraded
              </span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            {services.map((s, idx) => {
              const isDirectFailure = activeIncident && activeIncident.serviceName === s.name && incidentStatus !== 'RESOLVED';
              const isCascadeDegraded = blastRadiusServices.includes(s.name) && incidentStatus !== 'RESOLVED';

              const borderColor = isDirectFailure ? '#ef4444' : isCascadeDegraded ? '#f59e0b' : '#10b981';
              const bgColor = isDirectFailure ? '#450a0a' : isCascadeDegraded ? '#451a03' : '#064e3b';
              const statusText = isDirectFailure ? 'ROOT FAULT' : isCascadeDegraded ? 'DEGRADED (CASCADE)' : 'HEALTHY';
              const textColor = isDirectFailure ? '#fca5a5' : isCascadeDegraded ? '#fde68a' : '#6ee7b7';

              return (
                <React.Fragment key={s.name}>
                  <div style={{
                    padding: '12px 20px',
                    borderRadius: '8px',
                    border: `1px solid ${borderColor}`,
                    background: bgColor,
                    textAlign: 'center',
                    minWidth: '140px',
                    transition: 'all 0.3s ease'
                  }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.label}</div>
                    <div style={{ fontSize: '0.75rem', color: textColor, marginTop: '4px', fontWeight: 600 }}>
                      {statusText}
                    </div>
                  </div>
                  {idx < services.length - 1 && <span style={{ color: '#4b5563', fontSize: '1.2rem' }}>→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Active Incident Alert Banner */}
        {activeIncident && (
          <div style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#f87171' }}>{activeIncident.incidentId}</span>
              <span style={{ fontSize: '0.75rem', background: '#312e81', color: '#c7d2fe', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>P1_CRITICAL</span>
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <div style={{ fontWeight: 600 }}>Target Service: {activeIncident.serviceName}</div>
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '4px' }}>Summary: {activeIncident.errorSummary}</div>
            </div>
          </div>
        )}

        {/* Live Agent Trace Log */}
        <div style={{ background: '#030712', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#9ca3af', textAlign: 'center', margin: '0 0 12px 0' }}>Live Agent Trace Log</h2>
          <div style={{ height: '140px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.8rem', color: '#94a3b8' }}>
            {traceLogs.length === 0 ? (
              <div style={{ color: '#4b5563', fontStyle: 'italic', textAlign: 'center', paddingTop: '40px' }}>Awaiting incident triggers...</div>
            ) : (
              traceLogs.map((log, i) => (
                <div key={i} style={{ marginBottom: '6px' }}>{log}</div>
              ))
            )}
          </div>
        </div>

        {/* Synthetic Canary Verification Progress Cards */}
        {canaryProbes.length > 0 && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#9ca3af', margin: '0 0 12px 0' }}>
              Canary Health Verification Probes
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {canaryProbes.map((probe) => (
                <div
                  key={probe.step}
                  style={{
                    background: '#030712',
                    border: `1px solid ${probe.status === 'PASSED' ? '#059669' : probe.status === 'FAILED' ? '#ef4444' : '#d97706'}`,
                    borderRadius: '6px',
                    padding: '10px 14px'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Step {probe.step}</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '2px' }}>{probe.name}</div>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    marginTop: '6px',
                    color: probe.status === 'PASSED' ? '#34d399' : probe.status === 'FAILED' ? '#f87171' : '#fbbf24'
                  }}>
                    {probe.status === 'PASSED' ? '✓ HEALTHY' : probe.status === 'FAILED' ? '✕ FAILED' : '⟳ PROBING...'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generated RCA Post-Mortem & Remediation Action */}
        {rcaReport && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Generated Root Cause Analysis (RCA) Post-Mortem</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                {incidentStatus === 'RESOLVED' && (
                  <button
                    onClick={() => handleGeneratePR(activeIncident?.incidentId)}
                    disabled={isGeneratingPR}
                    style={{
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: isGeneratingPR ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isGeneratingPR ? '⟳ Generating PR...' : '🛠️ Auto-Generate Fix PR & Guardrail'}
                  </button>
                )}
                <button
                  onClick={downloadReport}
                  style={{ background: '#1f2937', border: '1px solid #374151', color: '#e5e7eb', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  ⬇ Export Markdown (.md)
                </button>
              </div>
            </div>

            <div style={{ background: '#030712', border: '1px solid #1f2937', borderRadius: '6px', padding: '16px', fontSize: '0.85rem', lineHeight: '1.6', overflowX: 'auto' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{rcaReport}</ReactMarkdown>
            </div>

            {incidentStatus === 'WAITING_APPROVAL' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                {isAutonomousMode ? (
                  <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚡ Autonomous self-healing in progress...
                  </span>
                ) : (
                  <button
                    onClick={approveRemediation}
                    style={{ background: '#059669', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ✓ Approve Remediation
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Diagnostic SRE Multi-Turn Chat Assistant */}
        {rcaReport && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f3f4f6', margin: '0 0 12px 0' }}>
              💬 Ask SRE Agent Follow-Up Questions
            </h3>

            <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {chatHistory.length === 0 ? (
                <span style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>
                  Ask about secondary ripple effects, rollback safety, or preventive guardrails...
                </span>
              ) : (
                chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      background: msg.role === 'user' ? '#1e3a8a' : '#1f2937',
                      color: '#f9fafb',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      maxWidth: '85%'
                    }}
                  >
                    <strong style={{ color: msg.role === 'user' ? '#93c5fd' : '#34d399' }}>
                      {msg.role === 'user' ? 'You: ' : 'SRE Agent: '}
                    </strong>
                    {msg.role === 'user' ? (
                      <span>{msg.content}</span>
                    ) : (
                      <div style={{ marginTop: '4px', overflowX: 'auto' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))
              )}
              {isQuerying && (
                <span style={{ fontSize: '0.75rem', color: '#93c5fd', fontStyle: 'italic' }}>
                  Agent analyzing post-mortem context...
                </span>
              )}
            </div>

            <form onSubmit={handleAskAgent} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="e.g., Will reverting this commit impact current active sessions?"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                style={{
                  flex: 1,
                  background: '#030712',
                  border: '1px solid #374151',
                  color: '#fff',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.85rem'
                }}
              />
              <button
                type="submit"
                disabled={isQuerying}
                style={{
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: isQuerying ? 'not-allowed' : 'pointer'
                }}
              >
                Ask
              </button>
            </form>
          </div>
        )}

        {/* Incident Audit Ledger & MTTR Table */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#9ca3af', margin: '0 0 12px 0' }}>Incident Audit Ledger & MTTR</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f2937', color: '#6b7280' }}>
                  <th style={{ padding: '8px' }}>Incident ID</th>
                  <th style={{ padding: '8px' }}>Service</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Triggered At</th>
                  <th style={{ padding: '8px' }}>Resolved At</th>
                  <th style={{ padding: '8px' }}>MTTR (Duration)</th>
                </tr>
              </thead>
              <tbody>
                {auditLedger.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '16px', textAlign: 'center', color: '#4b5563' }}>No historical incidents in database ledger.</td>
                  </tr>
                ) : (
                  auditLedger.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => openIncidentModal(row.id)}
                      style={{
                        borderBottom: '1px solid #1f2937',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#1e293b')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 8px', fontWeight: 600, color: '#60a5fa' }}>
                        {row.id} 🔍
                      </td>
                      <td style={{ padding: '10px 8px' }}>{row.service_name}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          background: row.status === 'RESOLVED' ? '#064e3b' : row.status === 'ESCALATED' ? '#7f1d1d' : '#78350f',
                          color: row.status === 'RESOLVED' ? '#34d399' : row.status === 'ESCALATED' ? '#fca5a5' : '#fde68a'
                        }}>
                          {row.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', color: '#9ca3af' }}>{new Date(row.created_at).toLocaleTimeString()}</td>
                      <td style={{ padding: '10px 8px', color: '#9ca3af' }}>{row.resolved_at ? new Date(row.resolved_at).toLocaleTimeString() : '-'}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600, color: '#93c5fd' }}>
                        {formatDuration(row.resolution_seconds)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Automated PR Draft & CI Guardrail Modal */}
        {prDraft && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '20px'
          }}>
            <div style={{
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #1f2937'
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f3f4f6' }}>
                    Pull Request Draft: <code style={{ color: '#60a5fa' }}>{prDraft.pr_title}</code>
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Incident Reference: <strong>{prDraft.incident_id}</strong>
                  </span>
                </div>
                <button
                  onClick={() => setPrDraft(null)}
                  style={{
                    background: '#1f2937',
                    border: '1px solid #374151',
                    color: '#9ca3af',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', marginBottom: '6px' }}>
                    PROPOSED CODE RECTIFICATION PATCH (git diff)
                  </div>
                  <pre style={{
                    background: '#030712',
                    border: '1px solid #1f2937',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#34d399',
                    overflowX: 'auto',
                    margin: 0
                  }}>
                    {prDraft.code_patch}
                  </pre>
                </div>

                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', marginBottom: '6px' }}>
                    PREVENTATIVE CI/CD PIPELINE GUARDRAIL (.github/workflows)
                  </div>
                  <pre style={{
                    background: '#030712',
                    border: '1px solid #1f2937',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: '#93c5fd',
                    overflowX: 'auto',
                    margin: 0
                  }}>
                    {prDraft.ci_guardrail}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Historical RCA Post-Mortem Modal */}
        {selectedAuditReport && (
          <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '20px'
          }}>
            <div style={{
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #1f2937'
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f3f4f6' }}>
                    Archived Post-Mortem: {selectedAuditReport.incident_id}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Approval Status: <strong>{selectedAuditReport.approval_status}</strong> | Culprit Commit: <code>{selectedAuditReport.culprit_commit}</code>
                  </span>
                </div>
                <button
                  onClick={closeIncidentModal}
                  style={{
                    background: '#1f2937',
                    border: '1px solid #374151',
                    color: '#9ca3af',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  ✕ Close
                </button>
              </div>

              <div style={{
                padding: '20px',
                overflowY: 'auto',
                fontSize: '0.85rem',
                lineHeight: '1.6',
                color: '#e5e7eb'
              }}>
                <div style={{ background: '#030712', border: '1px solid #1f2937', borderRadius: '6px', padding: '16px' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedAuditReport.report_markdown}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}