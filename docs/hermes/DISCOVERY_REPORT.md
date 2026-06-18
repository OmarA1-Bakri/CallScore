# Hermes Discovery Report — CallScore Control Plane Architecture

Generated: 2026-06-18
Repository: `/opt/crypto-tuber-ranked`
Hard gate: Phase 1 discovery only. No source-code implementation changes were made in this phase.

## Task-router analysis

Categories: backend, data, devops, testing, security, observability, frontend, ml/agentic-workflows.

Complexity: Very high. This is a multi-phase production control-plane upgrade touching database schema, workflow runtime, agent boundaries, deterministic scoring, observability, and admin UX.

Library/tooling discovery highlights:

- Primary skills loaded/used for routing and constraints: `task-router`, `writing-plans`, `subagent-driven-development`, `frontend-design`, `callscore-autopilot`, `workplane-status`, `parent-verification-of-agent-output`.
- Library search results showed relevant categories for workflow, database, observability, frontend, and agent architecture.
- Active frontend skill is relevant for later dashboard/admin views, but Phase 1 made no frontend code changes.
- Existing repository already has a bounded pipeline/job/event layer and Workplane readiness logic. The implementation plan below upgrades that framework first instead of introducing a separate workflow stack.

---

## 1. Repository overview

### Detected stack

- Application: Next.js app router.
- Frontend: React 19, TypeScript, Tailwind/PostCSS, Recharts, custom component primitives.
- Backend/API: Next.js `src/app/api/**/route.ts` handlers running Node runtime where needed.
- Scripts/workers: TypeScript scripts executed through `tsx`.
- Database: PostgreSQL-compatible SQL, with HH PostgreSQL as canonical production and Neon retained as legacy/backup compatibility.
- LLM/AI providers in code: Ollama Cloud/current extraction path, legacy Gemini helpers, removed OpenRouter path in current LLM extraction parser.
- Monitoring: optional Sentry plus structured JSON logger.
- Commerce/auth: Whop SDK/OAuth, local signed sessions, review-token auth, premium/API access helpers.

### Package manager

- `package-lock.json` exists.
- Package manager is npm.
- Node engine in `package.json`: `20.x`.

### Framework

- Next.js `^15.5.15` in `package.json`; build output reported Next.js `15.5.18`.
- React `^19.2.6`.
- App router files live under `src/app`.

### Application entry points

- Public app page: `src/app/page.tsx`.
- App layout: `src/app/layout.tsx`.
- API routes: 38 `route.ts` files under `src/app/api`.
- Core script entry points from `package.json` include:
  - `src/scripts/run-data-pipeline.ts`
  - `src/scripts/run-daily-pipeline.ts`
  - `src/scripts/hermes-worker.ts`
  - `src/scripts/extract-calls-llm.ts`
  - `src/scripts/match-prices.ts`
  - `src/scripts/compute-scores.ts`
  - `src/scripts/workplane-status.ts`
  - `src/scripts/workplane.ts`
  - `src/scripts/migrate.ts`

### Backend structure

- `src/lib/db.ts`: provider-portable DB adapter around Neon serverless and `pg` Postgres pool.
- `src/lib/pipeline.ts`: durable pipeline queue/run/job/event helpers.
- `src/scripts/hermes-worker.ts`: worker that claims and executes pipeline jobs with heartbeat and retry behavior.
- `src/lib/workplane-status.ts` and `src/lib/workplane-jobs.ts`: Workplane readiness and job-spec layer.
- `src/lib/workflow-receipts.ts`: file-backed workflow receipt/gate artifact helper.
- `src/lib/loop-engineering.ts`: bounded dry-run loop receipt contract for extraction improvement.
- `src/app/api/pipeline/*`: status/stats/blocker APIs.
- `src/app/api/cron/*`: Netlify/cron enqueue routes.

### Frontend structure

- Pages: 27 `page.tsx` files under `src/app`.
- Main user-visible pages include:
  - `/`
  - `/creator/[handle]`
  - `/call/[id]`
  - `/methodology`
  - `/pricing`
  - `/backtest`
  - `/alerts`
  - `/settings/*`
  - `/transparency`
