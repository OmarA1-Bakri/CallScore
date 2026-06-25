# CallScore Full LangGraph + Zod Operating Workplane Plan

Date: 2026-06-25
Repo: `/opt/crypto-tuber-ranked`
Status: implementation plan / task breakdown only
Target commit message for later implementation: `feat: add LangGraph operating workplane for full CallScore system`

## 0. Executive call

The correct migration path is wrapper-first, not rewrite-first:

```text
existing working script/function
  -> thin LangGraph node wrapper
  -> Zod-validated node result
  -> receipt/artifact
  -> observable operating goal run
  -> internal rewrite only after graph control is proven
```

LangGraph becomes the operating workplane. Existing scripts remain valid execution units while the graph supplies state, routing, gates, receipts, retries, observability, and audit lineage.

This plan intentionally does **not** treat the attached analysis as golden. It was checked against the current repo. Several corrections matter:

1. The current canonical data pipeline in `run-data-pipeline.ts` has 18 stages, not the shorter prompt list.
2. `docs/current-pipeline-entrypoints.md` says the canonical production/data-refresh path is `discover:videos -> scrape:v2 -> extract:llm -> match -> score -> consensus`; the graph must respect this while also wrapping the broader daily pipeline stages.
3. `src/video/queues/video-queues.ts` includes `broll` in `VIDEO_STAGES`, but `src/video/queues/start-video-workers.ts` currently skips broll in `runVideoWorkerPipeline()` and `runVideoStage()` does not dispatch it. The operating graph plan must fix/wrap that gap.
4. `src/lib/control-plane/runtime.ts` is already a parallel custom DAG runtime. It should be bridged/adapted under LangGraph first, not deleted immediately.
5. `src/lib/workflows/video-intelligence.ts` uses the custom `WorkflowRuntime` plus mutable closure state; this is a high-priority LangGraph conversion candidate, but it should initially be wrapped as a node/subgraph to preserve behavior.
6. `hermes-worker.ts` supports pipeline jobs plus channel tasks and Workplane job specs. The graph must wrap job claim/dispatch/complete/fail, not bypass the DB-backed worker semantics on day one.
7. Existing CMO social graphs are canonical and should be reused, not re-created.
8. Subagent audit found that `run-daily-pipeline.ts` dry-run is not safely dry-run today: `extract-local`, `match-prices`, and `compute-scores` can still mutate production state. Graph migration must block or refactor those paths before treating daily dry-run as safe.
9. `pipeline-job-schema.ts` currently has a loose `PipelineJobTypeSchema.or(z.string())` shape. Operating graph work must make dispatch schemas strict before worker execution is trusted.
10. `hermes-worker.ts` exports `executeJobWithKeepalive()` but keeps core `executeJob()` private. First implementation should extract dispatch logic into a library module instead of importing worker CLI internals.
11. CMO graphs prove hierarchy/orchestration, but currently use synthetic decision context and dry-run-only receipts. Revenue graph work must load real registry/Workplane/tool/sentinel/trust state before claiming operating revenue capability.
12. `cmo-channel-integration.ts` is the best existing publish-readiness kernel and should be wired as the central fan-in gate before any provider execution.

## 1. Task-router analysis

Categories:
- backend: worker dispatch, queue runners, node wrappers, CLI
- data: data refresh, extraction, matching, scoring, PostgreSQL-backed job queue
- devops: long-running workers, goal CLI, process wrappers, bounded execution
- testing: TDD, regression tests, graph routing tests, mutation flag assertions
- security: approval gates, secret gate, fail-closed unknown agents/goals
- observability: receipts, artifacts, duration, blockers, Workplane status
- ml: ML verifier, Gemma/Ollama shadow extraction, Markov trajectory, video intelligence
- social/revenue: X/LinkedIn/Reddit/Whop/alert surfaces gated by authority and approval

Primary skills/methods to use:
- `task-router`: classify, discover, route work
- `kanban-orchestrator`: decompose into safe parallel lanes and verification gates
- `writing-plans`: stable, executable plan before implementation
- `test-driven-development`: RED -> GREEN -> REFACTOR for every graph/schema slice
- `subagent-driven-development`: bounded implementation lanes, parent verifies every claim
- `langgraph-workplane`: canonical graph patterns and runtime semantics
- `minimum-diff-integration`: wrapper-first, minimal behavior change
- `parent-verification-of-agent-output`: parent runs tests and reads outputs before accepting worker claims

External app/tool stance:
- Composio remains the tool layer, not the agent hierarchy.
- Runtime nodes may call Composio-backed X/LinkedIn/Reddit/Whop/YouTube actions only after tool availability and approval evidence are verified inside the graph.
- Missing OAuth/tool access must return a precise blocker. It must not be reported as success.

Complexity: very high.
Expected implementation effort: 5 major phases, 30-45 focused tasks, likely multi-session.

## 2. Verified current system map

### 2.1 Existing LangGraph assets

Already under LangGraph:

| Graph | File | Notes |
|---|---|---|
| channel head graph | `src/lib/autonomy/channel-head-graph.ts` | Existing graph; still has older input injection pattern. Defer refactor until operating layer can wrap it. |
| social channel graph | `src/lib/autonomy/social-channel-graph.ts` | Canonical reusable graph for X/LinkedIn/Reddit specialist fan-out/fan-in. |
| CMO campaign graph | `src/lib/autonomy/cmo-campaign-graph.ts` | Canonical campaign graph invoking channel graphs and producing campaign receipt. |

### 2.2 Existing Zod/runtime schema assets

Relevant existing schema files:

| File | Purpose |
|---|---|
| `src/lib/validation/pipeline-state-schema.ts` | Pipeline state, receipts, guard audit, freshness, errors. Useful foundation but not sufficient for all operating-node outputs. |
| `src/lib/validation/pipeline-job-schema.ts` | Pipeline job, worker args, enqueue input. Already strict Zod. |
| `src/lib/autonomy/cmo-campaign-schemas.ts` | Specialist/channel/campaign receipt schemas for marketing graph. |
| `src/video/schemas/video.schemas.ts` | Video job state and artifact contracts. |
| existing autonomy/trust schemas | Decision, authority, trust, review receipts. Reuse where possible. |

New operating graph schemas should be small, strict, and compositional instead of duplicating all existing domain schemas.

### 2.3 Imperative/domain workflows outside LangGraph

Current outside-graph domains that must be wrapped:

1. Data pipeline
   - `src/scripts/run-data-pipeline.ts`
   - `src/scripts/run-daily-pipeline.ts`
   - `src/scripts/run-continuous-data-pipeline.ts`
   - canonical entrypoint docs: `docs/current-pipeline-entrypoints.md`

2. Worker dispatch
   - `src/scripts/hermes-worker.ts`
   - `src/lib/pipeline.ts`
   - `src/lib/pipeline-jobs.ts`
   - `src/lib/workplane-jobs.ts`
   - channel task claim/run/fail functions

3. Custom Control Plane DAG runtime
   - `src/lib/control-plane/runtime.ts`
   - `src/lib/control-plane/repository.ts`
   - `src/lib/control-plane/artifacts.ts`
   - `src/lib/workflows/video-intelligence.ts`

4. Video automation pipeline
   - `src/video/queues/video-queues.ts`
   - `src/video/queues/start-video-workers.ts`
   - `src/video/queues/workers/*.worker.ts`
   - `src/scripts/video-queue-consumer.ts`
   - CLI wrappers under `src/video/cli/`

5. Sentinels and monitoring
   - `src/lib/sentinels/fresh-call-sentinel.ts`
   - `src/lib/sentinels/creator-discovery.ts`
   - `src/scripts/callscore-freshness-check.ts`
   - `src/scripts/callscore-cmo-response-monitor.ts`
   - `src/scripts/gemma-capacity-preflight.ts`

6. Alert distribution
   - `src/scripts/send-queued-alerts.ts`
   - `src/lib/alerts.ts`
   - `src/lib/resend.ts`

7. Trust review
   - `src/scripts/callscore-non-founder-review.ts`
   - `src/lib/trust/non-founder-review-queue.ts`
   - `src/lib/trust/trust-decision-engine.ts`

8. Evidence/research/verifier/report workflows
   - `src/scripts/storm-evidence-pack.ts`
   - transition snapshot/report scripts
   - `src/scripts/ml-verifier-quality-gate.ts`
   - `src/scripts/ml-idle-improve.ts`
   - Markov/trajectory artifacts and related tests

9. Workplane status/governance
   - `src/scripts/workplane-status.ts`
   - `src/lib/workplane-status.ts`
   - `src/lib/workplane-jobs.ts`

10. GTM/Art-of-War/commerce workflow specs
   - `src/lib/workplane-jobs.ts` job specs for `artofwar_*`, `automation_*`, Whop health/check jobs
   - `docs/ops/callscore-gtm-agent-registry.json`
   - `docs/ops/callscore-canonical-subagent-roster.md`
   - `art-of-war/live/*.json` state/kill-switch/dashboard artifacts

### 2.4 Subagent audit additions: direct callables and known unsafe gaps

Data/worker audit found these clean direct call surfaces for early wrapper-first graph nodes:

| Surface | Direct callables / exports | First graph use |
|---|---|---|
| Pipeline queue | `enqueuePipelineJob`, `claimNextPipelineJob`, `resetStalePipelineJobs`, `updatePipelineJobHeartbeat`, `completePipelineJob`, `retryOrFailPipelineJob`, `appendPipelineJobEvent`, `auditDispatchEvent`, `getPipelineStatusSnapshot` from `src/lib/pipeline.ts` | worker dispatch graph, queue receipts, status snapshots |
| Pipeline job runners | `runCandleRefreshJob`, `runMatchPricesJob`, `runComputeScoresJob`, `candleRefreshArgsFromPayload`, `matchPricesArgsFromPayload` from `src/lib/pipeline-jobs.ts` | direct data/worker nodes before script wrappers |
| Channel task runners | `claimNextChannelTask`, `runChannelTask`, `failChannelTask`, `summarizeChannelTaskResult` from `src/lib/channel-agent-tasks.ts` | worker dispatch graph |
| Workplane jobs | `runWorkplaneJob`, `getWorkplaneJobSpec`, `WORKPLANE_JOB_TYPES` from `src/lib/workplane-jobs.ts` | worker dispatch and evidence/control-plane bridge |
| Direct stage helpers | `checkSecretHygiene`, `runCandleRefresh`, `runRepairPriceAtCall`, `runMatchPrices`, `runComputeScores`, `runFreshnessCheck`, `summarizeFreshCallInflow`, `validateShadowRecords` | direct graph nodes where side-effect gates are explicit |

