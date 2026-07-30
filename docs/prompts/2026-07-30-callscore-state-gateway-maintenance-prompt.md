# Execution Prompt — CallScore Phase R1 State, Snapshot and Gateway Maintenance

You are the CallScore canonical recovery supervisor operating on `hermes-agent-box` in `/opt/crypto-tuber-ranked`.

## Operator authorisation

When Omar supplies this document as the initiating execution prompt, it authorises **Phase R1 storage, snapshot and gateway maintenance only** under the exact bounds below.

It does not authorise credential rotation, provider/public mutation, deployment, image rebuild, service scaling, paid action, messaging, production publication, Whop/payment/customer mutation, production schema change or broad deletion.

The document existing in the repository is not standing mutation authority. The initiating user message must explicitly say to run/execute this prompt or authorise state and gateway maintenance. Otherwise stop after read-only preflight.

## Canonical plan and frozen evidence

Read in full:

- `/opt/crypto-tuber-ranked/docs/plans/2026-07-30-callscore-full-system-recovery-and-activation.md`
- `/opt/crypto-tuber-ranked/.tmp/system-status/callscore-whole-system-20260730T022510Z.json`
- `/opt/crypto-tuber-ranked/.tmp/system-status/callscore-whole-system-20260730T022510Z.json.sha256`

Verify their hashes before acting. Load:

- `orchestration/callscore-startup`
- `callscore-canonical-runtime`
- `orchestration/hermes-orchestrator`
- `task-router`
- `hermes-agent`
- `devops/durable-agent-state`
- `agent-state-relocation`
- `devops/workplane-status`
- `devops/workplane-diagnostics`
- `mlops/langgraph-workplane`
- `software-development/test-driven-development`
- `software-development/systematic-debugging`
- `software-development/receipt-backed-gate-review`
- `software-development/parent-verification-of-agent-output`
- `github/committing-user-work-safely`

Use Codebase Memory MCP for `/opt/crypto-tuber-ranked` and inspect live source before any code change.

## Objective

Restore durable Hermes session writes and disk headroom, replace the broken live-tar snapshot path with one verified atomic local rollback snapshot, and move the running CallScore gateway from a manual PID to the enabled canonical user unit.

At completion:

- root free space is at least 20 GiB and root usage is below 90%; target at least 30 GiB;
- `state.db` quick-check returns `ok`;
- compact v23 external-content FTS is active;
- exactly one verified canonical local rollback snapshot exists;
- `agent-snapshot.service` passes and its timer is active;
- `hermes-callscore-gateway.service` is active and owns the only gateway PID;
- a fresh Hermes session write succeeds;
- a graph-owned daily-pipeline canary no longer fails from storage;
- workers, Workplane, Langfuse, Sentinel and public website remain healthy;
- no action outside Phase R1 occurred.

## Starting facts to verify, not assume

At plan-authoring time:

- `/` was 95% used with about 8.7 GiB free.
- `/srv/agents/hermes/profiles/callscore/state.db` was about 13.8 GB.
- schema version was 23, but `messages_fts` and `messages_fts_trigram` still owned duplicate content.
- local snapshot candidate was `/srv/agents/hermes/profiles/callscore/state-snapshots/20260728-025055-pre-update/`.
- dry-run candidates were 2,296 ended cron sessions older than 1 day and 458 ended subagent sessions older than 1 day.
- `/usr/local/bin/agent-snapshot` tarred changing live Hermes files and its latest run failed.
- manual gateway PID `2725893` was live while enabled user `hermes-callscore-gateway.service` was failed.
- both mandatory Docker workers were healthy.

All values may have changed. Re-read live state and write the new baseline receipt.

## Allowed mutations

You may:

1. Stop and restart only:
   - user `hermes-callscore-gateway.service` or the manual CallScore gateway it replaces;
   - system `agent-snapshot.timer`/`.service`;
   - system `callscore-daily-pipeline.timer`/`.service` for the bounded maintenance/canary window.
2. Run the supported Hermes compact-FTS migration and storage optimisation.
3. Prune only ended, unpinned, non-archived sessions matching exactly:
   - `source=cron`, inactive over `1d`;
   - `source=subagent`, inactive over `1d`.
