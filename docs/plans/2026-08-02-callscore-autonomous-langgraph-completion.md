# CallScore Autonomous LangGraph Completion Implementation Plan

> **For Hermes:** Execute this plan through phase-level Kanban using strict RED → GREEN → REFACTOR. Every code-producing phase requires parent inspection plus independent contract, implementation, and security reviews before its checkpoint commit is accepted.

**Goal:** Replace the current wrapper-style channel orchestration with one PostgreSQL-checkpointed CallScore supervisor that owns claim-to-completion lifecycle, launches real Hermes specialist sessions, joins and evaluates their artifacts, performs provider-safe execution/readback, measures outcomes, and promotes or rolls back runtime prompt/model variants.

**Architecture:** Extend the existing control-plane tables, operating graph, channel-head contracts, provider nodes, and canonical 51-agent registry. Do not create a parallel orchestrator. Cron and shell paths become enqueue/wake adapters only. The TypeScript worker compiles one `StateGraph` with the official PostgreSQL checkpointer; node implementations remain small and transactional. All external mutations remain graph-owned, registry-authorised, idempotent, independently read back, and receipt-backed.

**Tech stack:** TypeScript, Node 20, `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres@1.0.4`, PostgreSQL, Zod, Hermes one-shot child sessions, Langfuse, Composio-backed provider adapters, node:test.

---

## 0. Immutable execution target

- Starting CallScore SHA: `22993a5537c9b677e25f6454f9f72c52179fc493`.
- Branch: `feat/callscore-autonomous-langgraph-completion-20260802`.
- Worktree: `/home/omar/callscore-worktrees/autonomous-langgraph-completion-20260802`.
- Canonical app repo remains `/opt/crypto-tuber-ranked` after deployment.
- Canonical Workplane executable root will be `/srv/agents/repos/callscore-workplane/workplane`; the historical repository remains the owner and gains a real executable package at that path. `/srv/agents/repos/Claude_Code_Automations/workplane` becomes compatibility-only and is removed from runtime commands after readback proves parity.
- Canonical Hermes profile: `callscore`.
- GCP Cloud Run is deliberately out of scope: CallScore production is Netlify + Hetzner/Hermes, and moving the supervisor to Cloud Run would violate the canonical host and transcript-network constraints.
- No payment mutation, private outreach, customer-record mutation, credential change, paid spend, or non-owned public action.

## 1. Verified starting state

| Layer | Starting state | Required correction |
|---|---|---|
| Worker ingress | `hermes-worker.ts` claims a `channel_tasks` row before invoking LangGraph | Put claim/lease/recovery inside graph-owned node transactions |
| Persistence | `createCallscoreOperatingGraph()` compiles without a checkpointer | Compile with PostgreSQL saver and stable `thread_id`, namespace, run ID |
| Scheduler | shell/tmux code independently selects, runs, and marks channel work done | convert to enqueue/wake only; completion comes from supervisor state |
| States | channel state machine has a smaller lifecycle and report-oriented statuses | canonical controlled lifecycle + transition table + reason codes |
| Delegation | current routine tasks launch flat Hermes prompts; no durable join lineage | persisted child envelopes, real session IDs, artifact hashes, required joins |
| Success | report/draft/exit-zero receipts can become `succeeded` | truthful achievement classes; `COMPLETE` requires channel-specific proof |
| Provenance | partial provider/model fields, no complete resolved prompt record | immutable runtime registry and per-generation resolved envelope |
| Quality | deterministic gates exist; semantic evaluator/outcome binding is absent | independent evaluator, max three revisions, persisted score/reason lineage |
| Providers | provider nodes and receipts exist but execution/readback is not a universal state boundary | idempotent submission + independent readback before `PROVIDER_VERIFIED` |
| Learning | tables and ML scripts exist, current social loop does not populate/promote | outcome joins, Langfuse scores, champion/challenger promotion + rollback |
| Runtime | split Workplane roots, graph hash drift, failed service + unmanaged gateway | single executable root, attested image/source/hash, one supervised gateway |