Main-only or child-process-first surfaces until refactored:

- `audit-recompute.ts`
- `discover-videos-rss-api.ts`
- `scrape-transcripts-v2.ts`
- `backfill-transcripts.ts`
- `extract-calls-llm.ts`
- `extract-calls-local.ts`
- `shadow-extract-transcripts.ts`
- `shadow-diff-extractions.ts`
- `audit-coverage-report.ts`
- `audit-pipeline-readiness.ts`
- `verify-public-surface.ts`

Hard blockers discovered by audit:

1. `run-daily-pipeline.ts --dry-run` cannot be trusted until mutating stages are gated or refactored.
2. `extract-calls-local.ts` has no dry-run/write flag and writes production calls; do not wrap as runnable operating node until fixed or blocked.
3. `match-prices.ts` mutates calls and may insert candles; require explicit write gate, idempotency, and receipt.
4. `compute-scores.ts` defaults to full recompute; graph wrapper must force bounded/canary mode unless production gate allows full recompute.
5. Shadow promotion gates are good; graph must preserve `--allow-statuses` and reviewed-video-id requirements.
6. Graph replay/retry can duplicate side effects; direct write nodes must use idempotency keys/job IDs and must not be replayed blindly.
7. `completePipelineJob()` currently marks a whole `pipeline_runs` row succeeded when one job completes; multi-node operating graph runs must not reuse that aggregation model without a separate run-level receipt.
8. Two shadow extraction defaults exist (`run-data-pipeline.ts` vs direct `shadow-extract-transcripts.ts`); centralize provider/model/timeouts before live graph use.

Revenue/GTM audit found these additional gaps:

1. `social-channel-graph.ts` uses synthetic context (`targetActionType: monitor_read_only`, `ready_public_owned`, synthetic Workplane OK) and must load real registry/Workplane/tool/sentinel/trust state before operating use.
2. `social-channel-config.ts` fields for commenting policy, owned-public status, and cadence are underused; graph nodes must turn these into risk/gate/cooldown decisions.
3. Posting specialists currently resolve as draft-style agents; live publish requires an explicit publish-readiness/execution node, not just specialist authority.
4. `cmo-channel-integration.ts` already joins trust, fresh-call sentinel, cooldown, originality, media, provider readiness, social discipline, and publication readback. It should become the central `channel_publish_readiness` fan-in node.
5. Workplane status during audit was `OK`, `CONTROLLED_FULL`, with `autonomous_revenue_status=NO`; plan must not claim autonomous revenue is currently live.
6. Current next autonomous action was blocked by transcript collector rate-limit cooldown; monitor graph should surface that blocker.

## 3. Canonical future architecture

### 3.1 Files to create

```text
src/lib/workplane/
  operating-goals.ts
  operating-graph-schemas.ts
  operating-receipts.ts
  operating-node-utils.ts
  callscore-operating-graph.ts
  node-wrappers/
    gating-nodes.ts
    data-pipeline-nodes.ts
    worker-dispatch-nodes.ts
    cmo-revenue-nodes.ts
    video-pipeline-nodes.ts
    sentinel-nodes.ts
    trust-review-nodes.ts
    alert-distribution-nodes.ts
    evidence-research-nodes.ts
    control-plane-bridge-nodes.ts

src/scripts/
  callscore-operating-goal.ts

tests/
  operating-graph-schemas.test.ts
  operating-goal-routing.test.ts
  operating-node-wrappers.test.ts
  callscore-operating-graph.test.ts
  callscore-operating-cli.test.ts
```

### 3.2 Top-level graph

```text
callscore_operating_graph
  -> boot_context
  -> hard_gate_preflight
  -> route_goal
      -> revenue_goal_loop
      -> data_goal_loop
      -> worker_dispatch_goal_loop
      -> video_goal_loop
      -> monitoring_goal_loop
      -> trust_goal_loop
      -> alert_goal_loop
      -> evidence_goal_loop
  -> collect_receipts
  -> operating_summary
  -> END
```

Implementation requirement:
- `StateGraph(OperatingGraphAnnotation)`
- `Annotation.Root({...})`
- `Annotation<T>({ reducer, default })`
- `START`, `END`
- `addEdge()` / `addConditionalEdges()`
- `.compile()` before invocation
- all graph inputs through `RunnableConfig.configurable`
- no module-level mutable input state

### 3.3 Domain subgraphs

