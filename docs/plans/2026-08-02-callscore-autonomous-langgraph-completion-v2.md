# CallScore Autonomous LangGraph Completion Plan v2

> Supersedes the failed plan at commit `10129ae81e3f1eac385292ced0cedc5c8390129d`. That plan received contract/spec FAIL, security/trust FAIL, and an implementation review timeout. This v2 plan is a new immutable review target; no production implementation begins until three new independent reviewers return PASS against the exact v2 commit and artifact manifest.

## 0. Goal, scope, and immutable target

Build one persistent CallScore autonomy supervisor that owns task claim through terminal state, uses PostgreSQL LangGraph checkpoints, launches real Hermes specialist processes with durable handles, joins and independently evaluates their artifacts, executes provider mutations only through graph-owned exact grants, verifies provider readback, measures outcomes, records all four canonical learning artifacts, activates statistically justified variants, and automatically rolls them back on regression.

In scope:

- App repo base: `22993a5537c9b677e25f6454f9f72c52179fc493`.
- App branch/worktree: `feat/callscore-autonomous-langgraph-completion-20260802` at `/home/omar/callscore-worktrees/autonomous-langgraph-completion-20260802`.
- Workplane repo base and `origin/master`: `99d1b9ce008557b82163ff4c799ff8087ccb97a9`.
- Workplane implementation must use a new clean worktree at `/home/omar/callscore-worktrees/workplane-autonomous-langgraph-completion-20260802`; the dirty canonical checkout is evidence only and must not be edited or cleaned.
- Canonical deployed roots remain `/opt/crypto-tuber-ranked`, `/srv/agents/repos/callscore-workplane`, and `/srv/agents/hermes/profiles/callscore`.
- App, Workplane, and runtime-script changes are one reviewed deployment tuple: `{app_commit_sha, workplane_commit_sha, runtime_script_manifest_sha256, worker_image_digest, graph_source_sha256, migration_ids, prompt_registry_version}`.
- Every phase is RED -> GREEN -> REFACTOR. A phase is accepted only after parent diff inspection, focused tests, regression tests, three independent PASS receipts, a checkpoint commit, push, and local/remote SHA equality.

Explicitly out of scope:

- Payment, checkout, subscription, entitlement, payout, customer-record, DB data-rewrite, paid-spend, private outreach, newsletter send, email reply send, DM, non-owned publication, and deployment-provider mutation.
- Those lanes are implemented only as `READ_ONLY_OBSERVATION` or `RESTRICTED_DRAFT`; a live request for one reaches controlled `FAILED`, never provider execution.
- No new canonical agent is added. Existing 51-agent ownership is reused.
- No direct parent/provider call is permitted. The single owned-public canary, if eligible, must be a supervisor workflow with an exact provider-operation and readback ledger.

Plan proof fixtures committed with this document:

- `docs/plans/fixtures/025-callscore-autonomous-supervisor-contract.sql`: executable PostgreSQL 18 contract fixture; it ran in one local transaction and returned `autonomy_contract_spike_passed`, then rolled back.
- `docs/plans/fixtures/autonomy-contract-spike-receipt.json`: command/result/rollback receipt for that SQL proof.
- `docs/plans/fixtures/hermes-child-identity-spike-receipt.json`: real Hermes one-shot proof with zero resolved tools, machine-written usage file, and non-empty session ID.
- `docs/plans/fixtures/callscore-autonomy-implementation-report.schema.json`: exact final report contract.
- `docs/plans/fixtures/autonomy-runtime-baseline-inventory.json`: exact Workplane dirty paths, unit/process topology, cron identities, worker image, and baseline script hashes. Its listed dirty paths are explicitly excluded from implementation; the clean Workplane worktree starts from the immutable base commit.
- `docs/plans/fixtures/langgraph-postgres-dependency-compatibility.json`: npm metadata proof that Postgres checkpointer `1.0.4` is semver-compatible with the checked-in LangGraph/core/checkpoint/pg/Node ranges; Phase B still requires a lockfile/import/setup/resume execution spike.

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

