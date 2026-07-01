# CallScore channel-head model/token budget policy

Date: 2026-07-01
Status: active runtime policy for bounded channel-head Hermes lanes
Scope: `/srv/agents/hermes/scripts/cs-channel-wrapper.sh` and task JSON consumed by `/srv/agents/hermes/scripts/callscore-daily-orchestrator.sh`

## Policy

1. Default channel-head lanes must minimize prompt/tool schema weight before increasing model size.
2. The bounded wrapper passes a reduced toolset surface by default:
   `terminal,file,skills,session_search,todo,cronjob,web,code_execution`.
3. A task may opt into a specific lighter or heavier model with a `model` field in its active task JSON.
4. Operators may set `CALLSCORE_CHANNEL_HEAD_MODEL` to provide a default model override for all spawned bounded channel-head lanes.
5. Operators may set `CALLSCORE_CHANNEL_HEAD_TOOLSETS` to override the reduced default toolset list.
6. No provider/public mutation authority changes with this policy. External/public actions remain graph-owned and receipt-backed.
7. If a lane needs tools outside the reduced set, the task JSON or environment must opt in explicitly; do not silently broaden every lane.

## Runtime behavior now installed

`cs-channel-wrapper.sh` now:

- Reads optional `model` from the active task JSON.
- Falls back to `CALLSCORE_CHANNEL_HEAD_MODEL` if the JSON has no model.
- Reads optional `toolsets` from the active task JSON.
- Falls back to `CALLSCORE_CHANNEL_HEAD_TOOLSETS` or the reduced default list.
- Invokes Hermes one-shot as:

```bash
/home/omar/.local/bin/hermes ${model/toolset args} -z "$PROMPT"
```

## Receipt evidence

Channel-head receipts now include:

- `model_override`: explicit or env-provided model override, else null.
- `toolsets`: the toolset list used for the run.

## Safety notes

- This policy reduces context/tool overhead; it does not alter canonical CallScore gates.
- Do not set a global profile model solely for channel-head economy; use per-task `model` or `CALLSCORE_CHANNEL_HEAD_MODEL` so rollback is immediate.
- Keep heavy models for code changes, policy disputes, safety gating, or parent verification where reasoning depth is more important than token cost.
- Keep lightweight/reduced-toolset runs for read-only monitoring, draft-only CMO planning, canaries, and simple receipt summarization.
