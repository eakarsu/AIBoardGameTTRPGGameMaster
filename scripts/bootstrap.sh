#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$project_dir"
if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; echo "Created backend/.env; replace placeholders before starting."; fi
(cd backend && npm ci && npm run db:generate); (cd frontend && npm ci)
echo "Dependencies installed. Run scripts/migrate.sh explicitly before start.sh."
