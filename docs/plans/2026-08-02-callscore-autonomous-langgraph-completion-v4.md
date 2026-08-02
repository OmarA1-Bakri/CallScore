# CallScore Autonomous LangGraph Completion Plan v4

> Supersedes failed v1 commit `10129ae81e3f1eac385292ced0cedc5c8390129d`, failed v2 commit `c435c49a3aafcd7de63a74988d68ea6d64b3006c`, and failed v3 commit `640329f4fed5f3fb276d2fd4ca8941179f2e43f2`. V4 closes the v3 retry/reclaim, lifecycle, child-identity, runtime-callability, quality-evidence, provider-readback, experiment-bootstrap, post-promotion, eligibility, final-report, cutover-order, and rollback-evidence blockers. No implementation begins until three new reviewers return PASS against the exact v4 commit and manifest.

## 0. Goal, scope, and immutable target

Build one persistent CallScore autonomy supervisor that owns task claim through terminal state, uses PostgreSQL LangGraph checkpoints, launches real Hermes specialist processes with durable handles, joins and independently evaluates their artifacts, executes provider mutations only through graph-owned exact grants, verifies provider readback, measures outcomes, records all four canonical learning artifacts, activates statistically justified variants, and automatically rolls them back on regression.

In scope:

- App repo base: `22993a5537c9b677e25f6454f9f72c52179fc493`.
- App branch/worktree: `feat/callscore-autonomous-langgraph-completion-20260802` at `/home/omar/callscore-worktrees/autonomous-langgraph-completion-20260802`.
- Workplane repo base and `origin/master`: `99d1b9ce008557b82163ff4c799ff8087ccb97a9`.
- Workplane implementation must use a new clean worktree at `/home/omar/callscore-worktrees/workplane-autonomous-langgraph-completion-20260802`; the dirty canonical checkout is evidence only and must not be edited or cleaned.
- Canonical deployed roots remain `/opt/crypto-tuber-ranked`, `/srv/agents/repos/callscore-workplane`, and `/srv/agents/hermes/profiles/callscore`.
- App, Workplane, and runtime-script changes are one reviewed deployment tuple: `{app_commit_sha,workplane_commit_sha,plan_commit_sha,graph_source_sha256,migration_sha256,runtime_script_manifest_sha256,image_digest,prompt_manifest_sha256}`. Every phase review, activation receipt, deployment manifest, final report, and verifier CLI binds this same tuple.
- Every phase is RED -> GREEN -> REFACTOR. A phase is accepted only after parent diff inspection, focused tests, regression tests, three independent PASS receipts, a checkpoint commit, push, and local/remote SHA equality.

Explicitly out of scope:

- Payment, checkout, subscription, entitlement, payout, customer-record, DB data-rewrite, paid-spend, private outreach, newsletter send, email reply send, DM, non-owned publication, and deployment-provider mutation.
- Those lanes are implemented only as `READ_ONLY_OBSERVATION` or `RESTRICTED_DRAFT`; a live request for one reaches controlled `FAILED`, never provider execution.
- No new canonical agent is added. Existing 51-agent ownership is reused.
- No direct parent/provider call is permitted. The single owned-public canary, if eligible, must be a supervisor workflow with an exact provider-operation and readback ledger.
- Baseline on this exact source tree is `1473/1474`: `tests/gtm-execution-fixes.test.ts` Phase 3.2 intermittently omits the LinkedIn zero-result engagement receipt (`Engagement receipt for linkedin must be produced`). Typecheck, lint, and build pass. The failure predates this documentation-only plan and is not relabelled green. Phase A first adds a deterministic no-result receipt fixture/fix and must make the full 1474-test baseline green before autonomy source work can advance.

Plan proof fixtures committed with this document:

- `docs/plans/fixtures/025-callscore-autonomous-supervisor-contract-v4.sql`: executable PostgreSQL 16 contract fixture using migration 024's UUID `channel_tasks` key. It creates no-login function-owner/runtime/policy/enqueue/observer/report-verifier roles, fixed-search-path `SECURITY DEFINER` functions, direct-DML denials, DB-computed append-only hash chains, exact grant relations, provider dispatch boundary, experiment/learning/final-report contracts, and simultaneous null-session child rows. It returned `autonomy_contract_v4_passed` and rolled back on local PostgreSQL 16.14.
- `docs/plans/fixtures/autonomy-contract-spike-receipt-v4.json`: command/result/rollback receipt for the v4 SQL proof.
- `docs/plans/fixtures/autonomy-authority-function-call-matrix-v4.json`: executable coverage map binding every authority function to its positive or fail-closed fixture path.
- `docs/plans/fixtures/hermes-child-identity-spike-receipt.json`: real Hermes one-shot proof with zero resolved tools, machine-written usage file, and non-empty session ID.
- `docs/plans/fixtures/canonical-learning-artifacts-v2.schema.json`: exact JSON Schemas for all four durable learning artifacts, including the registry version that generated the candidate.
- `docs/plans/fixtures/callscore-autonomy-implementation-report-v3.schema.json`: final report structure and PASS-conditional evidence contract.
- `docs/plans/fixtures/verify-autonomy-final-report-contract-v4.py`: executable independent-verifier predicate oracle for cross-field identity, A-J review independence, typed receipt content, artifact hashes, the full deployed tuple, and live-canary requirements.
- `docs/plans/fixtures/provider-mutation-surface-inventory-v4.json`: complete classified authority/mutation call-site inventory at base source commit `22993a5537c9b677e25f6454f9f72c52179fc493` and negative-test contract.
- `docs/plans/fixtures/autonomy-runtime-baseline-inventory-v4.json`: exact enabled/schedule/workdir/prompt hash and byte count, resolved runner path/hash, wake chain, disposition, worker digest, and gateway identity for every mutation/claim-capable cron/runtime authority. Cutover re-hashes the protected scheduler source rather than storing prompt text.
- `docs/plans/fixtures/langgraph-postgres-dependency-compatibility.json`: npm metadata proof that Postgres checkpointer `1.0.4` is semver-compatible with the checked-in LangGraph/core/checkpoint/pg/Node ranges; Phase B still requires a lockfile/import/setup/resume execution spike.
- `docs/plans/fixtures/v4-plan-artifact-manifest.json`: path, byte length, and SHA-256 binding for this plan and the eleven non-circular proof artifacts; the manifest's own SHA-256 is captured after commit and supplied to reviewers.

## 1. Single-authority architecture

### 1.1 Runtime topology

The channel-autonomy path moves out of the Docker `channel-agent-worker` and into one host user service:

- Tracked unit template: `ops/systemd/callscore-autonomy-supervisor.service`.
- Deployed unit: `/home/omar/.config/systemd/user/callscore-autonomy-supervisor.service`.
- Entrypoint: `/usr/bin/node --import tsx src/scripts/callscore-autonomy-supervisor.ts`.
- Working directory: `/opt/crypto-tuber-ranked`.
- Canonical user gateway remains `hermes-callscore-gateway.service`.
- System `hermes-gateway.service` remains disabled; user `hermes-gateway.service` and `hermes-gateway-callscore.service` remain masked.
- Docker `hermes-worker` remains the data/pipeline worker with `--no-channel-tasks`.
- Docker `channel-agent-worker` is stopped and removed from the active Compose set after quiesce.

The host supervisor is required because the current Docker image contains no Hermes CLI/profile and exposes only `.tmp`. The new service can launch real Hermes children while keeping child environments capability-filtered. This is not a second orchestrator: it is the sole claimant and state-transition owner for autonomy workflows.

### 1.2 Authority boundaries

Only the compiled supervisor graph may call repository functions that change autonomy workflow state. Shell, cron, gateway, Workplane, API, and worker code may only:

1. call the enqueue function, which allocates an immutable `workflow_id`; or
2. wake the supervisor; or
3. perform read-only status/receipt inspection.

They may not claim, lease, select a transition, mark success, mint an approval string, execute a provider mutation, or complete a workflow.

The worker loop may perform one pre-graph read-only operation: `locateRunnableWorkflowId()`. It returns an already-enqueued immutable `workflow_id` without claiming or changing state. That ID defines the LangGraph thread before first invocation. The first graph node performs the transactional claim.

## 2. Exact lifecycle contract

### 2.1 Enums

Workflow states:

`QUEUED`, `HEAD_PLANNING`, `CHILDREN_RUNNING`, `HEAD_SYNTHESIS`, `QUALITY_EVALUATION`, `REVISION`, `READY`, `EXECUTING`, `PROVIDER_VERIFIED`, `OUTCOME_PENDING`, `OUTCOME_MEASURED`, `LEARNING_RECORDED`, `COMPLETE`, `RETRY`, `FAILED`.

