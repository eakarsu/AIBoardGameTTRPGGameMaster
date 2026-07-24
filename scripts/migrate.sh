#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$project_dir/backend"; set -a; . ./.env; set +a
npx prisma db push --skip-generate
npx prisma migrate deploy
