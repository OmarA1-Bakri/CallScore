# CallScore Full-System Recovery and Activation Plan

> **Revision:** R1 safety amendment v2 after three independent FAIL reviews of commit `6ba9323503adc783dc578f2824a67f63dd8648fd`.
> **Execution:** Run each phase from a clean, isolated context. Use strict RED -> GREEN for changed safety boundaries and parent verification for every receipt.

**Goal:** Restore CallScore's degraded autonomous control plane without disturbing healthy public/read surfaces, then rotate affected credentials, reactivate the canonical system, restore cadence, and prove measured outcomes.

**Current disposition:** `DEGRADED_BLOCKED`, not wholly down. Public website/read surfaces, mandatory workers, Workplane, Sentinel and Langfuse had positive evidence. State writes, snapshotting, canonical gateway ownership, credentials, activation, cadence and commercial outcomes remain blocked or unproven.

**Canonical application repository:** `/opt/crypto-tuber-ranked`

**Canonical Workplane repository:** `/srv/agents/repos/callscore-workplane`

**Sole activation entry point:** `/srv/agents/hermes/profiles/callscore/skills/orchestration/callscore-system-activation/`

**Frozen diagnostic receipt:** `/opt/crypto-tuber-ranked/.tmp/system-status/callscore-whole-system-20260730T022510Z.json`

## Non-negotiable boundaries

1. The plan is not standing mutation authority.
2. Each mutation phase requires a separate operator authorisation record binding its exact commit, hashes, nonce, action set and expiry.
3. State/gateway maintenance, optional session pruning, credential rotation, runtime adoption, revocation, activation, cadence restoration and autopilot are separate transitions.
4. External/provider/public mutations are graph-owned and receipt-backed. Parent shell/provider success is never provider execution proof.
5. Replacement secrets flow directly into the graph-owned secret sink. Never put values in graph state, logs, receipts, diagnostics, snapshots or chat.
6. No old credential is revoked before replacement creation, storage, affected-runtime adoption and fingerprint-only readback pass.
7. The historical failed activation receipt remains immutable. Any later activation starts at Phase 0.
8. Autopilot remains forbidden until a new canonical activation receipt is independently verified `pass`.
9. Stop at the first mandatory failed gate. Execute a mandatory finaliser; never strand gateway/timer supervision silently.
10. Preserve unrelated Git work. No reset, clean, stash, amend, force-push or deployment.
11. Use top-level `schema` in receipts, never `receipt_type` or `receipt_schema`.
12. No session pruning occurs in Phase R1. Optional pruning is Phase R1B with separate authority and a manifest-bound compare-and-swap tool.

## Recovery state machine

```text
DIAGNOSTIC
  -> R0_REVIEWED
  -> R1_AUTHORISED
  -> R1_OUT_OF_BAND_READY
  -> CURRENT_RESTORE_POINT_VERIFIED
  -> WRITERS_QUIESCED
  -> FTS_COMPACTED
  -> PHYSICAL_STORAGE_RECLAIMED
  -> SNAPSHOT_CANARY_VERIFIED
  -> GATEWAY_CANONICAL
  -> R1_PASS
  -> optional R1B_EXACT_PRUNE_PASS
  -> R2_SECRET_AUTHORITY_READY
  -> R3_REPLACEMENTS_ADOPTED
  -> R4_OLD_CREDENTIALS_REVOKED
  -> R5_ACTIVATION_PASS
  -> R6_CADENCE_HEALTHY
  -> R7_MEASURED_OUTCOMES
```

No transition may be skipped or inferred from freshness alone.

## Phase R0 — Freeze and independently review the target

### Deliverables

- This plan.
- The bounded R1 prompt at `docs/prompts/2026-07-30-callscore-state-gateway-maintenance-prompt.md`.
- Three independent reviews against one immutable tuple:
  - specification and operations contract;
  - implementation and operational feasibility;
  - security, data-loss and rollback.

### Gate

All three reviewers must return `PASS` against the same commit/tree and plan/prompt SHA-256 values. Any edit invalidates all reviews.

