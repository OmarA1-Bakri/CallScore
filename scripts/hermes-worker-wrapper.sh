#!/bin/bash
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || { echo "Cannot cd to project dir: $PROJECT_DIR"; exit 1; }
LOG=".tmp/hermes-worker.log"
mkdir -p .tmp

while true; do
  # Load .env.local safely: export only valid K=V lines
  while IFS='=' read -r key value; do
    key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
    value="${value#\"}"; value="${value%\"}"
    value="${value#\'}"; value="${value%\'}"
    if [[ -n "$key" && "$key" != \#* ]]; then
      export "$key=$value"
    fi
  done < "$PROJECT_DIR/.env.local"

  # Fix DNS on WSL2
  export DNS_RESULT_ORDER=ipv4first

  echo "[$(date -Iseconds)] Worker starting..." >> "$LOG"
  export NODE_OPTIONS="--dns-result-order=ipv4first"
  npx tsx src/scripts/hermes-worker.ts --max-jobs 10000 >> "$LOG" 2>&1
  EXIT_CODE=$?
  echo "[$(date -Iseconds)] Worker exited ($EXIT_CODE), restarting in 5s..." >> "$LOG"
  sleep 5
done
