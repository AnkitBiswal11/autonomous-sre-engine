# ⚡ Autonomous SRE RCA & Self-Healing Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![LLM: Llama 3.1](https://img.shields.io/badge/LLM-Llama_3.1_(Groq)-F05032.svg)](https://groq.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1.svg?logo=mysql&logoColor=white)](https://www.mysql.com/)

An enterprise-grade, event-driven Site Reliability Engineering (SRE) automation platform that detects distributed microservice failures, models cascading topology blast radius, diagnoses root causes via low-latency LLMs, and executes verified self-healing playbooks with circuit-breaker canary rollbacks.

---

## 🌟 Key Features

* **Statistical Anomaly Detection (Zero Hardcoded Thresholds)**: Computes a rolling $Z$-score baseline over P99 latency ($>2.5\sigma$, P99 $>300\text{ ms}$) to identify true regressions without alert fatigue.
* **Cascading Blast Radius Graph**: Recursively traverses the microservice dependency topology to pinpoint root-fault nodes and visualize downstream impact across upstream consumers (`AUTH_SERVICE`, `PAYMENT_SERVICE`, `ORDER_SERVICE`).
* **Sub-Second LLM Root Cause Analysis**: Leverages `llama-3.1-8b-instant` on Groq to isolate culprit git commit SHAs, stack trace culprits, and remediation playbooks in $<800\text{ ms}$.
* **Zero-Touch Autonomous Self-Healing**: Toggleable policy mode that schedules unattended remediation playbooks with configurable countdown safeties.
* **3-Stage Synthetic Canary Verification & Circuit Breaker**: Evaluates service recovery via three health gates (`/healthz` pod liveness, `/ready` dependency handshake, and `/metrics/p99` baseline check). Trips an automatic rollback (`kubectl rollout undo`) if any probe fails.
* **Preventative PR & CI Guardrail Generator**: Synthesizes git diff patches and automated GitHub Actions workflow rules (`.github/workflows`) to block recurring regressions in CI/CD pipelines.
* **Multi-Turn SRE Copilot Chat**: Diagnostic assistant retaining incident context for technical follow-ups regarding data risk, rollback implications, and cache states.
* **Chaos Monkey Scheduler**: Background resilience engine injecting randomized faults every 45 seconds to continuously validate cluster self-healing under load.
* **Executive MTTR & SLA Analytics**: Aggregates real-time Mean Time to Resolution (MTTR), incident volume by service, and rolling 30-day SLA uptime compliance.

---

## 🏗️ System Architecture

                      +-------------------------------+
                      |   Microservice Mesh Topology  |
                      | (Auth, Orders, Payment, DB)   |
                      +---------------+---------------+
                                      |
                          Telemetry Tick (every 2s)
                                      v
                          +-----------------------+
                          |    Gateway Service    | <---> Outbound Webhook Alerts
                          |   (Node.js / Express) |       (Discord / Slack)
                          +-----------+-----------+
                                      |
        +-----------------------------+-----------------------------+
        |                             |                             |
        v                             v                             v
    +--------------------+       +--------------------+       +----------------------+
    | Z-Score Anomaly    |       | MySQL Ledger &     |       | AI Diagnostic Engine |
    | Detector & Canary  |       | MTTR Analytics     |       | (FastAPI + Groq LLM) |
    | Circuit Breaker    |       | (Audits & Reports) |       | (RCA & PR Synthesis) |
    +--------------------+       +--------------------+       +----------------------+
        |                             |                             |
        +-----------------------------+-----------------------------+
                                      |
                             WebSocket (Socket.io)
                                      v
                          +-----------------------+
                          |   React SRE Mission   |
                          |   Control Dashboard   | 
                          +-----------------------+


---