1. `revenue_gating_graph`
   - `read_kill_switch`
   - `read_workplane_status`
   - `check_heartbeat_freshness`
   - `check_authority_router`
   - `check_pipeline_freshness`
   - `check_approval_requirements`
   - `emit_gate_receipt`

2. `data_pipeline_graph`
   - `secret_hygiene`
   - `low_confidence_validate`
   - `candles`
   - `price_repair`
   - `evaluation_backfill`
   - `ready_extract`
   - `discover`
   - `transcripts`
   - `shadow_extract`
   - `shadow_validate`
   - `shadow_diff`
   - `shadow_promote`
   - `compute_scores`
   - `blocker_audit`
   - `symbol_funnel_audit`
   - `audit`
   - `pipeline_readiness`
   - `verify_public_surface`
   - `write_data_pipeline_receipt`

3. `worker_dispatch_graph`
   - `parse_worker_limits`
   - `reset_stale_jobs`
   - `claim_pipeline_job`
   - `route_pipeline_job_type`
   - `execute_pipeline_job_wrapper`
   - `claim_channel_task`
   - `execute_channel_task_wrapper`
   - `complete_or_retry_or_fail`
   - `write_worker_dispatch_receipt`

4. `cmo_revenue_graph`
   - wraps existing `createCmoCampaignGraph()`
   - adds live-mode gates around optional owned-public execution
   - supports `draft_only`, `approved_publish`, `read_live`
   - output: X owned post packet, LinkedIn draft/blocker, Reddit owned-profile draft/blocker, optional post-execution receipt

5. `video_pipeline_graph`
   - `load_or_create_video_job`
   - `plan`
   - `audio`
   - `captions`
   - `broll`
   - `render`
   - `thumbnail`
   - `qa`
   - `publish_gate`
   - `publish`
   - `analytics`
   - `write_video_job_receipt`

6. `sentinel_graph`
   - `fresh_call_sentinel`
   - `creator_discovery_sentinel`
   - `freshness_check`
   - `cmo_response_monitor`
   - `gemma_capacity_preflight`
   - `write_sentinel_receipt`

7. `trust_review_graph`
   - `load_review_queue`
   - `classify_review_packet`
   - `run_trust_decision_engine`
   - `apply_review_resolution_if_allowed`
   - `write_trust_review_receipt`

8. `alert_distribution_graph`
   - `claim_alert_batch`
   - `build_digest`
   - `send_gate`
   - `send_or_block`
   - `revert_on_failure`
   - `write_alert_batch_receipt`

9. `evidence_research_graph`
   - `storm_evidence_pack`
   - `transition_snapshot_report`
   - `ml_verifier_quality_gate`
   - `markov_trajectory_report`
   - `video_intelligence_workflow_bridge`
   - `write_evidence_research_receipt`

10. `control_plane_bridge_graph`
   - wraps existing `WorkflowRuntime.run()` as a node for legacy control-plane workflows
   - converts `WorkflowRunResult` into `OperatingNodeResult`
   - emits deprecation/bridge receipt
   - later phases can replace individual `WorkflowDefinition` flows with native LangGraph subgraphs

## 4. Operating goals

Define in `operating-goals.ts`:

```ts
export const OperatingGoalSchema = z.enum([
  "revenue_now",
  "refresh_data",
  "dispatch_worker_once",
  "produce_video",
  "monitor",
  "trust_review",
  "alerts",
  "evidence_research",
]);
```

Goal behavior:

| Goal | Must do | Must not do |
|---|---|---|
| `revenue_now` | Produce useful GTM output from existing CMO graph and real gating checks. | Claim publish success without provider proof. |
| `refresh_data` | Run bounded data freshness path using current script/function wrappers. | Unbounded scrape/extraction or DB migration. |
| `dispatch_worker_once` | Claim/execute at most one bounded job/task in graph wrapper mode. | Infinite polling loop. |
| `produce_video` | Advance/create one video job; stop at publish gate unless approved. | Publish without approval/config/tool proof. |
| `monitor` | Run sentinel/freshness/capacity wrappers and produce blocker/health receipts. | Spam queues. |
| `trust_review` | Process pending review packet(s) or return none-found receipt. | Auto-approve restricted external action without evidence. |
| `alerts` | Claim/build/send-or-block one alert batch according to policy. | Send when policy/approval/tool is missing. |
| `evidence_research` | Generate evidence/verifier/Markov/transition receipts. | Promote claims without source evidence. |

## 5. Zod schemas to add

Create strict schemas in `operating-graph-schemas.ts`:

1. `OperatingGoalConfigSchema`
   - `goal`
   - `mode`
   - `dryRun`
   - `approved`
   - `approvalReceiptId`
   - `bounded`
   - `maxItems`
   - `campaignId`
   - `videoJobId`
   - `testFixtures`

2. `MutationFlagsSchema`
   - `external_mutation_performed`
   - `send_or_outreach_performed`
   - `provider_mutation_performed`
   - `whop_mutation_performed`
   - `production_mutation_performed`
   - `db_write_performed`
   - `public_publish_performed`

