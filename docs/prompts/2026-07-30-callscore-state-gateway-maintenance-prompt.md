# Execution Prompt — CallScore R1 State, Snapshot and Gateway Maintenance v2

You are the CallScore canonical recovery supervisor on `hermes-agent-box`. Work against `/opt/crypto-tuber-ranked`, but do not execute destructive maintenance from the target CallScore profile, gateway or any process holding its state DB.

## Authority and hard scope

This prompt is a bounded Phase R1 template. The file existing or being read is not mutation authority.

Destructive R1 execution requires both:

1. Omar's initiating message explicitly says to run/execute this prompt or authorises CallScore R1 state and gateway maintenance; and
2. a pre-existing root-owned read-only authorisation record matching this run exists at `/var/lib/callscore/approvals/r1/<nonce>.json` with schema `callscore.r1_maintenance_authorization.v1`.

If either is absent, perform read-only preflight only and return `blocked_authorization_required`.

R1 authorises only:

- building and installing the exact reviewed maintenance/snapshot/session-probe tools;
- pausing exact named provider-capable CallScore cron jobs;
- disabling the write-capable daily-pipeline timer;
- stopping/restarting the exact gateway and snapshot units;
- creating and validating opaque private SQLite rollback snapshots;
- compact-FTS migration and supported storage optimisation;
- zero-provider/zero-PostgreSQL session and filesystem canaries;
- deletion of only snapshot paths exactly bound in the authorisation record after all gates pass;
- local receipts and focused Git commits.

R1 does not authorise:

- any session pruning;
- production PostgreSQL writes or the daily pipeline service;
- credential rotation or `.env.hermes` edits;
- provider/public mutation;
- deployment, image rebuild or scale change;
- paid action, messaging, publication or Whop/payment/customer mutation;
- DB schema migration;
- continuation into credential remediation, activation or autopilot.

## Canonical inputs

Read fully and verify live hashes:

- `/opt/crypto-tuber-ranked/docs/plans/2026-07-30-callscore-full-system-recovery-and-activation.md`
- `/opt/crypto-tuber-ranked/.tmp/system-status/callscore-whole-system-20260730T022510Z.json`
- `/opt/crypto-tuber-ranked/.tmp/system-status/callscore-whole-system-20260730T022510Z.json.sha256`

Load:

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

Use Codebase Memory MCP for `/opt/crypto-tuber-ranked` and inspect live source before code changes.

## Starting facts are stale until reverified

At planning time:

- root was 95% used with roughly 8.7 GiB free;
- target state DB was about 13.9 GB with v23 schema but content-owning FTS shadow tables;
- the only retained snapshot was July 28 and had over-permissive modes;
- a manual gateway PID was live while the canonical user unit was failed;
- the target DB also had an interactive Hermes holder;
- the daily pipeline unit directly executed `pipeline:daily -- --write`;
- provider-capable jobs `9c03a6eea969`, `144c3a9cc860` and `be1a78217918` were enabled;
- the Workplane repository had unrelated dirty/untracked files.

Re-read all state. Never reconstruct missing output.

## Mandatory out-of-band execution context

Before any mutation, verify the current executor's Hermes home and open file descriptors.

Abort destructive work unless:

- the executor uses a dedicated maintenance profile whose state DB is outside `/srv/agents/hermes/profiles/callscore`; or
- the deterministic executor is a reviewed transient systemd unit running as `User=omar` with state outside the target profile;
- neither the executor nor its parent holds `state.db`, `state.db-wal` or `state.db-shm` for the target profile.

The executor UID must equal `id -u omar`, never `0`. Root-only installation/system-unit steps may use exact reviewed `sudo` commands, but the executor must never write, replace or chmod the root-owned authorisation record.

If this prompt was started inside the target profile/gateway, perform read-only preflight, generate the exact maintenance-profile launch/handoff command, and return `blocked_out_of_band_runner_required`. Do not attempt to stop the gateway from inside itself.

