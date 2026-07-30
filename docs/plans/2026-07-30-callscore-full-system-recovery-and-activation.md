# CallScore Full-System Recovery and Activation Plan

> **Revision:** v3. The immediate executable prompt is source-only Phase R0A. Live R1 is intentionally withheld until tooling exists, is frozen, and passes three code-aware reviews.

## Goal

Restore CallScore's degraded autonomous control plane without disturbing healthy public/read surfaces, then rotate affected credentials, reactivate the canonical system from Phase 0, restore safe cadence, and prove measured outcomes.

## Current truth

CallScore is `DEGRADED_BLOCKED`, not wholly down.

Positive evidence existed for:

- public website/read surfaces;
- both mandatory workers;
- Workplane and canonical 51-agent mapping;
- Sentinel;
- Langfuse.

Blocked/degraded layers include:

- Hermes state writes and disk headroom;
- snapshot reliability;
- canonical gateway ownership;
- 41 affected credentials;
- canonical activation;
- data/content/video cadence;
- measured subscriber, retention, conversion and revenue outcomes.

Canonical application repo: `/opt/crypto-tuber-ranked`.

Canonical Workplane repo: `/srv/agents/repos/callscore-workplane`.

Canonical Hermes source: `/srv/agents/hermes/hermes-agent`.

R0A freezes the Hermes commit/tree and SHA-256 of `hermes_state.py`, `tools/session_search_tool.py` and `gateway/status.py`. Any additional dependency requires plan amendment.

Sole activation entry point: `/srv/agents/hermes/profiles/callscore/skills/orchestration/callscore-system-activation/`.

Frozen diagnostic receipt: `/opt/crypto-tuber-ranked/.tmp/system-status/callscore-whole-system-20260730T022510Z.json`.

## Global boundaries

1. A plan or prompt file is not standing mutation authority.
2. Source preparation, broker installation, live maintenance, optional pruning, credentials, runtime adoption, revocation, activation, cadence and autopilot are separate transitions.
3. Each live mutation requires an operator-signed authorisation binding exact immutable inputs, actions, argv, nonce and expiry.
4. External/provider/public mutations remain graph-owned and receipt-backed.
5. Secrets go directly to a graph-owned sink and never enter graph state, logs, receipts, snapshots or chat.
6. No old credential is revoked before replacement creation, storage, affected-runtime adoption and fingerprint readback pass.
7. The historical failed activation receipt remains immutable. Any later activation starts at Phase 0.
8. Autopilot stays off until a new activation receipt independently passes.
9. Every mutation phase has a mandatory state-dependent finaliser.
10. Preserve unrelated Git work. No reset, clean, stash, amend, force-push, deployment or broad deletion.
11. Use top-level `schema`, never `receipt_type` or `receipt_schema`.
12. A timeout, partial review or receipt-only claim is not PASS.

## Recovery state machine

```text
DIAGNOSTIC
  -> R0A_TOOLING_PREPARED
  -> R0B_COMPLETE_TUPLE_REVIEWED
  -> R0C_BROKER_AND_POLICIES_INSTALLED_BY_OPERATOR
  -> R1_SIGNED_AUTHORIZATION_ACCEPTED
  -> R1_CURRENT_ANCHOR_VERIFIED
  -> R1_KERNEL_FENCE_ACTIVE
  -> R1_STATE_COMPACTED_OR_ROLLED_BACK
  -> R1_GATEWAY_CANONICAL
  -> R1_SNAPSHOT_POLICY_HEALTHY
  -> optional R1B_MANIFEST_PRUNE_PASS
  -> R2_SECRET_AUTHORITY_READY
  -> R3_REPLACEMENTS_ADOPTED
  -> R4_OLD_CREDENTIALS_REVOKED
  -> R5_ACTIVATION_PASS
  -> R6_CADENCE_HEALTHY
  -> R7_MEASURED_OUTCOMES
```

No transition may be skipped.