- Components live in `src/components`, with primitives in `src/components/primitives` and commercial CTAs in `src/components/commercial`.
- Current admin/control-plane UI is partial: pipeline status APIs exist; no complete `/workflows`, `/workflows/:id`, `/calls/review`, or lineage dashboard exists yet.

### Database layer

- Root schema: `schema.sql`.
- Migration files: 21 SQL files under `migrations/`.
- Migration runner: `src/scripts/migrate.ts` reads `schema.sql` plus numbered migration files and applies split SQL statements.
- Query layer: `src/lib/db.ts`, using `DATABASE_PROVIDER` / `DB_PROVIDER` plus `DATABASE_URL`, `POSTGRES_URL`, `NEON_DATABASE_URL` fallbacks.
- No ORM was detected. This is raw SQL plus typed TypeScript query wrappers.

### Current test setup

- Test runner: Node built-in test runner with `tsx` import loader.
- Test files discovered: 92 `tests/**/*.test.ts` files.
- `npm test` exists, but because the script is `node --import tsx --test tests/**/*.test.ts`, the baseline shell run executed only 7 tests in this environment. The explicit discovered suite command ran 679 tests.
- Existing CI runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

### Deployment/runtime assumptions

- `netlify.toml` is present.
- Netlify build command: `npm run build`.
- Netlify publish directory: `.next`.
- Netlify Node version: `20`.
- Netlify plugin: `@netlify/plugin-nextjs`.
- Scheduled functions configured:
  - `cron-weekly`: weekly Monday 06:00
  - `cron-alerts-scan`: every 6h
  - `cron-alerts-send`: every 6h offset 15m
  - `cron-ml-enqueue`: daily 03:00
  - `cron-candles-enqueue`: every 15m
  - `cron-match-enqueue`: daily 03:30
  - `cron-scores-enqueue`: daily 03:45
- Docker support exists via `Dockerfile.hermes` and `docker-compose.yml`, with backup files present.
- Canonical production domain per existing project memory/docs: `https://call-score.com`; Netlify is canonical infra, stale Vercel assumptions are not production evidence.

---

## 2. Existing CallScore domain model

### Existing entities found

From `schema.sql` and migrations:

- `creators`
  - creator profile and aggregate ranking fields.
- `videos`
  - YouTube video metadata, transcript text, transcript quality, extraction state.
- `calls`
  - extracted market calls, symbol, direction, call type, quote, confidence, pricing fields, returns, alpha fields, score.
- `creator_stats`
  - precomputed leaderboard data per period.
- `consensus_signals`
  - convergence signals across creators.
- `pipeline_runs`
  - durable run ledger for existing pipeline jobs.
- `pipeline_jobs`
  - durable job queue with status, attempts, lock, heartbeat, lease, idempotency key, metrics, phase.
- `pipeline_job_events`
  - existing job/run event log.
- `ml_model_versions`
  - model/prompt registry for ML verifier.
- `ml_verification_runs`
  - per-call ML verifier output with decision, reason, evidence span, request/response payloads.
- `ml_training_examples`
  - training/eval data for verifier.
- `candles`
  - referenced by price matching and freshness checks; appears external/legacy table alongside root schema.
- watchlist/alerts/webhooks/auth-related tables are implied by tests/migrations beyond root `schema.sql`.

### Entities partially present or missing for target architecture

