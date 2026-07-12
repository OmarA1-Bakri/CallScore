# CallScore Automated Call Admission v2 — Implementation Plan

**Date:** 2026-07-12
**Status:** Approved for implementation planning; production DB/public rollout remains graph-gated
**Canonical repo:** `/opt/crypto-tuber-ranked`
**Related plans:** `.omx/plans/prd-callscore-creator-eligibility-recalibration.md`, `.omx/plans/test-spec-callscore-creator-eligibility-recalibration.md`

## Goal

Make CallScore a fully automated, source-bound evidence ledger that protects crypto investors by showing whether a creator-owned directional asset call was correct under a disclosed evaluation window.

The target loop is:

```text
Transcript
  -> Qwen candidate discovery
  -> deterministic evidence checks
  -> automatic straight-through decision for clear cases
  -> SOTA exception adjudication + sampled quality control
  -> immutable canonical call
  -> deterministic market outcome
  -> validated creator history
  -> Markov/HMM trajectory analytics
```

The SOTA orchestrator is the automated human-equivalent supervisor. It does **not** review every call. It decides ambiguous/high-risk cases, audits a dynamic sample of automatic decisions, controls model promotion, and emits receipt-backed approval decisions.

## Task-router analysis

- **Categories:** ML, data, backend, testing, observability, crypto, trust/safety
- **Complexity:** Very high; multi-phase data-contract and runtime repair
- **Primary skills:** `callscore-canonical-runtime`, `data/creator-analytics-pipeline`, `mlops/callscore-model-operations`, `mlops/hmm-markov-creator-trajectory`, `mlops/langgraph-workplane`, `software-development/test-driven-development`
- **Supporting skills:** `software-development/subagent-driven-development`, `software-development/requesting-code-review`, `software-development/parent-verification-of-agent-output`, `github/committing-user-work-safely`, `devops/workplane-diagnostics`
- **Optional skills:** `mlops/instructor` or `mlops/guidance` for constrained JSON; `mlops/evaluating-llms-harness` for extended evaluation
- **Library catalog:** unavailable on this host at the documented paths; routing used the active Hermes skill catalog as the verified source of loadable skills.

## Non-negotiable decisions

1. News/reporting publishers are sources, not automatically call owners.
2. `publisher`, `speaker`, and `claim_owner` are distinct concepts.
3. Altcoin Daily is excluded from creator ranking by default; a statement is attributable only to an explicitly identified owner who owns or endorses it.
4. Qwen processes volume; deterministic gates enforce source proof.
5. The SOTA orchestrator reviews ambiguity/high-risk cases and a dynamic quality sample—not all calls.
6. Missing transcript, quote, timecode, ownership, asset, direction, or forward orientation fails closed.
7. Exact source evidence is always public; paid tiers may hide analytics, not the proof required to verify a claim.
8. Extraction history is append-only and versioned.
9. Markov/HMM consumes only SOTA-approved, resolved, creator-owned calls.
10. No automatic public/DB mutation bypasses LangGraph/Workplane and receipt gates.
11. No score redesign is promoted before the admitted-call corpus is revalidated.
12. TDD is mandatory: RED -> GREEN -> regression verification.

## Current-state failures this plan must eliminate

- Daily production uses `extract-calls-local.ts`, writes fixed-confidence `0.6`, and marks videos extracted.
- `extract-calls-openrouter.ts` exits successfully without invoking the canonical extractor.
- Confidence values are rule buckets, not calibrated probabilities.
- High-confidence records contain news, history, guest calls, wrong assets, and non-calls.
- Missing transcripts can be treated as quote-supported.
- Public eligibility does not fail closed on extraction-invalid status.
- `raw_quote` can be hidden for target calls.
- Re-extraction deletes/replaces prior video calls.
- The Qwen 3 verifier is configured but not represented in the live verification ledger.
- The live Markov transition table is absent; Markov is not operational.

## Target data contracts

### Entity taxonomy

```ts
type PublisherType =
  | "INDIVIDUAL_CREATOR"
  | "MULTI_HOST_CREATOR_BRAND"
  | "NEWS_MEDIA"
  | "INTERVIEW_SHOW"
  | "AGGREGATOR"
  | "INSTITUTION"
  | "UNKNOWN";

type ClaimOwnership =
  | "CREATOR_OWNED"
  | "EXPLICITLY_ENDORSED"
  | "REPORTED_THIRD_PARTY"
  | "GUEST_OWNED"
  | "EDITORIAL_TEAM_POSITION"
  | "HISTORICAL_REFERENCE"
  | "CURRENT_OBSERVATION"
  | "AMBIGUOUS_OWNERSHIP"
  | "NON_CALL";
```