4. Implement the snapshot fix through canonical source under `/srv/agents/repos/callscore-workplane`, test it RED -> GREEN, then install the verified artifact at `/usr/local/bin/agent-snapshot` with an install receipt.
5. Create one fresh private rollback snapshot using SQLite backup semantics.
6. Delete exactly the one superseded snapshot directory only after the new snapshot passes every promotion and restore-readback gate.
7. Write local plans, tests, code, manifests and receipts necessary for this phase.

## Forbidden mutations

Do not:

- prune `cli`, messaging, `tool`, `callscore-child-agent`, active, pinned or archived sessions;
- print, inspect, copy into receipts, transform or rotate credential values;
- add secret-bearing files to the new snapshot;
- edit `.env.hermes`;
- call any provider directly;
- publish, send, spend or deploy;
- rebuild images, alter replicas or broadly restart containers;
- mutate PostgreSQL except through the already-approved graph-owned daily-pipeline canary;
- run a DB schema migration;
- stop unrelated services or timers;
- use broad globs, `git clean`, reset, stash, force operations, or unreviewed `rm`;
- delete the old snapshot before the new snapshot is validated and restored in isolation;
- enable CMO/publication or YouTube-consumer mutation lanes before a later canonical activation pass;
- claim that Workplane `READY_PUBLIC_OWNED` makes the globally blocked system autonomous.

## Emergency halt

Stop immediately, preserve evidence and return `blocked` if any of these occurs:

- root free space drops below 3 GiB or usage reaches 97%;
- SQLite quick-check is not exactly `ok`;
- the existing rollback candidate cannot be validated before state mutation;
- a mandatory worker becomes restarting/exited;
- a protected path becomes unreadable;
- a secret value appears in output or a receipt;
- Git state changes outside the exact phase files;
- a deletion candidate is active, pinned, archived or outside the exact two source/age filters;
- compact used bytes plus 2 GiB exceed filesystem free bytes before VACUUM;
- public website, Workplane or Langfuse regresses after maintenance;
- canonical gateway cannot take ownership without a second gateway process.

Never bypass an emergency halt to make progress.

## Execution sequence

### Step 0 — Immutable preflight

1. Run task-router and record its route.
2. Verify the plan/prompt commit and hashes. If three independent immutable-target reviews are absent or any verdict is not PASS, perform read-only preflight only and return `blocked_plan_review_required`.
3. Verify repository safety:

```bash
cd /opt/crypto-tuber-ranked
git status --short
git rev-parse HEAD
git rev-parse HEAD^{tree}
```

4. Create a private control directory:

```text
/opt/crypto-tuber-ranked/.tmp/system-recovery/<UTC-run-id>/
```

5. Write `master-state.json` and all logs atomically with mode `0600`. Use top-level `schema`, never `receipt_type` or `receipt_schema`.

### Step 1 — Secret-safe live baseline

Capture without secret values:

- `df -B1 /`, `df -i /`;
- DB/WAL/SHM path, bytes, mode, owner and timestamps;
- SQLite schema version, page size, page count, freelist count and FTS definitions;
- sessions/messages counts and source aggregates;
- exact dry-run prune manifests;
- gateway CLI status, user unit state/PID and process list;
- the two system timers/services;
- both mandatory Docker worker states and exec probes;
- queue counts;
- Workplane JSON;
- latest Langfuse read check;
- Sentinel and website freshness.

Do not source or print `.env.hermes` except inside existing commands that already suppress values. Persist hashes/names only.

### Step 2 — Validate rollback candidate

For `/srv/agents/hermes/profiles/callscore/state-snapshots/20260728-025055-pre-update/`:

1. Record directory/file metadata and SHA-256 values only.
2. Do not read secret-bearing file contents.
3. Run read-only SQLite quick-check with a bounded timeout.
4. Verify session/message tables can be counted and schema is readable.
5. Write `callscore.state_snapshot_validation_receipt.v1`.
6. Stop if validation fails.

### Step 3 — Quiesce writers

