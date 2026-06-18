# Phase 6 Scoring Boundary Report — CallScore

Generated: 2026-06-18
Repository: `/opt/crypto-tuber-ranked`
Phase: 6 — Deterministic price/scoring boundaries
Gate: Hard Gate 6

## Summary

Phase 6 added deterministic artifact-first price resolution and score evaluation boundaries.

The boundary creates immutable artifacts:

```text
normalized_calls
  → price_resolution
  → score_evaluation
```

It does not write final `calls` rows, `scores`, `creator_stats`, public leaderboard state, or any production database state.

## Files changed

```text
src/lib/scoring-boundary/deterministic.ts
src/lib/scoring-boundary/index.ts
tests/scoring-boundary.test.ts
docs/hermes/PHASE_6_SCORING_BOUNDARY_REPORT.md
```

## Implementation details

### Price resolution

`resolveDeterministicPrice` resolves entry/horizon prices from provided observations using:

```text
method=nearest_observation
same market symbol
same provider
finite positive prices only
```

Mixed providers fail closed with:

```text
mixed_price_providers_not_allowed
```

### Score evaluation

`evaluateDirectionalScore` computes deterministic directional return:

```text
rawReturn = (horizon - entry) / entry * 100
signedReturn = bullish ? rawReturn : bearish ? -rawReturn : 0
score = signedReturn * confidence
```

Outputs are rounded deterministically.

### Artifact writer

`createScoreBoundaryArtifacts` writes only through the control-plane repository:

```text
price_resolution artifact linked to normalized_calls artifact with link_type=priced_by
score_evaluation artifact linked to price_resolution artifact with link_type=scored_by
```

## Hard Gate 6 checklist

Passed:

```text
1. Price resolution is deterministic.
2. Score evaluation is deterministic.
3. Price/score outputs are immutable artifacts.
4. Boundary source does not insert/update calls.
5. Boundary source does not touch creator_stats.
6. Bullish and bearish examples are tested.
7. Typecheck/lint/targeted tests pass.
```

## Validation

Targeted validation log:

```text
/opt/crypto-tuber-ranked/.tmp/hermes-phase6/phase6-targeted-20260618T184114Z.log
```

Commands passed:

```text
npm run typecheck
npm run lint
node --import tsx --test tests/scoring-boundary.test.ts tests/video-intelligence-workflow.test.ts
```

Results:

```text
typecheck: passed
lint: passed
targeted tests: 6 passed, 0 failed
```

Full-suite validation is deferred to the final all-phases gate.

## Known risks

1. Phase 6 consumes provided fixture/observation prices; it does not fetch real provider candles.
2. No final publication/persistence path was added.
3. Existing legacy scoring scripts remain untouched and continue to operate as before.
4. Production migration/application is still separate and gated.

## Hard Gate 6 status

Status: passed.

Continuing automatically because Omar approved all remaining phases.
