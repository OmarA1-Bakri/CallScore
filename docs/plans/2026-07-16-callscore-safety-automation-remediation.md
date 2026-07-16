# CallScore Safety and Automation Remediation Implementation Plan

> **For Hermes:** Execute this plan with vertical RED→GREEN TDD and parent verification. Preserve the existing dirty working tree; do not publish, call providers, write production DB data, deploy, restart services, or mutate cron state.

**Goal:** Close the verified public-handoff, OHLCV, scheduler/catch-up, and sentinel false-green defects without weakening CallScore’s graph-owned or canonical-receipt gates.

**Architecture:** Strengthen enforcement at the lowest mutation boundary, then make data and scheduler operations deterministic, concurrency-safe, and truthfully receipted. Keep all verification local or read-only. Use atomic filesystem claims and hash-bound receipts rather than self-attested IDs.

**Tech Stack:** TypeScript, Node test runner, Zod, Bash/Python wrappers, PostgreSQL query layer, LangGraph/Workplane.

## Honest baseline

| Layer | Status before remediation |
|---|---|
| Public handoff | Blocked: canonical package optional for text-only calls; provider execution not at-most-once |
| Canonical receipts | Blocked: no freshness/owner/channel/payload binding |
| OHLCV refresh/repair | Blocked: open candles can persist; write approval is self-mintable; incomplete repair can say completed |
| Scheduler/catch-up | Degraded: shared state races, weak per-channel publish proof, future timestamps accepted |
| Sentinel v2 | Degraded: false green, weak API-period validation, overwriteable lineage, global cooldown contamination, nonzero exit masking |
| Existing checks | Typecheck/lint/build and focused tests green, but adversarial cases absent |

## Hard constraints

- No provider/public sends.
- No production DB writes or migrations.
- No deploy, service restart, cron enable/disable, or infra mutation.
- Preserve all pre-existing tracked and untracked work.
- Every behavior change starts with a failing behavioral test.
- Do not weaken canonical package, cooldown, originality, visual/media, approval, or rollback gates.

## Task 1 — Mandatory canonical package at every public node

**Files:**
- Modify `src/lib/workplane/node-wrappers/external-mutation-node-utils.ts`
- Modify `src/lib/workplane/node-wrappers/graph-owned-provider-adapter.ts`
- Modify `src/lib/autonomy/canonical-operational-runtime.ts`
- Modify `tests/graph-only-external-mutation.test.ts`
- Modify `tests/canonical-operational-runtime.test.ts`

**RED behaviors:**
1. Package-less text-only X/LinkedIn node returns a canonical-package blocker and calls provider zero times.
2. Stale (>24h), future (>5m), wrong-owner, wrong-channel, malformed-hash, and payload-unbound packages fail closed.
3. Valid current package bound to exact approved payload/channel passes.

**GREEN design:** Require package for all public/video provider handoffs. Validate receipt timestamp, canonical owner, channel, SHA-256 evidence format, and package payload hash. Pass expected channel and approved payload hash into the evaluator.

**Focused gate:**
`node --import tsx --test tests/graph-only-external-mutation.test.ts tests/canonical-operational-runtime.test.ts tests/graph-owned-public-execution-open.test.ts`

## Task 2 — Durable at-most-once provider execution

**Files:**
- Modify `src/lib/workplane/node-wrappers/graph-owned-provider-adapter.ts`
- Modify/add focused provider adapter tests under `tests/`

**RED behavior:** Two concurrent calls for identical tool/platform/destination/payload invoke the provider exactly once and return the same durable result.

**GREEN design:** Atomically create an execution claim (`open(..., 'wx')`) keyed by tool and canonical payload hash. Reuse succeeded receipts; fail closed on active/incomplete claims; never overwrite immutable success evidence. Persist pending→succeeded/failed state with unique attempt lineage.

## Task 3 — Closed-candle refresh and authenticated repair authority

