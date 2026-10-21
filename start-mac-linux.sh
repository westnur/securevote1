#!/usr/bin/env bash
# SecureVote - launcher for macOS/Linux (EDUCATIONAL PROTOTYPE, local only).
# Requirements: Node.js 20.19+ and either Docker (running) or a local PostgreSQL 16.
set -euo pipefail
cd "$(dirname "$0")"
echo
echo " Educational project for the course Introduction to Finance."
echo " Not a real product, service or investment offer. Do not use with real funds."
echo

command -v node >/dev/null || { echo "[X] Node.js is not installed. Install Node.js 20.19+ from https://nodejs.org"; exit 1; }
[ -f .env ] || { echo "[i] Creating .env from .env.example (local placeholder values)"; cp .env.example .env; }
[ -d node_modules ] || { echo "[i] Installing dependencies (first run takes a few minutes)..."; npm install; }

if docker info >/dev/null 2>&1; then
  echo "[i] Starting PostgreSQL in Docker..."
  npm run db:up
else
  echo "[i] Docker is not running - assuming a local PostgreSQL on port 5432."
fi

# Open the browser once the stack has had time to start.
( sleep 75; (command -v open >/dev/null && open http://localhost:5173) || (command -v xdg-open >/dev/null && xdg-open http://localhost:5173) || true ) >/dev/null 2>&1 &

echo "[i] Starting SecureVote. Press Ctrl+C to stop."
echo "[i] Login password for all demo accounts: the SEED_DEMO_PASSWORD value in .env"
exec npm run dev:fresh
