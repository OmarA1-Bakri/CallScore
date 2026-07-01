# CallScore Channel-Head Runtime Defaults Patch — 2026-07-01

Kanban: `callscore-channel-orchestrator-retask-20260701` / `t_bd2f9174`

## Verdict

Runtime default patch applied.

The operational Hermes channel-head orchestrator now defaults to one active channel lane and the active daily tasklist is set to `max_active: 1`. No tmux channel-head lane was launched during this patch.

## Runtime files patched

Outside the app repo, under Hermes runtime/control state:

```text
/srv/agents/hermes/scripts/callscore-channel-orchestrator.sh
/srv/agents/hermes/scripts/callscore-daily-orchestrator.sh
/srv/agents/hermes/runtime/channel-head-orchestrator/tasklists/daily-2026-07-01.json
```

## Exact changes

### callscore-channel-orchestrator.sh

```text
MAX_ACTIVE_CHANNELS default: 2 -> 1
comment: default 2, max 3 -> default 1, hard max 3
```

The hard cap remains 3.

### callscore-daily-orchestrator.sh

```text
max_active fallback: 2 -> 1
comment: default 2, cap 3 -> default 1, hard cap 3
```

The hard cap remains 3.

### active daily tasklist

```json
"max_active": 1
```

## Verification

Passed:

```bash
bash -n /srv/agents/hermes/scripts/callscore-channel-orchestrator.sh
bash -n /srv/agents/hermes/scripts/callscore-daily-orchestrator.sh
bash -n /srv/agents/hermes/scripts/cs-channel-wrapper.sh
python3 -m json.tool /srv/agents/hermes/runtime/channel-head-orchestrator/tasklists/daily-2026-07-01.json
```

Runtime non-launch proof:

```text
matching cs-head/cs-run/cs-* tmux sessions: none
active task files: 0
```

App repo tests already protecting the contract:

```bash
node --import tsx --test tests/channel-head-orchestrator-config.test.ts
npm run typecheck
```

## Remaining implementation work

- Shared SQL team memory vault.
- Agent message inbox/outbox.
- Daily website freshness proof.
- Dedicated script-only scheduler cron.
- Non-public CMO canary.
