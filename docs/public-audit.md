# Public Integrity Audit

## Summary

This audit treated CryptoTubers Ranked as a data-integrity product, not a UI-polish project. The main fixes fell into five buckets:

1. Extraction
2. Scoring
3. Aggregation
4. Rendering
5. Marketing copy

The shipped code now uses one public methodology module for score weights, confidence threshold, horizon handling, and count semantics. Public pages and API routes consume the same serializer instead of recomputing their own display math.

## Issues, Root Cause, and Fixes

### 1. Displayed Alpha Score did not match the displayed breakdown

- Reproduced on:
  - Alex Becker creator page: visible badge `12`, visible breakdown `68.9`
  - Altcoin Daily creator page: visible badge `6`, visible breakdown `63.4`
  - Miles Deutscher creator page: visible badge `1`, visible breakdown `41.2`
  - Call `754`: visible score `35.1`, visible breakdown `41.0`
  - Call `566`: visible score `51.6`, visible breakdown `60.8`
- Root cause:
  - Stored `calls.score` and `creator_stats.alpha_score` used a different internal formula in `src/lib/scoring.ts`.
  - Call and creator pages recomputed a second formula in-page, with different weights and no confidence multiplier.
  - Creator pages averaged only the latest 50 displayed calls instead of the full eligible creator history.
- Fix:
  - Added `src/lib/public-methodology.ts` as the single source of truth for the public formula.
  - Added `src/lib/public-serializer.ts` so call pages and creator pages render the same score math and status logic.
  - Rewired `src/lib/scoring.ts` to use the public formula.
  - Rewired creator-page aggregation to use all eligible scored calls, not the latest 50.
- Before:
  - Pages could show one number labeled "Alpha Score" and a different total in the visible breakdown.
- After:
  - If a page labels a value "Alpha Score", it comes from the same component sum the user can see.
- Layer:
  - Scoring, aggregation, rendering

### 2. Calls below the public 70% confidence threshold were still scored

- Reproduced on:
  - Calls `754`, `755`, `756`, `566`, and `5525` all showed `Extraction confidence: 60%` while still carrying scores.
- Root cause:
  - Legacy local extraction wrote `extraction_confidence = 0.6` as a constant.
  - Scoring and consensus pipelines filtered at `>= 0.5`, not `> 0.7`.
  - Public pages displayed the raw score without a shared eligibility/status check.
- Fix:
  - Added `EXTRACTION_CONFIDENCE_THRESHOLD = 0.7` to `src/lib/public-methodology.ts`.
  - Added extraction validation and normalization in `src/lib/extraction-validation.ts`.
  - Added `src/scripts/audit-recompute.ts` and `src/scripts/backfill-public-integrity.ts` to re-audit legacy rows from source transcripts.
  - Updated scoring/aggregation/consensus scripts to use the public threshold.
  - Call serialization now marks low-confidence rows as `excluded_confidence` instead of presenting them as scored.
- Before:
  - A call could be both "below confidence threshold" in copy and "scored" in the UI.
- After:
  - A call is either above threshold and eligible, or publicly shown as unscored.
- Layer:
  - Extraction, scoring, rendering, marketing copy

### 3. Future 30-day and 90-day horizons were being backfilled with latest prices

- Reproduced on:
  - Calls `566`, `569`, `563`, and `559`
  - Multiple recent April 2026 calls had identical 7d/30d/90d prices and returns.
- Root cause:
  - Historical data already contained stale future-horizon values from an older writer.
  - The public pages trusted stored `price_30d` and `price_90d` without a horizon-status guard.
- Fix:
  - Added explicit horizon helpers in `src/lib/public-methodology.ts`.
  - Updated `src/scripts/match-prices.ts` so it will not populate 7d/30d/90d values before the horizon actually elapses.
  - Added the public-integrity backfill to null premature horizons and recompute derived fields.
  - Updated call-page rendering so pending horizons display as pending, not as complete.
- Before:
  - Recent calls could show fake-complete 30d/90d rows.
- After:
  - 7d/30d/90d surfaces remain pending until the relevant window actually exists.
- Layer:
  - Market evaluation, rendering

### 4. Extraction mislabeled symbols, directions, and targets

- Reproduced on:
  - `755` TAO bearish despite a bullish "best buy" quote
  - `756` NEAR bullish despite the excerpt not clearly referencing NEAR
  - `5525` ETH bearish despite "ETH could make a push up"
  - `566` BTC target `$12` extracted from a `$12 trillion` Charles Schwab line
- Root cause:
  - Legacy extraction had weak validation.
  - Target parsing did not reject macro-scale figures.
  - Asset support checks did not distinguish between true symbol evidence and ambiguous English words.
- Fix:
  - Added deterministic extraction audit/normalization in `src/lib/extraction-validation.ts`.
  - Added special handling for ambiguous aliases like NEAR/AR/LINK/DOT.
  - Added target-unit sanity checks so macro figures do not become price targets.
  - Added regression tests for the named samples.
- Before:
  - Invalid extraction artifacts could survive into scoring and rendering.
- After:
  - Unsupported or contradictory extractions are either corrected during backfill or marked invalid/unscored.
- Layer:
  - Extraction

### 5. Creator counts, call totals, and premium copy did not reconcile

- Reproduced on:
  - Methodology: `20 creators tracked`
  - Homepage/About: `19 creators`
  - Creator pages: `Total Calls 2382` alongside `Showing 50 of 3533 calls`
  - Pricing: Pro claimed `full call-by-call history` and `score breakdown per call` even though the public pages already exposed them
- Root cause:
  - Tracked creators and ranked creators were conflated.
  - `creator_stats.total_calls` represented scored calls, while history pagination represented tracked calls.
  - Marketing copy drifted away from the live public product surface.
  - The old `compute-scores.ts` and cron route also used different aggregation logic, and one ranking path excluded Sheldon Evans despite tracked data existing.
- Fix:
  - Added `src/lib/tracked-creators.ts` and `src/lib/public-counts.ts`.
  - Re-labeled creator/page/table surfaces as `Tracked Calls` vs `Scored Calls`.
  - Updated homepage/about/methodology/pricing copy to remove the `19 creators` drift and the false premium/history claims.
  - Replaced duplicated creator-stat recomputation with `src/lib/recompute-stats.ts`.
- Before:
  - The same product could claim different creator counts and different meanings for "total calls".
- After:
  - Tracked creators, ranked creators, tracked calls, and scored calls each have one explicit meaning.
- Layer:
  - Aggregation, rendering, marketing copy

## New Operational Tools

- `npm run audit:recompute -- --call <id> --json`
  - Re-audits one call from source transcript context and shows before/after extraction normalization.
- `npm run audit:recompute -- --creator <handle> --write`
  - Re-audits one creator's calls and rebuilds public stats.
- `npm run audit:recompute -- --all-legacy --write`
  - Re-audits the legacy low-confidence corpus.
- `npm run backfill:public-integrity`
  - Clears premature horizons, re-audits legacy rows, recomputes derived fields, and rebuilds public stats.

## Verification

- Added automated regression coverage in `tests/public-integrity.test.ts`.
- Verified:
  - public formula component sum
  - low-confidence exclusion
  - future horizon pending state
  - target-unit sanity checks
  - named-sample invalid/excluded behavior
  - creator aggregate reconciliation

## Notes

- The repo originally had no committed ESLint config, so `.eslintrc.json` was added to make linting reproducible.
- WSL execution in this workspace required switching package scripts from bare `tsx` to `node --import tsx`.