## 2. Non-negotiable state contract

### 2.1 Workflow states

`QUEUED`, `HEAD_PLANNING`, `CHILDREN_RUNNING`, `HEAD_SYNTHESIS`, `QUALITY_EVALUATION`, `REVISION`, `READY`, `EXECUTING`, `PROVIDER_VERIFIED`, `OUTCOME_MEASURED`, `LEARNING_RECORDED`, `COMPLETE`, `RETRY`, `FAILED`.

### 2.2 Achievement classes

`OBSERVED`, `REPORTED`, `DRAFTED`, `QUALITY_PASSED`, `READY`, `EXECUTED`, `PROVIDER_VERIFIED`, `OUTCOME_MEASURED`, `COMPLETE`, `FAILED`.

### 2.3 Allowed transitions

Normal path:

`QUEUED → HEAD_PLANNING → CHILDREN_RUNNING → HEAD_SYNTHESIS → QUALITY_EVALUATION → READY → EXECUTING → PROVIDER_VERIFIED → OUTCOME_MEASURED → LEARNING_RECORDED → COMPLETE`.

Revision path:

`QUALITY_EVALUATION → REVISION → QUALITY_EVALUATION`, maximum three revisions.

Retry paths:

- `CHILDREN_RUNNING → RETRY → CHILDREN_RUNNING | FAILED`
- `EXECUTING → RETRY → EXECUTING | FAILED`
- `PROVIDER_VERIFIED → RETRY → PROVIDER_VERIFIED | FAILED`

Terminal states: `COMPLETE`, `FAILED`.

All mutations use compare-and-set on current state plus task lease owner/version. Agents may supply `detail`; they may not supply arbitrary states or reason-code names.

## 3. Data model and durable contracts

### Existing tables retained

`channel_tasks`, `workflow_runs`, `workflow_node_runs`, `workflow_events`, `artifacts`, `agent_invocations`, `channel_publications`, `autonomy_events`, `experiment_memory`, `ml_model_versions`, `feedback_reports`, `incidents`, `pipeline_jobs`, `pipeline_job_events`.

### Migration `025-callscore-autonomous-supervisor.sql`

Additive only:

1. Create PostgreSQL enums `callscore_workflow_state`, `callscore_achievement_class`, `callscore_join_status`, `callscore_evaluation_decision`, and controlled `callscore_reason_code` values.
2. Extend `channel_tasks` with `workflow_state`, `achievement_class`, `workflow_run_id`, `checkpoint_namespace`, `run_id`, `lease_owner`, `lease_token`, `lease_expires_at`, `lease_heartbeat_at`, `state_version`, `previous_executable_state`, `revision_count`, `retry_count`, `max_retries`, `reason_codes`, and structured `detail`.
3. Create `channel_task_transitions` with before/after state, expected version, lease token, run ID, reason codes, detail, and timestamps.
4. Create `agent_delegations` with `parent_task_id`, `delegation_id`, `child_task_id`, `child_session_id`, `child_agent_id`, provider/model/toolset/skill/prompt lineage, required schemas, artifact hashes, join status, and `consumed_by_parent_at`.
5. Create `generation_provenance` with the complete immutable prompt/model/parameter/token/cost/output contract.
6. Create `quality_evaluations` and `artifact_revisions` with deterministic and semantic scores, decisions, controlled reasons, source/output hashes, evaluator provenance, and revision number.
7. Create `provider_executions` with idempotency key, payload hash, attempt number, request/response artifact IDs, external ID, public URL/readback identifier, provider state, and verification time.
8. Create `outcome_measurements` with task/run/prompt/model/experiment/publication lineage and measurement window metrics.
9. Create `runtime_variants` and `runtime_variant_assignments` for champion/challenger selection, promotion, and rollback references.
10. Add uniqueness/foreign keys for idempotency, child identity, publication attribution, and one active champion per channel/agent/policy tuple.
11. Backfill existing `channel_tasks`: report-only rows become `REPORTED`; draft rows become `DRAFTED`; only provider-readback-backed rows may backfill beyond `EXECUTED`. No historical row is upgraded to `COMPLETE` without the task completion predicate.

