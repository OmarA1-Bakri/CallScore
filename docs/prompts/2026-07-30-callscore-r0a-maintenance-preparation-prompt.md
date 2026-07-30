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

Except for the explicitly deferred privileged R0C kernel-fence integration, if any required behaviour cannot be proven without live mutation, test it with fixtures/disposable databases, document the gap, and stop R0A at blocker code `blocked_preparation_gap` rather than touching production.

## Canonical inputs

Read in full:

- `/opt/crypto-tuber-ranked/docs/plans/2026-07-30-callscore-full-system-recovery-and-activation.md`
- the two FAIL summaries and one timeout evidence from delegation `deleg_1fb6fe24` at these committed paths and hashes:
  - `docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-specification-fail.md` — `096fa0df4c621a6cad42f15b8bc08f2024d2034d281fde416dae1732997ba498`;
  - `docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-security-fail.md` — `a147a8ec9535071a4f427eec02177f61e17620cdeebb671b8f081dd1585a06e2`;
  - `docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-implementation-timeout.json` — `020e64469f7003c2393a10b69559405f3d349f79779c35c55bc283535e8deaa5`;
- the three R0A FAIL reviews subsequently reconciled into this revision:
  - `docs/ops/callscore-r0a/input-reviews/deleg_a7901f50-r0a-security-fail.md` — `a3a646f38698252b957fed2cf1a5ef2249e4c5233235890f1c9fc8ac879cf0f4`;
  - `docs/ops/callscore-r0a/input-reviews/deleg_c26083f7-r0a-specification-fail.md` — `4551e2a02c0783459ec8c358461b1452ff4f6495faf2e9b9e701cf9e9a7052d2`;
  - `docs/ops/callscore-r0a/input-reviews/deleg_e17283dc-r0a-implementation-fail.md` — `7fb0c16bff6f5f5ac47058ad9bcbab8c6714021be710ba5c9f0b4c9b13637473`;
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

Codebase Memory is read-only in R0A. Use only existing-index read operations such as architecture/search/snippet queries. `index_repository`, `detect_changes`, `ingest_traces`, `manage_adr`, project deletion and every other index mutation are forbidden. If an existing index is unavailable, inspect source with local read-only tools and record `codebase_memory_existing_index=unavailable`; do not create one.

## Repository safety

Canonical Workplane source repository:

```text
/srv/agents/repos/callscore-workplane
```

Its primary checkout contains unrelated dirty/untracked work. Do not modify, stage or commit there.

The application repository has a `post-commit` hook that calls Codebase Memory indexing. R0A must bypass all repository hooks. Before the first Git mutation, create an empty owner-only directory outside every repository:

```text
/srv/agents/worktrees/.r0a-empty-hooks-<nonce>
```

Require owner `omar`, mode `0700`, zero members and a recorded device/inode. Execute **every** Git command in either repository, including worktree creation, status, diff, add and commit, as:

```bash
git -c core.hooksPath=/srv/agents/worktrees/.r0a-empty-hooks-<nonce> <subcommand>
```

Do not set a persistent Git configuration value. Revalidate that the hooks directory is still empty immediately before each commit. Bind the path, device/inode, mode, empty-member proof and literal no-hook argv in the review manifest. A hook execution or external index mutation is an R0A failure.

Create an isolated worktree from its current `HEAD`:

```text
/srv/agents/worktrees/callscore-workplane-r0a-<nonce>
```

Use a dedicated branch:

```text
r0a/hermes-state-maintenance-<nonce>
```

Record base commit/tree and dirty-state evidence. Do not infer that the dirty primary checkout belongs to this task.

Do not modify or commit from the application primary checkout. The immutable R0A review instruction supplies `APP_BASE_COMMIT` and `APP_BASE_TREE`; first verify they equal the reviewed primary `HEAD`/tree, then create a second isolated worktree using the same empty-hooks procedure:

```text
/srv/agents/worktrees/crypto-tuber-ranked-r0a-<nonce>
branch: r0a/callscore-maintenance-artifacts-<nonce>
base: APP_BASE_COMMIT / APP_BASE_TREE from the immutable review tuple
```

All application output paths below are relative to that application worktree. Preserve the primary checkout byte-for-byte.