| Target concept | Current state |
|---|---|
| creators | Present |
| channels | Partially represented by YouTube fields and external registry docs; no first-class `channels` table found in root schema |
| videos | Present |
| transcripts | Present as `videos.transcript`; no first-class immutable `transcripts` table found |
| transcript segments | Missing as durable DB entity |
| evidence spans | Partially present as `calls.raw_quote` and `ml_verification_runs.evidence_span`; no structured segment-linked evidence table |
| market calls | Present as `calls` |
| candidate calls | Partially present through shadow artifacts and dry-run extraction output; no durable candidate-call table separate from final `calls` |
| normalized calls | Partially represented by `calls` rows; no immutable normalized artifact table |
| assets | Partially represented by tracked symbols/constants; no first-class asset table found |
| price points | Partially represented by columns on `calls` and `candles`; no `price_points`/provider metadata table found |
| evaluations | Partially represented by score/return columns and `creator_stats`; no explicit evaluation entity table |
| creator scores | Present in `creator_stats` and `creators` aggregate fields |
| leaderboard entries | Computed/read from `creator_stats`/HH Read API; no separate immutable leaderboard publication table found |
| workflow runs | Partially present as `pipeline_runs`; target richer `workflow_runs` not present |
| workflow node runs | Missing |
| artifacts | Partially file-backed via `.tmp/workflow-receipts`, shadow/audit artifacts; no DB `artifacts` table found |
| agent invocations | Partially present as `ml_verification_runs`; no general `agent_invocations` table found |
| approval gates | Partially file-backed/registry-based; no DB `approval_gates` table found |

---

## 3. Existing data flow

Current inferred flow:

```text
source discovery
  → metadata ingestion
  → transcript acquisition
  → call extraction
  → normalization
  → price resolution
  → scoring
  → publication
```

| Step | Current state | Evidence |
|---|---|---|
| source discovery | Implemented/partial | `discover:videos`, `discover:videos:rss-api`, YouTube scripts and tests |
| metadata ingestion | Implemented/partial | `videos` table, `discover-videos-*`, `seed-creators`, creator scripts |
| transcript acquisition | Implemented but degraded by provider/platform limits | `backfill-transcripts.ts`, laptop collector docs/tests, transcript worklist/ingest scripts |
| transcript segmentation | Partial/in-memory | `extract-calls-llm.ts` chunks transcripts but no durable segment table |
| call extraction | Implemented | `extract-calls-llm.ts`, `extract-calls-local.ts`, `ai-extraction.ts`, shadow extraction scripts |
| normalization | Implemented in code, not as immutable artifact chain | `normalizeExtractedCalls`, symbol normalization, extraction validation |
| evidence linking | Partial | raw quote/evidence span stored, but no transcript-segment-linked immutable evidence chain |
| price resolution | Implemented | `match-prices.ts`, `match-prices-set-based.ts`, candles table, Binance fallback |
| scoring | Implemented deterministic code | `scoring.ts`, `public-methodology`, `recompute-stats.ts`, `compute-scores.ts` |
| publication | Implemented as public API/page read path | leaderboard APIs, home page, HH Read API fallback; no explicit publication decision table |
| audit trail | Partial | `pipeline_job_events`, workflow receipts, audit files, logs; no unified workflow/node/artifact ledger |

Important existing boundary:

- LLM extraction path can create/replace calls through deterministic script code (`replaceStoredCallsForVideo`) when write flags are used.
- Deterministic scoring exists separately in `compute-scores.ts`, `recompute-stats.ts`, `scoring.ts`, and `public-methodology`.
- The target architecture should reinforce the rule that agents may produce extraction artifacts, but only deterministic repository services write final scores/public state.

---

## 4. Existing validation

### Schema validation

- Zod is present as a dependency.
- API schemas exist in `src/lib/api-schemas.ts` and are tested by `tests/api-runtime-schemas.test.ts`.
- Extraction validation exists in `src/lib/extraction-validation.ts` and `tests/extraction-validation.test.ts`.
- Migration parser is tested in `tests/migrate.test.ts`.

### Type checking

- `npm run typecheck` executes `tsc --noEmit`.
- Baseline result: pass.

### Linting

- `npm run lint` executes `next lint`.
- Baseline result: pass, with Next.js deprecation warning for `next lint`.

### Unit/integration tests

- 92 test files discovered under `tests/`.
- `npm test` baseline passed but executed only 7 tests in this shell/glob environment.
- Explicit full discovered suite passed 679 tests.
- Coverage areas include pipeline, Workplane, scoring, extraction, shadow promotion, auth, frontend shape, API route schemas, Whop, transcript handling, secret hygiene, and workflow receipts.