The official checkpointer manages its own `checkpoint_*` tables through `PostgresSaver.setup()` in a dedicated idempotent setup command; tests run that setup against disposable PostgreSQL and prove schema-version upgrade/resume.

## 4. Implementation phases

### Phase A — Controlled contracts and migration

**Objective:** Make invalid lifecycle strings and false-success semantics unrepresentable.

**Files**
- Create: `migrations/025-callscore-autonomous-supervisor.sql`
- Create: `src/lib/autonomy/supervisor/contracts.ts`
- Create: `src/lib/autonomy/supervisor/completion-predicates.ts`
- Modify: `src/lib/control-plane/status.ts`
- Modify: `src/lib/control-plane/types.ts`
- Modify: `src/lib/control-plane/repository.ts`
- Modify: `src/lib/channel-agent-tasks.ts`
- Test: `tests/autonomous-supervisor-contracts.test.ts`
- Test: `tests/autonomous-supervisor-migration.test.ts`
- Test: `tests/channel-agent-tasks.test.ts`

**Vertical TDD slices**
1. RED: Zod rejects one invented workflow state. GREEN: canonical enum schema.
2. RED: invalid state transition is rejected. GREEN: explicit transition map.
3. RED: report-only result cannot satisfy `COMPLETE`. GREEN: task-kind completion predicates.
4. RED: `independent_agent_execution=true` without verified children is rejected. GREEN: derive from joined delegation rows only.
5. RED: duplicate provider idempotency key and duplicate child session lineage fail. GREEN: constraints.
6. RED: migration applied twice fails or changes schema. GREEN: transactional idempotent migration.
7. RED: historical report fixture is incorrectly promoted. GREEN: conservative backfill.

**Gate:** disposable PostgreSQL migration happy path plus forged-state, duplicate-lineage, FK mismatch, null identity, and rollback tests pass.

### Phase B — PostgreSQL checkpointer and graph-owned claim/lease

**Objective:** One supervisor owns ingestion, transactional claim, lease heartbeat, recovery, and terminal transition.

**Files**
- Add dependency: `@langchain/langgraph-checkpoint-postgres@1.0.4`
- Create: `src/lib/autonomy/supervisor/checkpointer.ts`
- Create: `src/lib/autonomy/supervisor/repository.ts`
- Create: `src/lib/autonomy/supervisor/state.ts`
- Create: `src/lib/autonomy/supervisor/graph.ts`
- Create: `src/lib/autonomy/supervisor/nodes/claim-lease.ts`
- Create: `src/lib/autonomy/supervisor/nodes/heartbeat.ts`
- Create: `src/lib/autonomy/supervisor/nodes/retry.ts`
- Create: `src/scripts/setup-callscore-supervisor-checkpoints.ts`
- Modify: `src/scripts/hermes-worker.ts`
- Modify: `src/lib/workplane/callscore-operating-graph.ts`
- Test: `tests/autonomous-supervisor-checkpoint.test.ts`
- Test: `tests/autonomous-supervisor-recovery.test.ts`
- Test: `tests/callscore-operating-graph.test.ts`

**TDD slices**
1. RED: same task can be claimed by two workers. GREEN: `FOR UPDATE SKIP LOCKED` + lease token/version CAS.
2. RED: process death after claim loses task. GREEN: persisted checkpoint immediately after claim.
3. RED: expired lease remains stuck. GREEN: graph-owned reclaim to previous executable state.
4. RED: restart re-runs completed node. GREEN: stable `thread_id=task/workflow ID`, namespace=workflow type, run ID=attempt.
5. RED: retry exhaustion loops. GREEN: controlled `FAILED` transition.
6. RED: checkpoint schema upgrade loses resumability. GREEN: setup/migration compatibility test.