`QUEUED`, `HEAD_PLANNING`, `CHILDREN_RUNNING`, `HEAD_SYNTHESIS`, `QUALITY_EVALUATION`, `REVISION`, `READY`, `EXECUTING`, `PROVIDER_VERIFIED`, `OUTCOME_MEASURED`, `LEARNING_RECORDED`, `COMPLETE`, `RETRY`, `FAILED`.

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

`QUALITY_EVALUATION -> READY -> EXECUTING -> PROVIDER_VERIFIED -> OUTCOME_MEASURED -> LEARNING_RECORDED -> COMPLETE`.

Internal artifact or restricted draft:

`QUALITY_EVALUATION -> READY -> OUTCOME_MEASURED -> LEARNING_RECORDED -> COMPLETE`.

`OUTCOME_MEASURED` here is the persisted offline evaluator/acceptance measurement, not fabricated provider evidence. The completion predicate requires an accepted artifact, independent evaluation, four canonical learning artifacts, and zero provider operation.

Read-only observation:

`QUALITY_EVALUATION -> READY -> OUTCOME_MEASURED -> LEARNING_RECORDED -> COMPLETE`.

Its measurement is the source-backed observation with collection method, source ID, timestamp, numerator, denominator, and raw artifact hash.

Restricted live-mutation request:

`READY -> FAILED/restricted_execution_class` before provider intent creation. If the task request is for a draft, it uses `RESTRICTED_DRAFT` and may complete locally; if it asks to send/mutate, it fails closed.

Retry transitions:

- `CHILDREN_RUNNING -> RETRY -> CHILDREN_RUNNING | FAILED`
- `EXECUTING -> RETRY -> EXECUTING | FAILED`
- `PROVIDER_VERIFIED -> RETRY -> PROVIDER_VERIFIED | FAILED`

`RETRY` stores `previous_executable_state`, `retry_at`, controlled reason, attempt, and lease generation. Delayed outcome collection uses `PROVIDER_VERIFIED -> RETRY` with `previous_executable_state=PROVIDER_VERIFIED`; when due, the graph resumes there and attempts read-only outcome ingestion. It does not resubmit the provider operation.

### 2.3 Completion predicates

`COMPLETE` is derived by a security-definer transition function; callers cannot set it directly.

- `OWNED_PUBLIC_MUTATION`: accepted evaluation, canonical authority/grant consumption, provider operation `VERIFIED`, independent readback artifact matching account/action/payload/external ID, required outcome window or durable remeasurement schedule, and all four learning artifacts.
- `INTERNAL_ARTIFACT` / `RESTRICTED_DRAFT`: accepted artifact hash, independent evaluation, offline measurement, all four learning artifacts, and no provider operation.
- `READ_ONLY_OBSERVATION`: source/readback artifact, typed measurement, independent acceptance, all four learning artifacts, and no provider operation.

Exit zero, draft existence, report receipt, `independent_agent_execution=true`, provider attempt, or public URL without readback can never satisfy a completion predicate.

## 3. Persistence, claim, checkpoint, and migration contracts

### 3.1 Authoritative schema

Migration `025-callscore-autonomous-supervisor.sql` must conform to the committed SQL contract fixture. It creates:

- lifecycle, execution-class, join, evaluation, provider, variant, and authority enums;
- `autonomy_workflows` as the authoritative state projection;
- append-only `autonomy_workflow_transitions`;
- exact-action `external_action_grants`;
- `agent_delegations` plus append-only `agent_delegation_events`;
- append-only `generation_provenance`, `quality_evaluations`, `artifact_revisions`;
- `provider_operations` plus append-only `provider_operation_events`;
- append-only `outcome_measurements` and `canonical_learning_artifacts`;
- immutable runtime variants, assignments, promotion events, and final reports.

`channel_tasks` remains a compatibility source/projection only. After migration, no component may treat its legacy `status` as authority. Enqueue creates the compatibility row and `autonomy_workflows` row atomically; transition receipt tests prove all old completion writers are removed.

