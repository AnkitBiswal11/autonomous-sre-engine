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
    +--------------------+       +--------------------+   +----------------------+
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