Freeze the consumed Hermes dependency before writing tests. Record the Hermes Git commit/tree plus SHA-256 for exactly:

```text
/srv/agents/hermes/hermes-agent/hermes_state.py
/srv/agents/hermes/hermes-agent/tools/session_search_tool.py
/srv/agents/hermes/hermes-agent/gateway/status.py
```

If implementation needs another Hermes file, stop at `blocked_dependency_scope_amendment`; do not silently widen the tuple. The final manifest, final R1 prompt, R1 authorisation schema, installation readback and R1 preflight must bind these exact Hermes bytes. Any later mismatch invalidates the reviews.

Before either worktree is created, generate an owner-only pre-edit input manifest at `/srv/agents/worktrees/.r0a-input-manifest-<nonce>.json`. It binds the reviewed application and Workplane base commits/trees, Hermes commit/tree and consumed-file hashes, the three committed review-input hashes, plus SHA-256/device/inode/mode/owner for:

```text
/etc/systemd/system/agent-snapshot.service
/etc/systemd/system/agent-snapshot.timer
/usr/local/bin/agent-snapshot
/home/omar/.config/systemd/user/hermes-callscore-gateway.service
```

Use strict UTF-8 JSON with duplicate-key rejection and RFC 8785 JCS hashing. Abort before worktree creation if a committed input hash or reviewed repository tuple mismatches. Copy the exact validated bytes into the application output path defined below; never re-evaluate mutable inputs later in R0A.

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

The future namespace topology is literal:

1. R0C provisions dedicated UID/GID `callscore-maint:callscore-state-maint`; it records original owner/group/mode/ACLs, then applies temporary traversal/write ACLs plus setgid/default group access needed to create DB/WAL/SHM through the private path;
2. the root broker opens an `O_PATH` fd to the original profile and creates `/run/callscore-maintenance/<nonce>/original` as a root-only bind anchor;
3. the broker starts `callscore-r1-maintenance@<nonce>.service`; systemd establishes its private mount namespace and `BindPaths=/run/callscore-maintenance/<nonce>/original:/var/lib/callscore-maintenance/state` before dropping credentials;
4. the waiting runner reports its PID, mount-namespace inode, private-bind device/inode and DAC write/readiness proof through a root-controlled nonce channel, but performs no DB mutation yet;
5. the broker verifies namespace isolation/readiness, bind-mounts the canonical host profile path onto itself, remounts that host-visible bind read-only, revalidates all holders and DB identity, then releases the waiting runner;
6. maintenance opens only `/var/lib/callscore-maintenance/state/state.db`; tests require DB/WAL/SHM creation through the private path while UID `omar` is denied through the canonical path;
7. on success, the service stops, broker verifies no private-path holders, removes temporary ACL/setgid/default access and verifies original owner/group/mode/ACLs, unmounts the private anchor and canonical read-only self-bind, then verifies original path identity;
8. on teardown uncertainty, keep the canonical path read-only and emit a critical blocker.

The target host rejects unprivileged mount namespaces. R0A runs hermetic nonprivileged state-machine/syscall-contract tests and generates the privileged disposable-fixture integration-test artifact, but must not claim kernel-fence GREEN. Privileged mount/writer-denial GREEN moves to R0C with exact command:

```bash
/usr/local/sbin/callscore-maintenance-broker integration-test --fixture-root /var/tmp/callscore-r0c-fixture --assert-host-ro --assert-private-rw --assert-hostile-writer-denied --assert-clean-teardown
```

Expected exit is `0`; every named assertion must be `pass`; the fixture is outside the live profile and deleted only after object-identity verification.

R0A completion is reported as `prepared`, not `pass`, and must include `kernel_fence_integration_status=pending_r0c` plus `kernel_fence_green_claimed=false`. R0C must prove namespace identity, maintenance DAC access, Omar denial, WAL/SHM creation and cleanup for every finaliser branch before live R1 can be authorised.

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
ops/hermes-state-maintenance/r0a_evidence.py
ops/hermes-state-maintenance/validate_schemas.py
ops/hermes-state-maintenance/r0a_secret_scan.py
ops/hermes-state-maintenance/test_broker.py
ops/hermes-state-maintenance/test_maintenance_runner.py
ops/hermes-state-maintenance/test_agent_snapshot.py
ops/hermes-state-maintenance/test_session_probe.py
ops/hermes-state-maintenance/test_fts_verify.py
ops/hermes-state-maintenance/test_restore.py
ops/hermes-state-maintenance/test_safe_snapshot_delete.py
ops/hermes-state-maintenance/test_authorization_verify.py
ops/hermes-state-maintenance/test_r0a_evidence.py
ops/hermes-state-maintenance/test_validate_schemas.py
ops/hermes-state-maintenance/test_r0a_secret_scan.py
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

