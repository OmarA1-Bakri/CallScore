#!/usr/bin/env bash
# cs-channel-wrapper.sh — run one channel-head task inside tmux.
set -euo pipefail

ACTIVE_FILE="${1:?Usage: $0 <active_json_path>}"
[ -f "$ACTIVE_FILE" ] || { echo "FATAL: active file not found: $ACTIVE_FILE"; exit 1; }

JSON_READER="${CALLSCORE_ACTIVE_JSON_READER:-/opt/crypto-tuber-ranked/scripts/callscore-read-active-json.py}"
read_json() { python3 "$JSON_READER" "$ACTIVE_FILE" "$1" "${2:-scalar}"; }

CHANNEL=$(read_json channel)
TASK_ID=$(read_json task_id)
RUN_ID=$(read_json run_id)
PROFILE=$(read_json profile)
RUNNER=$(read_json runner)
[ -z "$RUNNER" ] && RUNNER="hermes"
PROMPT=$(read_json prompt)
MAX_DUR=$(read_json max_duration_seconds)
[ -z "$MAX_DUR" ] && MAX_DUR=600
MODEL_OVERRIDE=$(read_json model)
[ -z "$MODEL_OVERRIDE" ] && MODEL_OVERRIDE="${CALLSCORE_CHANNEL_HEAD_MODEL:-}"
EXECUTION_MODE=$(read_json execution_mode)
[ -z "$EXECUTION_MODE" ] && EXECUTION_MODE="${CALLSCORE_EXECUTION_MODE:-read_only_verify}"
REQUIRE_CHILD_VERIFIER=$(read_json require_child_verifier)
[ -z "$REQUIRE_CHILD_VERIFIER" ] && REQUIRE_CHILD_VERIFIER="${CALLSCORE_REQUIRE_CHILD_VERIFIER:-false}"
TOOLSET_OVERRIDE=$(read_json toolsets csv)
if [ -z "$TOOLSET_OVERRIDE" ]; then
  TOOLSET_OVERRIDE="terminal,file,skills,session_search,todo,web,code_execution"
  if [ "$REQUIRE_CHILD_VERIFIER" = "true" ]; then
    TOOLSET_OVERRIDE="$TOOLSET_OVERRIDE,delegation"
  fi
fi
SKILLS_OVERRIDE=$(read_json skills csv)
[ -z "$SKILLS_OVERRIDE" ] && SKILLS_OVERRIDE="${CALLSCORE_CHANNEL_HEAD_SKILLS:-callscore-startup,callscore-canonical-runtime,callscore-social-posting-discipline,parent-verification-of-agent-output}"

RUNTIME_DIR=$(dirname "$(dirname "$ACTIVE_FILE")")
mkdir -p "$RUNTIME_DIR"/{completed,logs,receipts,state}
COMPLETED_FILE="$RUNTIME_DIR/completed/$(basename "$ACTIVE_FILE")"
LEGACY_RECEIPT_FILE="$RUNTIME_DIR/receipts/${RUN_ID}.receipt.json"
RUNNER_RECEIPT_FILE="$RUNTIME_DIR/receipts/${RUN_ID}.runner-receipt.json"
HERMES_EXIT_FILE="$RUNTIME_DIR/logs/${RUN_ID}.hermes-exit"
PROVIDER_FAILURE_FILE="$RUNTIME_DIR/logs/${RUN_ID}.provider-failure"
RAW_OUTPUT_FILE="$RUNTIME_DIR/logs/${RUN_ID}.raw.txt"
CANONICAL_JSON_FILE="$RUNTIME_DIR/logs/${RUN_ID}.canonical.json"
EXTRACT_RESULT_FILE="$RUNTIME_DIR/logs/${RUN_ID}.extract.json"
STDOUT_COMPAT_FILE="$RUNTIME_DIR/logs/${RUN_ID}.stdout.txt"
EXTRACTOR="${CALLSCORE_CANONICAL_JSON_EXTRACTOR:-/opt/crypto-tuber-ranked/scripts/callscore-extract-canonical-json.py}"
COOLDOWN_HELPER="${CALLSCORE_PROVIDER_COOLDOWN_HELPER:-/opt/crypto-tuber-ranked/scripts/callscore-record-provider-cooldown.py}"
PROVIDER_COOLDOWN_STATE="$RUNTIME_DIR/state/provider-cooldown.json"
HERMES_COMMAND="${CALLSCORE_HERMES_COMMAND:-/home/omar/.local/bin/hermes}"