Before R1 execution, the parent must produce an operator-authorised, root-owned read-only record at:

```text
/var/lib/callscore/approvals/r1/<nonce>.json
```

Required schema: `callscore.r1_maintenance_authorization.v1`.

It must bind:

- nonce and expiry;
- executor UID and dedicated maintenance-profile path;
- plan/prompt commit, tree and SHA-256 values;
- three authoritative review-result paths and SHA-256 values;
- exact target profile and state DB;
- exact systemd units;
- exact cron job IDs permitted to be paused;
- exact existing snapshot path permitted for final deletion;
- exact temporary pre-R1 restore-point path/target;
- exact command and installed-artifact hashes;
- explicitly forbidden transitions.

The executor may not write, replace or chmod this record.

## Phase R1 — State, snapshot and gateway recovery

### Purpose

Repair Hermes storage and canonical supervision only. Do not prune sessions, write production PostgreSQL, rotate credentials, publish, deploy or activate the full system.

### R1 execution-context gate

R1 destructive work must not run from the target CallScore gateway, target CallScore CLI/TUI, or any process holding the target `state.db`, WAL or SHM.

Use one of:

- a dedicated Hermes maintenance profile whose state DB is outside `/srv/agents/hermes/profiles/callscore`; or
- a reviewed transient systemd maintenance unit running as `User=omar` with state outside the target profile.

Abort if the executor or parent process has any open handle to the target DB files.

The executor UID must be Omar's UID, never `0`. Root-only installation/system-unit steps may use exact reviewed `sudo` commands, but the executor must never write or replace the root-owned authorisation record.

The out-of-band runner must:

1. acquire `/run/user/<omar-uid>/callscore-r1-maintenance.lock`;
2. install a mandatory `EXIT`, `ERR`, `INT` and `TERM` finaliser;
3. record original gateway/unit/timer/cron states and installed hashes;
4. block new target-profile writers by an exact maintenance guard after existing writers drain;
5. inventory `/proc/*/fd` immediately before every SQLite mutation;
6. prove stable SQLite `data_version`, WAL size and writer inventory across two bounded observations;
7. release the guard only in the finaliser.

### Exact canonical source paths

Implement changed safety boundaries in a clean isolated worktree from the current Workplane `HEAD` without touching its dirty primary worktree:

```text
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/ops/hermes-state-maintenance/r1_maintenance.py
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/ops/hermes-state-maintenance/agent_snapshot.py
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/ops/hermes-state-maintenance/session_probe.py
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/ops/hermes-state-maintenance/test_r1_maintenance.py
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/ops/hermes-state-maintenance/test_agent_snapshot.py
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/ops/hermes-state-maintenance/test_session_probe.py
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/ops/hermes-state-maintenance/schemas/callscore-state-snapshot-manifest-v1.schema.json
/srv/agents/worktrees/callscore-workplane-r1-<nonce>/ops/systemd/agent-snapshot.service
```

Installed artifacts:

```text
/usr/local/bin/callscore-r1-maintenance
/usr/local/bin/agent-snapshot
/usr/local/bin/callscore-session-store-probe
/etc/systemd/system/agent-snapshot.service
```

Every install receipt binds source commit, source bytes hash, installed bytes hash, owner, mode and exact argv.

### TDD requirements

Observe intentional RED before implementation and GREEN afterwards for:

- refusing execution from a target-DB-holding process;
- exact manual gateway PID validation and stop;
- mandatory finaliser on every exit path;
- raw live-DB tar rejection;
- SQLite online backup consistency during concurrent WAL writes;
- snapshot quick-check/integrity/restore failure preventing promotion;
- opaque state DB allowlist and secret-file denial;
- symlink/special-file rejection;
- private permission enforcement;
- no unapproved retention deletion;
- zero-provider/zero-PostgreSQL session create/read/end/delete probe;
- FTS integrity and deterministic canary search parity;
- review/authorisation hash mismatch fail-closed.

### Secret and snapshot boundary

The state DB is authorised only as an opaque encrypted-or-owner-only rollback payload. Do not inspect or extract potential values while copying it.

Snapshot allowlist is exactly:

- SQLite online backup output named `state.db`;
- generated `manifest.json`;
- generated `restore-readback.json`;
- value-free repository commit/tree identifiers in `recovery-metadata.json`.

Default-deny `.env*`, `auth.json`, provider configuration, key material, credential caches, logs, session exports, process environments, raw command output and Git object bundles.

Require snapshot root/directory mode `0700`, files `0600`, owner `omar:omar` unless the authorisation record names a different owner. Reject symlinks and special files.

### R1 sequence

#### 1. Read-only baseline

Record value-free evidence for disk/inodes, DB/WAL/SHM metadata, schema/page/freelist, session/message/source counts, FTS definitions, open handles, gateway PID/unit, named units/timers, relevant cron jobs, workers, queues, Workplane, Sentinel, Langfuse and live website.

Do not persist session titles, bodies, chat/user metadata, process environments or secret-bearing argv.

#### 2. Build and verify maintenance tooling

Create the isolated Workplane worktree. Implement the exact files above with RED -> GREEN. Run the applicable full suite, static checks and `git diff --check`. Commit only those files on a dedicated branch. Do not merge or push.

Install only after independent parent readback and checksum verification.

#### 3. Restrict and validate the existing rollback candidate

For `/srv/agents/hermes/profiles/callscore/state-snapshots/20260728-025055-pre-update/`:

- reject symlinks/special files;
- tighten directory/file modes to `0700`/`0600` before inspection;
- hash opaque files without reading secret-bearing content into logs;
- run bounded read-only SQLite quick-check and FTS integrity checks on its state DB;
- record counts and schema;
- keep it until the current pre-R1 restore point is verified.

#### 4. Pause prohibited schedulers and provider-capable jobs

Disable/stop `callscore-daily-pipeline.timer`; do not start its service in R1. Its installed unit runs `pipeline:daily -- --write` and is outside R1 authority.

Stop `agent-snapshot.timer` for implementation replacement.

Pause and verify paused these exact jobs before any gateway restart:

- `9c03a6eea969` — live CMO loop;
- `144c3a9cc860` — CMO cooldown watcher;
- `be1a78217918` — engagement executor.

Keep them paused through R1. Audit all other enabled jobs read-only; if another provider-, PostgreSQL- or public-mutation-capable job is enabled, stop and request amended authority rather than broad-pausing it.

#### 5. Create a current pre-mutation restore point

This occurs before FTS migration, session deletion or VACUUM.

Use SQLite online backup to the exact temporary target bound in the authorisation record. The target must be on a filesystem with enough verified free capacity for the full backup plus 2 GiB. On the current single-root layout, abort with `blocked_current_restore_point_capacity` unless an authorised external/attached target provides that capacity.

Require:

- source writer inventory and WAL state recorded;
- online backup under controlled concurrent WAL-write test;
- quick-check exactly `ok`;
- FTS5 integrity-check for every present index;
- source/backup schema and canonical counts equal;
- manifest SHA-256 verification;
- isolated restore/readback;
- owner-only permissions.

Retain this immutable pre-R1 anchor until every R1 acceptance gate passes.

#### 6. Quiesce writers and stop the manual gateway out-of-band

Never use `hermes gateway stop` for the current topology.

The reviewed helper must validate `/srv/agents/hermes/profiles/callscore/gateway.pid`, file owner/mode, PID start time, UID, executable, full `/proc/<pid>/cmdline`, profile path and gateway identity. It may send `SIGTERM` only to that exact PID, wait a bounded interval, and fail rather than use broad process matching or `SIGKILL`.

Verify:

- PID exited;
- user canonical unit is stopped/reset separately;
- no target cron execution remains active;
- no PostgreSQL pipeline/channel item is running;
- no unapproved process has DB/WAL/SHM handles;
- `data_version` and WAL state are stable;
- the maintenance guard blocks a deliberately attempted unapproved target-profile write.

#### 7. Migrate FTS and reclaim physical storage

Require free bytes at least 30% of live DB size before:

```bash
hermes --profile callscore sessions optimize-storage --no-vacuum --yes
```

Then require:

- compact v23 external-content FTS definitions;
- legacy content-owning shadow tables absent;
- no rebuild/trash markers;
- SQLite quick-check `ok`;
- FTS5 `integrity-check` pass for every index;
- canonical row counts unchanged;
- a known synthetic, non-secret session/message token is found through both canonical search paths and disappears after exact canary deletion;
- no session pruning occurred.

Before VACUUM compute:

```text
compact_used_bytes = (page_count - freelist_count) * page_size
```

Require filesystem free bytes at least `compact_used_bytes + 2147483648`, then run:

```bash
hermes --profile callscore sessions optimize
```

Require WAL checkpoint output with `busy=0`, quick-check `ok`, FTS integrity pass and stable counts.

#### 8. Restore canonical gateway ownership

Run the mandatory finaliser path if any earlier step failed. If DB integrity passes, restore canonical supervision even on a blocked R1; otherwise keep it deliberately stopped with an explicit critical blocker and exact rollback command.

For the success path:

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

The out-of-band/root runner must target Omar's user manager exactly as above. Bare root `systemctl --user` is forbidden because it addresses the wrong service manager.

Require:

- unit active;
- nonzero `MainPID`;
- gateway status PID equals `MainPID`;
- exactly one gateway process;
- legacy `hermes-gateway.service` disabled;
- provider-capable cron jobs remain paused.

Run `/usr/local/bin/callscore-session-store-probe` with a generated non-secret nonce. It must use Hermes `SessionDB` only to create, append, read back, end and delete one canary session. It must call no model/provider, network or PostgreSQL path. Verify the canary is present then absent and FTS parity follows both transitions.

#### 9. Snapshot service canary under live WAL activity

With the canonical gateway live and after the session probe, start `agent-snapshot.service` once. This is the single final snapshot creation/promotion operation.

Require:

- online backup consistency under live WAL activity;
- quick-check and all FTS integrity checks;
- source/snapshot canonical counts equal at one captured backup boundary;
- manifest and restore-readback pass;
- private modes and allowlist compliance;
- systemd `InvocationID`, journal cursor, executable hash and exit status in the receipt.

The service may delete only the exact superseded July 28 snapshot path authorised in the root-owned record. The temporary pre-R1 anchor remains until all other R1 gates pass; its final exact deletion must also be bound in that record and performed only at the R1 commit point. Verify exactly one canonical snapshot remains afterwards.

Re-enable/start `agent-snapshot.timer` only after the live-WAL canary passes.

#### 10. Zero-write storage and scheduler checks

Do not start or enable `callscore-daily-pipeline.service` or timer in R1.

Use only:

- a local `mktemp`/write/fsync/read/hash/delete filesystem canary;
- the zero-provider SessionDB probe;
- Workplane/Sentinel/Langfuse/website read checks.

`production_database` must be `false` only when independent readback proves no producer was started. If any write producer starts, report `true` or `unknown`; never default it to false.

#### 11. Final verification and commit point

Parent independently verifies live state, not receipt claims alone:

- root free at least 20 GiB and usage below 90%; target 30 GiB;
- DB quick-check, FTS integrity, external-content schema and `busy=0` checkpoint;
- one verified canonical snapshot and isolated restore-readback;
- canonical gateway ownership;
- zero-provider session write/read/delete;
- snapshot unit/timer healthy;
- daily pipeline unit/timer deliberately disabled pending later authority;
- exact three provider-capable cron jobs paused;
- workers, Workplane, Sentinel, Langfuse and website healthy;
- no session pruning;
- no credential/provider/public/deployment/image/scale/PostgreSQL mutation.

Only after every check passes may the authorised temporary pre-R1 anchor be deleted. Any failure runs the finaliser and reports only the exact R1 remediation. Set `phase_r2_allowed=false` unless R1 passed.

### R1 acceptance

- Current pre-R1 restore point existed before mutation and was independently restorable.
- State DB is compact-layout, integral and writable.
- Root free space threshold passes.
- Exactly one canonical private snapshot remains.
- Snapshot service/timer are healthy.
- Canonical user gateway owns the only gateway PID.
- Daily write timer remains disabled.
- Provider-capable jobs remain paused.
- No sessions were pruned.
- Production PostgreSQL, provider, public, credential, deployment, image and scale mutation flags are independently `false`.
- Finaliser state is verified.