## Phase R0A — Source-only maintenance tooling preparation

### Authority

Omar may authorise R0A through the initiating message because R0A changes source in isolated worktrees only. It does not install or touch live state/services.

Execution prompt:

```text
/opt/crypto-tuber-ranked/docs/prompts/2026-07-30-callscore-r0a-maintenance-preparation-prompt.md
```

### R0A output

Prepare in an isolated Workplane worktree:

- operator-signature verification and root-broker source;
- kernel-enforced writer-fence broker logic;
- deterministic maintenance runner;
- online snapshot and object-identity-safe retention;
- exact state restore/forensic preservation;
- zero-provider SessionDB probe;
- exact v23 FTS verifier;
- JSON Schemas;
- hardened systemd unit templates;
- complete RED/GREEN tests;
- operator signing/install documentation.

No live install, `sudo`, systemd, cron, gateway, profile, DB, provider or public mutation is allowed.

R0A also forbids Git-hook and Codebase Memory index mutation. Every Git command uses a revalidated empty owner-only `core.hooksPath`; Codebase Memory is limited to read-only queries against an existing index. Workplane and application changes occur in separate isolated worktrees; neither primary checkout is modified.

### R0A architecture

#### Signed authority

Future live authorisation is an RFC 8785/JCS JSON document whose exact bytes are signed outside Hermes with an operator private key unavailable on `hermes-agent-box`. The broker installs those exact verified bytes unchanged; it may not promote or transform an unsigned proposal into executable authority. Any read-only proposal is merely an operator aid and is never executable input.

Broker verification uses SSH signatures:

```text
ssh-keygen -Y verify
namespace: callscore-r1
principal: bound operator principal
trusted public keys: /etc/callscore/allowed_signers
```

Authorisation binds:

- operator principal and initiating-request digest;
- nonce, issued time, expiry and maximum run duration;
- plan, final R1 prompt, Workplane source, schema, unit and verifier hashes;
- exact target profile/DB;
- exact broker actions and argv;
- exact cron/unit set;
- exact snapshot and forensic targets;
- exact deletable filesystem objects;
- explicit forbidden classes.

The broker rejects replay and rechecks expiry before every destructive transition.

#### Kernel-enforced writer exclusion

Advisory locks and open-handle inventories are evidence, not a fence.

Prepare a root broker that:

1. verifies signed authority;
2. drains existing DB holders;
3. creates a private mount namespace for a dedicated `callscore-maint` UID;
4. exposes original state read-write only inside that namespace;
5. bind/remounts the canonical target path read-only for ordinary gateway/CLI/cron/direct-SQLite writers;
6. continuously holds the fence across FTS/VACUUM/verification/rollback;
7. starts the nonce-bound maintenance service with no sudo/network/capabilities;
8. releases the fence only after final verification or verified rollback.

The target rejects unprivileged mount namespaces. R0A therefore proves the fence state machine with nonprivileged hermetic tests and emits a fixed privileged disposable-fixture integration test. Actual mount/writer-denial GREEN occurs only in separately authorised R0C. The reviewed topology uses a root-only original bind anchor, a host-visible canonical read-only self-bind and systemd `BindPaths` into the maintenance-unit namespace; teardown uncertainty leaves the canonical path read-only.

#### Snapshot and restore

The state DB is an opaque owner-only payload.

Allow only:

- online-backup `state.db`;
- `manifest.json`;
- `restore-readback.json`;
- value-free `recovery-metadata.json`.

Reject `.env*`, auth/provider config, key material, logs, exports, process environments, command dumps and Git object bundles.

Snapshot deletion must bind parent/snapshot device and inode, owner, run ID, exact members and manifest hash. Use fd-relative, no-follow, beneath-only and no-cross-device traversal with immediate `fstat` revalidation.