**Gate:** kill-after-claim integration test resumes exactly once from PostgreSQL checkpoint.

### Phase C — Real Hermes delegation and durable join

**Objective:** Channel heads launch real specialist sessions and consume only validated child artifacts.

**Files**
- Create: `src/lib/autonomy/supervisor/delegation/hermes-child-runner.ts`
- Create: `src/lib/autonomy/supervisor/delegation/task-router.ts`
- Create: `src/lib/autonomy/supervisor/delegation/envelopes.ts`
- Create: `src/lib/autonomy/supervisor/nodes/head-planning.ts`
- Create: `src/lib/autonomy/supervisor/nodes/dispatch-children.ts`
- Create: `src/lib/autonomy/supervisor/nodes/join-children.ts`
- Modify: `src/lib/autonomy/channel-head-graph.ts`
- Modify: `src/lib/autonomy/social-channel-graph.ts`
- Modify: `docs/ops/callscore-channel-head-souls.yaml`
- Test: `tests/autonomous-supervisor-delegation.test.ts`
- Test: `tests/hermes-child-runner.integration.test.ts`

**Child execution contract**

Launch `/home/omar/.local/bin/hermes -p callscore --pass-session-id -z` with explicit model, provider, toolsets, skills, working directory, stable role contract, task context, evidence packet, output schema, and completion predicate. Child JSON must return the injected session ID plus artifacts. Persist launch envelope before spawn and result envelope after exit. A process exit alone is not success.

Required routing receipts: `callscore.task_router_receipt.v1` and `callscore.tool_inheritance_receipt.v1`. Canonical parent-child IDs must come from the 51-agent mapping. Tools are deny-by-default per execution mode.

**TDD slices**
1. RED: head plans a non-canonical child. GREEN: roster/authority validation.
2. RED: child requests forbidden public/DB/payment tool. GREEN: task-router denial receipt.
3. RED: child process exits zero with invalid JSON. GREEN: invalid envelope is rejected.
4. RED: parent advances before all required children finish. GREEN: durable join barrier.
5. RED: artifact hash mismatch is accepted. GREEN: schema + hash verification.
6. RED: no children yields independent execution. GREEN: derived false.
7. RED: two real child sessions lack model/tool/prompt lineage. GREEN: persisted complete envelope.

**Gate:** X head launches at least evidence/research and copy-specialist sessions; parent blocks until both join; invalid child prevents synthesis.

### Phase D — X vertical slice synthesis, evaluator, and revision

**Objective:** Complete the first end-to-end channel before generalisation.

**Files**
- Create: `src/lib/autonomy/supervisor/nodes/head-synthesis.ts`
- Create: `src/lib/autonomy/supervisor/evaluation/deterministic.ts`
- Create: `src/lib/autonomy/supervisor/evaluation/semantic.ts`
- Create: `src/lib/autonomy/supervisor/nodes/quality-evaluation.ts`
- Create: `src/lib/autonomy/supervisor/nodes/revision.ts`
- Create: `src/lib/autonomy/supervisor/channels/x.ts`
- Modify: `src/lib/autonomy/channel-head-scoring.ts`
- Modify: `src/lib/autonomy/channel-head-langfuse.ts`
- Modify: X prompt entries in `docs/ops/callscore-channel-head-souls.yaml`
- Test: `tests/autonomous-supervisor-quality.test.ts`
- Test: `tests/autonomous-supervisor-x.test.ts`

**Evaluator contract**

Scores factual accuracy, evidence support, originality, channel fit, clarity, Omar/CallScore voice, commercial strength, actionability, handoff readiness, hook, argument, platform-native structure, audience relevance, CTA, and similarity to recent publications. The evaluator uses a separate agent/model identity from the producing child.

**TDD slices**
1. deterministic failure enters `REVISION`.
2. semantic failure enters `REVISION`.
3. revision reason and source hash persist.
4. reevaluated revision may reach `READY`.
5. fourth revision attempt reaches `FAILED`.
6. similarity against recent published artifacts is scored and can block.
7. Langfuse receives generation metadata and quality scores tied to task/run/prompt hash.

