#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${CALLSCORE_APP_DIR:-/opt/crypto-tuber-ranked}"
BASE_URL="${CALLSCORE_PUBLIC_BASE_URL:-https://call-score.com}"
TEAM_MEMORY_ROOT="${CALLSCORE_TEAM_MEMORY_ROOT:-/srv/agents/hermes/runtime/callscore-team-memory}"
OUT_DIR="${TEAM_MEMORY_ROOT}/artifacts/website-freshness"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${OUT_DIR}/live-public-surface-${STAMP}.json"
LATEST="${OUT_DIR}/latest.json"

mkdir -p "$OUT_DIR"
cd "$APP_DIR"

npm run verify:public -- --source live --base-url "$BASE_URL" --audit-out "$OUT"
cp "$OUT" "$LATEST"

echo "CallScore live website freshness proof written: $OUT"