Rollback after any irreversible DB-stage failure must keep the fence, preserve failed DB/WAL/SHM to the authorised forensic target, stage and validate the pre-R1 anchor, fsync file and directory, atomically replace `state.db`, safely disposition stale WAL/SHM, and reverify before restarting. If rollback fails, the gateway remains stopped and fence remains active.

External capacity must cover the current anchor, the maximum failed `state.db`/WAL/SHM forensic set, a full sibling staged-restore copy and 2 GiB safety margin. Capacity or target-identity drift before anchoring performs zero live mutation and takes the pre-anchor blocked finaliser branch. The live root currently cannot be assumed to satisfy this.

#### Systemd contracts

`callscore-r1-maintenance@.service`:

- `User=callscore-maint`;
- `Group=callscore-state-maint`;
- `Environment=HERMES_HOME=/var/lib/callscore-maintenance/state` and `HOME=/nonexistent`;
- invokes the pinned Hermes `SessionDB` implementation against the explicit private-bind database path and never resolves `--profile callscore`;
- `NoNewPrivileges=yes`;
- no sudo;
- no network;
- empty capabilities;
- `ProtectSystem=strict`;
- writable paths limited to broker private bind/control directory;
- fixed nonce-bound argv;
- systemd timeout no greater than signed maximum duration.

`agent-snapshot.service`:

- `User=omar`, `Group=omar`, `UMask=0077`;
- `NoNewPrivileges=yes`;
- no network/capabilities;
- `ProtectSystem=strict`, `PrivateTmp=yes`;
- source profile read-only;
- writes limited to signed snapshot/control roots;
- validates a separate signed recurring snapshot policy before every run.

A nonce-bound R1 canary and recurring snapshot policy are separate. Timer enablement requires the recurring policy.

#### Exact FTS proof

Expected v23 indexes:

- `messages_fts`;
- `messages_fts_trigram`;
- `messages_fts_cjk` when present in installed schema.

For every present external-content index require:

```sql
INSERT INTO <table>(<table>, rank) VALUES('integrity-check', 1);
```

Validate exact table SQL, external content rowid, tokenizer/options and triggers.

Use deterministic canaries for `fts5`, CJK bigram, trigram fallback and one-character CJK LIKE routing. Require exact IDs from both `SessionDB.search_messages` and `tools.session_search_tool.session_search`, then absence after deletion.

Checkpoint proof is:

```sql
PRAGMA wal_checkpoint(TRUNCATE);
```

with busy exactly `0`.

### R0A gate

R0A is `prepared` only when:

- every required file exists in the isolated Workplane commit;
- explicit RED and GREEN evidence exists;
- full applicable tests/static/secret checks pass;
- the application repo has the exact committed final R1 prompt, manifest/schema, canonical red/green evidence and evidence-root paths defined by the R0A prompt;
- the self-reference-free JCS/SHA-256 graph validates;
- the in-tree manifest binds the Workplane tuple, application **base** tuple, exact changed-path allowlist and all non-self application output leaf hashes, plus the exact Hermes dependency tuple; the external R0B envelope later binds the final application commit/tree and manifest hash without self-reference;
- the pre-edit input manifest binds the committed review inputs and live unit/script identities consumed by preparation;
- all Git commands used the immutable empty-hooks procedure; shared Git administration writes were limited to exact nonce refs/reflogs/worktree metadata and newly created content-addressed loose objects, with no modification of pre-existing Git bytes and no external index mutation;
- every command ran through the prompt's cleared minimal environment and fail-closed full-syscall audit;
- any blocked/failed nonce was retained with its value-free failure receipt, was never reused, and cannot collide with a fresh reviewed nonce;
- both modified repos are clean at frozen commits;
- no live mutation occurred.

`prepared` is not a kernel-fence PASS. It requires `kernel_fence_integration_status=pending_r0c` and permits only R0B code-aware review. R0C must prove the real mount namespace, temporary DAC/setgid/default ACL access, Omar denial, DB/WAL/SHM creation and exact cleanup before live R1 authority exists.

## Phase R0B — Complete-tuple review