### Phase E — Provider execution, readback, and crash reconciliation

**Objective:** Make provider submission idempotent and independently verified.

**Files**
- Create: `src/lib/autonomy/supervisor/provider/contracts.ts`
- Create: `src/lib/autonomy/supervisor/provider/x-provider.ts`
- Create: `src/lib/autonomy/supervisor/nodes/execute-provider.ts`
- Create: `src/lib/autonomy/supervisor/nodes/verify-provider.ts`
- Modify: `src/lib/workplane/node-wrappers/social-publish-nodes.ts`
- Modify: `src/lib/workplane/node-wrappers/graph-owned-provider-adapter.ts`
- Test: `tests/autonomous-supervisor-provider.test.ts`
- Test: existing provider idempotency tests discovered by `npm test`

**TDD slices**
1. execution without idempotency key fails closed.
2. successful submission without readback remains `EXECUTING`/`RETRY`.
3. matching external ID + payload/readback advances to `PROVIDER_VERIFIED`.
4. crash after submission resumes at reconciliation and does not resubmit.
5. quota/rate error schedules retry without deleting prior provider state.
6. cooldown/authority/receipt failures block before provider call.

No live provider call occurs in tests. The final owned-public canary runs only after registry, cooldown, canonical receipt package, originality, provider path, and rollback checks pass.

### Phase F — Outcomes and learning

**Objective:** Bind read-only channel/business outcomes to the generation that caused them.

**Files**
- Create: `src/lib/autonomy/supervisor/outcomes/contracts.ts`
- Create: `src/lib/autonomy/supervisor/outcomes/x.ts`
- Create: `src/lib/autonomy/supervisor/outcomes/linkedin.ts`
- Create: `src/lib/autonomy/supervisor/outcomes/youtube.ts`
- Create: `src/lib/autonomy/supervisor/outcomes/posthog.ts`
- Create: `src/lib/autonomy/supervisor/outcomes/whop.ts`
- Create: `src/lib/autonomy/supervisor/nodes/measure-outcome.ts`
- Create: `src/lib/autonomy/supervisor/nodes/record-learning.ts`
- Modify: `src/lib/autonomy/channel-head-langfuse.ts`
- Test: `tests/autonomous-supervisor-outcomes.test.ts`
- Test: `tests/autonomous-supervisor-learning.test.ts`

**TDD slices**
1. outcome without task/run/prompt/publication lineage is rejected.
2. delayed outcome schedules remeasurement without losing prior state.
3. X metrics join to publication and prompt hash.
4. PostHog response decoding accepts documented payload and rejects malformed payload.
5. YouTube quota failure preserves prior measurements and schedules retry.
6. real outcome writes `experiment_memory`, `autonomy_events`, `channel_publications`, learning schemas, and Langfuse score.
7. task advances to `LEARNING_RECORDED` only after required learning records commit atomically.

Whop collection is read-only. No checkout, customer, subscription, entitlement, payment, or revenue mutation.

### Phase G — Prompt/model registry, promotion, and rollback

**Objective:** Subsequent tasks actually use promoted variants and automatically roll back regressions.

**Files**
- Create: `src/lib/autonomy/supervisor/runtime-registry.ts`
- Create: `src/lib/autonomy/supervisor/experiments.ts`
- Create: `src/lib/autonomy/supervisor/promotion.ts`
- Create: `src/lib/autonomy/supervisor/prompts/*.ts`
- Modify: `src/lib/control-plane/repository.ts`
- Modify: `src/scripts/ml-autoresearch.ts`
- Modify: `src/scripts/ml-verifier-quality-gate.ts`
- Modify: `docs/ops/callscore-channel-head-souls.yaml`
- Test: `tests/autonomous-supervisor-provenance.test.ts`
- Test: `tests/autonomous-supervisor-promotion.test.ts`