## Exact application-repository outputs

After the Workplane commit exists, create only these additional application-repository paths:

```text
docs/prompts/2026-07-30-callscore-r1-state-gateway-execution-prompt.md
docs/ops/callscore-r0a/review-manifest.json
docs/ops/callscore-r0a/review-manifest.json.sha256
docs/ops/callscore-r0a/schemas/callscore-r0a-review-manifest-v1.schema.json
docs/ops/callscore-r0a/schemas/callscore-r0a-input-manifest-v1.schema.json
docs/ops/callscore-r0a/input-manifest.json
docs/ops/callscore-r0a/evidence/red-results.json
docs/ops/callscore-r0a/evidence/green-results.json
docs/ops/callscore-r0a/evidence/evidence-root.json
docs/ops/callscore-r0a/evidence/evidence-root.json.sha256
```

Do not add install receipts or live authorisations in R0A.

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
- nonprivileged broker/fence state machine rejects invalid topology and unsafe transitions;
- generated R0C integration artifact covers same-UID writer denial, inter-chunk direct-SQLite denial and private-RW maintenance access;
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

### Canonical evidence commands and bytes

Create the evidence harness before behavioural tests. It is infrastructure, not the implementation under test. No package installation or network access is authorised. Preflight `python3` plus `jsonschema==4.10.3`; a missing/wrong dependency is `blocked_dependency_bootstrap`. Applicable scope is exactly `ops/hermes-state-maintenance/**`; all vendored `control-plane/**` trees are excluded. Use these exact commands from the isolated Workplane root:

```bash
python3 -c "import importlib.metadata as m; assert m.version('jsonschema') == '4.10.3'"
python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase red --command-id unit -- python3 -m unittest discover -s ops/hermes-state-maintenance -p 'test_*.py' -v
python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id unit -- python3 -m unittest discover -s ops/hermes-state-maintenance -p 'test_*.py' -v
python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id schema-negatives -- python3 -m unittest -v ops.hermes-state-maintenance.test_validate_schemas
python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id compile -- python3 -m compileall -q ops/hermes-state-maintenance
python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id lint -- python3 -m tabnanny -v ops/hermes-state-maintenance
python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id schemas -- python3 ops/hermes-state-maintenance/validate_schemas.py
python3 ops/hermes-state-maintenance/r0a_evidence.py run --phase green --command-id secret-scan -- python3 ops/hermes-state-maintenance/r0a_secret_scan.py --root ops/hermes-state-maintenance
git -c core.hooksPath=/srv/agents/worktrees/.r0a-empty-hooks-<nonce> diff --check
```

Every command uses the isolated Workplane root as cwd and expects exit `0`, except RED unit, which expects nonzero plus the exact planned assertion IDs. The isolated application worktree additionally runs `npm run hygiene:secrets` and no-hook `git diff --check` from its root with exit `0`. The manifest records exact argv, cwd token, included/excluded scope, expected/actual exit and normalised stdout/stderr hashes for every command.

`r0a_evidence.py` must run with a cleared/minimal environment, fixture-only temp roots and no network. It normalises result bytes by stripping ANSI sequences, converting CRLF to LF, replacing exact worktree/temp prefixes with `<WORKTREE>` and `<TMP>`, preserving a single final LF, and rejecting NUL or undecodable bytes. `red-results.json` and `green-results.json` are RFC 8785 JCS objects sorted by `command_id`, with `additionalProperties: false`, recording exact argv, argv SHA-256, exit code, normalised stdout/stderr SHA-256 and fixture-root identity. RED requires the intended behavioural tests to fail for expected assertion IDs; GREEN requires zero exit for all commands. No wall-clock timestamps, random paths, secrets or raw environment are included.

Self-reference-free binding order:

1. hash immutable Hermes dependency bytes and committed Workplane source/unit/schema/test bytes;
2. hash canonical red/green result objects;
3. create `evidence-root.json` containing those leaf hashes but no self-hash, then place its SHA-256 only in `evidence-root.json.sha256`;
4. create the final R1 prompt containing the frozen dependency/source hashes and manifest **path**, but not the manifest hash;
5. create `review-manifest.json` containing repository tuples, all leaf hashes, evidence-root hash, final R1 prompt hash and literal install/test/Git argv, but no self-hash;
6. place only the JCS SHA-256 of the manifest in `review-manifest.json.sha256`.

Validate every object against the exact committed manifest/schema set before the focused application commit. Duplicate JSON keys, non-JCS numbers and Unicode non-conformance fail.

## R0A completion sequence

1. Read repository instructions and inspect the application, Workplane and exact Hermes dependency files.
2. Freeze the Hermes commit/tree/file hashes, create the empty hook directory, and create the isolated Workplane worktree/branch using the literal no-hook Git form.
3. Write tests first and observe RED.
4. Implement minimum code/templates/docs.
5. Observe GREEN.
6. Run full applicable Workplane tests, Python/static checks and `git diff --check`.
7. Run secret hygiene against new source and fixtures.
8. Commit only exact R0A files in the isolated Worktree.
9. Parent reads committed bytes, schemas, units, tests and results.
10. Generate and schema-validate the final R1 prompt first, then hash it.
11. Generate the immutable R0A review manifest last, binding:
    - Workplane base/commit/tree;
    - Hermes commit/tree and exact consumed-file hashes;
    - every source/unit/schema/test hash;
    - literal future installation commands;
    - plan and R0A prompt commit/tree/hashes;
    - test commands and result hashes.
12. Validate the pre-edit input manifest, final R1 prompt, evidence root and review manifest against schemas and the binding graph.
13. Commit only the exact application output paths from the isolated application worktree using the owner-only empty-hooks procedure.
14. Stop. Do not install or execute R1.

## Required reviews after R0A

Dispatch three fresh independent reviews against the complete application, Workplane and Hermes-dependency tuple:

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
  "status": "prepared|blocked|failed",
  "r0b_allowed": false,
  "kernel_fence_integration_status": "pending_r0c|pass|failed|not_run",
  "kernel_fence_green_claimed": false,
  "live_mutation_performed": "false|true|unknown",
  "sudo_used": "false|true|unknown",
  "external_index_mutation_performed": "false|true|unknown",
  "git_hooks_executed": "false|true|unknown",
  "evidence_refs": [],
  "empty_hooks_proof": {
    "path": "",
    "device_inode": "",
    "mode": "0700",
    "member_count": 0
  },
  "hermes_dependency": {
    "commit": "",
    "tree": "",
    "files": []
  },
  "workplane": {
    "base_commit": "",
    "commit": "",
    "tree": "",
    "worktree": "",
    "files": []
  },
  "application_repo": {
    "base_commit": "",
    "base_tree": "",
    "commit": "",
    "tree": "",
    "worktree": "",
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
    "live_state": "false|true|unknown",
    "systemd": "false|true|unknown",
    "cron": "false|true|unknown",
    "snapshot": "false|true|unknown",
    "session_prune": "false|true|unknown",
    "production_database": "false|true|unknown",
    "provider": "false|true|unknown",
    "public": "false|true|unknown",
    "credentials": "false|true|unknown",
    "deployment": "false|true|unknown"
  },
  "langfuse_checked": {
    "status": "not_required_for_source_only_r0a"
  },
  "blockers": [],
  "next_action": "Status-dependent: only prepared with r0b_allowed=true may proceed to three independent R0B reviews; blocked or failed must return remediation only."
}
```

The result schema enforces: `status=prepared` iff `r0b_allowed=true`, all source/static/fixture tests and manifests validate, every forbidden mutation is evidence-backed `false`, `kernel_fence_integration_status=pending_r0c` and `kernel_fence_green_claimed=false`. `status=blocked|failed` requires `r0b_allowed=false`, at least one blocker code such as `blocked_preparation_gap`, and remediation-only `next_action`. R0A may never report kernel-fence integration `pass`. No observation defaults to false.
