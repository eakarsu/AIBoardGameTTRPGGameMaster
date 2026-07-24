#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$project_dir/.env"; . "$project_dir/backend/.env"; set +a
case "${CONFIRM_DEMO_SEED:-}" in yes|YES) ;; *) echo "Refusing demo seed. Set CONFIRM_DEMO_SEED=yes explicitly." >&2; exit 1 ;; esac
cd "$project_dir/backend"; node src/db/seed.js