## Authorisation-record gate

Read but never modify:

```text
/var/lib/callscore/approvals/r1/<nonce>.json
```

Require root ownership, mode `0444` or stricter, valid schema, unexpired timestamp and exact bindings for:

- nonce;
- executor UID and maintenance profile;
- plan/prompt commit, tree and hashes;
- three PASS-review result paths and hashes;
- target profile/state DB;
- exact permitted cron job IDs and systemd units;
- exact existing snapshot deletion path;
- exact temporary pre-R1 restore target/path;
- exact source/install command hashes;
- explicit prohibitions.

Any mismatch returns `blocked_authorization_binding_mismatch` before mutation.

## Emergency halt and mandatory finaliser

Create an out-of-band runner with:

- exclusive `/run/user/<omar-uid>/callscore-r1-maintenance.lock`;
- traps/finaliser for `EXIT`, `ERR`, `INT` and `TERM`;
- original gateway, unit, timer, cron and installed-artifact state recorded before mutation;
- exact rollback commands and hashes.

The finaliser always runs. On failure it must:

1. restore the prior installed snapshot binary/unit when installation did not pass;
2. verify DB integrity before restarting any writer;
3. restore canonical gateway supervision when DB integrity permits;
4. never resume provider-capable jobs or the daily write timer;
5. restore `agent-snapshot.timer` only when the installed snapshot path passed;
6. release maintenance protections;
7. verify final PIDs/unit states independently;
8. emit an explicit blocked state if any component intentionally remains disabled.

Halt if:

- root free falls below 3 GiB or usage reaches 97%;
- current pre-mutation restore point cannot be created and read back;
- SQLite quick-check or FTS integrity is not exactly successful;
- any unapproved process holds or opens target DB files;
- stable `data_version`/WAL observations fail;
- any secret value, session title/body, chat/user metadata, process environment or secret-bearing argv enters output;
- a mandatory worker regresses;
- public website, Workplane or Langfuse regresses;
- Git changes escape exact phase files;
- an action falls outside the root-owned authorisation record.

Never bypass a halt.

## Exact implementation locations

Use a clean isolated worktree, never the dirty Workplane primary worktree:

```text
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/
```

Create exactly:

```text
ops/hermes-state-maintenance/r1_maintenance.py
ops/hermes-state-maintenance/agent_snapshot.py
ops/hermes-state-maintenance/session_probe.py
ops/hermes-state-maintenance/test_r1_maintenance.py
ops/hermes-state-maintenance/test_agent_snapshot.py
ops/hermes-state-maintenance/test_session_probe.py
ops/hermes-state-maintenance/schemas/callscore-state-snapshot-manifest-v1.schema.json
ops/systemd/agent-snapshot.service
```

Install only checksum-verified committed artifacts as:

```text
/usr/local/bin/callscore-r1-maintenance
/usr/local/bin/agent-snapshot
/usr/local/bin/callscore-session-store-probe
/etc/systemd/system/agent-snapshot.service
```

Receipts bind source commit/hash, installed hash, owner, mode, exact argv hash, UID/PID, exit status and systemd InvocationID/journal cursor where applicable.

## Snapshot contract

The target state DB may be copied only as an opaque rollback payload. Do not inspect or extract values while copying.

Allowed snapshot contents are exactly:

- SQLite online backup output `state.db`;
- generated `manifest.json`;
- generated `restore-readback.json`;
- value-free commit/tree identifiers in `recovery-metadata.json`.

Reject every other file by default, including `.env*`, `auth.json`, provider config, key material, credential caches, logs, exports, process environments, command dumps and Git object bundles.

Reject symlinks and special files. Require root/directory mode `0700`, files `0600`, authorised owner, SHA-256 manifest, SQLite quick-check, FTS integrity, canonical count equality and isolated restore/readback.

The snapshot tool interface must be:

```text
agent-snapshot create --profile-home <absolute-path> --snapshot-root <absolute-path> --run-id <nonce> --defer-retention
agent-snapshot verify --snapshot <absolute-path>
agent-snapshot service-run --profile-home <absolute-path> --snapshot-root <absolute-path> --authorisation <absolute-path>
```

`create --defer-retention` cannot delete anything. `service-run` may delete only paths bound in the authorisation record after promotion gates pass.

## TDD gate

Before implementation, write and observe failing tests for:

- target-profile/executor DB-holder refusal;
- exact manual PID validation and bounded SIGTERM-only stop;
- finaliser execution on every failure path;
- raw live-DB tar rejection;
- online backup consistency during concurrent WAL writes;
- quick-check, FTS-integrity, manifest, permission and restore failures blocking promotion;
- strict snapshot allowlist and symlink/special-file denial;
- no deletion from `--defer-retention`;
- unapproved retention deletion refusal;
- exact zero-provider/zero-PostgreSQL session create/read/end/delete probe;
- FTS canary search appearance/disappearance;
- authorisation/review/hash mismatch fail-closed.

Observe RED. Implement the minimum solution. Observe GREEN. Run applicable full tests/static checks and `git diff --check`. Commit only exact files on the isolated branch. Do not merge or push.

## Execution sequence

### 0. Immutable preflight

1. Run task-router and record route.
2. Verify the current plan/prompt commit/tree/hashes.
3. Require three PASS reviews for that exact tuple.
4. Verify the root-owned authorisation record.
5. Verify the application repo is clean except authorised receipts.
6. Create private control directory:

```text
/opt/crypto-tuber-ranked/.tmp/system-recovery/<nonce>/
```

7. Write `master-state.json` atomically with mode `0600` and top-level `schema`.

### 1. Secret-safe baseline

Record without sensitive payloads:

- root bytes/inodes;
- DB/WAL/SHM path, bytes, owner, mode, timestamps;
- schema/page/freelist and FTS definitions;
- sessions/messages/source counts only;
- open DB handles, stable `data_version` and WAL observations;
- gateway CLI status, PID-file metadata, process identity and user unit;
- named system services/timers;
- exact named cron-job states;
- mandatory worker states/exec probes;
- queue counts;
- Workplane JSON;
- Langfuse HTTP/latest-trace metadata;
- Sentinel and website freshness.

Never persist raw prune output, titles, bodies, user/chat metadata, process environments or secret-bearing argv.

### 2. Build and install reviewed tooling

Create the isolated Workplane worktree from its current `HEAD`. Preserve all dirty primary-worktree state. Execute the TDD gate. Parent-read the committed bytes and test output. Install only when hashes match the root-owned authorisation record.

### 3. Restrict and validate the existing snapshot

For the exact July 28 snapshot path bound in authorisation:

1. reject symlinks/special files;
2. tighten directories to `0700` and files to `0600` before inspection;
3. hash opaque files without logging content;
4. run bounded state-DB quick-check and FTS integrity;
5. record schema and canonical counts;
6. retain it until a current pre-R1 restore point passes.

### 4. Pause forbidden writers

Run and verify:

```bash
hermes --profile callscore cron pause 9c03a6eea969
hermes --profile callscore cron pause 144c3a9cc860
hermes --profile callscore cron pause be1a78217918
sudo systemctl disable --now callscore-daily-pipeline.timer
sudo systemctl stop agent-snapshot.timer
```

Ensure `callscore-daily-pipeline.service` and `agent-snapshot.service` are inactive.

Audit other enabled target jobs read-only. If another provider-, PostgreSQL- or public-mutation-capable job is enabled, halt for amended authority. Do not broaden the pause set.

Keep the exact three jobs and daily timer paused/disabled throughout R1 and afterwards pending later activation/write authority.

### 5. Create current pre-mutation restore point

Before stopping the gateway or changing SQLite, create a current SQLite online backup at the exact temporary target bound in authorisation.

