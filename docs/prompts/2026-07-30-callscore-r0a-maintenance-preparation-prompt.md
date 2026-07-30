# Execution Prompt — CallScore R0A Maintenance Tooling Preparation

You are the CallScore preparation supervisor on `hermes-agent-box`.

## Authority and scope

When Omar explicitly instructs you to run this prompt, it authorises **source-only R0A preparation**. It does not authorise live state, service, scheduler, provider, credential, database, deployment or public mutation.

R0A may:

- create clean isolated Git worktrees;
- add tests, source, JSON Schemas, systemd unit templates and operator documentation in those worktrees;
- run tests/static analysis against fixtures and disposable temporary databases;
- create focused local commits;
- generate value-free review manifests and checksums.

R0A must not:

- install anything under `/usr`, `/etc`, `/var`, `/run` or a live profile;
- use `sudo`;
- stop/start/reload/enable/disable a service, timer, gateway, cron job or container;
- open the live CallScore state DB in read-write mode;
- change ownership, permissions, mounts, ACLs or files under `/srv/agents/hermes/profiles/callscore`;
- create a live authorisation record or call a broker;
- rotate/read/print credentials or edit `.env.hermes`;
- prune sessions, run VACUUM or migrate FTS on live state;
- write production PostgreSQL;
- call a provider, publish, send, spend or deploy;
- merge, push, amend, reset, stash, clean or alter unrelated work.

If any required behaviour cannot be proven without live mutation, test it with fixtures, mount namespaces and disposable databases only, document the remaining install-time integration test, and stop R0A at `blocked_preparation_gap` rather than touching production.

## Canonical inputs

Read in full:

- `/opt/crypto-tuber-ranked/docs/plans/2026-07-30-callscore-full-system-recovery-and-activation.md`
- the three FAIL review summaries for delegation `deleg_1fb6fe24`;
- `/srv/agents/hermes/hermes-agent/hermes_state.py`;
- `/srv/agents/hermes/hermes-agent/tools/session_search_tool.py`;
- `/srv/agents/hermes/hermes-agent/gateway/status.py`;
- the current `agent-snapshot.service`, timer and implementation;
- the canonical user `hermes-callscore-gateway.service`.

Load and follow:

- `orchestration/callscore-startup`
- `callscore-canonical-runtime`
- `orchestration/hermes-orchestrator`
- `task-router`
- `hermes-agent`
- `devops/durable-agent-state`
- `agent-state-relocation`
- `software-development/test-driven-development`
- `software-development/systematic-debugging`
- `software-development/receipt-backed-gate-review`
- `software-development/parent-verification-of-agent-output`
- `github/committing-user-work-safely`
- `github/safe-git-worktree-operations`

Use Codebase Memory MCP for both repositories before changing source.

## Repository safety

Canonical Workplane source repository:

```text
/srv/agents/repos/callscore-workplane
```

Its primary checkout contains unrelated dirty/untracked work. Do not modify, stage or commit there.

Create an isolated worktree from its current `HEAD`:

```text
/srv/agents/worktrees/callscore-workplane-r0a-<nonce>
```

Use a dedicated branch:

```text
r0a/hermes-state-maintenance-<nonce>
```

Record base commit/tree and dirty-state evidence. Do not infer that the dirty primary checkout belongs to this task.

The application repo `/opt/crypto-tuber-ranked` may be changed only for the final R1 prompt/manifest after the Workplane tooling commit exists. Preserve all unrelated state and use a focused commit.

## Required architecture

R0A prepares but does not install three security boundaries.

### 1. Signed root broker

Prepare a root broker that accepts only an operator-signed, schema-valid authorisation from a preconfigured SSH allowed-signers trust store.

The future operator flow must use:

```text
ssh-keygen -Y verify
namespace: callscore-r1
operator principal: bound by the authorisation
```

The broker must reject:

- unsigned/self-authored records;
- unknown principals;
- wrong namespace;
- stale/future/expired records;
- nonce replay;
- wrong plan, prompt, source, unit, schema or verifier hashes;
- actions/argv outside the signed set;
- execution after `maximum_run_duration_seconds`;
- requests from an unapproved target/profile;
- any destructive transition whose per-transition expiry check fails.

The R1 runner may trigger an already-authorised broker action but may not create, modify or sign its authorisation.

### 2. Kernel-enforced writer fence

Do not claim an advisory lock or `/proc` inventory prevents writers.