cleanup() {
  local wrapper_ec=$?
  local hermes_ec="$wrapper_ec"
  if [ -f "$HERMES_EXIT_FILE" ]; then
    hermes_ec="$(cat "$HERMES_EXIT_FILE" 2>/dev/null || echo "$wrapper_ec")"
  fi
  cp "$RAW_OUTPUT_FILE" "$STDOUT_COMPAT_FILE" 2>/dev/null || true
  if [ "$RUNNER" = "hermes" ]; then
    python3 "$COOLDOWN_HELPER" "$RAW_OUTPUT_FILE" "$PROVIDER_COOLDOWN_STATE" "$RUN_ID" >/dev/null 2>&1 || true
  fi
  if [ -s "$RAW_OUTPUT_FILE" ] && [ -x "$EXTRACTOR" ]; then
    python3 "$EXTRACTOR" "$RAW_OUTPUT_FILE" "$CANONICAL_JSON_FILE" "callscore.workflow_canonical_output.v1" > "$EXTRACT_RESULT_FILE" 2>/dev/null || true
  elif [ -s "$RAW_OUTPUT_FILE" ] && [ -f "$EXTRACTOR" ]; then
    python3 "$EXTRACTOR" "$RAW_OUTPUT_FILE" "$CANONICAL_JSON_FILE" "callscore.workflow_canonical_output.v1" > "$EXTRACT_RESULT_FILE" 2>/dev/null || true
  else
    printf '{"canonical_json_found":false,"canonical_json_valid":false,"schema_errors":["extractor_or_raw_output_missing"]}\n' > "$EXTRACT_RESULT_FILE"
  fi

  export WRAPPER_EC="$wrapper_ec" HERMES_EC="$hermes_ec" CHANNEL TASK_ID RUN_ID RUNNER MODEL_OVERRIDE TOOLSET_OVERRIDE SKILLS_OVERRIDE EXECUTION_MODE
  export RAW_OUTPUT_FILE CANONICAL_JSON_FILE EXTRACT_RESULT_FILE RUNNER_RECEIPT_FILE LEGACY_RECEIPT_FILE PROVIDER_FAILURE_FILE
  python3 - <<'PY'
import json, os, subprocess
from pathlib import Path
wrapper_ec = int(os.environ['WRAPPER_EC'])
hermes_ec = int(os.environ['HERMES_EC'])
extract = {}
try:
    extract = json.loads(Path(os.environ['EXTRACT_RESULT_FILE']).read_text())
except Exception as exc:
    extract = {'canonical_json_found': False, 'canonical_json_valid': False, 'schema_errors': [f'extract_result_unreadable:{exc}']}
canonical_valid = bool(extract.get('canonical_json_valid'))
canonical_found = bool(extract.get('canonical_json_found'))
provider_failure_detected = Path(os.environ['PROVIDER_FAILURE_FILE']).exists()
accepted_nonzero = os.environ['RUNNER'] == 'hermes' and hermes_ec == 134 and canonical_valid and not provider_failure_detected
workflow_status = (extract.get('workflow_status') or 'needs_review') if canonical_valid and (hermes_ec == 0 or accepted_nonzero) else 'failed'
if canonical_valid and hermes_ec == 0:
    runner_status = 'succeeded'
elif accepted_nonzero:
    runner_status = 'succeeded_nonzero_with_valid_json'
elif hermes_ec == 124:
    runner_status = 'failed_timeout'
elif hermes_ec != 0:
    runner_status = 'failed_nonzero'
elif canonical_found:
    runner_status = 'failed_schema_invalid'
else:
    runner_status = 'failed_no_canonical_json'
finished = subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ'], text=True).strip()
runner = {
  'schema': 'callscore.runner_receipt.v1',
  'run_id': os.environ['RUN_ID'],
  'workflow_id': os.environ['TASK_ID'],
  'raw_output_path': os.environ['RAW_OUTPUT_FILE'],
  'canonical_json_path': os.environ['CANONICAL_JSON_FILE'],
  'canonical_json_found': canonical_found,
  'canonical_json_valid': canonical_valid,
  'schema_errors': extract.get('schema_errors') or [],
  'hermes_exit_code': hermes_ec,
  'wrapper_exit_code': wrapper_ec,
  'runner_status': runner_status,
  'provider_failure_detected': provider_failure_detected,
  'workflow_status': workflow_status,
  'execution_mode': os.environ['EXECUTION_MODE'],
  'runner_type': os.environ['RUNNER'],
  'finished_at_utc': finished,
}
Path(os.environ['RUNNER_RECEIPT_FILE']).write_text(json.dumps(runner, indent=2, sort_keys=True)+'\n')
legacy_status = 'SUCCEEDED' if runner_status in {'succeeded', 'succeeded_nonzero_with_valid_json'} else runner_status.upper()
legacy = {
  'schema': 'callscore_channel_head_receipt.v1',
  'channel': os.environ['CHANNEL'],
  'task_id': os.environ['TASK_ID'],
  'run_id': os.environ['RUN_ID'],
  'exit_code': wrapper_ec,
  'hermes_exit_code': hermes_ec,
  'status': legacy_status,
  'runner_status': runner_status,
  'workflow_status': workflow_status,
  'model_override': os.environ.get('MODEL_OVERRIDE') or None,
  'toolsets': os.environ.get('TOOLSET_OVERRIDE') or None,
  'skills': os.environ.get('SKILLS_OVERRIDE') or None,
  'execution_mode': os.environ['EXECUTION_MODE'],
  'runner_type': os.environ['RUNNER'],
  'child_subagents_enabled': 'delegation' in (os.environ.get('TOOLSET_OVERRIDE') or '').split(','),
  'raw_output_path': os.environ['RAW_OUTPUT_FILE'],
  'canonical_json_path': os.environ['CANONICAL_JSON_FILE'] if canonical_valid else None,
  'runner_receipt_path': os.environ['RUNNER_RECEIPT_FILE'],
  'finished_at_utc': finished,
}
Path(os.environ['LEGACY_RECEIPT_FILE']).write_text(json.dumps(legacy, indent=2, sort_keys=True)+'\n')
PY
  mv "$ACTIVE_FILE" "$COMPLETED_FILE" 2>/dev/null || true
  tmux kill-session -t "cs-${CHANNEL}" 2>/dev/null || true
}
trap cleanup EXIT