**Files:**
- Modify `src/scripts/refresh-candles.ts`
- Modify `src/scripts/repair-candle-gaps-binance.ts`
- Modify `src/scripts/backfill-candles-data-vision.ts`
- Modify `scripts/callscore-ohlcv-historical-repair.sh`
- Modify `tests/refresh-candles.test.ts`

**RED behaviors:**
1. Default refresh end excludes the currently open minute.
2. Arbitrary approval IDs/flags cannot enable writes.
3. Missing archives or request-cap truncation cannot report completed.
4. Partial failures preserve cumulative fetched/inserted counters and emit partial_failure.

**GREEN design:** Clamp to last closed minute. Require a real JSON approval receipt path with schema, approved operation, bounded symbols/range, payload hash, expiry, and authority. Emit expected/available/fetched/inserted/uncovered/cursor fields and truthful incomplete/partial statuses.

## Task 4 — Scheduler and catch-up concurrency/receipt truth

**Files:**
- Modify `scripts/callscore-daily-orchestrator.sh`
- Modify `scripts/callscore-cmo-cooldown-catchup.sh`
- Modify `tests/channel-head-scheduler-fairness.test.ts`
- Modify `tests/cmo-cooldown-catchup-wrapper.test.ts`

**RED behaviors:**
1. Two concurrent scheduler pulses dispatch each channel once and preserve both process outcomes.
2. Two concurrent catch-up watchers schedule one trigger-key unit.
3. Partial X success/LinkedIn failure verifies only X.
4. Receipts >5m future are quarantined and do not suppress cadence.
5. Abandoned active files become durable failed receipts.

**GREEN design:** Hold `flock` across state claim/dispatch/commit; use unique temp paths and trigger-key unit IDs. Verify per-channel post-execution receipts/readback. Add future-skew validation and stale active-file reconciliation.

## Task 5 — Sentinel correctness, lineage, cooldown isolation, and process truth

**Files:**
- Modify `src/lib/sentinels/leaderboard-sentinel-v2-data.ts`
- Modify `src/lib/sentinels/leaderboard-sentinel-v2.ts`
- Modify `scripts/cs-channel-wrapper.sh`
- Modify `tests/leaderboard-sentinel-v2-data.test.ts`
- Modify `tests/leaderboard-sentinel-v2.test.ts`
- Modify `tests/leaderboard-sentinel-v2-runtime.test.ts`

**RED behaviors:**
1. Empty/stale/missing pipeline history and excessive active jobs cannot report GREEN.
2. Wrong meta/row period, rank 0, duplicate IDs/ranks, bad totals/order fail validation.
3. Same generated timestamp cannot overwrite immutable history.
4. Receipt binds snapshot hash and validates previous lineage.
5. Sentinel HTTP 429 cannot set global model cooldown.
6. Nonzero child exit remains nonzero even with valid JSON.

**GREEN design:** Add strict API contract validation and freshness thresholds; collision-resistant run IDs/exclusive history writes; hash-bound prior lineage; global cooldown only for Hermes/model runner; separate output validity from process success.

## Task 6 — Integration and release gate

**Commands:**
- Focused tests from Tasks 1–5
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`
- `bash -n scripts/callscore-daily-orchestrator.sh scripts/callscore-cmo-cooldown-catchup.sh scripts/cs-channel-wrapper.sh scripts/callscore-ohlcv-historical-repair.sh`
- `/usr/bin/python3 /srv/agents/hermes/scripts/callscore-canonical-agent-audit.py`

**Adversarial proofs:**
- Package-less public call: provider count 0.
- Concurrent identical provider call: provider count 1.
- Open Binance candle: rejected from write batch.
- Self-minted repair approval: rejected before DB client use.
- Concurrent scheduler/watcher: one claim/dispatch.
- Sentinel empty/stale/wrong-period: AMBER/RED, never GREEN.
- Sentinel 429: no global model cooldown.
- Failed sentinel JSON: wrapper nonzero.

**Acceptance:** All gates pass; no external/DB/deploy/runtime mutation; implementation receipt records exact paths, test counts, and remaining blockers.