Prepare a broker-controlled fence using a dedicated `callscore-maint` service UID and a private mount namespace:

1. drain and verify all existing target DB holders;
2. expose the original profile/state path read-write only inside the maintenance namespace;
3. bind/remount the canonical target path read-only for ordinary processes;
4. deny Omar's ordinary gateway/CLI/cron/direct-SQLite writers while the fence is active;
5. allow only the nonce-bound maintenance unit to reach the private read-write bind;
6. hold the fence continuously across FTS migration, VACUUM, verification and rollback;
7. fail closed if a direct unguarded writer is detected;
8. release only through the broker finaliser after DB verification.

The R1 service must run as `User=callscore-maint`, with `NoNewPrivileges=yes`, no sudo, no network, empty capability bounding set and writable paths limited to the private maintenance bind plus the run's control directory.

Use fixture directories and mount namespaces for R0A tests. Do not mount over the live profile.

### 3. Snapshot and restore

Prepare an owner-only, online-SQLite snapshot tool and a staged rollback tool.

The state DB is an opaque payload. Never extract or log possible values.

Snapshot allowlist:

- `state.db` created by SQLite online backup;
- `manifest.json`;
- `restore-readback.json`;
- value-free `recovery-metadata.json`.

Default-deny `.env*`, `auth.json`, provider configuration, key material, caches, logs, exports, process environments, command dumps and Git object bundles.

For any deletable snapshot, bind:

- canonical parent path;
- parent device/inode;
- snapshot device/inode;
- owner;
- run ID;
- complete member allowlist;
- manifest SHA-256.

Deletion must use fd-relative, no-follow, beneath-only, no-cross-device traversal (`openat2` with `RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS|RESOLVE_NO_XDEV`, or an equivalently proven boundary), immediate `fstat` revalidation, allowlisted `unlinkat`, and zero deletion on drift.

Rollback after any post-mutation DB/FTS/count/search/checkpoint failure must:

1. keep writers fenced and gateway stopped;
2. verify the pre-R1 anchor identity and hash;
3. preserve the failed DB/WAL/SHM on the authorised forensic target without logging content;
4. restore the anchor to a sibling staged file;
5. verify quick-check, exact FTS schema/integrity and canonical counts;
6. fsync the staged file;
7. atomically replace `state.db`;
8. fsync the parent directory;
9. safely disposition stale WAL/SHM;
10. reverify before any writer restarts;
11. keep the fence and gateway stopped if restoration fails.

The R1 authorisation must require external capacity for both the current anchor and potential failed-DB forensic preservation plus 2 GiB. R0A does not provision that capacity.

## Exact source files

Create exactly these paths in the isolated Workplane worktree:

```text
ops/hermes-state-maintenance/broker.py
ops/hermes-state-maintenance/maintenance_runner.py
ops/hermes-state-maintenance/agent_snapshot.py
ops/hermes-state-maintenance/session_probe.py
ops/hermes-state-maintenance/fts_verify.py
ops/hermes-state-maintenance/restore.py
ops/hermes-state-maintenance/safe_snapshot_delete.py
ops/hermes-state-maintenance/authorization_verify.py
ops/hermes-state-maintenance/test_broker.py
ops/hermes-state-maintenance/test_maintenance_runner.py
ops/hermes-state-maintenance/test_agent_snapshot.py
ops/hermes-state-maintenance/test_session_probe.py
ops/hermes-state-maintenance/test_fts_verify.py
ops/hermes-state-maintenance/test_restore.py
ops/hermes-state-maintenance/test_safe_snapshot_delete.py
ops/hermes-state-maintenance/test_authorization_verify.py
ops/hermes-state-maintenance/schemas/callscore-r0a-preparation-receipt-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-proposal-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-maintenance-authorization-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-snapshot-policy-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-state-snapshot-manifest-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-gate-receipt-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-finalizer-receipt-v1.schema.json
ops/hermes-state-maintenance/schemas/callscore-r1-phase-final-v1.schema.json
ops/hermes-state-maintenance/systemd/callscore-maintenance-broker.socket
ops/hermes-state-maintenance/systemd/callscore-maintenance-broker.service
ops/hermes-state-maintenance/systemd/callscore-r1-maintenance@.service
ops/hermes-state-maintenance/systemd/agent-snapshot.service
ops/hermes-state-maintenance/systemd/agent-snapshot.timer
ops/hermes-state-maintenance/docs/operator-signing-and-install.md
```

