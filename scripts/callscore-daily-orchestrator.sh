#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
RUNTIME="${CALLSCORE_CHANNEL_HEAD_RUNTIME:-${CALLSCORE_CHANNEL_ORCHESTRATOR_RUNTIME:-/srv/agents/hermes/runtime/channel-head-orchestrator}}"
TASKLIST="${CALLSCORE_CHANNEL_HEAD_TASKLIST:-$RUNTIME/tasklists/current.tasklist}"
WRAPPER="${CALLSCORE_CHANNEL_HEAD_WRAPPER:-/srv/agents/hermes/scripts/cs-channel-wrapper.sh}"
HARD_MAX=3

mkdir -p "$RUNTIME"/{active,completed,logs,receipts,scheduler-receipts,state,daily-summaries}

python3 - "$MODE" "$RUNTIME" "$TASKLIST" "$WRAPPER" "$HARD_MAX" <<'PY'
import json, os, shlex, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

mode, runtime_raw, tasklist_raw, wrapper, hard_max_raw = sys.argv[1:]
runtime = Path(runtime_raw)
tasklist_path = Path(tasklist_raw)
hard_max = int(hard_max_raw)
if not tasklist_path.exists():
    raise SystemExit(f"FATAL: tasklist missing: {tasklist_path}")

tasklist = json.loads(tasklist_path.read_text())
channels = tasklist.get("channels") or []
tasklist_id = str(tasklist.get("id") or tasklist.get("date") or tasklist_path.name)
now = os.environ.get("CALLSCORE_NOW_UTC") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
stamp = now.replace("-", "").replace(":", "")

if mode == "summary":
    runs = []
    for path in sorted((runtime / "completed").glob("*.json")):
        try:
            row = json.loads(path.read_text())
        except Exception:
            continue
        if row.get("tasklist_id") == tasklist_id:
            runs.append(row)
    unique = sorted({f"{row.get('channel','')}:{row.get('task_id','')}" for row in runs})
    summary = {
        "schema": "callscore.channel_head_tasklist_summary.v2",
        "generated_at_utc": now,
        "tasklist_id": tasklist_id,
        "tasklist_date": tasklist.get("date"),
        "tasks_total": sum(len(channel.get("tasks") or []) for channel in channels),
        "completed_runs_for_tasklist": len(runs),
        "unique_tasks_completed": len(unique),
        "unique_task_keys": unique,
    }
    out = runtime / "daily-summaries" / f"{stamp}-summary.json"
    out.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    print(json.dumps(summary, sort_keys=True))
    raise SystemExit(0)

if mode == "status":
    state_path = runtime / "state" / "scheduler-state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    print(json.dumps({
        "schema": "callscore.channel_head_scheduler_status.v1",
        "tasklist_id": tasklist_id,
        "channel_count": len(channels),
        "next_cursor": int(state.get("next_cursor", 0)),
        "pulse_sequence": int(state.get("pulse_sequence", 0)),
    }, sort_keys=True))
    raise SystemExit(0)

if mode != "run":
    raise SystemExit(f"Usage: {sys.argv[0]} [run|summary|status]")

state_path = runtime / "state" / "scheduler-state.json"
try:
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
except Exception:
    state = {}
sequence = int(state.get("pulse_sequence", 0)) + 1
count = len(channels)
cursor = int(state.get("next_cursor", 0)) % count if count else 0
requested = int(tasklist.get("max_active") or (tasklist.get("constraints") or {}).get("max_active_channels") or 1)
max_active = max(1, min(requested, hard_max))

cooldown_path = runtime / "state" / "provider-cooldown.json"
try:
    cooldown = json.loads(cooldown_path.read_text()) if cooldown_path.exists() else {}
    cooldown_until = datetime.fromisoformat(str(cooldown.get("until_utc", "")).replace("Z", "+00:00"))
    pulse_now = datetime.fromisoformat(now.replace("Z", "+00:00"))
    cooldown_active = cooldown_until > pulse_now
except Exception:
    cooldown = {}
    cooldown_active = False

tmux = shutil.which("tmux")
if not tmux:
    raise SystemExit("FATAL: tmux not found")
active_sessions: set[str] = set()
listed = subprocess.run([tmux, "list-sessions", "-F", "#S"], text=True, capture_output=True)
if listed.returncode == 0:
    active_sessions = {line.strip() for line in listed.stdout.splitlines() if line.strip().startswith("cs-")}
active_before = sorted(active_sessions)
slots = max(0, max_active - len(active_sessions))
dispatched: list[str] = []
run_ids: list[str] = []
spawn_failures: list[dict[str, object]] = []
last_considered = cursor - 1