## 📂 Project Structure

    autonomous-sre-engine/
    ├── ai-agent-engine/              # Python FastAPI AI Diagnostic Service
    │   ├── app/
    │   │   └── main.py               # Groq LLM integrations, chat sessions, PR generator
    │   ├── requirements.txt
    │   └── .env.example
    ├── gateway-service/              # Node.js / Express Gateway & Socket.io Hub
    │   ├── src/
    │   │   └── server.js             # Anomaly engine, blast radius calculator, canary probes
    │   ├── package.json
    │   └── .env.example
    ├── frontend/                     # React Vite Mission Control Dashboard
    │   ├── src/
    │   │   ├── App.jsx               # Real-time charts, topology view, post-mortem modal
    │   │   └── main.jsx
    │   ├── package.json
    │   └── vite.config.js
    ├── init.sql                      # Database schema and seed services
    ├── start-dev.bat                 # 1-Click native Windows orchestration launcher
    ├── .gitignore
    └── README.md

---

## 🚀 Quickstart (Local Native Setup)

### Prerequisites

* **Node.js** (v18.x or later)
* **Python** (v3.10 or later)
* **MySQL Server** (8.0+ running locally on port 3306)
* **Groq API Key** ([Get free key here](https://console.groq.com/keys))

---

### 1. Database Initialization

Run the provided schema in your local MySQL client:

sql
CREATE DATABASE IF NOT EXISTS incident_engine_db;
USE incident_engine_db;

-- Execute schema queries from init.sql

(Alternatively: run mysql -u root -p < init.sql from your terminal)

2. Environment Configuration
AI Agent Service
Copy ai-agent-engine/.env.example to ai-agent-engine/.env:

GROQ_API_KEY=gsk_your_actual_groq_api_key_here
GATEWAY_URL=http://localhost:5000

Gateway Service
Copy gateway-service/.env.example to gateway-service/.env:

PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_password
DB_NAME=incident_engine_db
AI_ENGINE_URL=http://localhost:8000
NOTIFICATION_WEBHOOK_URL=[https://discord.com/api/webhooks/your_webhook_url](https://discord.com/api/webhooks/your_webhook_url)

3. Dependency Installation

Terminal 1 — AI Engine:
cd ai-agent-engine
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate
pip install -r requirements.txt

Terminal 2 — Gateway Service:
cd gateway-service
npm install

Terminal 3 — Frontend Dashboard:
cd frontend
npm install

4. Run the Platform
Option A: 1-Click Native Launcher (Windows)
Double-click start-dev.bat or run:
start-dev.bat

Option B: Manual Execution
-AI Engine: uvicorn app.main:app --reload --port 8000 (inside ai-agent-engine)
-Gateway: node src/server.js (inside gateway-service)
-Frontend: npm run dev (inside frontend)
Open http://localhost:5173 in your browser.

🧪 Verification & Demo Workflow
-Observe Baseline: Verify telemetry graphs indicate healthy latency ($<50\text{ ms}$) and error rate ($<0.05\%$) alongside ● Gateway Online.
-Inject Chaos: Select an outage scenario from the dropdown (e.g., Auth Service: Redis Lock Timeout) and click Simulate Outage Alert.
-Inspect Real-Time Trace:
Telemetry spikes to $>4000\text{ ms}$ and triggers the statistical anomaly banner ($+Z\sigma$).
Blast radius highlights downstream dependent nodes as degraded.
LLM generates a post-mortem isolating the root cause and culprit commit within 1 second.
-Execute Self-Healing:
Click ✓ Approve Remediation (or toggle ⚡ Auto-Heal: ON for zero-touch execution).
Watch the 3-Stage Canary Health Verification run in sequence.
Metrics drop back to the sub-50ms green baseline.
-Inspect Auto-Generated PR: Click 🛠️ Auto-Generate Fix PR & Guardrail to view the unified git diff patch and GitHub Actions workflow synthesized to prevent regressions.
-Circuit-Breaker Test: Toggle ⚠️ Fail Simulation: ACTIVE and trigger an alert to witness synthetic canary failure, circuit breaker tripping, and emergency automated rollback.

🛡️ Security & Privacy Notice
-Local .env credential files containing API keys or database passwords are fully ignored by .gitignore.
-Never push production credentials or private webhook URLs to public repositories. Always reference .env.example.

📄 License
Distributed under the MIT License. See LICENSE for more information.