Execution classes:

- `OWNED_PUBLIC_MUTATION`
- `INTERNAL_ARTIFACT`
- `READ_ONLY_OBSERVATION`
- `RESTRICTED_DRAFT`

Terminal states are only `COMPLETE` and `FAILED`.

### 2.2 Allowed paths by execution class

All classes share:

`QUEUED -> HEAD_PLANNING -> CHILDREN_RUNNING -> HEAD_SYNTHESIS -> QUALITY_EVALUATION`.

Quality revision:

`QUALITY_EVALUATION -> REVISION -> QUALITY_EVALUATION`, maximum three revisions. A fourth requested revision becomes `FAILED/revision_budget_exhausted`.

Owned public mutation:

`QUALITY_EVALUATION -> READY -> EXECUTING -> PROVIDER_VERIFIED -> OUTCOME_PENDING -> OUTCOME_MEASURED -> LEARNING_RECORDED -> COMPLETE`.

Internal artifact or restricted draft:

`QUALITY_EVALUATION -> READY -> OUTCOME_PENDING -> OUTCOME_MEASURED -> LEARNING_RECORDED -> COMPLETE`.

`OUTCOME_MEASURED` here is the persisted offline evaluator/acceptance measurement, not fabricated provider evidence. The completion predicate requires an accepted artifact, independent evaluation, four canonical learning artifacts, and zero provider operation.

Read-only observation:

`QUALITY_EVALUATION -> READY -> OUTCOME_PENDING -> OUTCOME_MEASURED -> LEARNING_RECORDED -> COMPLETE`.

Its measurement is the source-backed observation with collection method, source ID, timestamp, numerator, denominator, and raw artifact hash.

Restricted live-mutation request:

`READY -> FAILED/restricted_execution_class` before provider intent creation. If the task request is for a draft, it uses `RESTRICTED_DRAFT` and may complete locally; if it asks to send/mutate, it fails closed.

Retry transitions:

- `CHILDREN_RUNNING -> RETRY -> CHILDREN_RUNNING | FAILED`
- `EXECUTING -> RETRY -> EXECUTING | FAILED`
- `PROVIDER_VERIFIED -> RETRY -> PROVIDER_VERIFIED | FAILED`
- `OUTCOME_PENDING -> RETRY -> OUTCOME_PENDING | FAILED`

Generic `transition_autonomy_workflow` rejects both entry to and exit from `RETRY`. `schedule_autonomy_retry(...)` atomically stores the exact previous executable state, due timestamp, controlled reason, incremented retry count, and current lease generation or terminalises at `FAILED/retry_budget_exhausted`. `resume_due_autonomy_retry(...)` requires due time, the stored previous state, expected state version, and a new lease token; it resumes only that state. `resume_or_reclaim_autonomy_workflow(...)` handles same-identity continuation or expired-lease generation-fenced recovery and writes an append-only workflow lease event. Delayed outcome collection uses `OUTCOME_PENDING -> RETRY`; resumption attempts read-only outcome ingestion and never resubmits a provider operation.

### 2.3 Completion predicates

`COMPLETE` is derived by a security-definer transition function; callers cannot set it directly.

- `OWNED_PUBLIC_MUTATION`: accepted evaluation, canonical authority/grant consumption, provider operation `VERIFIED`, independent readback artifact matching account/action/payload/external ID, required outcome window or durable remeasurement schedule, and all four learning artifacts.
- `INTERNAL_ARTIFACT` / `RESTRICTED_DRAFT`: accepted artifact hash, independent evaluation, offline measurement, all four learning artifacts, and no provider operation.
- `READ_ONLY_OBSERVATION`: source/readback artifact, typed measurement, independent acceptance, all four learning artifacts, and no provider operation.

Exit zero, draft existence, report receipt, `independent_agent_execution=true`, provider attempt, or public URL without readback can never satisfy a completion predicate.

## 3. Persistence, claim, checkpoint, and migration contracts

### 3.1 Authoritative schema

Migration `025-callscore-autonomous-supervisor.sql` must conform table-for-table, type-for-type, constraint-for-constraint, trigger-for-trigger, function-signature-for-function-signature, and ACL-for-ACL to `025-callscore-autonomous-supervisor-contract-v4.sql`, with only the fixture schema/role prefixes changed to production names. In particular, `source_channel_task_id` is UUID because migration 024 defines `channel_tasks.id UUID`; bigint is forbidden. It creates:

- lifecycle, execution-class, join, evaluation, provider, variant, and authority enums;
- `autonomy_workflows` as the authoritative state projection;
- append-only `autonomy_workflow_transitions` and `autonomy_workflow_lease_events`;
- exact-action `external_action_grants`;
- `agent_delegations` plus append-only `agent_delegation_events`, with database-unique child execution ID and parent-captured PID/PGID/start-ticks/executable/UID/cwd identity;
- append-only `generation_provenance`, `quality_evaluations`, `artifact_revisions`;
- `provider_operations` plus append-only provider transition/lease events and independently verified typed execution/readback/absence evidence;
- append-only `outcome_measurements` and `canonical_learning_artifacts`;
- content-addressed `autonomy_artifacts` metadata with UUID foreign keys from every evidence-bearing row;
- runtime experiment definitions whose only mutable field is function-owned `ends_at`, immutable content-addressed variants, mutable CAS runtime registry, append-only assignments/cooldowns/promotion events, and final reports.

`channel_tasks` remains a compatibility source/projection only. After migration, no component may treat its legacy `status` as authority. New enqueue creates the compatibility row directly as `blocked/migrated_to_autonomy:<workflow_id>` plus the `autonomy_workflows` row atomically; it is never born claimable. A trigger rejects any transition of an autonomy-linked compatibility row back to `pending` or `running`, and transition receipt tests prove all old completion writers are removed.

Conservative legacy mapping runs under one transaction, the activation fence, and `LOCK TABLE channel_tasks IN SHARE ROW EXCLUSIVE MODE`:

- `pending` rows become `QUEUED`; only the exact allowlist `engagement_discovery`, `status_observation`, `analytics_collect`, and `sentinel_observation` becomes `READ_ONLY_OBSERVATION`; every other pending legacy row is downgraded to `RESTRICTED_DRAFT`; no legacy row is automatically classified `OWNED_PUBLIC_MUTATION`;
- `running` rows become `FAILED/legacy_running_reconciliation_required`, because pre-migration provider dispatch cannot be proven absent;
- every legacy row is first copied to append-only `legacy_channel_task_migration_snapshots` with canonical row JSON and DB-computed SHA-256; `succeeded`, `failed`, `blocked`, `cancelled`, and `draft_only` remain history-only and do not become autonomy workflows or count as autonomy `COMPLETE`;
- insert uses `ON CONFLICT (source_channel_task_id) DO NOTHING`; before/after counts and every excluded status count are written to the migration receipt;
- after successful mapping, compatibility rows originally `pending` or `running` are changed to `blocked` with `migrated_to_autonomy:<workflow_id>` so even an accidentally invoked legacy worker cannot claim them; their original row/status remains in the immutable snapshot ledger;
- migration aborts if any pending row falls outside the two conservative mappings, any running row is not failed, or any terminal legacy row appears in `autonomy_workflows`.

All ledger foreign keys use `ON DELETE RESTRICT`. Append-only tables reject `UPDATE` and `DELETE` with triggers. The DB-owned `set_ledger_hash()` trigger obtains a per-stream advisory transaction lock, requires exactly prior sequence plus one, overwrites caller-supplied previous/hash fields, canonicalises `to_jsonb(NEW)` excluding the two hash fields, and computes `sha256(canonical_json_text || previous_hash_hex)`. Forked sequence insertion, mutation, and deletion are executable negative probes. Runtime variants are content-addressed immutable definitions rather than event streams; activation changes occur only in the versioned registry and append-only promotion ledger.

### 3.2 Privilege split

Migration creates or verifies these privilege classes through migration-role execution:

- migration/admin role: DDL and role grants only;
- `callscore_function_owner`: NOLOGIN, owns every `SECURITY DEFINER` authority function, has table DML needed by those functions, and is not the migration or runtime login;
- `callscore_runtime`: dedicated supervisor login; executes claim/heartbeat/transition/grant/provider functions and reads projections; has no direct INSERT/UPDATE/DELETE on authority or ledger tables;
- `callscore_enqueue`: enqueue-function execution only; cannot claim, transition, grant, or execute;
- `callscore_policy_writer`: imports reviewed registry snapshots/receipt evidence and controls the activation fence; cannot execute providers or change workflow state;
- `callscore_report_verifier`: independent final-report verifier; can execute only `insert_verified_autonomy_report` after the file verifier returns PASS and cannot mutate any authority table directly;
- `callscore_observer`: SELECT only.

