#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$project_dir"
if [ ! -f .env ] || [ ! -f backend/.env ]; then echo "Missing .env or backend/.env; configure both before starting." >&2; exit 1; fi
if [ ! -d backend/node_modules ] || [ ! -d frontend/node_modules ]; then echo "Dependencies are absent; run scripts/bootstrap.sh first." >&2; exit 1; fi
set -a; . ./.env; . ./backend/.env; set +a
backend_port="${BACKEND_PORT:-${PORT:-3001}}"; frontend_port="${FRONTEND_PORT:-5273}"
export PORT="$backend_port" BACKEND_PORT="$backend_port" FRONTEND_PORT="$frontend_port"
for port in "$backend_port" "$frontend_port"; do if command -v lsof >/dev/null && lsof -ti ":$port" >/dev/null 2>&1; then echo "Port $port is already in use; refusing to stop another process." >&2; exit 1; fi; done
(cd backend && npm start) & backend_pid=$!
(cd frontend && npm run dev -- --port "$frontend_port") & frontend_pid=$!
cleanup(){ kill "$backend_pid" "$frontend_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
wait "$backend_pid" "$frontend_pid"