1. Record current enabled/active state for the three named timer/service groups.
2. Stop `agent-snapshot.timer` and `callscore-daily-pipeline.timer` for the window.
3. Ensure neither oneshot service is currently running.
4. Stop the manual gateway using the CallScore profile CLI.
5. Verify its PID exits and no CallScore cron run remains active.
6. Verify PostgreSQL pipeline/channel queues have no running item.
7. Keep mandatory Docker workers live unless direct evidence proves they hold the Hermes state DB.
8. Write a quiesce receipt before storage mutation.

### Step 4 — Migrate FTS to compact layout

Recheck free bytes. Require at least 30% of the live DB size.

Run exactly:

```bash
hermes --profile callscore sessions optimize-storage --no-vacuum --yes
```

Then verify:

- compact external-content FTS definitions are present;
- legacy content-owning FTS shadow tables are absent;
- `PRAGMA quick_check` returns `ok`;
- sessions/messages counts are unchanged from the pre-migration baseline.

If the command reports failure, use its resumable supported path; do not manually edit `sqlite_master`.

### Step 5 — Prune exact background cohorts

Regenerate and hash:

```bash
hermes --profile callscore sessions prune --source cron --older-than 1d --dry-run
hermes --profile callscore sessions prune --source subagent --older-than 1d --dry-run
```

Programmatically verify every candidate against the permitted source, ended state, activity bound, pinned=false and archived=false.

Only then run:

```bash
hermes --profile callscore sessions prune --source cron --older-than 1d --yes
hermes --profile callscore sessions prune --source subagent --older-than 1d --yes
```

Record exact candidate count, deleted count, manifest path and manifest SHA-256. Do not persist message bodies.

### Step 6 — Reclaim physical storage

Compute:

```text
compact_used_bytes = (page_count - freelist_count) * page_size
```

Require:

```text
filesystem_free_bytes >= compact_used_bytes + 2147483648
```

Then run:

```bash
hermes --profile callscore sessions optimize
```

Verify:

- `PRAGMA quick_check=ok`;
- WAL checkpoint succeeds;
- session counts equal pre-prune count minus exactly deleted cohorts;
- `hermes --profile callscore sessions stats` succeeds;
- root free space is at least 20 GiB and root usage below 90%.

If free space remains below target 30 GiB, create an exact safe-candidate manifest and stop. Do not expand deletion authority.

### Step 7 — Replace snapshot implementation with TDD

The canonical implementation must be committed in `/srv/agents/repos/callscore-workplane`; `/usr/local/bin/agent-snapshot` is an installed copy.

Before editing:

1. inspect that repo's `AGENTS.md`/instructions and dirty state;
2. preserve unrelated work;
3. create an isolated worktree if dirty;
4. identify or create the narrow `scripts/ops` and `tests/ops` locations.

RED tests must prove:

- a raw live-DB tar path is forbidden;
- quick-check failure prevents promotion;
- secret-bearing files are absent from the new snapshot manifest;
- atomic-promotion failure preserves the prior verified snapshot;
- retention cannot delete more than one exact superseded path;
- restore-readback is required before old-snapshot deletion.

Observe RED failures. Implement the minimum solution using SQLite online backup, private staging, atomic promotion, SHA-256 manifest, mode checks, one-snapshot retention and isolated restore-readback. Observe GREEN. Run the repo's full applicable test/static gates and `git diff --check`.

Create a focused commit. Install by checksum from the committed source to `/usr/local/bin/agent-snapshot`; record source commit, source hash and installed hash. Never make `/usr/local/bin` the only source of truth.

### Step 8 — Create and promote one canonical snapshot

1. Run the new snapshot implementation while the gateway remains stopped.
2. Require private directory/file modes.
3. Require SQLite quick-check and isolated restore-readback.
4. Require manifest and SHA-256 verification.
5. Require recovery metadata for the unpushed `/opt/crypto-tuber-ranked` refs without build caches or secret files.
6. Only after all checks pass, delete the exact old snapshot directory recorded in the promotion receipt.
7. Verify exactly one canonical snapshot remains.
8. Run `agent-snapshot.service` once as a canary; require exit 0 and no second retained history.
9. Re-enable/start `agent-snapshot.timer` only after canary success.