All ledger foreign keys use `ON DELETE RESTRICT`. Append-only tables reject `UPDATE` and `DELETE` with triggers. Every ledger stream has monotonically unique sequence/version, previous hash, and SHA-256 canonical-record hash. Application acceptance reads ledger rows, not mutable projection claims.

### 3.2 Privilege split

Migration creates or verifies these privilege classes through migration-role execution:

- migration/admin role: DDL and role grants only;
- `callscore_runtime`: a dedicated login role used only by the autonomy supervisor; execute approved security-definer enqueue/claim/heartbeat/transition/provider functions and read projections; no direct INSERT/UPDATE/DELETE on authority or ledger tables;
- `callscore_policy_writer`: import reviewed registry snapshots and operator gate records; cannot execute providers or change workflow state;
- read-only observability role: SELECT only.

Production activation therefore requires one separately approved DB-role/credential step: provision `CALLSCORE_AUTONOMY_DATABASE_URL` for `callscore_runtime` in the protected runtime environment, without printing or committing its value. The existing application/data-pipeline `DATABASE_URL` remains unchanged. If the separate runtime credential is not approved or cannot pass the negative privilege probes, cutover remains fenced and no service is started.

The migration refuses to run when the active connection cannot prove migration-role capability. `PostgresSaver.setup()` runs only in `src/scripts/setup-callscore-supervisor-checkpoints.ts` under migration credentials. Runtime startup has no DDL privilege and fails readiness if checkpoint schema/version is absent.

Disposable PostgreSQL tests create equivalent temporary roles and prove:

- runtime cannot forge a grant or ledger row;
- runtime cannot update/delete ledger evidence;
- parent deletion is blocked;
- migration applied twice is idempotent;
- failed migration rolls back wholly;
- conservative backfill never upgrades report/draft rows to provider-verified or complete;
- old application compatibility remains during the 24-hour rollback window.

### 3.3 Thread bootstrap and crash windows

Enqueue allocates `workflow_id` before any claim. The worker read-only locator returns that ID. Invocation config is fixed before first graph call:

- `thread_id = callscore-task:<workflow_id>`
- `checkpoint_ns = callscore-supervisor/<task_type>`
- `run_id = <attempt UUID>`

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
- `src/scripts/callscore-hermes-child-wrapper.ts`
- `src/lib/autonomy/supervisor/delegation/reconciler.ts`
- typed launch/result/usage schemas.

Before spawn, the graph inserts a unique `DISPATCH_INTENT` keyed by `(workflow_id, run_id, revision_number, delegated_role, ordinal)`. The child wrapper receives a random `delegation_id` and `CALLSCORE_CHILD_EXECUTION_ID`, atomically writes its launch record, then spawns:

`/home/omar/.local/bin/hermes -p callscore --safe-mode --ignore-rules --pass-session-id --usage-file <exclusive-path> -m <model> --provider <provider> -t <approved-toolset> --skills <approved-skills> -z <schema-bound-prompt>`.

Durable handles are authoritative in this order:

1. `delegation_id` and dispatch key before spawn;
2. wrapper PID plus `/proc/<pid>/stat` start ticks, executable, UID, cwd, and exact child-execution ID after spawn;
3. machine-written Hermes `session_id`, model, provider, completion/failure, and API-call count from the exclusive usage file after completion.

Child-echoed IDs are ignored. Exit zero is ignored unless usage file says `completed=true`, `failed=false`, session ID is non-empty, stdout parses against the required schema, artifact hashes match parent reads, and the join accepts it.

The committed child spike proves a real `context_engine` invocation with zero resolved tools and session `20260802_010715_716abd`.

### 4.2 Capability isolation

The wrapper uses `env -i` and passes only `HOME`, `USER`, `PATH`, `HERMES_HOME`, `HERMES_PROFILE`, locale/CA variables, child execution ID, and the selected LLM provider credential. It never passes database, Composio, social, email, Whop, payment, deployment, cloud, or infrastructure credentials.

Approved toolsets:

- synthesis/copy/critic/evaluator children: `context_engine`, which resolves to zero tools;
- public-evidence research children: `search` or `web`, read-only only;
- no child receives `terminal`, `file`, `browser`, `computer_use`, `skills`, `delegation`, `cronjob`, `kanban`, provider-app, or mutation tools.

Skills are injected in the launch prompt; children do not receive `skill_manage`. Media/provider execution remains a graph node behind canonical gates, never an arbitrary child tool.

### 4.3 Recovery, timeout, cancellation, and join

On restart, reconciliation checks the terminal receipt, usage file, exact PID/start-ticks identity, and process environment. It never uses `pkill` or name-only matching.

- If the wrapper is alive, the graph rejoins it.
- If a valid terminal receipt exists, the graph validates and consumes it once.
- If spawn intent exists but no receipt/process exists, wait a five-second spawn grace, mark `ORPHANED`, and create a bounded retry attempt. The unique dispatch key plus attempt event prevents concurrent respawn.
- At deadline, send SIGTERM only to the exact PID/start-ticks match, wait ten seconds, then SIGKILL only if still the same process. Record `TIMED_OUT` or `CANCELLED`.
- Any required child `FAILED`, `TIMED_OUT`, `ORPHANED`, invalid-schema, or hash mismatch blocks synthesis. Missing child success can never be synthesised around.

## 5. Evaluation and revision contract

The head synthesiser and evaluator use different canonical agent IDs and different generation records. The evaluator cannot be the producer, promoter, or authority-grant issuer.

Deterministic gates include schema validity, evidence citation/hash match, prohibited claims, platform constraints, originality/same-shit memory, exact canonical media receipt package, and restricted-lane classification.

Semantic dimensions are factual accuracy, evidence support, originality, platform fit, clarity, CallScore voice, commercial strength, actionability, handoff readiness, hook, argument, native structure, audience relevance, CTA, and similarity to recent publications.

Acceptance thresholds:

- all deterministic gates pass;
- factual accuracy >= 0.95;
- evidence support >= 0.95;
- safety/compliance = 1.00;
- all other required dimensions >= 0.80;
- weighted mean >= 0.86;
- similarity below the channel's committed threshold.

Failure produces controlled reason codes and a new revision artifact. Revision N must hash-link source generation, evaluation, and revised generation. Revision 3 may be accepted or rejected; no revision 4 exists.

## 6. Non-self-attested provider authority and exactly-once execution

### 6.1 Remove caller-controlled approval

Modify all of:

- `src/scripts/callscore-operating-goal.ts`
- `src/lib/workplane/external-mutation-guard.ts`
- `src/lib/workplane/external-mutation-schemas.ts`
- `src/lib/workplane/node-wrappers/graph-owned-provider-adapter.ts`
- applicable social/YouTube provider nodes and tests.

Live execution schemas reject `approved`, `approved_publish`, `approved_by_operator`, `approval_receipt_id`, `live_owned_public`, and worker-minted receipt IDs. CLI may select dry-run/read-only mode only. No boolean or receipt string supplied by a caller confers authority.

For `READY_PUBLIC_OWNED`, a security-definer function receives only `workflow_id` and `operation_id`; it independently reads:

- reviewed registry snapshot and policy commit;
- workflow execution class and current state;
- exact destination/account scope;
- provider tool/action;
- canonical payload hash;
- cooldown and originality evidence;
- mandatory canonical editorial/platform/visual/same-shit receipts;
- for public media, design bundle, website alignment v2, branding v2, lockup occlusion, and media artifact v2 receipts;
- rollback contract and expiry.

If all pass, it inserts one exact, expiring, single-use grant bound to workflow, account, provider tool, action, and payload hash. Runtime cannot insert or edit grants. Operator grants are not used in this project because restricted mutations are out of scope.

### 6.2 Provider operation state machine

`provider_operations` is the mutable CAS projection; `provider_operation_events` is immutable evidence. Unique idempotency key:

`sha256(workflow_id || publication_revision || account_scope_hash || provider_tool || action_name || payload_sha256)`.