Require target free capacity for full backup plus 2 GiB. The current root filesystem does not meet this merely because the old snapshot exists. If no authorised external/attached target has enough capacity, return `blocked_current_restore_point_capacity` without FTS migration, VACUUM, snapshot deletion or gateway transfer.

Require:

- controlled concurrent WAL writer test;
- quick-check `ok`;
- FTS5 integrity-check for every present index;
- source/backup schema and canonical counts equal at backup boundary;
- SHA-256 manifest verification;
- isolated restore/readback;
- owner-only permissions.

Retain this immutable pre-R1 anchor until final R1 acceptance.

### 6. Quiesce target writers and stop manual gateway out-of-band

Do not call `hermes gateway stop`.

Use the reviewed helper to validate `/srv/agents/hermes/profiles/callscore/gateway.pid`, its owner/mode, PID start time, UID, executable, full cmdline, profile and gateway identity. Send `SIGTERM` only to that exact PID, wait boundedly, and fail without broad matching or `SIGKILL`.

Then require:

- manual PID absent;
- canonical user unit stopped/reset separately;
- no active target cron execution;
- no running pipeline/channel queue item;
- no unapproved DB/WAL/SHM handle;
- stable `data_version` and WAL state across two observations;
- an attempted unapproved target-profile write is rejected by the maintenance guard.

Write `writer-quiesce.json` before SQLite mutation.

### 7. Compact FTS

Recheck disk. Require free bytes at least 30% of live DB size.

Run exactly:

```bash
hermes --profile callscore sessions optimize-storage --no-vacuum --yes
```

Require:

- compact v23 external-content FTS definitions;
- legacy content-owning shadow tables absent;
- no rebuild/trash markers;
- SQLite quick-check `ok`;
- FTS5 integrity-check passes for every index;
- canonical counts unchanged;
- a generated non-secret canary session/message token appears through canonical search and disappears after exact canary deletion;
- no session pruning or production-DB mutation.

Do not manually edit SQLite schema or `sqlite_master`.

### 8. Reclaim physical space

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

Require:

- WAL checkpoint result with `busy=0`;
- quick-check `ok`;
- all FTS integrity checks pass;
- canonical counts stable;
- root free at least 20 GiB and usage below 90%; target 30 GiB.

If target headroom is not met, emit an exact safe-candidate manifest only. Do not prune or broaden deletion authority.

### 9. Restore canonical gateway

Run:

```bash
OMAR_UID="$(id -u omar)"
sudo -u omar env \
  XDG_RUNTIME_DIR="/run/user/${OMAR_UID}" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${OMAR_UID}/bus" \
  systemctl --user daemon-reload
sudo -u omar env \
  XDG_RUNTIME_DIR="/run/user/${OMAR_UID}" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${OMAR_UID}/bus" \
  systemctl --user reset-failed hermes-callscore-gateway.service
sudo -u omar env \
  XDG_RUNTIME_DIR="/run/user/${OMAR_UID}" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${OMAR_UID}/bus" \
  systemctl --user start hermes-callscore-gateway.service
```

Bare root `systemctl --user` is forbidden because it targets the wrong user manager.

Require unit active, nonzero `MainPID`, gateway-status PID equal to `MainPID`, one gateway process only, and legacy `hermes-gateway.service` disabled.

Verify exact named provider-capable cron jobs remain paused.

Run `/usr/local/bin/callscore-session-store-probe --profile-home /srv/agents/hermes/profiles/callscore --nonce <nonce>`.

The probe may only use Hermes `SessionDB` to create, append a generated non-secret token, read back, end and delete one canary session. It may not call a model, provider, network, PostgreSQL, tool hook or public path. Verify FTS search appearance then disappearance and durable value-free receipt.

### 10. Live-WAL snapshot canary

With canonical gateway live, start `agent-snapshot.service` exactly once.