### API tests

- Tests cover route shape and runtime schemas, including leaderboard APIs, checkout, webhook, auth, pipeline status, health helpers, alerts, and API cache behavior.

### Frontend checks

- Shape/style tests exist for pages and components.
- Frontend design token/style constraints are tested, including anti-rounded/glow/gradient conventions and primitive exports.

### Database constraints

- SQL schema includes primary keys, unique indexes, foreign keys, check constraints, partial unique indexes, and indexes for queue/lookup performance.
- Pipeline job statuses currently support `queued/running/succeeded/failed/cancelled` at run level and `pending/running/succeeded/failed/cancelled` at job level. Target status vocabulary needs expansion or mapping.

### Manual review gates

- `workflow-receipts.ts` blocks dangerous workflows without approval evidence.
- Workplane status encodes many required approvals and mutation gates.
- GTM registry and channel-head souls docs define safe-owned vs gated actions.
- `compute-scores.ts` protects bounded canary mode and makes full recompute explicit by default behavior or `--confirm-full-recompute`.

### Logging/audit records

- JSON logger in `src/lib/logger.ts`.
- Optional Sentry in `src/lib/monitoring.ts`.
- Durable `pipeline_job_events` table.
- File-backed receipts under `.tmp/workflow-receipts`.
- Shadow extraction/promotion audit artifacts.
- Workplane status/freshness reports.

---

## 5. Current risks

1. No unified durable workflow control-plane ledger.
   - Existing `pipeline_runs/jobs/events` are useful but not rich enough for workflow node runs, artifact lineage, agent invocations, and approval gates.

2. No durable immutable artifact table.
   - Artifacts exist as files/JSONL/receipts, but lineage is not normalized in DB.

3. Weak provenance from score to transcript evidence.
   - `calls.raw_quote` and `ml_verification_runs.evidence_span` exist, but there is no mandatory chain from score → evaluation → normalized call → candidate call → evidence span → transcript segment → transcript → video → workflow run.

4. No first-class transcript segment model.
   - Extraction chunks are in-memory. Evidence-friendly durable transcript segments are missing.

5. Agents can get too close to durable call state.
   - Existing write extraction scripts can replace calls for a video. The new architecture should route agent output through candidate/normalized artifacts and deterministic repositories/gates before touching final `calls`.

6. Price-source auditability is partial.
   - `calls` has price fields and repair metadata, and `candles` has price data, but individual resolved price points are not stored with provider/retrieval metadata per evaluation.

7. Approval gates are fragmented.
   - File receipts, registry docs, Workplane readiness, and scripts each encode pieces. There is no DB-level `approval_gates` table.

8. Bounded loop controls exist but are not universal.
   - Some scripts have max attempts, batch sizes, cooldowns, and defaults; the target workflow runtime needs a generic loop/retry contract with events/cost logging/failure states.

9. Cost/token tracking is missing or partial.
   - `pipeline_runs` has metrics JSON, but no standard `agent_invocations` with tokens/cost/latency.

10. Admin observability is incomplete.
   - Pipeline status APIs exist, but full workflow/node/artifact/lineage/cost/approval dashboards are not present.

11. Current `npm test` script may under-test in some shells.
   - `npm test` passed 7 tests here. The explicit null-safe discovered command passed 679. CI may behave differently depending shell glob expansion; this should be documented/fixed in a later phase.

12. `next lint` is deprecated.
   - Lint passes now, but Next.js 16 will remove `next lint`; migrate later to ESLint CLI.

13. Some migration filenames/comments are inconsistent.
   - `migrations/021-launch-pipeline-ops.sql` comments identify migration 008. Not functionally blocking but confusing for auditability.

---

## 6. Proposed implementation plan

This plan intentionally upgrades the existing framework first: `pipeline_runs`, `pipeline_jobs`, `pipeline_job_events`, `workflow-receipts`, Workplane readiness, and existing deterministic scoring scripts. It does not introduce a broad external workflow framework.