for step in range(count):
    if len(dispatched) >= slots:
        break
    index = (cursor + step) % count
    last_considered = index
    channel_cfg = channels[index]
    channel = str(channel_cfg.get("channel") or "").strip()
    if not channel or f"cs-{channel}" in active_sessions:
        continue
    tasks = channel_cfg.get("tasks") or []
    if not tasks:
        continue
    task = tasks[0]
    runner = str(task.get("runner") or channel_cfg.get("runner") or "hermes")
    if cooldown_active and runner != "sentinel_v2":
        continue
    task_id = str(task.get("id") or f"{channel}-task")
    run_id = f"{channel}-{stamp}-p{sequence:06d}-{task_id}"
    pulse_id = f"scheduler-{stamp}-p{sequence:06d}"
    active_file = runtime / "active" / f"{run_id}.json"
    payload = {
        "schema": "callscore.channel_head_active_task.v2",
        "tasklist_id": tasklist_id,
        "scheduler_pulse_id": pulse_id,
        "channel": channel,
        "task_id": task_id,
        "run_id": run_id,
        "profile": task.get("profile") or channel_cfg.get("profile") or "callscore",
        "runner": runner,
        "model": task.get("model") or channel_cfg.get("model"),
        "prompt": task.get("prompt") or "",
        "max_duration_seconds": int(task.get("max_duration_seconds") or channel_cfg.get("max_duration_seconds") or 600),
        "execution_mode": task.get("execution_mode") or channel_cfg.get("execution_mode") or "read_only_verify",
        "require_child_verifier": bool(task.get("require_child_verifier", channel_cfg.get("require_child_verifier", False))),
        "toolsets": task.get("toolsets") or channel_cfg.get("toolsets"),
        "skills": task.get("skills") or channel_cfg.get("skills"),
        "created_at_utc": now,
    }
    active_file.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    command = f"{shlex.quote(wrapper)} {shlex.quote(str(active_file))}"
    spawned = subprocess.run([tmux, "new-session", "-d", "-s", f"cs-{channel}", command], text=True, capture_output=True)
    if spawned.returncode != 0:
        active_file.unlink(missing_ok=True)
        spawn_failures.append({"channel": channel, "exit_code": spawned.returncode, "stderr": spawned.stderr[-500:]})
        continue
    dispatched.append(channel)
    run_ids.append(run_id)
    active_sessions.add(f"cs-{channel}")

next_cursor = ((last_considered + 1) % count) if count and last_considered >= 0 else cursor
new_state = {
    "schema": "callscore.channel_head_scheduler_state.v1",
    "tasklist_id": tasklist_id,
    "next_cursor": next_cursor,
    "pulse_sequence": sequence,
    "last_pulse_at_utc": now,
    "last_channels_dispatched": dispatched,
}
if cooldown_active:
    new_state["provider_cooldown_until_utc"] = cooldown.get("until_utc")
tmp_state = state_path.with_suffix(".tmp")
tmp_state.write_text(json.dumps(new_state, indent=2, sort_keys=True) + "\n")
tmp_state.replace(state_path)
if spawn_failures:
    pulse_status = "degraded"
elif cooldown_active and dispatched:
    pulse_status = "degraded_provider_cooldown_local_only"
elif cooldown_active:
    pulse_status = "blocked_provider_cooldown"
else:
    pulse_status = "ok"
pulse = {
    "schema": "callscore.channel_head_scheduler_pulse_receipt.v1",
    "pulse_id": f"scheduler-{stamp}-p{sequence:06d}",
    "created_at_utc": now,
    "tasklist_id": tasklist_id,
    "requested_max_active_channels": requested,
    "effective_max_active_channels": max_active,
    "active_before": active_before,
    "channels_dispatched": dispatched,
    "run_ids": run_ids,
    "spawn_failures": spawn_failures,
    "next_cursor": next_cursor,
    "status": pulse_status,
}
if cooldown_active:
    pulse["blockers"] = [str(cooldown.get("reason") or "provider_cooldown_active")]
    pulse["cooldown_until_utc"] = cooldown.get("until_utc")
receipt_path = runtime / "scheduler-receipts" / f"{stamp}-p{sequence:06d}.json"
receipt_path.write_text(json.dumps(pulse, indent=2, sort_keys=True) + "\n")
with (runtime / "logs" / "orchestrator.log").open("a") as log:
    log.write(json.dumps(pulse, sort_keys=True) + "\n")
print(json.dumps(pulse, sort_keys=True))
PY