Every definer function has an explicit signature, NOLOGIN owner, `SECURITY DEFINER`, fixed `SET search_path = pg_catalog, public`, fully qualified relation references, PUBLIC EXECUTE revoked, and one exact per-role `GRANT EXECUTE`. The executable fixture defines, compiles, and invokes the authority surface, including retry scheduling/resume/reclaim, experiment-bundle import, child creation/events, deterministic gate evidence, quality evaluation, provider-intent creation, grant minting, provider execution/readback/absence reconciliation, outcomes, all four learning artifacts, promotion/rollback, and final-report insertion. Its positive lifecycle reaches `COMPLETE`; its ambiguity path reaches `UNKNOWN -> CONFIRMED_NOT_PERFORMED -> CLAIMED`; its negative probes cover compatibility reactivation, direct DML, ledger mutation/fork, and false completion. Production migration changes only schema/role prefixes. TypeScript callers cannot issue raw authority-table DML.

Production activation therefore requires one separately approved DB-role/credential step. `scripts/provision-callscore-autonomy-db-roles.sh` runs under the migration role and atomically provisions two LOGIN principals plus three NOLOGIN group roles: the supervisor login is a member only of `callscore_runtime`; the one-shot report-verifier login is a member only of `callscore_report_verifier`; the existing application login receives membership only in `callscore_enqueue`. It generates both new passwords without stdout/stderr and writes `CALLSCORE_AUTONOMY_DATABASE_URL=<dsn>` and `CALLSCORE_REPORT_VERIFIER_DATABASE_URL=<dsn>` to separate files under `/srv/agents/hermes/profiles/callscore/runtime-secrets/` through `umask 077`, fsync, and atomic rename. The directory is owner `omar`, group `omar`, mode `0700`; each file is `omar:omar` mode `0600`. It proves each positive EXECUTE grant and every forbidden DML/function call without printing a DSN. The supervisor unit loads only `autonomy-runtime.env` and declares `InaccessiblePaths=/srv/agents/hermes/profiles/callscore/runtime-secrets/autonomy-report-verifier.env`; the one-shot verifier unit loads only `autonomy-report-verifier.env` and declares `InaccessiblePaths=/srv/agents/hermes/profiles/callscore/runtime-secrets/autonomy-runtime.env`. Both use `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`, and explicit writable artifact directories. The policy writer is NOLOGIN and is assumed only by the approved migration controller; it has no persistent credential. Children are launched through `env -i` and inherit neither file. Rollback removes a credential file only when its provisioning receipt says that exact file/login was newly created; neither content nor a secret-derived hash enters receipts. Existing application/data-pipeline `DATABASE_URL` remains unchanged. Failure keeps cutover fenced.

The migration refuses to run when the active connection cannot prove migration-role capability. `PostgresSaver.setup()` runs only in `src/scripts/setup-callscore-supervisor-checkpoints.ts` under migration credentials. Runtime startup has no DDL privilege and fails readiness if checkpoint schema/version is absent.

Disposable PostgreSQL tests create equivalent temporary roles and prove:

- runtime cannot forge a grant or ledger row;
- runtime cannot update/delete ledger evidence;
- parent deletion is blocked;
- migration applied twice is idempotent;
- failed migration rolls back wholly;
- conservative backfill never upgrades report/draft rows to provider-verified or complete;
- `channel_tasks` read/projection compatibility remains during the 24-hour observation window, while the old claiming worker is permanently fenced after migration 025.

### 3.3 Thread bootstrap and crash windows

Enqueue allocates `workflow_id` before any claim. The worker read-only locator returns that ID. Invocation config is fixed before first graph call:

- `thread_id = callscore-task:<workflow_id>`
- `checkpoint_ns = callscore-supervisor/<task_type>`
- `workflow_run_id = <stable UUID allocated once at enqueue and never changed until terminal>`
- `graph_attempt_id = <fresh UUID for each supervisor process invocation>`; this is checkpoint metadata only and is forbidden from child idempotency keys.

The graph's first node calls `claim_autonomy_workflow(workflow_id, worker_id, lease_duration, expected_state_version)` using `FOR UPDATE` and CAS. No external action occurs in the claim node.

Crash semantics:

1. Before claim: no mutation; another loop can locate the row.
2. After claim transaction but before LangGraph checkpoint write: lease row persists, no side effect has run, and restart invokes the same thread ID. The claim node recognises the same active lease or reclaims only after expiry, then writes the first checkpoint.
3. After checkpoint: restart loads the same PostgreSQL checkpoint and resumes the next node.
4. After node output but before checkpoint: every mutating node first creates a DB intent with an idempotency key; retry reconciles the intent and never assumes the side effect was absent.
5. After terminal transition: locator excludes the row; repeated invocation returns the terminal checkpoint without re-execution.

A dedicated kill-point harness sends SIGKILL at each boundary and asserts one workflow, one transition version per step, one provider operation, no duplicate child dispatch key, and identical resumed thread ID.

## 4. Real Hermes delegation contract

### 4.1 Launch and identity

Create:

- `src/lib/autonomy/supervisor/delegation/hermes-child-runner.ts`
- `src/lib/autonomy/supervisor/delegation/reconciler.ts`
- typed launch/result/usage schemas.

Before spawn, the graph inserts a unique `DISPATCH_INTENT` keyed by `(workflow_id, workflow_run_id, revision_number, delegated_role, ordinal)`. Because `workflow_run_id` is stable across supervisor retries/restarts, a fresh graph invocation cannot create a second child identity. The runner receives a random `delegation_id` and `CALLSCORE_CHILD_EXECUTION_ID`, opens exclusive stdout/usage paths, and directly spawns Hermes with `detached: true`, file-descriptor stdout/stderr sinks, and a new process group:

`/home/omar/.local/bin/hermes -p callscore --safe-mode --ignore-rules --pass-session-id --usage-file <exclusive-path> -m <model> --provider <provider> -t <approved-toolset> --skills <approved-skills> -z <schema-bound-prompt>`.

Durable handles are authoritative in this order:

1. `delegation_id` and dispatch key before spawn;
2. Hermes PID, process-group ID, `/proc/<pid>/stat` start ticks, executable, UID, cwd, and exact child-execution ID after spawn;
3. machine-written Hermes `session_id`, model, provider, completion/failure, and API-call count from the exclusive usage file after completion.

Child-echoed IDs are ignored. Exit zero is ignored unless usage file says `completed=true`, `failed=false`, session ID is non-empty, stdout parses against the required schema, artifact hashes match parent reads, and the join accepts it.

The committed child spike proves a real `context_engine` invocation with zero resolved tools and session `20260802_010715_716abd`.

### 4.2 Capability isolation

The runner constructs the equivalent of `env -i` and passes only `HOME`, `USER`, `PATH`, `HERMES_HOME`, `HERMES_PROFILE`, locale/CA variables, child execution ID, and the selected LLM provider credential. It never passes database, Composio, social, email, Whop, payment, deployment, cloud, or infrastructure credentials.

Approved toolsets:

- synthesis/copy/critic/evaluator children: `context_engine`, which resolves to zero tools;
- public-evidence research children: `search` or `web`, read-only only;
- no child receives `terminal`, `file`, `browser`, `computer_use`, `skills`, `delegation`, `cronjob`, `kanban`, provider-app, or mutation tools.

Skills are injected in the launch prompt; children do not receive `skill_manage`. Media/provider execution remains a graph node behind canonical gates, never an arbitrary child tool.

### 4.3 Recovery, timeout, cancellation, and join

On restart, reconciliation checks the terminal receipt, usage file, exact PID/start-ticks/PGID identity, executable, UID, cwd, and process environment. It never uses `pkill` or name-only matching. If the parent crashed after `spawn()` but before PID persistence, the reconciler scans only same-UID `/proc/*/environ` for the exact random child execution ID, requires exactly one process plus matching executable/cwd, then backfills PID/start-ticks/PGID; zero matches after the five-second grace becomes `ORPHANED`, while multiple matches become `FAILED/ambiguous_child_identity` with no respawn.