### Phase 2 — Control-plane ledger

Goal: add the minimum durable control-plane foundation while preserving existing pipeline tables.

Likely files to change:

- Create migration: `migrations/022-workflow-control-plane.sql`
- Add DB types/repositories:
  - `src/lib/control-plane/types.ts`
  - `src/lib/control-plane/repository.ts`
  - `src/lib/control-plane/checksum.ts`
- Add tests:
  - `tests/control-plane-ledger.test.ts`
- Add report:
  - `docs/hermes/PHASE_2_CONTROL_PLANE_REPORT.md`

Database changes:

- Add `workflow_runs`, `workflow_node_runs`, `workflow_events`, `artifacts`, `agent_invocations`, `approval_gates`.
- Prefer UUID primary keys for new control-plane tables.
- Do not drop/replace existing `pipeline_*` tables.
- Add optional cross-reference fields where useful, e.g. `pipeline_run_id`, `pipeline_job_id`, or metadata links back to legacy pipeline rows.

Expected risks:

- Duplicating concepts with `pipeline_runs/jobs/events`.
- Status vocabulary mismatch: existing `succeeded` vs target `completed`.
- Migration runner currently applies every statement; concurrent index usage in old migrations is already present and should be handled carefully.

Validation commands:

- `npm run typecheck`
- `npm run lint`
- `node --import tsx --test tests/control-plane-ledger.test.ts`
- `find tests -name '*.test.ts' -print0 | xargs -0 node --import tsx --test`
- `npm run build`

Rollback strategy:

- Revert code/tests migration file before applying to production.
- If migration applied, add a rollback SQL script that drops only the new `022` tables in dependency order, after ensuring no production workflow records need preservation.

### Phase 3 — Artifact chain

Goal: make artifacts immutable and queryable, and support score/call lineage.

Likely files to change:

- Extend `src/lib/control-plane/repository.ts`
- Add `src/lib/control-plane/artifacts.ts`
- Add `src/lib/control-plane/lineage.ts`
- Add tests: `tests/artifact-chain.test.ts`
- Report: `docs/hermes/PHASE_3_ARTIFACT_CHAIN_REPORT.md`

Database changes:

- Extend `artifacts` if needed with `entity_type`, `entity_id`, `parent_artifact_ids`, or add `artifact_links` if lineage querying is cleaner.
- Keep artifacts immutable. Corrections create new artifacts.

Expected risks:

- Over-normalizing too early.
- Storing oversized transcript JSON in DB. Use `storage_uri` for large raw transcripts if needed.

Validation commands:

- `npm run typecheck`
- `npm run lint`
- `node --import tsx --test tests/artifact-chain.test.ts`
- Full discovered test suite
- `npm run build`

Rollback strategy:

- Revert artifact code and migration before production apply.
- If already applied, leave empty artifact tables in place unless operator approves drop.

### Phase 4 — Workflow runtime

Goal: implement a minimal TypeScript-native workflow runtime on top of the control-plane repository.

Likely files to change:

- `src/lib/workflows/types.ts`
- `src/lib/workflows/runtime.ts`
- `src/lib/workflows/idempotency.ts`
- `src/lib/workflows/approval.ts`
- Tests: `tests/workflow-runtime.test.ts`
- Report: `docs/hermes/PHASE_4_WORKFLOW_RUNTIME_REPORT.md`

Database changes:

- None expected beyond Phase 2 unless runtime discovers missing indexes.

Expected risks:

- Building a generic engine too broad for current needs.
- Approval pause/resume semantics can become ambiguous.
- Need deterministic idempotency keys to avoid duplicate processing.

Validation commands:

- `npm run typecheck`
- `npm run lint`
- `node --import tsx --test tests/workflow-runtime.test.ts`
- Full discovered test suite
- `npm run build`

Rollback strategy:

- Revert runtime files/tests. Existing pipeline remains unaffected.

### Phase 5 — Call extraction/video intelligence workflow