States:

`INTENT -> CLAIMED -> SUBMITTED -> VERIFIED`;
`CLAIMED -> CONFIRMED_NOT_PERFORMED -> CLAIMED` for safe retry;
`SUBMITTED -> UNKNOWN` when the network result cannot be proven;
retryable/terminal failure states as defined in the fixture.

The graph atomically consumes the exact grant and claims the provider operation before any network call. The mutating adapter receives only the claimed operation record and payload artifact; it cannot invent authority.

Crash after network submission but before external ID persistence becomes `UNKNOWN`. Automatic resubmission is forbidden unless either:

1. the provider honours the same native idempotency key; or
2. independent readback proves `CONFIRMED_NOT_PERFORMED` for the exact account/action/payload/time window.

If readback finds one matching object, record its external ID/URL and verify it. If it finds multiple or cannot distinguish absence from uncertainty, remain `UNKNOWN` and fail closed. Never convert unknown to success or retry blindly.

Execution and readback use separate graph nodes, separate receipts, and preferably separate provider read methods. `PROVIDER_VERIFIED` requires account, action, payload hash, external ID, and public/private visibility to match the claimed operation.

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

The same transaction writes exactly one validated instance of each:

- `learning_event.v1`
- `agent_performance_ledger.v1`
- `learning_delta.v1`
- `experiment_result.v1`

`LEARNING_RECORDED` requires all four hashes and schema validations. Langfuse trace/score writes are additional observability, not the authoritative ledger. Langfuse failure schedules retry and cannot erase DB evidence.

### 7.3 Assignment and numeric promotion rules

Assignment is deterministic from `sha256(experiment_id || workflow_id) mod 100`:

- buckets 0-79: champion/control;
- buckets 80-99: challenger/treatment.

Assignment is persisted before generation and never changed for that workflow.

A candidate can be promoted only when all are true:

- >= 30 eligible control outcomes and >= 30 eligible treatment outcomes;
- >= 14 calendar days observed;
- no workflow appears in both cohorts;
- primary live metric has non-zero denominator and exact provider attribution;
- treatment weighted quality delta >= +0.03;
- treatment live outcome relative delta >= +10%;
- stratified bootstrap 95% CI lower bound for live delta >= 0;
- provider verification rate = 100% for eligible mutating samples;
- zero safety, policy, canonical-receipt, public-deletion, or restricted-lane violations;
- no required quality dimension regresses by > 0.02;
- immutable rollback target is the current champion.

An independent evaluator creates the recommendation; `callscore-trust-head` validates cohort integrity; a DB promotion function recomputes thresholds and performs CAS against expected registry version. Producer/head/runtime worker cannot self-promote.

Post-promotion rollback runs on every completed outcome and at least daily. It restores the prior champion automatically when any is true in the first 20 eligible treatment outcomes or first seven days:

- any safety/policy/canonical-receipt violation;
- provider verification rate < 100%;
- weighted quality delta <= -0.05;
- live outcome relative delta <= -10%;
- lower confidence bound becomes < -0.05.

Rollback is one CAS transaction plus immutable promotion event. The next task must resolve the restored variant. The failed candidate enters 14-day cooldown and cannot be reassigned.

## 8. TDD implementation phases

### Phase A - schema, roles, controlled contracts

Files:

- create `migrations/025-callscore-autonomous-supervisor.sql` from the reviewed fixture;
- create `src/lib/autonomy/supervisor/contracts.ts`, `repository.ts`, `transition-map.ts`, `completion-predicates.ts`;
- modify control-plane and `channel-agent-tasks` compatibility code;
- tests: contracts, migration, role/ACL, hash-chain, conservative backfill, legacy-writer denial.

RED first: invalid state, invalid class transition, direct `COMPLETE`, forged grant, append-only update/delete, parent cascade, duplicate transition version, duplicate idempotency key, inconsistent lease, report-only completion, migration replay/rollback.

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

