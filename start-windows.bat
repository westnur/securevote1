@echo off
REM SecureVote - double-click launcher for Windows (EDUCATIONAL PROTOTYPE, local only).
REM Requirements: Node.js 20.19+ and either Docker Desktop (running) or a local PostgreSQL 16.
setlocal
cd /d "%~dp0"
title SecureVote (educational prototype)
echo.
echo  Educational project for the course Introduction to Finance.
echo  Not a real product, service or investment offer. Do not use with real funds.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed. Install Node.js 20.19 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [i] Creating .env from .env.example (local placeholder values^)...
  copy /Y ".env.example" ".env" >nul
)

if not exist "node_modules" (
  echo [i] Installing dependencies - first run takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo [X] npm install failed.
    pause
    exit /b 1
  )
)

docker info >nul 2>nul
if errorlevel 1 (
  echo [i] Docker is not running - assuming a local PostgreSQL on port 5432.
) else (
  echo [i] Starting PostgreSQL in Docker...
  call npm run db:up
)

REM Open the browser once the stack has had time to start.
start "" cmd /c "timeout /t 75 /nobreak >nul & start http://localhost:5173"

echo [i] Starting SecureVote. Keep this window open; press Ctrl+C to stop.
echo [i] Login password for all demo accounts: the SEED_DEMO_PASSWORD value in .env
call npm run dev:fresh
pause