export HERMES_HOME=/srv/agents/hermes
export HERMES_PROFILE="$PROFILE"
export CALLSCORE_EXECUTION_MODE="$EXECUTION_MODE"
HERMES_ARGS=()
[ -n "$MODEL_OVERRIDE" ] && HERMES_ARGS+=(--model "$MODEL_OVERRIDE")
[ -n "$TOOLSET_OVERRIDE" ] && HERMES_ARGS+=(--toolsets "$TOOLSET_OVERRIDE")
[ -n "$SKILLS_OVERRIDE" ] && HERMES_ARGS+=(--skills "$SKILLS_OVERRIDE")
set +e
rm -f "$RAW_OUTPUT_FILE" "$CANONICAL_JSON_FILE" "$EXTRACT_RESULT_FILE" "$STDOUT_COMPAT_FILE" "$RUNNER_RECEIPT_FILE" "$LEGACY_RECEIPT_FILE" "$HERMES_EXIT_FILE" "$PROVIDER_FAILURE_FILE"
if [ "$RUNNER" = "sentinel_v2" ]; then
  if [ -n "${CALLSCORE_SENTINEL_V2_COMMAND:-}" ]; then
    timeout "$MAX_DUR" "$CALLSCORE_SENTINEL_V2_COMMAND" | tee "$RAW_OUTPUT_FILE"
    hermes_ec=${PIPESTATUS[0]}
  else
    timeout "$MAX_DUR" /usr/bin/npm --prefix /opt/crypto-tuber-ranked run sentinel:leaderboard:v2 -- --output-root "$RUNTIME_DIR/sentinel-v2" | tee "$RAW_OUTPUT_FILE"
    hermes_ec=${PIPESTATUS[0]}
  fi
elif [ "$RUNNER" = "hermes" ]; then
  timeout "$MAX_DUR" "$HERMES_COMMAND" "${HERMES_ARGS[@]}" -z "$PROMPT" | tee "$RAW_OUTPUT_FILE"
  hermes_ec=${PIPESTATUS[0]}
else
  printf '{"schema":"callscore.channel_head_runner_failure.v1","status":"failed","workflow_status":"unsupported_runner","runner":"%s"}\n' "$RUNNER" | tee "$RAW_OUTPUT_FILE"
  hermes_ec=2
fi
set -e
echo "$hermes_ec" > "$HERMES_EXIT_FILE"
wrapper_exit="$hermes_ec"
if [ "$RUNNER" = "hermes" ]; then
  python3 "$COOLDOWN_HELPER" "$RAW_OUTPUT_FILE" "$PROVIDER_COOLDOWN_STATE" "$RUN_ID" >/dev/null 2>&1 || true
  if python3 - "$PROVIDER_COOLDOWN_STATE" "$RUN_ID" <<'PY'
import json, sys
from pathlib import Path
path, run_id = Path(sys.argv[1]), sys.argv[2]
try:
    current = json.loads(path.read_text())
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if run_id in (current.get('source_runs') or []) else 1)
PY
  then
    : > "$PROVIDER_FAILURE_FILE"
  fi
  if [ "$hermes_ec" -eq 134 ] && [ ! -f "$PROVIDER_FAILURE_FILE" ] && [ -s "$RAW_OUTPUT_FILE" ]; then
    python3 "$EXTRACTOR" "$RAW_OUTPUT_FILE" "$CANONICAL_JSON_FILE" "callscore.workflow_canonical_output.v1" > "$EXTRACT_RESULT_FILE" 2>/dev/null || true
    if python3 - "$EXTRACT_RESULT_FILE" <<'PY'
import json, sys
try:
    result = json.load(open(sys.argv[1]))
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if result.get('canonical_json_valid') is True else 1)
PY
    then
      wrapper_exit=0
    fi
  fi
fi
exit "$wrapper_exit"