### SOTA adjudication receipt

Required fields:

- candidate hash
- transcript hash
- source video ID and timestamp
- publisher identity/type
- speaker identity
- claim-owner identity
- ownership classification
- temporal orientation
- asset and direction support
- exact quote support
- decision: `ACCEPT`, `REJECT`, or `PENDING_AMBIGUITY`
- reason codes
- model/provider/version
- prompt version
- created timestamp
- canonical approval eligibility

### Sampling policy

- Qwen + deterministic gates process every candidate.
- Straight-through auto-decisions are allowed only for policy-defined clear cases.
- SOTA reviews 100% of:
  - model/rule disagreements
  - news/media and multi-speaker passages
  - third-party/guest attribution
  - negation
  - generic ticker aliases
  - conditional calls
  - low-confidence/ambiguous ownership
  - disputes and appeals
- SOTA audits a deterministic random 5–10% sample of auto-accepts and auto-rejects.
- Sampling expands or the lane fails closed when measured error exceeds the configured gate.
- Sampling policy and thresholds are versioned and receipt-backed.

## Work packages

### WP0 — Baseline and safety receipt

**Files:**
- Create `src/scripts/audit-call-admission-v2-baseline.ts`
- Create `tests/call-admission-v2-baseline.test.ts`
- Write receipt under `.tmp/workflow-receipts/call_admission_v2/`

**RED:** test current baseline report shape, discrete confidence distribution, pipeline entrypoint no-op detection, news leakage count, source-evidence exposure.

**GREEN:** implement a read-only report that records current counts and known failure signatures without mutating business data.

**Verification:** targeted test, read-only live run, JSON schema validation, checksum.

### WP1 — Contain the broken daily extraction route

**Files:**
- Modify `src/scripts/run-daily-pipeline.ts`
- Modify `src/scripts/extract-calls-local.ts`
- Modify `src/scripts/extract-calls-openrouter.ts`
- Modify/add `tests/data-pipeline.test.ts`
- Add `tests/extract-calls-entrypoint.test.ts`

**RED:** prove local extraction cannot write canonical calls or mark videos extracted; prove canonical entrypoint invokes `main`; prove required stages fail the daily run.

**GREEN:** local extractor becomes explicit shadow-only; canonical entrypoint runs; extraction/validation/matching/scoring/freshness are required in production write mode.

**Rollback:** restore prior systemd wrapper only if the new pipeline fails before any canonical write; never reactivate local canonical writes.

### WP2 — Publisher/speaker/claim-owner taxonomy

**Files:**
- Modify `src/lib/creator-eligibility/creator-eligibility.ts`
- Modify `src/lib/creator-eligibility-policy.mjs`
- Modify `src/lib/creator-eligibility-policy.d.ts`
- Modify `src/lib/creator-eligibility/news-channel-exclusions.ts`
- Add `src/lib/call-attribution.ts`
- Add `tests/call-attribution.test.ts`
- Extend creator eligibility tests

**RED cases:** Altcoin Daily reports Tom Lee; host-owned statement; guest call; institution forecast; historical quote; unknown speaker.

**GREEN:** separate publisher, speaker, and claim owner; news defaults non-ranking; explicit owned/endorsed exceptions remain possible and source-bound.

### WP3 — Candidate and adjudication contracts

**Files:**
- Add `src/lib/call-admission-contract.ts`
- Add `src/lib/call-admission-receipts.ts`
- Modify `src/lib/ai-extraction.ts`
- Modify `src/lib/extraction-validation.ts`
- Add `tests/call-admission-contract.test.ts`
- Extend `tests/extraction-validation.test.ts`

**RED:** missing transcript/timecode/quote/ownership/asset/direction/forward orientation blocks acceptance; malformed receipts fail closed.

**GREEN:** Zod/type contracts and deterministic receipt validation exist; missing transcript is never quote-supported.

### WP4 — Qwen 3 structured candidate and verifier path

**Files:**
- Modify `src/scripts/extract-calls-llm.ts`
- Modify `src/lib/ml-verifier.ts`
- Modify `src/lib/ml-verifier-label-policy.ts`
- Modify `src/scripts/ml-verifier-quality-gate.ts`
- Extend `tests/ml-verifier.test.ts`
- Extend `tests/shadow-extraction.test.ts`