- If the Hermes process is alive, the graph rejoins it without a second spawn.
- If a valid terminal receipt exists, the graph validates and consumes it once.
- If spawn intent exists but no receipt/process exists, wait a five-second spawn grace, mark the same delegation row `ORPHANED`, then use CAS to advance that row's lease generation back to `DISPATCH_INTENT` for a bounded respawn. It never inserts another dispatch key. Only one owner can advance the generation, so concurrent restart loops cannot respawn together.
- At deadline, verify PID/start-ticks/PGID/execution-ID again, send SIGTERM to the negative PGID (the exact child process group), wait ten seconds while scanning that PGID, then SIGKILL the same negative PGID if any member remains. Verify no same execution-ID process and no member of the recorded PGID remains before recording `TIMED_OUT` or `CANCELLED`. PID reuse, daemonised descendants, and grandchild survival are RED cases.
- Any required child `FAILED`, `TIMED_OUT`, `ORPHANED`, invalid-schema, or hash mismatch blocks synthesis. Missing child success can never be synthesised around.

## 5. Evaluation and revision contract

The head synthesiser and evaluator use different canonical agent IDs and different generation records. The evaluator cannot be the producer, promoter, or authority-grant issuer.

Deterministic gates include schema validity, evidence citation/hash match, prohibited claims, platform constraints, originality/same-shit memory, exact canonical media receipt package, and restricted-lane classification. They are not caller booleans: `record_quality_gate_evidence(...)` stores one append-only row for each exact required gate, bound to workflow, candidate generation, artifact, producer, independent verifier, and pass/fail result. `record_quality_evaluation(...)` resolves the five mandatory gate names from those durable rows and refuses missing, duplicate, failed, wrong-generation, or self-verified evidence.

Semantic dimensions are factual accuracy, evidence support, originality, platform fit, clarity, CallScore voice, commercial strength, actionability, handoff readiness, hook, argument, native structure, audience relevance, CTA, and similarity to recent publications.

`record_quality_evaluation` recomputes, rather than accepts, the decision. It requires the evaluator generation and candidate generation to share the same workflow, revision, experiment/cohort/variant registry lineage, while using distinct producer agents and distinct sessions. Similarity is a separate lower-is-better gate. The positive-dimension weighted mean uses fixed weights: factual accuracy 0.15, evidence support 0.15, originality 0.08, platform fit 0.07, clarity 0.07, CallScore voice 0.07, commercial strength 0.05, actionability 0.06, handoff readiness 0.05, hook 0.06, argument 0.06, native structure 0.05, audience relevance 0.04, CTA 0.04. The sum is exactly 1.00. Safety/compliance is a separate exact-1.00 gate.

Acceptance thresholds:

- all deterministic gates pass;
- factual accuracy >= 0.95;
- evidence support >= 0.95;
- safety/compliance = 1.00;
- all other required dimensions >= 0.80;
- weighted mean >= 0.86;
- similarity below the channel's committed threshold.

Failure produces controlled reason codes and a new revision artifact. Revision N must hash-link source generation, evaluation, and revised generation. Revision 3 may be accepted or rejected; a `REVISION` request at the budget is converted atomically to `FAILED/revision_budget_exhausted`, so no revision 4 exists and no exception can strand the workflow in a nonterminal quality state.

## 6. Non-self-attested provider authority and exactly-once execution

### 6.1 Remove caller-controlled approval

Phase E must reproduce the search contract in `provider-mutation-surface-inventory-v4.json` and classify every match. The reviewed inventory requires changes to `callscore-operating-goal.ts`, `external-mutation-guard.ts`, `external-mutation-schemas.ts`, `graph-owned-provider-adapter.ts`, `external-mutation-node-utils.ts`, `mcp-youtube-publisher.ts`, `composio-client.ts`, `youtube-publisher.ts`, and `hermes-worker.ts`. A new matching path not present in the inventory fails RED until classified; a path may not be silently omitted as an "applicable" call site.

Live execution schemas reject `approved`, `approved_publish`, `approved_by_operator`, `approval_receipt_id`, `live_owned_public`, and worker-minted receipt IDs. CLI may select dry-run/read-only mode only. No boolean or receipt string supplied by a caller confers authority.

`create_provider_operation_intent(...)` is the only runtime-authorised intent creator. It requires workflow state `READY`, the exact current publication revision, a content-addressed canonical payload artifact, a content-addressed provider-object rollback/deletion artifact, bounded expiry, and typed account/tool/action fields. It derives `payload_sha256` from the stored artifact and refuses duplicate global account/tool/action/payload tuples. Runtime has no direct intent-table DML.

For `READY_PUBLIC_OWNED`, `mint_ready_public_owned_grant(workflow_id,intent_id)` receives no approval boolean, destination, tool, action, or payload from the caller. It independently reads the immutable workflow and provider-intent rows and joins:

- reviewed registry snapshot and policy commit;
- workflow execution class and current state;
- exact destination/account scope;
- provider tool/action;
- canonical payload hash;
- cooldown and originality evidence;
- mandatory canonical editorial/platform/visual/same-shit receipts;
- for public media, design bundle, website alignment v2, branding v2, lockup occlusion, and media artifact v2 receipts;
- task-router and tool-inheritance receipts;
- rollback contract and expiry.

If all pass, it inserts one exact, expiring, single-use grant. The SQL fixture uses composite unique keys and foreign keys so provider operation, grant, and intent must agree on `(workflow_id,intent_id,publication_revision,account_scope_hash,provider_tool,action_name,payload_sha256)`. Runtime cannot directly insert or edit grants. The single-use grant ID is unique in `provider_operations`. Operator grants are not used in this project because restricted mutations are out of scope.

### 6.2 Provider operation state machine

`provider_operations` is the mutable CAS projection; `provider_operation_events` is immutable evidence. The DB computes the operation key from canonical PostgreSQL `jsonb_build_object(... )::text` encoded UTF-8, never ambiguous string concatenation:

`sha256(canonical_json({workflow_id,publication_revision,account_scope_hash,provider_tool,action_name,payload_sha256}))`.

That workflow-scoped key prevents duplicate retries. A second global unique constraint on `(account_scope_hash,provider_tool,action_name,payload_sha256)` prevents the same exact publication payload from being executed under a different workflow. An intentional later repost requires a materially different canonical payload and a new independently evaluated publication revision; a caller-supplied nonce is not sufficient.

States:

`INTENT -> CLAIMED -> DISPATCHING -> SUBMITTED -> VERIFIED`;
`CLAIMED -> CONFIRMED_NOT_PERFORMED -> CLAIMED` for safe retry before any dispatch boundary;
`DISPATCHING -> UNKNOWN` on process/network ambiguity, including crash after the durable boundary and before a conclusive response;
`SUBMITTED -> UNKNOWN` when provider readback cannot prove the object;
retryable/terminal failure states as defined in the fixture.

The graph atomically consumes the exact grant and claims the provider operation before any network call. The adapter then calls `mark_provider_dispatching(operation_id,expected_version,lease_token)` and commits its immutable timestamped event immediately before provider request bytes may be written. A stale `CLAIMED` lease may retry only because no dispatch event exists; a stale `DISPATCHING` lease becomes `UNKNOWN` and may not resubmit. The mutating adapter receives only the claimed operation record and payload artifact; it cannot invent authority.

Crash after network submission but before external ID persistence becomes `UNKNOWN`. Automatic resubmission is forbidden until independent readback proves `CONFIRMED_NOT_PERFORMED` for the exact account/action/payload/time window and stores a content-hashed absence receipt. A provider's claimed native idempotency support is not enough to skip that proof.

If readback finds one matching object, record its external ID/URL and verify it. If it finds multiple or cannot distinguish absence from uncertainty, remain `UNKNOWN` and fail closed. Never convert unknown to success or retry blindly.

Execution and readback use separate graph nodes, separate typed evidence rows, separate receipts, and preferably separate provider read methods. `record_provider_readback_evidence(...)` binds evidence type, operation, account scope, tool, action, payload hash, dispatch-time window, external ID/URL/visibility or exact non-performance, artifact hash, and an independent verifier. `record_provider_result(...)` resolves these projections and rejects raw caller values that do not match them. `PROVIDER_VERIFIED` requires account, action, payload hash, external ID, and public/private visibility to match the claimed operation; `CONFIRMED_NOT_PERFORMED` requires typed ABSENCE evidence over the dispatch window.

Initial mutating adapters are X, LinkedIn owned page, and private YouTube package/upload path. The single live canary is X only. Email, Whop, Reddit/community replies, DMs, outreach, payment, and customer actions remain non-mutating in this implementation.