RED first: child self-reported session accepted; zero exit with failed usage accepted; forbidden toolset/env accepted; crash-after-spawn duplicates; PID reuse killed; timeout not terminal; missing required child allows synthesis; artifact hash mismatch accepted.

Real integration gate: X head launches one `search` research child and one zero-tool copy/critic child, records distinct machine usage-file sessions, survives parent restart, joins both, and rejects an intentionally invalid third child.

### Phase D - X synthesis, independent evaluation, bounded revision

Create X adapter, synthesis/evaluation/revision nodes, deterministic and semantic evaluators, Langfuse appenders, and tests.

RED first: producer evaluates itself, threshold edge passes incorrectly, revision source hash is lost, fourth revision exists, similarity gate bypasses, Langfuse receipt substitutes for DB evaluation.

Gate: forced semantic failure revises once, re-evaluates independently, and reaches READY only after exact thresholds.

### Phase E - exact authority, provider execution, and readback

Implement section 6 and remove all caller approval flags/worker-minted receipts.

RED first: forged approved boolean, forged receipt ID, wrong account/action/payload grant, reused grant, duplicate process claim, crash-after-submit resubmission, unknown outcome success, URL without readback, adapter direct invocation.

Gate: fake provider crash matrix proves exactly one logical operation and fail-closed unknown handling; no live call.

### Phase F - outcomes and four learning artifacts

Implement X/LinkedIn/YouTube/PostHog/Whop read-only collectors, measurement node, learning transaction, Langfuse score linkage, and delayed remeasurement.

RED first: missing attribution, zero denominator, malformed PostHog payload, quota failure overwrites prior measure, partial learning set advances state, delayed outcome resubmits provider.

Gate: one fixture publication produces one measurement and all four canonical learning artifacts atomically; due retry resumes measurement only.

### Phase G - runtime registry, experiments, promotion, activation, rollback

Implement deterministic assignment, prompt/model registry resolution, independent recommendation/trust validation, DB threshold recomputation, promotion CAS, post-promotion watcher, and rollback.

RED first: cohort contamination, underpowered promotion, non-independent evaluator, threshold boundary, safety violation, stale registry version, promoted variant not used next task, rollback not used next task.

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

### Phase J - deterministic evidence harness, product regressions, and canary

Create:

- `src/scripts/verify-callscore-autonomy-activation.ts`;
- `src/scripts/verify-callscore-autonomy-report.ts`;
- `src/lib/autonomy/supervisor/evidence/report.ts`;
- committed schemas and fixtures for every proof;
- JSON and Markdown report producers plus SHA-256 sidecars.

The JSON must validate against `callscore-autonomy-implementation-report.schema.json`. The verifier independently reads Git remotes, Docker labels/digest, migration tables, graph source, prompt registry, systemd units, cron states, DB ledgers, and proof artifacts. It writes a separate verifier artifact. Final-report DB insertion requires both hashes and PASS.

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

### 9.3 Automatic cutover rollback

Before un-fencing, any failed readiness/proof automatically:

1. leaves or re-enables activation fence;
2. stops the new supervisor;
3. restores previous unit/script manifest and previous image digest;
4. restarts the old channel worker only if compatibility tests prove it cannot consume new authoritative rows;
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

If visual/media is included, it also requires design bundle reference, website alignment v2, branding v2, lockup occlusion, and media artifact v2. The graph must independently mint the exact action grant, create the provider operation, execute, read back, record external ID/URL/hash, and preserve a deletion/rollback contract.

If any gate, cooldown, provider, authority, receipt, originality, readback, or rollback check fails, the canary proof is `BLOCKED_BY_GRAPH`; that is an accepted readiness outcome but not publication success. Parent shell/provider publication is forbidden.

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

1. Commit this v2 plan plus all proof fixtures and calculate a manifest of path/size/SHA-256.
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
- the owned-public canary is either provider-verified through the graph or receipt-backed `BLOCKED_BY_GRAPH`;
- the schema-valid final report and independent verifier receipt exist, hashes match, remote/deployed SHAs read back, and both implementation worktrees are clean.