Review the complete three-repository/dependency tuple, not plan prose alone:

1. source/tests/units/schema correctness;
2. Linux mount/systemd/SQLite operational feasibility;
3. signature trust, TOCTOU, rollback, snapshot object identity and data-loss resistance.

All three must PASS against exact commits, trees and all artifact hashes. A timeout fails the gate. Any edit invalidates every review.

## Phase R0C — Separate operator installation and policy ingress

R0C is not executed by the R0A agent or R1 runner.

From a separate operator shell:

1. verify the reviewed tuple and hashes;
2. install broker, units, tools, dedicated `callscore-maint:callscore-state-maint` identity and trusted signer public key using literal reviewed commands;
3. against a disposable fixture only, record original DAC/ACL state, provision/use `User=callscore-maint` and `Group=callscore-state-maint`, apply literal temporary traversal/write ACLs plus setgid/default group access, start the nonce maintenance unit and verify its distinct mount-namespace inode/private bind before the broker applies the host-visible canonical read-only bind;
4. run the exact root integration command and require maintenance UID access, Omar denial, DB/WAL/SHM creation, hostile-writer denial and clean teardown all `pass`;
5. restore and byte-verify fixture owner/group/mode/ACLs; any cleanup uncertainty fails R0C;
6. install signed recurring snapshot policy if the timer is expected to run;
7. create a value-free read-only R1 proposal with current path/object identities and external-capacity target;
8. on `omarslaptop-1`, reconcile the proposal into the final `callscore-r1-maintenance-authorization-v1` JCS object;
9. sign those exact final authorisation bytes with the operator private key under namespace `callscore-r1`;
10. return the unchanged authorisation bytes plus detached signature to the broker ingress;
11. broker runs the reviewed literal `ssh-keygen -Y verify` argv and, only after a valid principal/namespace/signature result, atomically installs the same bytes unchanged in root-controlled authorisation storage.

The operator signing key must not exist on HHVM or in Hermes/Composio.

## Phase R1 — Live state, snapshot and gateway maintenance

The final R1 prompt is generated only after R0A actual hashes exist. R1 prohibits source edits and installation.

### Signed preconditions

Require:

- complete R0B PASS tuple;
- installed hashes equal reviewed hashes;
- valid signed authorisation and snapshot policy;
- external capacity for the current anchor, maximum failed DB/WAL/SHM forensic preservation set, a full sibling staged-restore copy and 2 GiB safety margin;
- exact existing snapshot object identity;
- exact paused cron/unit action set;
- unexpired per-transition authority.

### State-dependent finaliser

Branches are explicit:

1. pre-anchor capacity block with no gateway stop: preserve/verify original manual state;
2. post-anchor, pre-stop failure: retain anchor and original gateway state;
3. post-stop, pre-DB failure: restore authorised supervision only after DB verification;
4. post-DB failure: exact fenced rollback;
5. rollback failure: fence retained, gateway stopped, critical blocker;
6. success: canonical gateway, provider jobs/daily write timer paused, snapshot timer enabled only under valid recurring policy.

### Live sequence

1. Read-only baseline and exact signed-authorisation reconciliation.
2. Pause exact provider-capable jobs and disable the daily write timer.
3. Create/verify current pre-R1 external anchor before gateway stop or DB mutation.
4. Broker stops only the exact PID after PID-file, UID, executable, cmdline, profile and start-time validation.
5. Broker activates kernel fence and starts nonce-bound maintenance service.
6. Run supported compact migration:

```bash
/usr/local/bin/callscore-r1-maintenance optimize-storage --state-db /var/lib/callscore-maintenance/state/state.db --no-vacuum
```