**RED corpus:** generic `near/link/dot`, negation, history, current observation, third-party forecast, guest attribution, conditional call, direct owned call.

**GREEN:** Qwen returns constrained candidate JSON including evidence spans and ownership; verifier records model/prompt provenance; output cannot self-promote.

### WP5 — SOTA exception adjudication and adaptive QA sampling

**Files:**
- Add `src/lib/call-admission-sampling.ts`
- Add `src/lib/sota-call-adjudicator.ts`
- Add graph node(s) under the existing operating graph modules
- Extend graph routing/policy files through canonical registry IDs only
- Add `tests/call-admission-sampling.test.ts`
- Add `tests/sota-call-adjudication-node.test.ts`

**RED:** high-risk cases always route to SOTA; routine cases are sampled deterministically; error threshold expands sampling or blocks promotion; no direct provider/DB write.

**GREEN:** SOTA acts as automated human-equivalent exception and quality layer; graph emits routing, tool inheritance, adjudication, learning, and promotion receipts.

### WP6 — Append-only evidence persistence

**Files:**
- Add a migration only after graph-owned DB approval receipt
- Modify `src/scripts/script-helpers.ts`
- Add `src/lib/call-admission-persistence.ts`
- Add `tests/call-admission-persistence.test.ts`

**Required records:** extraction runs, candidates, validation/adjudication decisions, canonical call reference, supersession state.

**RED:** re-extraction cannot delete prior evidence; duplicate retries are idempotent; malformed/missing approval receipt cannot promote.

**GREEN:** append-only persistence with immutable provenance. No production migration executes until tests, dry-run, rollback SQL, and Workplane approval receipt pass.

### WP7 — Fail-closed public inclusion and free source evidence

**Files:**
- Modify `src/lib/public-methodology.ts`
- Modify `src/lib/public-serializer.ts`
- Modify `src/lib/leaderboard-eligibility.ts`
- Modify read API safety paths
- Extend public serializer, methodology, leaderboard, and API contract tests

**RED:** extraction-invalid, missing source, news-owned, or unapproved candidates never enter public scoring; target calls always expose exact quote/source/timecode.

**GREEN:** public lifecycle consumes validated admission status; proof remains free; analytics may remain tiered.

### WP8 — Gold set and model-quality harness

**Files:**
- Extend `data/eval/call-extraction-fixtures.jsonl` or create versioned real-corpus dataset outside public artifacts
- Modify `src/scripts/evaluate-llm-gold-set.ts`
- Add `src/scripts/evaluate-call-admission-v2.ts`
- Add tests for split integrity and metric calculation

**Requirements:** real transcript excerpts; creator/news/guest/history/negation/alias/conditional strata; train/dev/untouched holdout; SOTA-supervised labels; no model self-label promotion.

**Promotion gates:** source binding 100%; creator ownership and asset-direction precision targets set by policy; overall admitted-call precision target at least 95%; false attribution below 1%; recall reported but secondary.

### WP9 — Shadow revalidation and supply analysis

**Files:**
- Add `src/scripts/revalidate-call-corpus-v2.ts`
- Add `src/scripts/analyze-validated-call-supply.ts`
- Add tests for read-only/shadow defaults, bounded batches, resume/idempotency, and cohort reports

**Outputs:** valid calls by creator/publisher/language/asset; news/guest/history/non-call counts; concentration; processing cost; creator expansion recommendations.

**Safety:** shadow-only default, bounded cohorts, no destructive updates, no public promotion.

### WP10 — Outcome and ranking alignment

**Files:**
- Modify scoring only after WP9 evidence gate
- Extend `src/lib/public-methodology.ts`, `src/lib/scoring.ts`, and related tests
- Reconcile with existing creator eligibility recalibration plans

**Requirements:** correct/incorrect remains primary; direction-adjusted magnitude added; bearish alpha corrected; P&L never inferred; sparse creators remain provisional; news publishers excluded.

### WP11 — Markov/HMM operationalization

**Files:**
- Add approved transition-state persistence through migration gate
- Wire validated resolved calls into `src/lib/hmm-markov-creator-trajectory.ts`
- Modify `src/lib/pipeline-guard-audit.ts`
- Add live-data readiness and baseline-comparison tests