Goal: create `video_intelligence_workflow` that processes fixture video/transcript into candidate/normalized call artifacts, with low-confidence approval gates.

Likely files to change:

- `src/lib/workflows/video-intelligence.ts`
- `src/lib/video-intelligence/transcript-segments.ts`
- `src/lib/video-intelligence/extract-candidate-calls.ts`
- `src/lib/video-intelligence/normalize-calls.ts`
- `src/lib/video-intelligence/validate-evidence.ts`
- Fixtures:
  - `tests/fixtures/transcripts/*`
  - `tests/fixtures/videos/*`
- Tests: `tests/video-intelligence-workflow.test.ts`
- Report: `docs/hermes/PHASE_5_VIDEO_INTELLIGENCE_REPORT.md`

Database changes:

- Ideally none beyond artifact tables unless durable transcript segments need a first-class table. If they do, propose a minimal `transcript_segments` table before proceeding.

Expected risks:

- Accidentally letting workflow persist final calls instead of candidate artifacts.
- Weak quote-to-segment mapping.
- LLM/provider availability in tests; use deterministic fixture extractor or injected handler for tests.

Validation commands:

- `npm run typecheck`
- `npm run lint`
- `node --import tsx --test tests/video-intelligence-workflow.test.ts`
- Full discovered test suite
- `npm run build`

Rollback strategy:

- Revert workflow and fixtures. Control-plane foundation remains useful.

### Phase 6 — Deterministic price/scoring boundaries

Goal: make price resolution and scoring auditable, deterministic, and unreachable by agent mutation paths.

Likely files to change:

- `src/lib/price-resolution/*`
- `src/lib/scoring-boundary/*`
- Existing files:
  - `src/scripts/match-prices.ts`
  - `src/scripts/compute-scores.ts`
  - `src/lib/recompute-stats.ts`
  - `src/lib/scoring.ts`
  - `src/lib/public-methodology.ts`
- Tests: `tests/scoring-boundary.test.ts`
- Report: `docs/hermes/PHASE_6_SCORING_BOUNDARY_REPORT.md`

Database changes:

- Add `price_points` and `score_evaluations`, or represent both as immutable artifacts if DB table scope should stay minimal.
- Add explicit link from evaluation to call/evidence/artifact IDs.
- Add blocker reason/state fields if existing `calls` table cannot represent target states cleanly.

Expected risks:

- Existing `calls` table currently stores both extracted call and final evaluation fields. A clean boundary may require gradual dual-write or artifact-first migration.
- Public API must not regress while internals are refactored.

Validation commands:

- `npm run typecheck`
- `npm run lint`
- `node --import tsx --test tests/scoring-boundary.test.ts tests/compute-scores-cli.test.ts tests/methodology-rubric.test.ts tests/public-integrity.test.ts`
- Full discovered test suite
- `npm run build`

Rollback strategy:

- Keep old scoring path until new boundary is verified.
- Feature-flag any publisher changes.

### Phase 7 — Observability dashboard/admin views

Goal: expose workflow runs, node runs, artifacts, approval gates, costs, blocked items, and lineage.

Likely files to change:

- API routes:
  - `src/app/api/workflows/route.ts`
  - `src/app/api/workflows/[id]/route.ts`
  - `src/app/api/calls/review/route.ts`
  - `src/app/api/calls/[id]/lineage/route.ts`
  - `src/app/api/admin/costs/route.ts`
  - `src/app/api/admin/blocked/route.ts`
- Pages/components if frontend is enabled:
  - `src/app/workflows/page.tsx`
  - `src/app/workflows/[id]/page.tsx`
  - `src/app/calls/review/page.tsx`
  - `src/app/calls/[id]/lineage/page.tsx`
  - `src/app/admin/costs/page.tsx`
  - `src/app/admin/blocked/page.tsx`
  - `src/components/control-plane/*`
- Tests for route/page shape and auth.
- Report: `docs/hermes/PHASE_7_OBSERVABILITY_REPORT.md`

Database changes:

- None expected if Phase 2/3 tables are sufficient.

Expected risks:

- Exposing unsafe mutation endpoints.
- Leaking secrets/provider payloads in artifact JSON.
- Generic admin pages conflicting with existing Whop/auth tier model.

Validation commands:

- `npm run typecheck`
- `npm run lint`
- API/page tests
- Full discovered test suite
- `npm run build`
- Browser QA for frontend pages before claiming UI complete.

Rollback strategy:

- Keep endpoints read-only first.
- Remove/disable routes if auth assumptions are insufficient.

### Phase 8 — End-to-end verification loop

Goal: prove fixture transcript → workflow → candidate/normalized calls → evidence validation → price/scoring or blocked state → observability.

Likely files to change:

- `tests/e2e/video-intelligence-control-plane.test.ts` or `tests/control-plane-e2e.test.ts`
- Fixture data under `tests/fixtures/*`
- Scripts if needed:
  - `src/scripts/run-fixture-workflow.ts`
- Final report: `docs/hermes/FINAL_SYSTEM_VERIFICATION_REPORT.md`

Database changes:

- None expected beyond earlier phases.

Expected risks:

- Fixture tests passing but production data not wired.
- Build/test time growth.
- Need injected DB transaction/test DB pattern to avoid production writes.

Validation commands:

- `npm run typecheck`
- `npm run lint`
- Unit/integration/e2e fixture commands
- Full discovered test suite
- `npm run build`
- Migration apply check against safe test DB or documented dry-run/rehearsal environment.

Rollback strategy:

- E2E tests are additive and can be reverted without production impact.
- Do not promote production workflow until all final gates pass.

---

## 7. Baseline command results

### Command: `npm run typecheck`

Result: pass.

Output summary:

```text
> crypto-tuber-ranked@0.1.0 typecheck
> tsc --noEmit
EXIT_CODE: 0
```

Failure summary: none.

Likely cause: not applicable.

### Command: `npm run lint`

Result: pass.

Output summary:

```text
> crypto-tuber-ranked@0.1.0 lint
> next lint
`next lint` is deprecated and will be removed in Next.js 16.
✔ No ESLint warnings or errors
EXIT_CODE: 0
```

Failure summary: none.

Likely cause: not applicable. Deprecation warning should be addressed later by migrating to ESLint CLI.

### Command: `npm test`

Result: pass, but only 7 tests executed in this shell environment.

Output summary:

```text
> crypto-tuber-ranked@0.1.0 test
> node --import tsx --test tests/**/*.test.ts
1..4
# tests 7
# suites 2
# pass 7
# fail 0
EXIT_CODE: 0
```

Failure summary: none.

Likely cause/risk: the script glob may not enumerate the full test suite in this shell context. Use the explicit discovered test command for stronger verification until the script is corrected.

### Command: `find tests -name '*.test.ts' -print0 | xargs -0 node --import tsx --test`

Result: pass.

Output summary:

```text
1..676
# tests 679
# suites 2
# pass 679
# fail 0
# cancelled 0
# skipped 0
# todo 0
Exit code: 0
```

Failure summary: none.

Likely cause: not applicable.

Log path:

```text
/opt/crypto-tuber-ranked/.tmp/hermes-discovery/full-discovered-tests-20260618T170051Z.log
```

### Command: `npm run build`

Result: pass.

Output summary:

```text
> crypto-tuber-ranked@0.1.0 build
> next build
✓ Compiled successfully
✓ Generating static pages (39/39)
Route inventory generated successfully
EXIT_CODE: 0
```

Failure summary: none.

Likely cause: not applicable.

### Baseline validation log

```text
/opt/crypto-tuber-ranked/.tmp/hermes-discovery/baseline-validation-20260618T165854Z.log
```

---

## Discovery-only changed files

Created/updated only this discovery report:

```text
docs/hermes/DISCOVERY_REPORT.md
```

No source implementation files were changed during Phase 1 discovery.

---

## Hard Gate 1 status

Status: reached.

Discovery report has been written. Per the prompt, implementation must stop here until approval is given for Phase 2 — Control-plane foundation.