7. Verify exact external-content schemas, triggers, all FTS integrity checks and all search routes.
8. Require physical-space preflight, then run supported optimisation/VACUUM.
9. Require `wal_checkpoint(TRUNCATE)` busy `0`, counts, search parity and quick-check.
10. On any failure, execute exact restore matrix while fenced.
11. On success, broker returns ownership/path visibility and canonical user gateway supervision.
12. Run zero-provider SessionDB create/read/end/delete probe.
13. Run nonce-bound snapshot canary under live WAL activity.
14. Independently verify snapshot/object identity/restore, gateway, workers, Workplane, Sentinel, Langfuse, website and no unauthorised mutations.
15. Enable snapshot timer only with separately valid recurring policy.
16. Keep daily write timer and provider-capable jobs paused.

### R1 exclusions

- No session pruning.
- No daily pipeline service/write.
- No PostgreSQL/provider/public/credential/deployment/image/scale mutation.
- No R2 continuation.

## Phase R1B — Optional exact background-session pruning

Only if R1 headroom remains insufficient and with separate signed authority.

Do not execute Hermes age/source prune filters because preview and deletion recalculate membership.

Build/review a manifest-bound tool that:

- freezes an absolute cutoff;
- records IDs/metadata/child links only;
- excludes active, pinned, archived or child-linked rows unless individually authorised;
- hashes the exact set;
- in one `BEGIN IMMEDIATE` transaction requires exact set and metadata equality;
- deletes exactly manifest IDs or zero;
- never emits titles/bodies.

## Phase R2 — Credential authority mapping

After R1 pass only:

- map all 41 affected credential names to exact provider adapters, canonical payloads, secret sink, affected runtime, fingerprint readback and revocation-only tool;
- create separate provider/action `SECRET_GATE` receipts;
- prove the graph-owned secret sink exists;
- stop if any exact path is missing.

No credential mutation occurs in R2.

## Phase R3 — Replacement creation and runtime adoption

One credential at a time:

1. graph-owned provider adapter creates replacement;
2. plaintext goes directly to secret sink;
3. durable provider execution proof persists without values;
4. only affected runtimes are updated/recreated;
5. fingerprint-only readback and health pass.

No revocation, image rebuild or scale change.

## Phase R4 — Old-credential revocation

For each adopted replacement:

- separate signed revocation authority;
- revocation-only tool proof;
- graph-owned execution;
- durable provider proof;
- old rejected/new accepted readback.

## Phase R5 — Canonical activation from Phase 0

Use only the canonical activation skill. Start a new run at Phase 0. Preserve historical failure.

Require sequential pass receipts for workers, Workplane, 51-agent audit, learning cluster, content/video gates, observability and cooldown.

Autopilot stays off until final activation pass is independently verified.

## Phase R6 — Restore data, content and video cadence

With separate graph-owned write/public gates:

- replace fixed daily-pipeline approval with a real bound receipt;
- run bounded scoring/ingestion and verify DB deltas;
- restore CMO/cooldown jobs only after activation pass;
- require all canonical editorial/platform/visual/coherence/originality receipts;
- require design alignment v2, branding v2, lockup occlusion and media artifact v2 for media;
- require all YouTube production receipts for YouTube readiness;
- preserve cooldown as a valid receipt-backed outcome.

## Phase R7 — Durable learning and measured outcomes

Require:

- `learning_event.v1`;
- `agent_performance_ledger.v1`;
- `learning_delta.v1`;
- `experiment_result.v1`.

Measure subscribers, retention, conversion, revenue and operational performance from authoritative systems. Do not infer outcomes from artifacts or publication count.

## Global completion

CallScore is fully recovered only when:

1. R0 tooling/broker/policies pass full code-aware review and operator installation.
2. R1 state/snapshot/gateway maintenance passes or verified rollback leaves an explicit blocker.
3. Optional R1B is unnecessary or separately passes.
4. All affected credentials are replaced, adopted and revoked with provider proof.
5. A new activation passes from Phase 0.
6. Safe cadence is healthy under canonical receipts.
7. Autopilot is enabled only after activation pass.
8. Learning and measured outcomes are durable.

Until then report precise layer status, never “the whole system is down.”