**Rules**

Every launch resolves and freezes agent, channel, task/run, prompt name/version/hash/body, model/provider, temperature, top-p, max tokens, tools, skills, policy version, evidence hashes, timing, tokens, cost, and output hash before execution.

Promotion requires minimum sample size, no safety/canonical-regression, offline quality delta, bound live outcome delta, and a recorded rollback target. Promotion transaction updates the active runtime variant. Regression across a post-promotion cohort automatically restores the rollback target and records the decision.

**TDD slices:** deterministic challenger assignment; provenance completeness; outcome attribution; winning promotion; next task reads promoted config; regression detection; automatic rollback; next task reads restored config.

### Phase H — Generalise existing roster channel adapters

**Objective:** Reuse the same supervisor/delegation/evaluator contracts for the canonical roster without inventing another hierarchy.

**Files**
- Create/modify channel adapters under `src/lib/autonomy/supervisor/channels/`
- Modify: `docs/ops/callscore-channel-head-souls.yaml`
- Modify: `docs/ops/callscore-canonical-subagent-roster.md`
- Modify: `docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json` only if ownership reconciliation requires it
- Modify: `src/lib/autonomy/canonical-operational-runtime.ts`
- Test: `tests/autonomous-supervisor-channel-adapters.test.ts`
- Test: `tests/canonical-operational-runtime.test.ts`

Adapters: CMO, LinkedIn, YouTube, Data, Sentinel, Reddit/community, Whop, email drafts, opportunity research, compliance. Restricted lanes stop before execution unless their exact external gate exists. Owned public lanes need no human approval after automated evidence/quality/authority/cooldown checks.

Special requirements:
- CMO produces thesis candidates through research/critic children and downstream-consumed briefs.
- LinkedIn has independent long-form structure.
- YouTube has topic/research/script/scene/packaging/thumbnail/production/QA/upload/analytics and all canonical media receipts; call 24458 is forbidden.
- Data converts blockers into bounded idempotent remediation jobs.
- Sentinel opens and verifies owning-head remediation tasks.
- Reconcile `callscore-x-linkedin-growth-head`: retire it unless the canonical mapping deliberately assigns a unique executable role.

### Phase I — Runtime consolidation and attestation

**Objective:** One executable Workplane root, one supervisor authority, one supervised gateway.

**Files**
- Add executable Workplane package under `/srv/agents/repos/callscore-workplane/workplane` by minimum-diff transfer from the existing compatibility package; preserve Workplane repo history.
- Modify app runtime references in `src/lib/workplane-jobs.ts`, `src/lib/workplane-status.ts`, and applicable docs.
- Modify: `scripts/callscore-channel-head-scheduler.sh`
- Modify: `scripts/callscore-daily-orchestrator.sh`
- Modify: `scripts/cs-channel-wrapper.sh`
- Modify: `/srv/agents/hermes/scripts/callscore-channel-orchestrator.sh`
- Modify canonical runtime-script sources first, then deploy generated copies with hash receipts.
- Create: `src/lib/autonomy/supervisor/runtime-attestation.ts`
- Modify: `src/scripts/hermes-worker.ts`
- Modify: `src/scripts/callscore-agent-heartbeat.ts`
- Test: `tests/autonomous-supervisor-runtime-attestation.test.ts`
- Test: `tests/autonomous-supervisor-single-authority.test.ts`

Shell scripts may enqueue a goal or wake the worker only. They may not choose channels, run heads, or mark completion. Readiness exposes Git SHA, image digest, graph source hash, prompt registry version, and migration version and fails on mismatch.

Service activation order:
1. verify canonical `hermes-callscore-gateway.service` unit and stop unmanaged replacement;
2. install/deploy approved code and runtime scripts;
3. run additive migrations and checkpoint setup;
4. build/tag worker image from final SHA;
5. restart supervised worker and canonical gateway;
6. disable obsolete shell/timer authority;
7. prove only one gateway and one supervisor are active.