3. `OperatingNodeResultSchema`
   - `node_id`
   - `domain`
   - `status: ok | blocked | failed | skipped`
   - `receipt_id`
   - `artifact_path`
   - `blockers`
   - `warnings`
   - `started_at`
   - `finished_at`
   - `duration_ms`
   - `mutation_flags`
   - `summary`

4. `OperatingReceiptSchema`
   - `receipt_id`
   - `goal`
   - `domain`
   - `parent_receipt_ids`
   - `node_results`
   - `mutation_flags`
   - `approval_receipt_id`
   - `rollback_or_recovery_note`
   - `artifact_paths`

5. `OperatingGraphStateSchema`
   - top-level graph state validation snapshot
   - accumulated results/receipts/blockers/errors
   - domain-specific artifacts by reference, not giant embedded payloads

6. `ExternalMutationRequestSchema`
   - approval and authority checks for any live mutation node
   - `.superRefine()` invariants:
     - mutation requested requires approval evidence
     - `dryRun === true` forbids true mutation flags
     - public publish requires destination/channel + rollback note
     - Whop mutation requires financial + production gate evidence

7. `ApprovalBlockerDecisionSchema`
   - `status: clear_owned_public | blocked | cooldown | approval_required | non_founder_review_required | tool_missing | monitor_only`
   - `required_gate: null | SEND_GATE | SPEND_GATE | FINANCIAL_GATE | PRODUCTION_GATE | SECRET_GATE | PUBLISH_GATE | NON_FOUNDER_TRUST_REVIEW`
   - `blocker_codes: string[]`
   - `approval_receipt_required: boolean`
   - `allowed_next_action: monitor_read_only | draft | create_approval_packet | create_non_founder_review_item | ready_to_publish | publish_owned_public | sleep`
   - `owner_agent`
   - `rollback_path`
   - `evidence_refs`
   - built from registry row + Workplane status + decision gates + trust decision + sentinel receipt + provider/tool readiness + CMO channel decision + non-founder queue state

8. `PipelineDispatchJobSchema`
   - strict discriminated union of supported pipeline/workplane/channel task job types
   - replaces loose `PipelineJobTypeSchema.or(z.string())` behavior for operating graph dispatch
   - payload schemas for `candle_refresh`, `match_prices_batch`, `compute_scores`, `ml_verifier_batch`, `promote_ml_verified`, `candidate_admission`, and Workplane jobs

All schemas use `.strict()` and exported `z.infer<>` types.

## 6. Node wrapper standard

Every wrapper returns `OperatingNodeResult`.

```ts
export type OperatingNodeWrapper = (
  state: OperatingGraphState,
  config: RunnableConfig,
) => Promise<Partial<OperatingGraphState>>;
```

Wrapper invariants:
- parse input config with Zod before work
- record `started_at`, `finished_at`, `duration_ms`
- catch exceptions and return `status: failed` with blocker/error receipt
- never swallow missing provider/tool/OAuth as success
- child-process wrappers capture command, exit code, stdout/stderr artifact path, and timeout
- direct function wrappers are preferred over child processes
- live mutation wrappers must call the authority router or gate helper before action
- mutation flags must reflect what actually happened, not what was intended

## 7. Implementation phases and task list

### Phase P0 — Baseline, spec lock, and RED tests

P0.1 Verify baseline
- Commands:
  - `npm run typecheck`
  - existing autonomy tests
  - existing full-system test
- Output: baseline receipt in `.tmp/workflow-receipts/operating-graph-plan/<run-id>.json`

P0.2 Add operating schema RED tests
- File: `tests/operating-graph-schemas.test.ts`
- Tests:
  - strict schemas reject unknown keys
  - dry-run cannot set mutation flags true
  - missing approval blocks mutation request
  - public publish requires rollback/recovery note
  - invalid goal fails

P0.3 Add goal routing RED tests
- File: `tests/operating-goal-routing.test.ts`
- Tests:
  - all supported goals route to expected domain loop
  - unknown goal fails closed
  - missing config defaults safe
  - config injection uses `RunnableConfig.configurable`

P0.4 Add node wrapper RED tests
- File: `tests/operating-node-wrappers.test.ts`
- Tests:
  - direct function wrapper maps success/failure/blocker
  - child-process wrapper records command/exit/duration
  - mutation flags default false
  - timeout returns `failed`/`blocked` precisely

P0.5 Add top-level graph RED tests
- File: `tests/callscore-operating-graph.test.ts`
- Tests:
  - graph boots
  - all goals route
  - receipts collect
  - `monitor` dry-run returns real sentinel/freshness wrappers or precise blockers
  - `revenue_now` dry-run uses real CMO graph output

### Phase P1 — Shared schemas, receipts, and utility wrappers

P1.1 Implement `operating-goals.ts`
- Export goal enum, mode enum, helpers, safe defaults.

P1.2 Implement `operating-graph-schemas.ts`
- Strict Zod schemas from section 5.

P1.3 Implement `operating-receipts.ts`
- Stable receipt ID generation.
- Artifact path convention under `.tmp/workflow-receipts/callscore_operating_graph/`.
- Redaction helpers for command output.

