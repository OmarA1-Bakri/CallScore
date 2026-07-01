#!/usr/bin/env bash
set -euo pipefail

RUNTIME="${CALLSCORE_CHANNEL_ORCHESTRATOR_RUNTIME:-/srv/agents/hermes/runtime/channel-head-orchestrator}"
ENABLED_FILE="${CALLSCORE_CHANNEL_SCHEDULER_ENABLED_FILE:-${RUNTIME}/scheduler.enabled}"
ORCHESTRATOR="${CALLSCORE_CHANNEL_DAILY_ORCHESTRATOR:-/srv/agents/hermes/scripts/callscore-daily-orchestrator.sh}"

mkdir -p "$RUNTIME"/logs

if [ ! -f "$ENABLED_FILE" ]; then
  echo "callscore-channel-head-scheduler disabled: missing ${ENABLED_FILE}"
  exit 0
fi

export MAX_ACTIVE_CHANNELS="${MAX_ACTIVE_CHANNELS:-1}"
exec "$ORCHESTRATOR"