Do not invent additional production files without stopping for plan amendment.

## Exact future installed paths

Document but do not install:

```text
/usr/local/lib/callscore-maintenance/
/usr/local/sbin/callscore-maintenance-broker
/usr/local/bin/callscore-r1-maintenance
/usr/local/bin/agent-snapshot
/usr/local/bin/callscore-session-store-probe
/usr/local/bin/callscore-state-restore
/etc/systemd/system/callscore-maintenance-broker.socket
/etc/systemd/system/callscore-maintenance-broker.service
/etc/systemd/system/callscore-r1-maintenance@.service
/etc/systemd/system/agent-snapshot.service
/etc/systemd/system/agent-snapshot.timer
/etc/callscore/allowed_signers
/var/lib/callscore/authorizations/r1/
/var/lib/callscore/policies/snapshot-policy.json
```

No R1 executor sudoers entry is allowed.

## Exact unit requirements

### Broker

- root-owned source and unit;
- root service;
- fixed absolute `ExecStart`;
- root-owned socket with a narrow group;
- validates operator SSH signature and all schema/hash/expiry bindings before action;
- creates nonce replay tombstone before first destructive transition;
- no network;
- logs only value-free identifiers and hashes.

### R1 maintenance unit

- `User=callscore-maint` and `Group=callscore-maint`;
- `NoNewPrivileges=yes`;
- empty `CapabilityBoundingSet` and `AmbientCapabilities`;
- network namespace denied;
- `PrivateTmp=yes`;
- `ProtectSystem=strict`;
- no sudo path;
- `ReadWritePaths` only for broker-created private RW bind and run control directory;
- fixed nonce-bound argv;
- maximum runtime enforced by both authorisation and systemd;
- mandatory finaliser.

### Snapshot service

- `User=omar`, `Group=omar`, `UMask=0077`;
- `NoNewPrivileges=yes`;
- empty capability bounding set;
- `ProtectSystem=strict`;
- `PrivateTmp=yes`;
- network denied;
- source profile read-only;
- `ReadWritePaths` limited to approved snapshot/control roots;
- fixed absolute `ExecStart`;
- validates a separately signed recurring `callscore.snapshot_policy.v1` before each run;
- validates policy expiry and exact source/unit/tool/schema hashes;
- one-snapshot retention with object-identity-bound deletion.

The one-time R1 snapshot canary is nonce-bound. The recurring timer may be enabled only when the separate recurring policy exists and validates. Otherwise it remains disabled without failing the state/gateway maintenance rollback.

## FTS verification contract

Expected v23 indexes are:

- `messages_fts`;
- `messages_fts_trigram`;
- `messages_fts_cjk` when present in the installed Hermes v23 schema.

For every present external-content index, execute on a disposable fixture in R0A and specify for R1:

```sql
INSERT INTO <table>(<table>, rank) VALUES('integrity-check', 1);
```

Validate exact v23 table SQL, content rowid, tokenizer/options and required triggers from the installed Hermes source.

Prepare deterministic non-secret canaries that force:

- ASCII `fts5` routing;
- CJK bigram routing when available;
- trigram fallback with CJK-bigram availability deliberately disabled in the test instance;
- one-character CJK `like_scan` routing.

For each, assert exact session/message IDs through:

- `SessionDB.search_messages`;
- `tools.session_search_tool.session_search`.

Assert presence before exact canary deletion and absence after. The R1 verifier must require:

```sql
PRAGMA wal_checkpoint(TRUNCATE);
```

with the busy field exactly `0`.

## Receipt and schema semantics

Use top-level `schema`, never `receipt_type` or `receipt_schema`.

All schemas must use `additionalProperties: false` at security boundaries and encode cross-field rules, including:

- `blocked|failed` implies `phase_r2_allowed=false`;
- `pass` requires verified finaliser, authorisation, snapshot, writer-fence, DB, FTS, checkpoint and gateway gates;
- no receipt defaults mutation flags to false without evidence;
- `production_database` is `false|true|unknown` and `pass` requires independently proven `false`;
- stale/missing/wrong review or artifact hashes fail;
- authorisation expiry is revalidated before every destructive transition;
- snapshot deletion requires exact object identity and member allowlist;
- finaliser branches on `current_restore_point_verified` and `gateway_stop_started`.

Canonical JSON hashing must be specified as UTF-8 RFC 8785 JCS bytes plus SHA-256. Tests must include reordered-key equivalence, Unicode, numeric and duplicate-key rejection cases.