P1.4 Implement `operating-node-utils.ts`
- `wrapDirectFunctionNode()`
- `wrapChildProcessNode()`
- `mergeMutationFlags()`
- `nodeResultToStatePatch()`
- timeout support
- fixture injection for tests

P1.5 GREEN P0 schema/wrapper tests.

### Phase P2 — Hard gate/preflight graph

P2.1 Implement `gating-nodes.ts`
- `boot_context`
- `read_kill_switch` from `art-of-war/live/kill-switch.json` if present
- `read_workplane_status` using `buildWorkplaneStatus()` when safe/testable
- `check_heartbeat_freshness`
- `check_authority_router` using existing authority/decision router
- `check_pipeline_freshness`
- `check_approval_requirements`

P2.2 Tests
- kill switch blocks
- unknown agent/goal blocks
- approval missing blocks mutation
- missing Workplane status returns blocker not crash
- no `.env` or secret output in receipts

P2.3 Acceptance
- `monitor` can run preflight and produce a health/blocker receipt with zero mutation.

### Phase P3 — Top-level operating graph skeleton

P3.1 Implement `callscore-operating-graph.ts`
- `OperatingGraphAnnotation`
- boot -> hard gate -> route -> collect -> summary
- route goals with `addConditionalEdges()`
- stub domain loops returning typed skipped/blocker receipts

P3.2 Implement CLI shell `callscore-operating-goal.ts`
- `npm run operating:goal -- --goal monitor --dry-run`
- `npm run operating:goal -- --goal revenue_now --dry-run`
- parse args into Zod config
- invoke compiled graph with `RunnableConfig.configurable`

P3.3 Add package script
- `"operating:goal": "tsx src/scripts/callscore-operating-goal.ts"`

P3.4 GREEN routing/CLI tests
- CLI dry-run prints JSON receipt summary
- unknown goal exits non-zero with safe error

### Phase P4 — CMO revenue graph integration

P4.1 Implement `cmo-revenue-nodes.ts`
- wrap `createCmoCampaignGraph()` directly
- map output receipts into `OperatingNodeResult`
- create publish-ready packet artifact
- enforce `draft_only` by default
- load real registry / Workplane / provider-readiness / sentinel / trust inputs instead of relying on synthetic social-channel context
- wire existing `cmo-channel-integration.ts` as `channel_publish_readiness` fan-in before any provider execution
- treat current Workplane `autonomous_revenue_status=NO` as a blocker for autonomous live revenue execution unless later status/evidence changes

P4.2 Add live gate wrapper but keep default blocked
- `approved_publish` requires:
  - `approvalReceiptId` or `approved_by_operator`
  - authority allows owned-public publish
  - messaging policy pass
  - provider/OAuth/tool availability proof
- If missing, return exact blocker (`approval_missing`, `provider_auth_missing`, `tool_unavailable`, etc.)

P4.3 Tests
- `revenue_now --dry-run` produces real CMO graph campaign packet
- mutation flags all false in dry-run
- approved path without provider proof blocks, not fake success
- if a test publisher fixture is injected, approved path sets publish flags and receipt correctly

P4.4 Revenue acceptance
- The dry-run must produce at least one reviewable output: X owned post packet, LinkedIn draft/blocker, Reddit owned-profile draft/blocker.

### Phase P5 — Data pipeline graph integration

P5.1 Implement `data-pipeline-nodes.ts`
- first wrap `parseDataPipelineArgs()` and `buildDataPipelineStageCommands()` from `run-data-pipeline.ts`
- each stage node calls existing command wrapper or direct function if available
- prefer direct wrappers for `checkSecretHygiene`, `runCandleRefreshJob`, `runMatchPricesJob`, `runComputeScoresJob`, `runRepairPriceAtCall`, `runFreshnessCheck`, status/blocker snapshots, and shadow validation where side effects are gated
- use child-process wrappers only for main-only scripts until they expose `runX(args, deps)` functions
- support bounded config:
  - max creators/videos/items
  - skip unbounded stages
  - dry-run default
  - write requires approval/prod gate
- hard block `run-daily-pipeline.ts --dry-run` as an operating dry-run source until mutating stages are refactored/gated
- hard block `extract-calls-local.ts` as a runnable node until it has explicit dry-run/write semantics

P5.2 Use exact current stage list
- `secret-hygiene`
- `low-confidence-validate`
- `candles`
- `price-repair`
- `evaluation-backfill`
- `ready-extract`
- `discover`
- `transcripts`
- `shadow-extract`
- `shadow-validate`
- `shadow-diff`
- `shadow-promote`
- `compute-scores`
- `blocker-audit`
- `symbol-funnel-audit`
- `audit`
- `pipeline-readiness`
- `verify-public-surface`

P5.3 Tests
- bounded dry-run generates command plan without executing unbounded writes
- write-only stages skip in dry-run with explicit skipped result
- failed stage stops downstream nodes
- receipt includes audit dir and stage results

P5.4 Acceptance
- `npm run operating:goal -- --goal refresh_data --bounded --dry-run` produces a real data pipeline receipt from current command builders/wrappers.

### Phase P6 — Worker dispatch graph integration

