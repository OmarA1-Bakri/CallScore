#!/bin/bash
set -euo pipefail
LOG=".tmp/hermes-worker.log"
mkdir -p .tmp

while true; do
# Load .env.local into the current shell
# Use eval to handle values with spaces safely (we know our env file format)
PROJECT_DIR="${CALLSCORE_APP_DIR:-/opt/crypto-tuber-ranked}"
ENV_FILE="${CALLSCORE_ENV_FILE:-$PROJECT_DIR/.env.hermes}"
[ -f "$ENV_FILE" ] || ENV_FILE="$PROJECT_DIR/.env.local"
cd "$PROJECT_DIR" || { echo "Cannot cd to project dir"; exit 1; }
set -o allexport
source "$ENV_FILE"
set +o allexport

# Fix DNS on WSL2
  export DNS_RESULT_ORDER=ipv4first

  echo "[$(date -Iseconds)] Worker starting..." >> "$LOG"
  # Run worker. If it crashes, wait 5s and restart.
  npx tsx --dns-result-order=ipv4first src/scripts/hermes-worker.ts --max-jobs 10000 >> "$LOG" 2>&1 || true
  echo "[$(date -Iseconds)] Worker exited ($?), restarting in 5s..." >> "$LOG"
  sleep 5
done