## 7. Outcome, learning, experiment, promotion, and rollback contract

### 7.1 Required provenance

Every generation freezes and persists:

- workflow/run/delegation/agent/channel/task IDs;
- complete resolved prompt name/version/body artifact and SHA-256;
- prompt secret-scan receipt proving no secret is present;
- model/provider and all generation parameters;
- tools/skills/policy/registry versions;
- evidence artifact IDs/hashes;
- timing, tokens, cost, output artifact/hash;
- experiment, cohort, and variant IDs.

A prompt containing a detected secret is rejected before model invocation and is not persisted as a generation. Provider credentials exist only in the process environment, never prompt/evidence.

### 7.2 Outcomes and four durable learning artifacts

Each accepted measurement must link workflow, run, generation, provider operation when applicable, provider object/publication, channel, cohort, variant, time window, metric numerator/denominator/value, and raw readback artifact.

The same transaction validates against `canonical-learning-artifacts-v2.schema.json`, verifies every artifact payload hash, and writes exactly one typed relational row plus JSON payload for each:

- `learning_event.v1`
- `agent_performance_ledger.v1`
- `learning_delta.v1`
- `experiment_result.v1`

Each schema requires workflow, measurement, generation, publication (nullable only for non-mutating classes), agent, channel, prompt name/version/hash, model/provider/parameters, evaluator score, experiment/cohort/variant (explicit nullable values when not enrolled), source artifact/hash, and timestamp. `learning_delta.v1` additionally binds prior/candidate variant and content-hashed changes; `experiment_result.v1` binds control/treatment samples, metric, effect, bootstrap CI/resamples/seed, safety count, and decision. UUID columns are real foreign keys to workflow, measurement, generation, experiment, cohort/assignment, variant, and content-addressed artifact metadata; JSON strings cannot substitute for relational provenance.

`LEARNING_RECORDED` requires all four distinct schema rows, exact schema validation, and DB hash-chain insertion. Langfuse trace/score writes are additional observability, not the authoritative ledger. Langfuse failure schedules retry and cannot erase DB evidence.

### 7.3 Assignment and numeric promotion rules

`import_runtime_experiment_bundle(bundle,review_receipt_artifact_id)` is the only experiment/variant/cohort/registry bootstrap path. The NOLOGIN policy writer calls it only after a reviewed JSON Schema validation receipt exists with distinct producer/verifier identities. The function validates the exact bundle schema, derives definition/content hashes, inserts both immutable variants and 80/20 cohorts atomically, initialises the versioned registry, and is idempotent only for the same content-addressed definition. Runtime has no direct DML on those tables.

Each experiment is one exact `(agent_id, channel, task_type, policy_version, primary_metric)` stratum. `assign_runtime_variant(workflow_id)` binds the workflow's stored head agent/channel/task/policy before generation. While an experiment is open, assignment is deterministic from PostgreSQL canonical JSON `sha256(jsonb_build_object('experiment_id', experiment_id, 'workflow_id', workflow_id)::text)`, using the first 63 non-sign bits modulo 100; raw concatenation is forbidden:

- buckets 0-79: champion/control;
- buckets 80-99: challenger/treatment.

Assignment is persisted before generation and never changed for that workflow.

After promotion closes the experiment, the same function records the active registry variant while retaining the promoted experiment/TREATMENT cohort and promotion-event identity as an explicit monitoring assignment. Post-promotion outcome measurements therefore remain linked to the experiment and feed rollback from sample one. Rollback changes the registry by CAS; the following resolution proves it uses the restored champion and the candidate cooldown prevents reassignment.

A candidate can be promoted only when all are true. `eligibility_contract` is constrained to the supported typed predicate (`terminal COMPLETE`, accepted quality, required outcome) and `compute_runtime_experiment_statistics` explicitly joins and filters by that contract; excluded/failed/missing-quality/missing-outcome workflows cannot enter sample counts:

- >= 30 eligible control outcomes and >= 30 eligible treatment outcomes;
- >= 14 calendar days observed;
- no workflow appears in both cohorts;
- primary live metric has non-zero denominator and exact provider attribution;
- treatment weighted quality delta >= +0.03;
- treatment live outcome relative delta >= +10%;
- deterministic 10,000-resample bootstrap within the experiment's single stratum, seeded from the stored experiment seed, has 95% CI lower bound for live delta >= 0;
- provider verification rate = 100% for eligible mutating samples;
- zero safety, policy, canonical-receipt, public-deletion, or restricted-lane violations;
- immutable rollback target is the current champion.

An independent evaluator generation creates the recommendation; a separately launched zero-tool `callscore-trust-head` generation validates cohort integrity. The two generation IDs, agent IDs, and machine-written Hermes session IDs must all differ from each other and from every candidate-producer generation. `promote_runtime_variant(experiment_id,expected_registry_version,evaluator_generation_id,trust_generation_id)` resolves the candidate from the exact TREATMENT cohort, ignores supplied scores, recomputes cohort membership/thresholds from typed outcome/evaluation ledgers through `compute_runtime_experiment_statistics`, verifies both ACCEPT reviews target that candidate, closes the experiment, and performs registry CAS. Producer/head/runtime worker cannot self-promote.

Post-promotion rollback runs on every completed outcome and at least daily. Rollback is legal from the first post-promotion observation and remains legal later: unlike promotion, it has no minimum control/treatment sample or observation-day constraint. The first 20 eligible treatment outcomes and first seven days are the mandatory high-frequency observation window, not an expiry. It restores the prior champion automatically whenever any is true:

- any safety/policy/canonical-receipt violation;
- provider verification rate < 100%;
- weighted quality delta <= -0.05;
- live outcome relative delta <= -10%;
- lower confidence bound becomes < -0.05.

`rollback_runtime_variant(experiment_id,expected_registry_version,trigger_measurement_id)` independently recomputes the trigger and, in one CAS transaction, restores the immutable prior champion, appends a `ROLLBACK` event, and appends a minimum 14-day candidate cooldown. The SQL decision constraint applies 30/30/14 and lift thresholds only to `PROMOTE`; `ROLLBACK` instead requires a `rollback_*` controlled reason and may have treatment sample size one. The next task must resolve the restored variant and the failed candidate cannot be reassigned during cooldown.

## 8. TDD implementation phases

### Phase A0 - deterministic baseline repair prerequisite

Before phases A-J and before any migration, runtime, provider, service, cron, or production mutation, create the clean Workplane worktree, reproduce `tests/gtm-execution-fixes.test.ts` Phase 3.2 with a deterministic zero-result LinkedIn fixture, add the failing Workplane runtime-script test, repair the tracked Workplane source so every zero-result lane emits its capability receipt, deploy nothing, then run the focused app test and the full 1474-test app baseline. Phase A0 receives its own RED/GREEN/REFACTOR receipts, parent verification, three independent PASS reviews, Workplane commit/push/local-remote equality, and clean-worktree evidence. Any red result blocks Phase A; the defect may not be carried as a known baseline into later acceptance.

### Phase A - schema, roles, controlled contracts

Files:

- create `migrations/025-callscore-autonomous-supervisor.sql` from the reviewed v4 SQL fixture, preserving UUID compatibility, DB-owned hashes, role/function ACLs, composite grant FKs, child uniqueness, experiment/cohort FKs, and final-report PASS checks;
- create `src/lib/autonomy/supervisor/contracts.ts`, `repository.ts`, `transition-map.ts`, `completion-predicates.ts`;
- modify control-plane and `channel-agent-tasks` compatibility code;
- tests: contracts, migration, role/ACL, hash-chain, conservative backfill, legacy-writer denial.

RED first: bigint compatibility FK, invalid state/class transition, direct `COMPLETE`, forged grant/direct ledger DML, append-only update/delete/fork, parent cascade, duplicate transition/version/global payload, inconsistent lease, two null child sessions rejected, report-only completion, unsafe legacy mapping, migration replay/rollback.

Gate: disposable PostgreSQL role tests and app compatibility tests pass.

### Phase B - PostgreSQL checkpointer and graph-owned intake/lease/recovery

Files:

- add exact dependency `@langchain/langgraph-checkpoint-postgres@1.0.4`; the committed metadata receipt proves semver compatibility, and acceptance additionally requires lockfile diff inspection, TypeScript import compilation, `PostgresSaver.setup()`, and disposable PostgreSQL resume execution;
- create checkpointer/setup, state graph, locator, claim/heartbeat/retry nodes, kill-point harness;
- replace pre-graph claim in `src/scripts/hermes-worker.ts` and `callscore-operating-graph.ts`;
- tests: first-thread bootstrap, kill windows, lease expiry, stale owner, checkpoint upgrade, terminal replay.