### Step 9 — Transfer gateway ownership to systemd

1. Confirm the manual PID remains absent.
2. Run:

```bash
systemctl --user daemon-reload
systemctl --user reset-failed hermes-callscore-gateway.service
systemctl --user start hermes-callscore-gateway.service
```

3. Verify unit active, nonzero `MainPID`, gateway status PID equals `MainPID`, and no second gateway process exists.
4. Verify legacy `hermes-gateway.service` remains masked/disabled.
5. Verify ticker heartbeat advances.
6. Run one safe local heartbeat cron job and verify a new session plus durable receipt is stored.

Do not use `hermes gateway install`; the canonical unit already exists.

### Step 10 — Daily pipeline canary and safe re-arm

1. Re-run Workplane and verify no mandatory blocker.
2. Start one `callscore-daily-pipeline.service` canary through its installed graph-owned wrapper.
3. Require exit 0 or a receipt-backed non-storage domain blocker. `No space left on device`, `mktemp` failure or session-write failure is not acceptable.
4. Re-enable/start its timer only after the storage path passes.
5. Keep CMO/publication and YouTube consumer mutation lanes paused until a later Phase R5 activation pass.

### Step 11 — Parent verification

Run and directly inspect:

```bash
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
cd /opt/crypto-tuber-ranked && npm run workplane:status
cd /opt/crypto-tuber-ranked && npm run sentinel:fresh-calls
cd /opt/crypto-tuber-ranked && npm run sentinel:leaderboard:v2
cd /opt/crypto-tuber-ranked && npm run hygiene:secrets
cd /opt/crypto-tuber-ranked && npx tsc --noEmit
cd /opt/crypto-tuber-ranked && git diff --check
/srv/agents/hermes/scripts/callscore-live-website-freshness-proof.sh
```

Also verify:

- root bytes/inodes;
- SQLite quick-check and compact FTS shape;
- exactly one snapshot and restore-readback receipt;
- systemd gateway ownership;
- fresh session persistence;
- snapshot and daily-pipeline units/timers;
- both worker exec probes and restart counts;
- queue counts;
- Langfuse HTTP 200 and latest trace;
- no provider/public/credential/deployment/image/scale mutation.

## Receipt paths

Write under:

```text
/opt/crypto-tuber-ranked/.tmp/system-recovery/<run-id>/
```

Required files:

- `master-state.json`
- `baseline.json`
- `rollback-candidate-validation.json`
- `writer-quiesce.json`
- `fts-migration.json`
- `session-prune-manifest.json`
- `storage-reclamation.json`
- `snapshot-implementation.json`
- `snapshot-promotion.json`
- `gateway-handoff.json`
- `daily-pipeline-canary.json`
- `phase-r1-final.json`
- adjacent `.sha256` files

Use top-level `schema`. Set files to mode `0600`. Never include secret values or message bodies.

## Completion rule

Phase R1 passes only if every mandatory acceptance check passes. Partial success remains `blocked` with the exact rollback state and next action. Do not continue to credential rotation or canonical activation in the same run.

## Final response

Return exactly one valid JSON object and no prose outside it:

```json
{
  "schema": "callscore.phase_r1_operator_result.v1",
  "status": "pass|blocked|failed",
  "phase": "R1_storage_snapshot_gateway",
  "actions_performed": [],
  "mutations_performed": {
    "session_store": false,
    "snapshot": false,
    "systemd": false,
    "provider": false,
    "public": false,
    "credentials": false,
    "production_database": false,
    "deployment": false
  },
  "storage": {},
  "snapshot": {},
  "gateway": {},
  "workers": {},
  "verification": {
    "workplane": null,
    "canonical_agents": null,
    "sentinel": null,
    "website_freshness": null,
    "langfuse_checked": null,
    "secret_hygiene": null
  },
  "evidence": [],
  "blockers": [],
  "rollback_status": "ready|performed|not_needed|blocked",
  "next_action": "Proceed to Phase R2 credential authority mapping only after a separate explicit operator instruction."
}
```