## State-dependent finaliser

Encode and test at least:

1. **Pre-anchor capacity block:** `current_restore_point_verified=false`, `gateway_stop_started=false`; preserve and verify the original manual gateway/timer/job state. Do not transfer supervision.
2. **Post-anchor pre-stop failure:** preserve verified anchor and original gateway state.
3. **Post-stop pre-DB-mutation failure:** restore canonical gateway only if authorised and DB verifies.
4. **Post-DB-mutation verification failure:** execute exact state restore while fenced; restart only after restore verifies.
5. **Restore failure:** retain fence, leave gateway stopped, emit critical blocker.
6. **Success:** canonical gateway only, daily write timer and provider-capable jobs remain paused, snapshot timer enabled only with valid recurring policy.

## RED -> GREEN matrix

Observe each RED failure before implementation. At minimum test:

- unsigned/unknown/stale/replayed/wrong-hash authorisation rejection;
- per-transition expiry;
- no implementation-hash bootstrap assumption;
- same-UID ordinary writer denied by the kernel fence;
- direct SQLite writer denied throughout inter-chunk intervals;
- maintenance UID accepted only through private RW bind;
- exact PID identity and SIGTERM-only stop;
- every finaliser branch;
- online backup during concurrent WAL writes;
- opaque snapshot allowlist and private modes;
- object substitution, symlink, mount-crossing and membership-drift deletion attacks;
- failed DB forensic preservation and atomic restore;
- all FTS routes and both search entrypoints;
- checkpoint busy nonzero failure;
- snapshot service sandbox and recurring-policy expiry;
- all JSON Schema negative matrices and canonical hashing.

Run tests from disposable fixtures only. Capture explicit RED and GREEN command output.

## R0A completion sequence

1. Read repository instructions and inspect both repos.
2. Create isolated Workplane worktree/branch.
3. Write tests first and observe RED.
4. Implement minimum code/templates/docs.
5. Observe GREEN.
6. Run full applicable Workplane tests, Python/static checks and `git diff --check`.
7. Run secret hygiene against new source and fixtures.
8. Commit only exact R0A files in the isolated Worktree.
9. Parent reads committed bytes, schemas, units, tests and results.
10. Generate an immutable R0A review manifest binding:
    - Workplane base/commit/tree;
    - every source/unit/schema/test hash;
    - literal future installation commands;
    - plan and R0A prompt commit/tree/hashes;
    - test commands and result hashes.
11. In `/opt/crypto-tuber-ranked`, generate the final R1 execution prompt only after these hashes exist. The R1 prompt must prohibit source edits and bind the frozen Workplane tuple.
12. Commit only the final R1 prompt/manifest update in the application repo.
13. Stop. Do not install or execute R1.

## Required reviews after R0A

Dispatch three fresh independent reviews against the complete two-repository tuple:

1. code, test and unit correctness;
2. operational/kernel/systemd/SQLite feasibility;
3. security, approval, rollback and data-loss resistance.

All must return PASS. A timeout is not PASS. Any edit invalidates all reviews.

Only after PASS may Omar, through a separate operator shell and private signing key, authorise installation/broker setup and later sign the exact R1 proposal.

## Final response

Return exactly one valid JSON object and no prose outside it:

```json
{
  "schema": "callscore.r0a_maintenance_preparation_result.v1",
  "status": "pass|blocked|failed",
  "live_mutation_performed": false,
  "sudo_used": false,
  "workplane": {
    "base_commit": "",
    "commit": "",
    "tree": "",
    "worktree": "",
    "files": []
  },
  "application_repo": {
    "commit": "",
    "tree": "",
    "files": []
  },
  "tests": {
    "red_observed": false,
    "green_passed": false,
    "full_applicable_suite": null,
    "static_checks": null,
    "secret_hygiene": null
  },
  "review_manifest": {
    "path": "",
    "sha256": ""
  },
  "mutations_performed": {
    "live_state": false,
    "systemd": false,
    "cron": false,
    "snapshot": false,
    "session_prune": false,
    "production_database": false,
    "provider": false,
    "public": false,
    "credentials": false,
    "deployment": false
  },
  "langfuse_checked": {
    "status": "not_required_for_source_only_r0a"
  },
  "blockers": [],
  "next_action": "Run three independent reviews against the complete frozen R0A tuple; do not install or execute R1 before all pass."
}
```