RED first: two workers claim one row, crash after claim loses thread, expired lease double-executes, completed node re-runs, runtime role performs DDL.

Gate: one stable thread ID resumes at each kill point with no duplicate transition or action intent.

### Phase C - real Hermes children and durable join

Files and contract are in section 4.

RED first: child self-reported session accepted; zero exit with failed usage accepted; forbidden toolset/env accepted; crash-after-spawn duplicates; supervisor restart changes child dispatch key; PID reuse killed; process-group grandchild survives timeout; ambiguous execution-ID match respawns; missing required child allows synthesis; artifact hash mismatch accepted.

Real integration gate: X head launches one `search` research child and one zero-tool copy/critic child, records distinct machine usage-file sessions, survives parent restart, joins both, and rejects an intentionally invalid third child.

### Phase D - X synthesis, independent evaluation, bounded revision

Create X adapter, synthesis/evaluation/revision nodes, deterministic and semantic evaluators, Langfuse appenders, and tests.

RED first: producer evaluates itself, threshold edge passes incorrectly, revision source hash is lost, fourth revision exists, similarity gate bypasses, Langfuse receipt substitutes for DB evaluation.

Gate: forced semantic failure revises once, re-evaluates independently, and reaches READY only after exact thresholds.

### Phase E - exact authority, provider execution, and readback

Implement section 6, remove all caller approval flags/worker-minted receipts, and make the source-inventory test exactly reproduce `provider-mutation-surface-inventory-v4.json`.

RED first: forged approved boolean, forged receipt ID, wrong account/action/payload/revision grant, reused grant, cross-workflow duplicate payload, ambiguous key encoding, duplicate process claim, crash-after-DISPATCHING resubmission, stale CLAIMED unsafe takeover, unknown outcome success, URL without readback, adapter direct invocation, unclassified provider surface.

Gate: fake provider crash matrix proves exactly one logical operation and fail-closed unknown handling; no live call.

### Phase F - outcomes and four learning artifacts

Implement X/LinkedIn/YouTube/PostHog/Whop read-only collectors, measurement node, learning transaction validated against `canonical-learning-artifacts-v2.schema.json`, Langfuse score linkage, and delayed remeasurement.

RED first: missing attribution, zero denominator, malformed PostHog payload, quota failure overwrites prior measure, partial learning set advances state, delayed outcome resubmits provider.

Gate: one fixture publication produces one measurement and all four canonical learning artifacts atomically; due retry resumes measurement only.

### Phase G - runtime registry, experiments, promotion, activation, rollback

Implement deterministic assignment, prompt/model registry resolution, independent recommendation/trust validation, DB threshold recomputation, promotion CAS, post-promotion watcher, and rollback.

RED first: cohort contamination, orphan experiment/cohort/variant UUID, underpowered promotion, evaluator and trust same generation/session/agent, threshold boundary, safety violation, stale registry version, promoted variant not used next task, first post-promotion sample cannot rollback, rollback not used next task, cooldown candidate reassigned.

Gate: deterministic cohort fixtures promote one challenger; the next task resolves it; injected regression automatically restores the prior champion; the following task resolves the restored champion.

### Phase H - broader canonical adapters

Generalise the same graph/contracts without new agents:

- CMO: research/critic children -> consumed thesis brief;
- LinkedIn: long-form adapter and owned-page provider/readback contract;
- YouTube: topic/research/script/scene/packaging/thumbnail/production/QA/private upload/analytics, with every YouTube and canonical media receipt; call 24458 hard-rejected;
- Data: bounded idempotent remediation-job intents only;
- Sentinel: observation -> owning-head remediation workflow -> verified resolution;
- Reddit/community, email, Whop, opportunity research, compliance: read-only or draft-only in this project.

Reconcile `callscore-x-linkedin-growth-head` by remapping its responsibilities to existing X/LinkedIn heads unless the canonical source already assigns a unique executable role. Mapping changes require canonical audit pass and no agent-count change.

RED first: each adapter task-class path, restricted live request, missing child, missing media receipt, stale receipt, forbidden 24458, false specialist success, false provider completion.

### Phase I - Workplane/runtime consolidation and controlled cutover

Workplane changes occur only in its clean worktree and receive their own commit/review/push evidence. Runtime scripts are changed first in tracked Workplane sources, then copied by a manifest-driven deployment script. `/srv/agents/hermes/scripts` is never the untracked source of truth.

The deployed `/srv/agents/hermes/scripts/callscore-channel-orchestrator.sh` currently has no tracked Workplane source. Phase I first imports that exact baseline (`sha256:5436ef7dd6936322e23803cea9d326383acb152a8106d8bc85de19e83156b9f0`) into the clean Workplane worktree, then applies the enqueue-only change as a reviewable diff. It does not edit the deployed copy first.

Tracked deployment assets:

- `ops/systemd/callscore-autonomy-supervisor.service`;
- `scripts/deploy-callscore-autonomy-runtime.sh`;
- `scripts/rollback-callscore-autonomy-runtime.sh`;
- Workplane runtime-script manifest and SHA-256 validator;
- runtime attestation and single-authority tests.

The app `docker-compose.yml` moves `channel-agent-worker` behind profile `legacy-channel-agent-disabled` and its command exits unless `CALLSCORE_ALLOW_LEGACY_CHANNEL_WORKER=1`; default `docker compose up` can never restart a second claimant. The new unit and deploy script assert the service is absent from the default Compose config. After migration 025 is applied, automated rollback never starts the legacy worker; it fences and forward-recovers because legacy code is not an authority-compatible consumer.

Workplane creates `infra/hermes-runtime-scripts/tests/test_autonomy_enqueue_only.py`, `infra/hermes-runtime-scripts/build-runtime-script-manifest.py`, and `infra/hermes-runtime-scripts/verify-runtime-script-manifest.py`. Exact Workplane gates from its clean worktree are:

```bash
python3 -m unittest discover -s infra/hermes-runtime-scripts/tests -p 'test_autonomy_*.py'
python3 -m py_compile infra/hermes-runtime-scripts/callscore-engagement-discovery-impl.py
bash -n infra/hermes-runtime-scripts/callscore-engagement-discovery.sh
bash -n infra/hermes-runtime-scripts/callscore-channel-orchestrator.sh
python3 infra/hermes-runtime-scripts/callscore-cmo-regression-test.py
python3 infra/hermes-runtime-scripts/build-runtime-script-manifest.py --source-root infra/hermes-runtime-scripts --out .tmp/autonomy-runtime-script-manifest.json
python3 infra/hermes-runtime-scripts/verify-runtime-script-manifest.py --manifest .tmp/autonomy-runtime-script-manifest.json --source-root infra/hermes-runtime-scripts --mode source
```

The unittest parses every converted cron target and asserts it can only invoke the app enqueue/wake CLI, cannot source provider credentials, cannot invoke Composio/social/email/Whop clients, cannot write legacy task completion, and emits deterministic zero-result LinkedIn/Reddit/YouTube capability receipts.

Exact current authorities to quiesce before new claims:

- cron `8bd323116227` bounded tmux scheduler;
- cron `9c03a6eea969` direct CMO loop;
- cron `144c3a9cc860` cooldown catch-up direct trigger;
- cron `be1a78217918` engagement executor;
- cron `4427e147e29c` email monitor/reply executor;
- cron `f39440513eb5` video scheduler while it still does more than enqueue;
- cron `f2cfc2dd7a7c` engagement discovery during cutover;
- Docker project `whop-auto`, service `channel-agent-worker`, image digest `sha256:82800844c0e37e0fe97ea52a9941a853a344623a9bde82b60a3987c8d209dade`.

After deployment, approved cron jobs may be resumed only with reviewed enqueue/wake-only scripts. Data-pipeline cron jobs and Docker `hermes-worker --no-channel-tasks` remain independent because they do not claim autonomy workflows.

The tracked deploy controller executes the following literal identities; the approved manifest supplies only immutable SHAs/digests and receipt directory, never arbitrary commands:

```bash
hermes -p callscore cron pause 8bd323116227
hermes -p callscore cron pause 9c03a6eea969
hermes -p callscore cron pause 144c3a9cc860
hermes -p callscore cron pause be1a78217918
hermes -p callscore cron pause 4427e147e29c
hermes -p callscore cron pause f39440513eb5
hermes -p callscore cron pause f2cfc2dd7a7c

set -a
. /opt/crypto-tuber-ranked/.env.hermes >/dev/null 2>&1
set +a
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from channel_tasks where status='running';"

docker compose -p whop-auto -f /opt/crypto-tuber-ranked/docker-compose.yml stop -t 900 channel-agent-worker
docker compose -p whop-auto -f /opt/crypto-tuber-ranked/docker-compose.yml rm -f channel-agent-worker
test -z "$(docker ps -q --filter label=com.docker.compose.project=whop-auto --filter label=com.docker.compose.service=channel-agent-worker)"

sudo -u omar XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user is-enabled hermes-callscore-gateway.service
sudo -u omar XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user is-enabled hermes-gateway.service hermes-gateway-callscore.service
systemctl is-enabled hermes-gateway.service
```

The pre-migration drain command references only migration-024 relations and must return `0` before proceeding; it is executed before migration 025 and therefore must never query `provider_operations`. Immediately after migration 025, before service install or un-fencing, a separate migration receipt query requires `select count(*) from provider_operations where provider_state in ('CLAIMED','DISPATCHING','SUBMITTED','UNKNOWN')` to return `0`. `hermes-callscore-gateway.service` must be enabled; both legacy user gateway units must report `masked`; the system gateway must report `disabled`. Any other output aborts and preserves the fence. The tracked script captures each command, exit status, and sanitised output in `single-authority-inventory.json`.

### Phase J - deterministic evidence harness, product regressions, and canary

Create:

- `src/scripts/verify-callscore-autonomy-activation.ts`;
- `src/scripts/verify-callscore-autonomy-report.ts`;
- `src/lib/autonomy/supervisor/evidence/report.ts`;
- committed schemas and fixtures for every proof;
- JSON and Markdown report producers plus SHA-256 sidecars.

The JSON must validate against `callscore-autonomy-implementation-report-v3.schema.json`. `phase_gates` is an exact object keyed A0-J, so omitted/duplicate phases are impossible; each phase carries typed RED/GREEN/REFACTOR receipts and exactly one contract, implementation, and security review. Every receipt reference contains its expected schema, and the verifier reads the JSON payload rather than trusting path/hash metadata alone. Phase and review payloads must bind the same externally supplied full tuple `{app_commit_sha,workplane_commit_sha,plan_commit_sha,graph_source_sha256,migration_sha256,runtime_script_manifest_sha256,image_digest,prompt_manifest_sha256}`. Activation receipts bind report ID and tuple. Canary execution, independent readback, and tested provider-object rollback/deletion receipts must bind the same workflow, provider operation, account, action, payload, external object, and URL; the runtime-variant rollback receipt remains a separate Phase G proof. Final `PASS` is impossible with `BLOCKED_BY_GRAPH`, null provider IDs, arbitrary generic JSON, any non-PASS phase/review, self-verification, or an untested public-object rollback. Final-report DB insertion requires schema PASS, independent verifier PASS, both hashes, and the SQL PASS constraints.

## 9. Cutover, rollback, and live-canary procedure

No live command in this section runs until implementation commits, three phase reviews, full preflight, and explicit activation approval are present.

### 9.1 Preflight and quiesce

1. Capture before-inventory: Git SHAs/status, Workplane SHA/status, service unit files/states/PIDs, cron IDs/states, Docker projects/images/digests, active tmux child sessions, graph/checkpoint/migration versions, outstanding provider operations.
2. Build and test the app and Workplane immutable commits before touching runtime.
3. Enable DB `autonomy_activation_fence`; enqueue remains durable but locator returns no new work.
4. Pause the exact cron IDs listed in Phase I. Do not delete them.
5. Wait for active old channel tasks/provider operations to reach a terminal or reconciled state. Timeout aborts cutover; do not force-complete.
6. Stop `whop-auto-channel-agent-worker-1`; verify no process can claim or complete legacy channel tasks.
7. Verify system `hermes-gateway.service` is disabled and user legacy gateway units are masked. Stop any unmanaged replacement only after PID/executable/profile identity is captured.

### 9.2 Deploy and activate

1. Verify local app/workplane commits equal their remote branch SHAs and match the approved tuple.
2. Back up only deployed unit/script manifests and prior image digest; do not copy secrets.
3. Run additive migration 025 under migration role; write migration receipt.
4. Provision the separately approved `CALLSCORE_AUTONOMY_DATABASE_URL` secret for the least-privilege runtime role; do not print it. Run checkpoint setup under migration role; runtime role DDL and direct-ledger-DML probes must fail.
5. Deploy tracked Workplane/script bundle and verify every destination hash against manifest.
6. Install/reload `callscore-autonomy-supervisor.service` but keep activation fence enabled.
7. Start/restart canonical `hermes-callscore-gateway.service`; verify exact profile, HERMES_HOME, PID, health, and no unmanaged duplicate.
8. Start the supervisor; require readiness: approved tuple, DB role, migration, checkpoint schema, graph hash, prompt registry, zero legacy claimers, provider fence.
9. Run non-provider kill/recovery, real-child, fake-provider, promotion/rollback, and single-authority canaries.
10. Convert/resume approved cron jobs as enqueue/wake only, un-fence intake, and observe three clean workflow cycles before any public canary.

Literal install/start commands after the approved tuple, migration, secret, source/destination manifest, and zero-claimer checks pass:

```bash
sudo install -d -o omar -g omar -m 0755 /home/omar/.config/systemd/user
sudo install -o omar -g omar -m 0644 /opt/crypto-tuber-ranked/ops/systemd/callscore-autonomy-supervisor.service \
  /home/omar/.config/systemd/user/callscore-autonomy-supervisor.service
sudo -u omar XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user daemon-reload
sudo -u omar XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user enable --now callscore-autonomy-supervisor.service
sudo -u omar XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user restart hermes-callscore-gateway.service
```

`verify-callscore-autonomy-activation.ts` then requires the unit's `ExecStart`, `WorkingDirectory`, environment-file path, main PID/cgroup, app SHA, graph hash, migration/checkpoint version, and DB role to equal the approved manifest before `set_activation_fence(false,expected_version,...)` may execute.

### 9.3 Automatic cutover rollback

Before un-fencing, any failed readiness/proof automatically:

1. leaves or re-enables activation fence;
2. stops the new supervisor;
3. restores previous unit/script manifest and previous image digest;
4. before migration 025 only, may restore the captured old Compose service; after migration 025, never restarts the legacy channel worker and leaves queued work fenced for fixed-forward recovery;
5. resumes the previously paused cron states exactly as captured;
6. restores the canonical gateway only, never an unmanaged duplicate;
7. writes a rollback receipt and leaves migration 025 in place.

Migration 025 is additive and has no destructive down migration. Before any new-format workflow, rollback may use old code. After any new-format write, rollback is forward recovery only: deploy the previous compatible image or fixed-forward image that understands migration 025. The old application compatibility test is therefore mandatory before cutover.

After un-fencing, any single-authority, hash-attestation, duplicate-provider, or ledger-integrity failure automatically re-fences intake and executes the same rollback controller. Existing in-flight provider operations are reconciled; never blindly replayed.

### 9.4 Owned-public canary

Only one zero-cost owned X post is eligible. It must be a normal `OWNED_PUBLIC_MUTATION` workflow and possess, at minimum:

- `editorial_angle_receipt.v1`
- `platform_fit_receipt.v1`
- `visual_brief_receipt.v1`
- `visual_qa_receipt.v1`
- `copy_visual_coherence_receipt.v1`
- `same_shit_memory_receipt.v1`
- `callscore.task_router_receipt.v1`
- `callscore.tool_inheritance_receipt.v1`

If visual/media is included, it also requires design bundle reference, website alignment v2, branding v2, lockup occlusion, and media artifact v2. The graph must independently mint the exact action grant, create the provider operation, execute, read back, record external ID/URL/hash, and preserve a deletion/rollback contract.

If any gate, cooldown, provider, authority, receipt, originality, readback, or rollback check fails, the canary proof is `BLOCKED_BY_GRAPH`; the report must be `BLOCKED`, not `PASS`, and the project remains incomplete. Parent shell/provider publication is forbidden. Completion requires one real graph-owned canary with provider operation `VERIFIED`, exact external ID/URL, independent readback artifact, task-router/tool-inheritance receipts, a `callscore.provider_object_rollback_receipt.v1` proving graph-owned deletion or reversion of that exact external object, and a separate `callscore.runtime_variant_rollback_receipt.v1` proving Phase G registry rollback. One cannot substitute for the other.

