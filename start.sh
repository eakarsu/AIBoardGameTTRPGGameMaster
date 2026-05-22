#!/bin/bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

BACKEND_PORT=3201
FRONTEND_PORT=5273

echo -e "${YELLOW}[1/5] Cleaning up ports...${NC}"
kill_port() {
  local port=$1
  local pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "  ${RED}Killing on port $port: $pids${NC}"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}
kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT

echo -e "${YELLOW}[2/5] Checking PostgreSQL...${NC}"
if ! pg_isready -q 2>/dev/null; then
  brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || true
  sleep 2
fi

echo -e "${YELLOW}[3/5] Ensuring database & schema...${NC}"
psql -lqt | cut -d \| -f 1 | grep -qw ttrpg_gm_master || createdb ttrpg_gm_master
cd "$PROJECT_DIR/backend"
npx prisma generate >/dev/null 2>&1 || true
npx prisma db push --skip-generate >/dev/null 2>&1 || true
node src/db/seed.js >/dev/null 2>&1 || true

echo -e "${YELLOW}[4/5] Installing dependencies...${NC}"
cd "$PROJECT_DIR/backend" && [ -d node_modules ] || npm install --silent 2>&1 | tail -1
cd "$PROJECT_DIR/frontend" && [ -d node_modules ] || npm install --silent 2>&1 | tail -1

echo -e "${YELLOW}[5/5] Starting servers...${NC}"
cd "$PROJECT_DIR/backend"
node src/index.js > /tmp/ttrpg_backend.log 2>&1 &
BACKEND_PID=$!

cd "$PROJECT_DIR/frontend"
npx vite --host --port $FRONTEND_PORT --strictPort > /tmp/ttrpg_frontend.log 2>&1 &
FRONTEND_PID=$!

cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}Backend  : http://localhost:$BACKEND_PORT${NC}"
echo -e "${GREEN}Frontend : http://localhost:$FRONTEND_PORT${NC}"
echo -e "${CYAN}Login    : gm@gamemaster.ai / password123${NC}"

wait
