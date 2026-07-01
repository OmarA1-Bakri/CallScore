# CallScore Bounded Channel-Head Scheduler Cron Proof — 2026-07-01

Kanban: `callscore-channel-orchestrator-retask-20260701` / `t_e1be1388`

## Verdict

Dedicated Hermes cron scheduler is installed and safe-by-default.

The job exists, but it cannot launch a tmux channel-head lane unless this enable file exists:

```text
/srv/agents/hermes/runtime/channel-head-orchestrator/scheduler.enabled
```

This prevents accidental backwards movement into an always-on/multi-lane runtime before the non-public canary is intentionally run.

## Cron job

```text
job_id: 8bd323116227
name: CallScore bounded channel-head tmux scheduler
schedule: */15 * * * *
script: callscore-channel-head-scheduler.sh
mode: no_agent=true
workdir: /opt/crypto-tuber-ranked
next_run_at: 2026-07-01T18:45:00+01:00
```

## Runtime model enforced

```text
Hermes cron scheduler
→ repo scheduler wrapper
→ /srv/agents/hermes/scripts/callscore-daily-orchestrator.sh
→ one bounded tmux lane by default
→ channel-head Hermes profile/subagent inside tmux
→ channel head may spawn child agents inside lane
→ artifacts/receipts/team-memory refs
```

## Safety controls

- disabled by default unless `scheduler.enabled` exists.
- default max active channel lanes remains 1.
- hard max remains 3 in orchestrator.
- no public/provider mutation from scheduler.
- no all-head autoseeding.
- no always-on LLM fleet.

## Verification

Ran while disabled:

```bash
scripts/callscore-channel-head-scheduler.sh
```

Output:

```text
callscore-channel-head-scheduler disabled: missing /srv/agents/hermes/runtime/channel-head-orchestrator/scheduler.enabled
```

No runtime launch:

```text
matching cs-head/cs-run/cs-* tmux sessions: none
active task files: 0
```

Syntax checks passed:

```bash
bash -n scripts/callscore-channel-head-scheduler.sh
bash -n /srv/agents/hermes/profiles/callscore/scripts/callscore-channel-head-scheduler.sh
```

## Next step

Run `t_55870a81`: single-channel non-public CMO canary.

That canary may create `scheduler.enabled` only for a controlled one-channel run, then disable it again after verification.