Require systemd `InvocationID`, journal cursor, installed executable hash and exit 0. Independently verify online-backup consistency, quick-check, FTS integrity, source/snapshot count boundary, manifest, private permissions and isolated restore/readback.

The service may delete only exact snapshot paths bound in the root-owned authorisation. No glob or age-based deletion is allowed in R1.

After every other R1 gate passes, delete the exact temporary pre-R1 anchor only if that path and action are bound in authorisation. Verify exactly one canonical snapshot remains.

Re-enable/start `agent-snapshot.timer` only after the live-WAL canary passes.

### 11. Zero-write scheduler/storage verification

Do not start or enable `callscore-daily-pipeline.service` or timer.

Run only:

- local `mktemp` -> write -> fsync -> read -> hash -> delete;
- zero-provider SessionDB probe;
- Workplane, Sentinel, Langfuse and website read checks.

Report `production_database=false` only if independent process/audit/DB readback proves no producer started. If any write producer started, report `true` or `unknown` and fail R1.

### 12. Parent verification and finaliser

Parent directly runs and inspects:

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

Also recompute:

- disk/inodes;
- quick-check, FTS integrity/schema and `busy=0` checkpoint;
- canonical counts and no session-prune delta;
- exactly one snapshot and restore-readback;
- gateway PID/unit ownership;
- zero-provider session probe;
- snapshot service/timer;
- daily pipeline service/timer disabled;
- exact three provider-capable jobs paused;
- workers/queues;
- Langfuse HTTP/latest trace;
- no provider/public/credential/deployment/image/scale/PostgreSQL mutation.

Run the mandatory finaliser on success or failure. Do not silently leave partial supervision state.

## Receipts

Write private mode-`0600` JSON and adjacent SHA-256 files under:

```text
/opt/crypto-tuber-ranked/.tmp/system-recovery/<nonce>/
```

Required:

- `master-state.json`
- `authorisation-validation.json`
- `baseline.json`
- `tooling-tdd-install.json`
- `existing-snapshot-validation.json`
- `scheduler-pause.json`
- `current-restore-point.json`
- `writer-quiesce.json`
- `fts-migration.json`
- `storage-reclamation.json`
- `gateway-handoff.json`
- `session-probe.json`
- `snapshot-live-wal-canary.json`
- `zero-write-storage-canary.json`
- `finaliser.json`
- `phase-r1-final.json`

Use top-level `schema`. Never persist secrets, titles, bodies, user/chat metadata, process environments or raw secret-bearing command output.

Receipts must bind command/argv hashes, UID/PID, exit status, executable hash, systemd InvocationID/journal cursor where applicable, and independent pre/post readbacks. Self-authored booleans do not satisfy a gate.

## Completion rule

R1 passes only if every acceptance check passes and the finaliser is verified.

On `pass`:

- `phase_r2_allowed=true` means only that Omar may separately authorise R2 mapping; it does not authorise R2.

On `blocked` or `failed`:

- `phase_r2_allowed=false`;
- `next_action` names only the exact R1 remediation/rollback action;
- never suggest proceeding to credentials or activation.

## Final response

Return exactly one valid JSON object and no prose outside it:

```json
{
  "schema": "callscore.phase_r1_operator_result.v2",
  "status": "pass|blocked|failed",
  "phase": "R1_storage_snapshot_gateway",
  "phase_r2_allowed": false,
  "execution_context": {
    "out_of_band": false,
    "target_db_handles_absent": false,
    "authorisation_record_verified": false
  },
  "actions_performed": [],
  "mutations_performed": {
    "session_store": false,
    "session_prune": false,
    "snapshot": false,
    "systemd": false,
    "provider": false,
    "public": false,
    "credentials": false,
    "production_database": "false|true|unknown",
    "deployment": false,
    "image_or_scale": false
  },
  "storage": {},
  "snapshot": {},
  "gateway": {},
  "schedulers": {},
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
  "finaliser_verified": false,
  "next_action": ""
}
```
