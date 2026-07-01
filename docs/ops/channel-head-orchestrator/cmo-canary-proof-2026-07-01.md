# CallScore Single-Channel Non-Public CMO Canary — 2026-07-01

Kanban: `callscore-channel-orchestrator-retask-20260701` / `t_55870a81`

## Verdict

Canary completed as a non-public intelligence run inside one tmux channel-head lane.

The CMO channel head produced a structured read-only receipt summary. No public/provider mutation occurred.

The Hermes CLI currently aborts with exit `134` after writing valid stdout; this was reproduced with a direct `hermes -z` smoke test. The tmux wrapper was hardened to preserve non-empty output as `NEEDS_REVIEW_NONZERO_WITH_OUTPUT` instead of losing the artifact.

## Run

```text
run_id: cmo-intel-canary-20260701T174337Z
channel: cmo
task_id: intel-canary
tmux lane: cs-cmo
scheduler: scripts/callscore-channel-head-scheduler.sh
```

## Receipt

```text
/srv/agents/hermes/runtime/channel-head-orchestrator/receipts/cmo-intel-canary-20260701T174337Z.receipt.json
```

Committed copy:

```text
docs/ops/channel-head-orchestrator/receipts/cmo-intel-canary-20260701T174337Z.receipt.json
```

Receipt summary:

```json
{
  "schema": "callscore_channel_head_receipt.v1",
  "channel": "cmo",
  "task_id": "intel-canary",
  "run_id": "cmo-intel-canary-20260701T174337Z",
  "exit_code": 0,
  "hermes_exit_code": 134,
  "status": "NEEDS_REVIEW_NONZERO_WITH_OUTPUT",
  "output_capture_path": "/srv/agents/hermes/runtime/channel-head-orchestrator/logs/cmo-intel-canary-20260701T174337Z.stdout.txt"
}
```

## Output artifact

```text
/srv/agents/hermes/runtime/channel-head-orchestrator/logs/cmo-intel-canary-20260701T174337Z.stdout.txt
```

Committed copy:

```text
docs/ops/channel-head-orchestrator/receipts/cmo-intel-canary-20260701T174337Z.stdout.txt
```

Output status:

```text
schema: callscore.cmo_head_read_only_intelligence_canary.v1
status: COMPLETED_READ_ONLY
agent_id: callscore-cmo-head
ready_to_publish: false
ready_to_call_provider_api: false
ready_for_non_public_intelligence_artifact: true
```

Mutation flags from the canary output:

```text
external_mutation_performed: false
provider_api_called: false
publish_or_post_performed: false
db_write_performed: false
deploy_or_infra_mutation_performed: false
secrets_read_or_printed: false
files_modified: false
```

## Important blocker discovered

Canonical audit inside the canary reported:

```text
status: blocked
blocker: profile_skill_ok=false because config_prompt_canonical_operational=false
```

This is a blocker for canonical green status, but not a blocker for the read-only canary itself.

## Wrapper hardening

Patched runtime wrapper:

```text
/srv/agents/hermes/scripts/cs-channel-wrapper.sh
```

New behavior:

- captures Hermes stdout to runtime artifact.
- stores `hermes_exit_code` separately.
- if Hermes exits nonzero but output exists, wrapper completes the task with `status=NEEDS_REVIEW_NONZERO_WITH_OUTPUT`.
- does not mark this as public/provider success.

## Direct Hermes CLI smoke reproduction

Command:

```bash
HERMES_HOME=/srv/agents/hermes HERMES_PROFILE=callscore /home/omar/.local/bin/hermes -z 'Return exactly: OK_CANARY_CLI'
```

Observed:

```text
stdout: OK_CANARY_CLI
exit: 134
```

So the canary output is usable, but final verification must keep the `hermes_exit_code=134` runtime defect visible.