### Phase J — Full verification, activation, and evidence report

**Objective:** Prove the system, then activate one eligible owned-public canary.

**Required commands**

```bash
node --import tsx --test \
  tests/autonomous-supervisor-contracts.test.ts \
  tests/autonomous-supervisor-migration.test.ts \
  tests/autonomous-supervisor-checkpoint.test.ts \
  tests/autonomous-supervisor-recovery.test.ts \
  tests/autonomous-supervisor-delegation.test.ts \
  tests/hermes-child-runner.integration.test.ts \
  tests/autonomous-supervisor-quality.test.ts \
  tests/autonomous-supervisor-x.test.ts \
  tests/autonomous-supervisor-provider.test.ts \
  tests/autonomous-supervisor-outcomes.test.ts \
  tests/autonomous-supervisor-learning.test.ts \
  tests/autonomous-supervisor-provenance.test.ts \
  tests/autonomous-supervisor-promotion.test.ts \
  tests/autonomous-supervisor-channel-adapters.test.ts \
  tests/autonomous-supervisor-runtime-attestation.test.ts \
  tests/autonomous-supervisor-single-authority.test.ts
npm run lint
npm run typecheck
npm test
npm run build
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
```

**Runtime proofs**

1. Apply migration and checkpoint setup with migration receipt.
2. Start a non-provider X workflow using fake provider adapter; kill after claim; restart; prove same task/thread resumes exactly once.
3. Kill after fake provider submission; prove readback reconciles without duplicate.
4. Launch at least two real read-only/draft Hermes children; capture session/model/tool/prompt/artifact/join lineage.
5. Force semantic failure; prove bounded revision and reevaluation.
6. Prove promotion changes the next task's runtime envelope; prove regression rollback restores prior runtime.
7. Verify worker SHA/image/graph/prompt/migration attestation.
8. Verify no duplicate scheduler authority or unmanaged gateway.
9. Run one eligible owned-public X canary only if every canonical receipt, authority, quality, originality, cooldown, provider, rollback, and readback gate passes. Otherwise record the exact graph-owned blocker and do not fabricate execution.
10. Ingest first measurement or schedule a durable remeasurement; prove task/outcome/prompt/publication join.

**Final report**

Write `/srv/agents/hermes/runtime/reviews/CALLSCORE_AUTONOMY_IMPLEMENTATION_2026-08-02.md` containing only starting SHA, final SHA, remote SHA, migration IDs, services activated, obsolete paths disabled, topology, checkpoint/delegation/revision/provider/outcome/promotion proofs, test results, and genuinely external blockers.

## 5. Review and checkpoint policy

1. Commit this plan and calculate its SHA-256.
2. Three independent reviewers receive the exact plan commit and plan hash:
   - contract/spec reviewer;
   - implementation/operability reviewer;
   - security/trust reviewer.
3. Any plan edit invalidates all three verdicts; recommit, rehash, rerun all reviews.
4. Create phase-level Kanban only after all three return PASS. Each implementation phase has one worker card, one parent-verification card, and a fail-closed review gate. A failed gate remains blocked; it is never marked done with a FAIL summary.
5. Use checkpoint commits after each accepted phase, push, and verify `origin/<branch>` equals local SHA.
6. Child self-reports are not evidence. Parent reads diffs, runs tests, and verifies artifacts/runtime directly.

## 6. Completion definition

The task is complete only when:

- one PostgreSQL-checkpointed graph owns task claim through terminal state;
- process-death and migration-resume tests prove durability;
- X and the generalised canonical heads launch and join real Hermes children;
- deterministic and semantic evaluation drive bounded revisions;
- provider submission is idempotent and readback-gated;
- outcomes join to prompt/model/publication lineage;
- champion/challenger promotion changes runtime selection and regression rolls it back;
- one supervised gateway and one supervisor authority remain;
- existing pipeline, scoring, public API, website, lint, typecheck, test, and build gates pass;
- the final runtime report is receipt-backed and Git status is clean.