## Phase R1B — Optional manifest-bound background-session pruning

R1B is optional and separately authorised only if root headroom remains insufficient after R1.

Do not use Hermes age/source prune commands for execution because preview and delete recalculate membership.

First implement a TDD tool that:

1. freezes one absolute UTC cutoff;
2. creates an IDs-only manifest with exact metadata and child relationships;
3. excludes pinned, archived, active and child-linked sessions unless separately named;
4. hashes the manifest;
5. in one `BEGIN IMMEDIATE` transaction requires exact candidate-set and metadata equality;
6. deletes exactly manifest IDs or zero rows;
7. aborts on newly eligible, newly pinned, newly archived, changed or child-linked rows;
8. persists counts/hashes only, never titles or messages.

A separate root-owned authorisation record must bind the exact manifest hash and IDs count. Parent verifies retained-child links, counts, FTS integrity and rollback.

## Phase R2 — Credential authority and provider-adapter readiness

After R1 pass only:

- reconcile the 41 credential names against authoritative providers;
- map each to exact provider adapter/tool, graph payload schema, secret sink, affected runtime, fingerprint readback and revocation-only tool;
- create separate `SECRET_GATE` receipts per provider/action/payload;
- prove the graph-owned secret sink is available;
- stop if any credential lacks an exact provider path.

No credential mutation occurs in R2.

## Phase R3 — Replacement creation and affected-runtime adoption

For one credential at a time:

1. create replacement through the approved graph-owned provider adapter;
2. write plaintext directly to the graph-owned secret sink;
3. persist provider-execution evidence without values;
4. update/recreate only named affected runtimes;
5. perform fingerprint-only readback;
6. verify service health and rollback readiness.

No old credential is revoked in R3. No image rebuild or scale change without separate authority.

## Phase R4 — Old-credential revocation

For each fully adopted replacement:

- obtain separate revocation authorisation;
- prove the selected tool is revocation-only;
- execute through the graph-owned adapter;
- require durable provider-execution evidence and old-key rejection/new-key acceptance;
- stop on any mismatch.

## Phase R5 — Canonical activation from Phase 0

Use only the canonical activation skill. Preserve the historical failed receipt. Create a new run ID and begin at Phase 0.

Require each phase receipt to pass sequentially, including workers, Workplane, canonical 51-agent audit, learning cluster, content/video gates, receipts, observability and cooldown handling.

Autopilot remains off until the new final activation receipt is independently verified `pass`.

## Phase R6 — Restore data, content and video cadence

With separate graph-owned write/public gates:

- replace the unsafe daily-pipeline fixed approval with an actual bound authorisation receipt;
- run bounded scoring/ingestion and verify DB deltas;
- restore CMO and cooldown jobs only after activation pass;
- require the full canonical operational package for public handoff;
- require design/media v2 receipts for visual output;
- require all YouTube production receipts for YouTube readiness;
- preserve cooldown as a receipt-backed valid outcome.

## Phase R7 — Durable learning and measured outcomes

Require:

- `learning_event.v1`;
- `agent_performance_ledger.v1`;
- `learning_delta.v1`;
- `experiment_result.v1`.

Measure subscribers, retention, conversion, revenue and operational performance from authoritative sources. Do not infer outcomes from artifact freshness or publication counts.

## Global completion criteria

CallScore is fully recovered only when:

1. R1 storage/snapshot/gateway pass is verified.
2. Optional R1B is either unnecessary or separately passed.
3. All affected credentials are replaced, adopted and old credentials revoked with provider proof.
4. A new activation run passes from Phase 0.
5. Safe cadence is healthy under canonical receipts.
6. Autopilot is enabled only after activation pass.
7. Learning is durable.
8. Measured product/commercial outcomes exist.

Until then report the precise layer status: healthy public/read/runtime layers, degraded schedulers where applicable, and blocked autonomy.