## 10. Deterministic verification commands and expected artifacts

Focused autonomy suite:

```bash
node --import tsx --test \
  tests/autonomous-supervisor-contracts.test.ts \
  tests/autonomous-supervisor-migration.test.ts \
  tests/autonomous-supervisor-db-roles.test.ts \
  tests/autonomous-supervisor-checkpoint.test.ts \
  tests/autonomous-supervisor-recovery.test.ts \
  tests/autonomous-supervisor-delegation.test.ts \
  tests/hermes-child-runner.integration.test.ts \
  tests/autonomous-supervisor-quality.test.ts \
  tests/autonomous-supervisor-x.test.ts \
  tests/autonomous-supervisor-authority.test.ts \
  tests/autonomous-supervisor-provider.test.ts \
  tests/autonomous-supervisor-outcomes.test.ts \
  tests/autonomous-supervisor-learning.test.ts \
  tests/autonomous-supervisor-provenance.test.ts \
  tests/autonomous-supervisor-promotion.test.ts \
  tests/autonomous-supervisor-channel-adapters.test.ts \
  tests/autonomous-supervisor-runtime-attestation.test.ts \
  tests/autonomous-supervisor-single-authority.test.ts \
  tests/autonomous-supervisor-evidence-report.test.ts
```

Full app gates:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run hygiene:secrets
npm run audit:pipeline
npm run pipeline:guard
npm run verify:public
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
```

The existing baseline failure in `tests/gtm-execution-fixes.test.ts` must be fixed in the tracked Workplane source by emitting deterministic read-only capability receipts for LinkedIn, Reddit, and YouTube even when no opportunity is found; the deployed copy is updated only through the reviewed manifest. Full `npm test` must be green before implementation acceptance.

Product-specific non-mutating gates:

```bash
node --import tsx --test \
  tests/channel-head-scoring.test.ts \
  tests/api-routes.test.ts \
  tests/leaderboard-sentinel-v2-data.test.ts \
  tests/page-home-shape.test.ts \
  tests/page-creator-shape.test.ts \
  tests/site-url.test.ts
```

No production `npm run score`, pipeline rewrite, DB backfill, deploy, or provider mutation is part of regression verification.

Final evidence verification uses both the production TypeScript verifier and the committed independent Python oracle against the same report and immutable tuple:

```bash
node --import tsx src/scripts/verify-callscore-autonomy-report.ts \
  --report .tmp/autonomy-implementation/$RUN_ID/callscore-autonomy-implementation-report.json \
  --schema docs/plans/fixtures/callscore-autonomy-implementation-report-v3.schema.json \
  --deployment-manifest .tmp/autonomy-implementation/$RUN_ID/deployment-manifest.json \
  --expected-app-sha "$APP_SHA" --expected-workplane-sha "$WORKPLANE_SHA" \
  --expected-plan-sha "$PLAN_COMMIT_SHA" --expected-plan-content-sha256 "$PLAN_CONTENT_SHA256" \
  --expected-manifest-sha256 "$PLAN_MANIFEST_SHA256" \
  --expected-graph-source-sha256 "$GRAPH_SOURCE_SHA256" --expected-migration-sha256 "$MIGRATION_SHA256" \
  --expected-runtime-script-manifest-sha256 "$RUNTIME_SCRIPT_MANIFEST_SHA256" --expected-image-digest "$IMAGE_DIGEST" \
  --expected-prompt-manifest-sha256 "$PROMPT_MANIFEST_SHA256" \
  --require-live-canary --out .tmp/autonomy-implementation/$RUN_ID/report-verifier-ts.json
python3 docs/plans/fixtures/verify-autonomy-final-report-contract-v4.py \
  --report .tmp/autonomy-implementation/$RUN_ID/callscore-autonomy-implementation-report.json \
  --schema docs/plans/fixtures/callscore-autonomy-implementation-report-v3.schema.json \
  --deployment-manifest .tmp/autonomy-implementation/$RUN_ID/deployment-manifest.json \
  --expected-app-sha "$APP_SHA" --expected-workplane-sha "$WORKPLANE_SHA" \
  --expected-plan-sha "$PLAN_COMMIT_SHA" --expected-plan-content-sha256 "$PLAN_CONTENT_SHA256" \
  --expected-manifest-sha256 "$PLAN_MANIFEST_SHA256" \
  --expected-graph-source-sha256 "$GRAPH_SOURCE_SHA256" --expected-migration-sha256 "$MIGRATION_SHA256" \
  --expected-runtime-script-manifest-sha256 "$RUNTIME_SCRIPT_MANIFEST_SHA256" --expected-image-digest "$IMAGE_DIGEST" \
  --expected-prompt-manifest-sha256 "$PROMPT_MANIFEST_SHA256" \
  --out .tmp/autonomy-implementation/$RUN_ID/report-verifier-python.json
```

Both commands must exit zero and emit status `PASS`; their verifier-script hashes, report hash, and schema hash must be stored. Tests mutate one predicate at a time (duplicate reviewer, self-verifier, omitted phase, bad artifact hash, wrong commit, blocked canary, null provider/readback/rollback, non-empty blocker) and require both verifiers to reject.

Required proof artifacts under `.tmp/autonomy-implementation/<run-id>/`:

- `migration-receipt.json`
- `db-role-probe.json`
- `checkpoint-kill-matrix.json`
- `child-dispatch-join-proof.json`
- `quality-revision-proof.json`
- `provider-crash-matrix.json`
- `outcome-learning-proof.json`
- `promotion-activation-rollback-proof.json`
- `single-authority-inventory.json`
- `runtime-attestation.json`
- `product-gates.json`
- `owned-public-canary.json`
- `deployment-manifest.json`
- `callscore-autonomy-implementation-report.json`
- `callscore-autonomy-implementation-report.md`
- SHA-256 sidecars and independent verifier receipt.

The verified final copies are written to `/srv/agents/hermes/runtime/reviews/` only after report-schema validation, secret scan, independent verifier PASS, and DB final-report insertion.

## 11. Review, Kanban, and checkpoint policy

1. Generate the v4 non-circular artifact manifest from the final plan and proof fixtures, validate every bound path/size/SHA-256, then commit the complete immutable package.
2. Push and verify local commit equals `origin/feat/callscore-autonomous-langgraph-completion-20260802`.
3. Send exact commit and manifest to three new independent reviewers: contract/spec, implementation/operability, security/trust.
4. Any file edit invalidates all verdicts. New review batch, new commit, and new manifest are mandatory.
5. Implementation begins only after three actual `VERDICT: PASS` reports are read in full. Timeout, missing summary, process exit zero, or batch completion is not PASS.
6. Create phase Kanban from a non-delegated parent context. If the current Hermes context is forbidden from task mutation, do not bypass the guard; use the session todo as the fail-closed phase ledger and require the same worker/parent/reviewer artifacts.
7. Each phase card has separate worker, parent verification, contract review, implementation review, and security review gates. Missing/failed child or review blocks the phase.
8. Parent reads every diff and artifact, reruns tests, commits accepted work, pushes, and verifies remote SHA.
9. Live migration/service/cron/provider action remains separately approval-gated even after code completion.

## 12. Completion definition

Complete only when all are true:

- one PostgreSQL-checkpointed graph service owns workflow claim through terminal state;
- read-only pre-graph location cannot mutate or complete work;
- exact kill-window tests prove restart recovery without duplicate transitions, children, or provider operations;
- real Hermes child handles and machine session IDs are persisted and restart-safe;
- independent evaluation drives bounded revision;
- caller approval strings are rejected and exact DB authority grants are non-self-attested;
- provider execution and readback are separate, idempotent, and unknown-safe;
- every outcome joins workflow/publication/generation/variant/cohort provenance;
- all four canonical learning artifacts are durable;
- numeric promotion changes the next task and automatic rollback restores the following task;
- broader canonical adapters use explicit mutating, internal, observation, or restricted-draft paths;
- one canonical gateway, one autonomy supervisor, and no legacy claimant remain;
- app/Workplane/script/image/graph/migration/prompt tuple is attested;
- pipeline, scoring, public API, website, lint, typecheck, full tests, build, secret scan, and canonical audit pass;
- one owned-public canary is provider-verified through the graph with independent readback and rollback receipt; `BLOCKED_BY_GRAPH` keeps the final status `BLOCKED` and cannot satisfy completion;
- the schema-valid final report and independent verifier receipt exist, hashes match, remote/deployed SHAs read back, and both implementation worktrees are clean.