P6.1 Implement `worker-dispatch-nodes.ts`
- wrap claim/reset/execute/complete/fail at most one iteration
- never run infinite poll loop inside graph
- extract private `executeJob()` logic from `src/scripts/hermes-worker.ts` into a new library module such as `src/lib/pipeline-dispatcher.ts`; leave `hermes-worker.ts` as polling CLI
- wrap `executeJobWithKeepalive()` where practical after strict Zod dispatch validation
- support channel task claim/run wrapper
- validate all job types through strict `PipelineDispatchJobSchema`; unknown job types fail closed
- do not let `completePipelineJob()` imply whole operating graph success; operating graph writes separate aggregate receipts

P6.2 Tests
- dry-run/fixture claim executes smoke job wrapper
- unsupported job type fails closed
- channel task failure routes to fail wrapper
- max one job by default

P6.3 Acceptance
- `dispatch_worker_once` returns job claim/start/complete/fail receipt.

### Phase P7 — Video pipeline graph integration

P7.1 Fix/wrap broll gap
- Add `runBrollStage()` to `runVideoStage()` in `start-video-workers.ts`.
- Include `broll` in `runVideoWorkerPipeline()` between captions and render.
- TDD: existing broll tests plus new pipeline test.

P7.2 Implement `video-pipeline-nodes.ts`
- direct wrappers around worker functions:
  - `runPlanStage`
  - `runAudioStage`
  - `runCaptionsStage`
  - `runBrollStage`
  - `runRenderStage`
  - `runThumbnailStage`
  - `runQaStage`
  - `runPublishStage`
  - `runAnalyticsStage`
- publish gated by config/approval.

P7.3 Tests
- produce_video creates or advances one job in mock/fixture mode
- stops before publish without approval
- injected mock publisher can prove approved path
- missing video inputs block precisely

P7.4 Acceptance
- `produce_video --dry-run` advances/plans one video job or returns exact resource/tool blocker.

### Phase P8 — Sentinels and monitor goal

P8.1 Implement `sentinel-nodes.ts`
- wrap fresh call sentinel
- wrap creator discovery sentinel
- wrap freshness check
- wrap CMO response monitor
- wrap Gemma capacity preflight

P8.2 Tests
- monitor goal returns health receipts
- queue-spam prevention: bounded max enqueue count
- missing DB/tool returns blocker
- CMO response monitor does not mutate provider/channel

P8.3 Acceptance
- `npm run operating:goal -- --goal monitor` produces monitoring/blocker receipts.

### Phase P9 — Trust review graph

P9.1 Implement `trust-review-nodes.ts`
- load pending review packets
- call `decideTrust()` / trust decision engine
- resolve in dry-run by default
- live resolution requires approval/authority where mutation-like

P9.2 Tests
- no pending reviews -> skipped receipt
- pending fixture -> trust decision receipt
- restricted approval missing blocks external action

### Phase P10 — Alert distribution graph

P10.1 Implement `alert-distribution-nodes.ts`
- wrap alert claim -> digest -> send/revert
- dry-run/default does not send
- live send only if existing alert policy allows and approval/tool checks pass

P10.2 Tests
- missing send policy blocks
- injected mailer fixture proves approved send path
- send failure reverts claim and records blocker

### Phase P11 — Evidence/research graph

P11.1 Implement `evidence-research-nodes.ts`
- wrap STORM evidence pack
- wrap transition snapshot/report
- wrap ML verifier quality gate
- wrap Markov trajectory report
- wrap video intelligence via control-plane bridge first

P11.2 Tests
- each wrapper returns artifact path or precise blocker
- claim-bearing outputs require evidence
- Markov publication remains gated until validated

### Phase P12 — Control-plane bridge and migration path

P12.1 Implement `control-plane-bridge-nodes.ts`
- wrapper around `WorkflowRuntime.run()` for legacy `WorkflowDefinition` flows
- convert custom workflow result to operating receipt
- preserve artifact ids and statuses

P12.2 Tests
- bridge can execute fixture workflow with repository mock
- awaiting approval maps to `blocked` or `awaiting_approval` receipt as appropriate
- errors map to failed result with no synthetic success

P12.3 Later migration
- Convert `createVideoIntelligenceWorkflow()` to native LangGraph only after bridge coverage proves behavior.

### Phase P13 — Cross-domain operating receipts and summary

P13.1 Implement `collect_receipts`
- aggregate node/domain receipts
- merge mutation flags
- fail closed on inconsistent flags
- output one `OperatingSummary`

P13.2 Tests
- summary has all child receipt IDs
- mutation flags are accurate
- blockers visible and grouped by domain
- no secret-looking values leak

### Phase P14 — Verification and acceptance

Required commands:

```bash
npm run typecheck
node --import tsx --test tests/action-authority.test.ts tests/decision-router.test.ts tests/decision-gates.test.ts tests/channel-head-scoring.test.ts tests/pipeline-guard-audit.test.ts tests/control-plane-observability.test.ts
node --import tsx --test tests/social-channel-graph.test.ts tests/cmo-campaign-graph.test.ts
node --import tsx --test tests/operating-graph-schemas.test.ts tests/operating-goal-routing.test.ts tests/operating-node-wrappers.test.ts tests/callscore-operating-graph.test.ts tests/callscore-operating-cli.test.ts
node --import tsx src/scripts/callscore-full-system-test.ts
npm run operating:goal -- --goal revenue_now --dry-run
npm run operating:goal -- --goal monitor
npm run operating:goal -- --goal refresh_data --bounded --dry-run
npm run operating:goal -- --goal produce_video --dry-run
```

Acceptance requires at least one useful output, not just tests:
- X owned post review packet ready for approval, or
- approved X owned post published with provider proof, or
- LinkedIn publish-ready draft with exact OAuth/tool blocker, or
- Reddit owned-profile draft/blocker, or
- video job advanced to next stage, or
- fresh data pipeline receipt showing actionable update or blocker.

### Phase P15 — Commit and handoff

Only after all acceptance checks pass:

```bash
git status --short
git diff --stat
git commit -m "feat: add LangGraph operating workplane for full CallScore system"
```

No commit should be made until the user explicitly authorizes it or the active task explicitly includes commit permission.

## 8. Kanban task breakdown

Recommended board: `callscore-operating-graph-20260625`
Default workdir: `/opt/crypto-tuber-ranked`

Task graph:

| ID | Title | Assignee | Depends on | Acceptance |
|---|---|---|---|---|
| O0 | Spec lock and baseline verification | `callscorearchitect` | none | plan + baseline commands captured |
| O1 | Operating schemas RED/GREEN | `callscoreimplementer` | O0 | schema tests pass, strict Zod boundaries |
| O2 | Operating node wrapper utilities | `callscoreimplementer` | O1 | direct/child-process wrappers tested |
| O3 | Hard gate/preflight graph | `callscoresafety` | O1,O2 | kill switch/approval/unknown fail-closed tests pass |
| O4 | Top-level operating graph skeleton + CLI | `callscorearchitect` | O1,O2,O3 | all goals route, unknown goal fails closed |
| O5 | CMO revenue node wrappers | `callscorecmo` | O4 | revenue_now dry-run produces real campaign packet |
| O6 | Data pipeline node wrappers | `callscoredata` | O4 | refresh_data bounded dry-run receipt from current commands |
| O7 | Worker dispatch node wrappers | `callscoreimplementer` | O4 | dispatch_worker_once fixture + unsupported type tests pass |
| O8 | Video pipeline node wrappers + broll dispatcher fix | `callscoreimplementer` | O4 | produce_video fixture advances through broll-aware path |
| O9 | Sentinel monitor nodes | `callscoredata` | O4 | monitor receipt with sentinel/freshness/capacity blockers |
| O10 | Trust review nodes | `callscoretrust` | O4 | pending/no-pending review tests pass |
| O11 | Alert distribution nodes | `callscoreimplementer` | O4 | alert send blocked unless policy/tool approved |
| O12 | Evidence/research/control-plane bridge nodes | `callscoredata` | O4 | STORM/transition/ML/Markov/bridge fixture tests pass |
| O13 | Cross-domain receipt aggregation and mutation flag audit | `callscoresafety` | O5-O12 | no inconsistent flags, no secret leaks |
| O14 | Three-agent review: architecture | `callscorearchitect` | O13 | architecture review posted |
| O15 | Three-agent review: safety/gates | `callscoresafety` | O13 | safety review posted |
| O16 | Three-agent review: implementation/test coverage | `callscorereviewer` | O13 | reviewer signs off or blocks |
| O17 | Final parent verification + acceptance run | `default-orchestrator` | O14,O15,O16 | all verification commands + one useful output |

Dispatch rule:
- Do not dispatch O5-O12 until O4 is green.
- O5-O12 can run in parallel after O4.
- O13 must be parent-verified; no worker self-report accepted without test output.
- O17 is parent-only final verification.

## 9. Risk controls

Hard gates that must remain fail-closed:
- global kill switch
- unknown goal
- unknown agent
- missing approval for external mutation
- missing OAuth/tool access
- missing evidence for claim-bearing output
- missing rollback/recovery note for public publish
- Whop pricing/product/payment mutation without financial + production gates
- DB migration request
- network/service restart request
- secrets/env exposure

Mutation flags must be exact:
- `external_mutation_performed`
- `send_or_outreach_performed`
- `provider_mutation_performed`
- `whop_mutation_performed`
- `production_mutation_performed`
- `db_write_performed`
- `public_publish_performed`

If any wrapper cannot know whether mutation happened, it must return `failed` or `blocked`, not `ok`.

## 10. First implementation slice recommendation

The first implementation PR should be small enough to finish safely:

1. schemas
2. wrapper utilities
3. hard gate/preflight
4. top-level skeleton
5. `monitor` goal
6. `revenue_now --dry-run` goal using existing CMO campaign graph
7. CLI
8. tests + full-system verification

Then add data/video/worker/trust/alerts/evidence lanes in parallel.

This sequence gives immediate operating graph control without rewriting the system internals.
