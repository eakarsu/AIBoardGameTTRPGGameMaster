#!/usr/bin/env bash
set -euo pipefail
if [ "${CONFIRM_DEMO_SEED:-}" != "yes" ]; then echo "Refusing demo seed. Set CONFIRM_DEMO_SEED=yes explicitly." >&2; exit 1; fi
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$project_dir/backend"; node src/db/seed.js
