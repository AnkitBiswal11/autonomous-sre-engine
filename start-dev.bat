@echo off
title Autonomous SRE Platform Launcher
echo ====================================================
echo Starting Autonomous SRE RCA Platform (Local Native)
echo ====================================================

echo [1/3] Launching FastAPI AI Agent Engine (Port 8000)...
start "AI Agent Engine" cmd /k "cd ai-agent-engine && call .\venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

echo [2/3] Launching Node.js Gateway & Telemetry Service (Port 5000)...
start "Gateway Service" cmd /k "cd gateway-service && node src/server.js"

timeout /t 3 /nobreak >nul

echo [3/3] Launching Vite React Dashboard (Port 5173)...
start "Frontend Dashboard" cmd /k "cd frontend && npm run dev"

echo.
echo All microservices launched successfully!
echo Dashboard will be live at: http://localhost:5173
echo ====================================================
pause