**Requirements:** consume only validated creator-owned resolved calls; beat last-state/global-state baselines; calibrated probabilities; sparse creators return `INSUFFICIENT_DATA`; advisory only, never admission truth.

### WP12 — Controlled production canary and corpus migration

**Dependencies:** WP1–WP9 complete; WP10/WP11 may remain separately gated if product launch does not require them.

**Steps:**
1. Read-only live baseline.
2. One-video no-public canary.
3. Twenty-five-video shadow cohort.
4. SOTA exception reviews plus sampled QA.
5. Compare against gold gates.
6. Graph-owned bounded canonical promotion.
7. Readback public evidence.
8. Bounded legacy revalidation, preserving superseded records.
9. Recompute creator stats only through the app path.

**Rollback:** stop promotion; restore prior read selection; keep append-only evidence; never delete original rows.

### WP13 — Final verification and operational handoff

- Three independent reviewers: architecture/spec, code/quality, security/trust.
- Parent verifies every critical claim directly.
- Run targeted tests, full tests, lint, typecheck, build.
- Verify systemd service/timer and live worker state.
- Verify Qwen 3 ledger entries and quality-gate receipts.
- Verify Markov readiness honestly; block public Markov output if baselines/data are insufficient.
- Verify public call pages expose proof.
- Verify Altcoin Daily has no creator-ranked leakage.
- Write completion, rollback, learning, and audit receipts.

## Dependency graph

```text
WP0
 ├─ WP1 containment
 ├─ WP2 taxonomy -> WP3 contracts -> WP4 Qwen
 │                                ├─ WP5 SOTA sampling
 │                                ├─ WP6 persistence
 │                                └─ WP8 evaluation
 └─────────────────────────────────────────────┐
WP5 + WP6 + WP7 + WP8 ----------------------> WP9 shadow revalidation
WP9 ----------------------------------------> WP10 scoring
WP9 ----------------------------------------> WP11 Markov
WP1 + WP7 + WP9 ----------------------------> WP12 canary
WP10 + WP11 + WP12 -------------------------> WP13 final verification
```

## Test commands

Targeted RED/GREEN commands are defined per work package. Final gates:

```bash
git diff --check
node --import tsx --test tests/extraction-validation.test.ts tests/shadow-extraction.test.ts tests/ml-verifier.test.ts
node --import tsx --test tests/creator-eligibility.test.ts tests/creator-eligibility-policy.test.mjs tests/creator-stats-eligibility.test.ts
node --import tsx --test tests/call-attribution.test.ts tests/call-admission-contract.test.ts tests/call-admission-sampling.test.ts tests/call-admission-persistence.test.ts
npm test
npm run lint
npm run typecheck
npm run build
/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py
```

Production verification additionally requires live DB readback, systemd state, worker health, public-source readback, receipt validation, and rollback readiness.

## Acceptance criteria

1. Scheduled production no longer writes fixed-confidence local candidates canonically.
2. Canonical extractor entrypoint performs real work and fails visibly on failure.
3. Every admitted call is source-bound to exact quote and timestamp.
4. Publisher, speaker, and claim owner are distinct.
5. News/reporting statements are never attributed to publishers by default.
6. Altcoin Daily cannot appear as a ranked call creator absent a separately approved editorial-ownership policy.
7. Qwen processes all candidates; SOTA reviews ambiguity/high risk and a dynamic sample, not all calls.
8. Missing evidence fails closed.
9. Public proof is never paywalled.
10. Extraction decisions and revisions are append-only and idempotent.
11. Quality metrics are measured on a real holdout before model promotion.
12. Revalidated supply is quantified before adding creators.
13. Markov uses only validated resolved creator-owned calls and beats simple baselines before public exposure.
14. Full tests/lint/typecheck/build pass.
15. Live canary and public readback produce receipt-backed evidence with rollback.

## Explicit non-goals for the first containment release

- No mass historical deletion.
- No immediate public score redesign.
- No broad creator expansion.
- No unrestricted DB migration.
- No public Markov claims before readiness.
- No manual recurring operator queue.

## Estimated execution

- Containment and fail-closed public fixes: first implementation wave.
- Contracts, Qwen, SOTA sampling, and append-only evidence: second wave.
- Gold benchmark and shadow revalidation: third wave.
- Scoring/Markov/corpus promotion: gated fourth wave.

This is a multi-day autonomous implementation and validation program. It should run through a dedicated Kanban board with maximum two non-overlapping implementation lanes and mandatory review gates.
