# ⚡ Autonomous SRE RCA & Self-Healing Platform

An enterprise-grade autonomous Site Reliability Engineering (SRE) platform capable of real-time statistical anomaly detection, dependency blast radius modeling, LLM-powered root-cause analysis (RCA), and circuit-breaker canary rollbacks.

---

## 🏗️ Architecture Overview

                      +-------------------------+
                      |   Microservice Mesh     |
                      | (Auth, Orders, Payment) |
                      +------------+------------+
                                   |
                            Telemetry Pulse
                                   v
                         +-------------------+
                         |  Gateway Service  | <----+ Outbound Discord Alerts
                         | (Node.js/Express) |
                         +---+-----------+---+
                             |           |
        Statistical Z-Score  |           | Webhook Diagnostics
        Anomaly Detection    |           v
                             |   +---------------+
                             |   | AI Diagnostic | (Groq / Llama 3.1)
                             |   |    Engine     | Multi-turn RCA & PR Gen
                             |   +---------------+
                             v
                 +-----------------------+
                 | React Vite Dashboard  |
                 |  - MTTR Analytics     |
                 |  - Blast Radius Mesh  |
                 |  - 3-Stage Canary Probes
                 +-----------------------+


---

## ✨ Key Features

1. **Statistical Anomaly Detector**: Rolling $Z$-Score window ($>2.5\sigma$, P99 $>300\text{ ms}$) triggers autonomous alerts without human input.
2. **Dependency Blast Radius Calculator**: Maps graph topologies to highlight upstream ripple effects across critical microservices.
3. **Zero-Touch Auto-Healing**: Toggleable autonomous self-healing countdown with automated CLI playbook execution.
4. **Synthetic Canary Probes & Circuit Breaker**: Runs 3-stage validation (`/healthz`, `/ready`, `/metrics`) and executes automated rollback if canary probes fail.
5. **Interactive Diagnostic Copilot**: Multi-turn conversational memory allowing engineers to drill down on incident implications.
6. **Automated Remediation PR Generation**: Generates `git diff` patches and GitHub Actions CI guardrails preventing recurrent regressions.
7. **Executive MTTR Analytics**: Aggregates resolution velocity, incident counts, and SLA uptime compliance percentages.

---

## 🚀 Quickstart (Local Native Setup)

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- MySQL Server (Running locally on default port 3306)

### 1. Database Setup
Ensure MySQL is running and initialize the database schema:
```sql
CREATE DATABASE IF NOT EXISTS incident_engine_db;
-- Run the queries provided in init.sql

2. Environment Variables
ai-agent-engine/.env:
GROQ_API_KEY=your_groq_api_key_here
GATEWAY_URL=http://localhost:5000

gateway-service/.env:
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password
DB_NAME=incident_engine_db
AI_ENGINE_URL=http://localhost:8000
NOTIFICATION_WEBHOOK_URL=your_discord_webhook_url

3. Launch the Stack
Double-click start-dev.bat or run:
start-dev.bat
Navigate to http://localhost:5173 in your browser.

---

### Step 3: Final End-to-End Validation Checklist

Run through this single test sequence to confirm all features function together:

1. **Launch**: Double-click `start-dev.bat`. Ensure all three windows open without errors.
2. **Verify Telemetry**: On `http://localhost:5173`, verify `● Gateway Online` is green and the MTTR cards render.
3. **Turn On Policies**:
   * Toggle **`⚡ Auto-Heal: ON`**
   * Toggle **`🐒 Chaos Monkey: ON`**
4. **Observe Automation**:
   * Wait 45 seconds for Chaos Monkey to strike.
   * Watch the telemetry graph spike and the `ANOMALY DETECTED` badge appear.
   * Watch the blast radius highlight upstream dependent services.
   * The RCA report generates within seconds.
   * Autonomous self-healing starts its 3-second countdown.
   * Synthetic canary probes run (3/3 steps pass).
   * Telemetry drops back to baseline ($<50\text{ ms}$).
   * The MTTR and SLA availability cards update immediately in the database ledger.
5. **Test PR Generation**: Click **`🛠️ Auto-Generate Fix PR & Guardrail`** to view the generated diff patch and GitHub Actions YAML.
