# CallScore Methodology / Rubric Certification

**Date:** 2026-06-11  
**Scope:** read-only methodology audit plus safe docs/public-copy/test patch.  
**Production action:** none. No DB mutation, recompute, extraction rerun, service restart, provider change, or secret change.

## Verdict

**ACCEPTABLE WITH PRODUCT COPY CHANGES.**

The current small official leaderboard is commercially acceptable **if** the product explicitly communicates that official ranking is a strict eligibility state, not the full tracked-creator universe. The live HH legacy payload currently has 100 leaderboard rows, but the frontend compatibility safety contract classifies only 17 as official. That result is driven by sample thresholds and explicit exclusion, not by missing global call volume.

This remains **not fully methodology-certified** until the HH read API serves native buckets, `creator_stats` writer semantics are aligned with the read/UI safety contract, and score lifecycle is separated from score value at the data model/source-writer level.

## Actual implemented call-scoring methodology

Evidence inspected:

- `src/lib/public-methodology.ts`
- `src/lib/scoring.ts`
- `src/lib/public-serializer.ts`
- `src/lib/recompute-stats.ts`
- `src/scripts/compute-scores.ts`

Current implementation:

1. **Candidate call** — extracted call row from transcript/video pipeline. The scoring layer does not yet prove creator-owned vs guest/news/aggregation ownership on each individual call.
2. **Confidence-passing call** — `extraction_confidence >= 0.70` in public methodology helpers.
3. **Matched call** — has `price_at_call`, `price_30d`, and `return_30d` plus target-window fields when a target exists.
4. **Public-scored call** — `getCallScoreStatus(...) === "scored"`, meaning confidence passes, 30d horizon is mature/available, and target calls also have 90d target evidence.
5. **Stored scored value today** — `recomputeCallScores()` writes computed 0–100 score for scored calls and writes `0` for unscored/pending/excluded calls.

Current 0–100 public components:

| Component | Current code behavior |
| --- | --- |
| Direction | `40` if `correct_direction` is true, else `0`; direction correctness in `src/lib/scoring.ts` uses bullish `return_30d > 2`, bearish `< -2`, neutral `abs(return_30d) < 10`. |
| Alpha over BTC | `clamp(alpha_30d * 2.5, 0, 25)` in `computePublicScoreComponents`; negative alpha is floored at `0` in the public 0–100 score. |
| Specificity | `clamp(specificity_score * 15, 0, 15)`; `computeSpecificity()` can credit entry, target, stop-loss, timeframe, but current data reality is mostly target-driven. |
| Regime difficulty | `clamp(regime_difficulty * 10, 0, 10)`; `computeRegimeDifficulty()` rewards bullish calls more in bear/crash regimes and bearish calls more in bull regimes. |
| Target hit | `10` if `hit_target` is true; target hit uses bullish high >= target and bearish low <= target with conservative stop-loss guard. |

Current weaknesses:

- `score = 0` is both a possible legitimate score value and the current placeholder for unscored/pending/excluded calls.
- Public/read-count safety therefore temporarily uses `score > 0`, but methodology v2 must not define scored calls that way.
- BTC-call benchmark behavior is not explicitly formalized in the public copy.
- Creator-owned call attribution is not enforced as a first-class call lifecycle status.

## Actual implemented creator-ranking methodology

Evidence inspected:

- `src/lib/recompute-stats.ts`
- `src/lib/leaderboard-eligibility.ts`
- `src/lib/leaderboard-safety.mjs`
- `src/lib/home-read-api-contract.ts`
- `src/scripts/callscore-read-api-server.mjs`

Current source writer behavior:

- `creator_stats.alpha_score` is set to `AVG(c.score)` over eligible calls. Despite the legacy name, it is **average Call Score**, not raw average alpha.
- Rank assignment orders by:
  1. `alpha_score DESC`
  2. `win_rate DESC`
  3. `total_calls DESC`
  4. `creator_id ASC`
- Source writer currently recomputes `all_time`, `90d`, and `30d` in `recomputeAllStats()`; it does not yet recompute `12m` there.
- Source writer/read safety thresholds are not fully aligned:
  - writer all_time threshold: legacy 25 calls;
  - read/UI safety all_time official threshold: 50 calls;
  - writer 90d/30d threshold: legacy 10 calls;
  - read/UI 90d official threshold: 25 calls;
  - read/UI 30d official: disabled.

Current read/UI safety behavior:

- Bucket states: `officialRankedRows`, `provisionalRows`, `watchlistRows`, `staleRows`, `excludedRows`, `pendingMaturityRows`.
- Classification order: excluded -> pending maturity/30d -> stale -> official -> provisional -> watchlist.
- Official requires non-null rank, total_calls > 0, official sample threshold, target creator class, not excluded, not stale, and valid official period.
- Altcoin Daily is excluded as `EXCLUDED_MEDIA_NEWS_CHANNEL`.
- Homepage compatibility path re-buckets legacy HH `leaderboard.rows` while HH read API runtime still serves the legacy flat payload.

## Why the live compatibility path shows 17 official creators

Read-only live HH payload checked from:

```text
https://ops-bridge.call-score.com/api/read/home?period=all_time
```

The live endpoint still serves a legacy flat response rather than native bucket fields.
Compatibility bucketing of the 100 legacy rows produced:

| Bucket | Count |
| --- | ---: |
| officialRankedRows | 17 |
| provisionalRows | 29 |
| watchlistRows | 53 |
| staleRows | 0 |
| excludedRows | 1 |
| pendingMaturityRows | 0 |

Reason breakdown:

| Reason | Count |
| --- | ---: |
| official | 17 |
| provisional low sample | 29 |
| watchlist insufficient sample | 31 |
| watchlist zero calls | 22 |
| excluded media/news channel | 1 |

Official names under compatibility bucketing:

- Cilinix Crypto
- Crypto Rover
- CryptosRUs
- Lark Davis
- Discover Crypto
- Crypto Le Trone
- Crypto Banter
- Satoshi Stacker
- Crypto Capital Venture
- Austin Hilton
- DataDash
- The Moon Show
- Anthony Pompliano
- Miles Deutscher Finance
- The Wolf Of All Streets
- Ivan on Tech
- Michael Wrubel

Important examples reclassified out of official ranking:

- Alex Becker's Channel — 24 calls, legacy rank 1 -> provisional/low sample, not official.
- MoneyZG — 12 calls, legacy rank 2 -> provisional/low sample, not official.
- Crypto Inspector — 8 calls, legacy rank 3 -> watchlist/insufficient sample, not official.
- Altcoin Daily — 429 calls, legacy rank 19 -> excluded, not official.

Stale rows are 0 in this compatibility analysis because the legacy HH payload does not include `latest_video_date`. Native HH bucketed API must include freshness fields so stale gating can be certified at runtime.

## Mismatch matrix

| Surface | Current status | Mismatch / risk |
| --- | --- | --- |
| Public methodology page | Patched in this PR | Previously said “Avg Alpha across scored calls” and lacked creator bucket states, thresholds, 30d pending maturity, and lifecycle/value separation. |
| Scoring implementation | PARTIAL | 0–100 call score exists, but score status/value are still conflated in stored `calls.score` writer/count paths. |
| Creator stats writer | NOT CERTIFIED | Uses legacy thresholds and `alpha_score` naming; 30d source ranks can exist even though public 30d official ranking is disabled. |
| Read API safety layer | MERGED CODE / RUNTIME NOT NATIVE | Code supports buckets, but live HH endpoint still returns legacy flat rows until runtime update/restart/certification. |
| Homepage display contract | SAFE COMPATIBILITY PATH | Homepage re-buckets legacy rows and avoids unsafe official display; compatibility path must remain until native HH buckets are live. |
| Public copy | PATCHED LOCALLY | Now distinguishes Call Score from Creator Rank Score and states approval-gated v2 methodology limits. |

## Methodology v2 recommendation

Do not loosen thresholds to increase the creator count. Instead:

1. Add first-class call lifecycle/status at source:
   - `raw_candidate`
   - `confidence_pass`
   - `matched`
   - `pending_maturity`
   - `scored`
   - `excluded`
   - `invalid`
2. Separate score lifecycle from score value:
   - `score_status` determines denominator eligibility;
   - `score_value` is nullable until scored and can validly be `0`.
3. Formalize score-eligible call ownership:
   - creator-owned;
   - forward-looking;
   - timestamped;
   - supported asset/benchmark;
   - direction or measurable target;
   - confidence >= 0.70;
   - valid entry/outcome market data;
   - not news reporting, guest quote, aggregation, third-party prediction, retrospective claim, generic sentiment, joke/meme, or ambiguous ownership.
4. Align stats-writer eligibility with public safety:
   - all_time official: 50 calls;
   - 12m official: 25 calls;
   - 90d official: 25 calls unless an explicit lower threshold is approved;
   - 30d official: disabled until redesigned.
5. Replace raw/noisy creator averages with approval-gated rank score:

```text
sample_adjusted_score =
  (creator_raw_score * N + global_baseline_score * prior_N) / (N + prior_N)
```

Recommended composite:

- 45% sample-adjusted average Call Score
- 25% sample-adjusted BTC-relative alpha percentile
- 15% consistency
- 10% freshness
- 5% specificity quality

6. Keep 30d disabled until redesigned as “calls whose 30d outcome matured in the last 30 days”:

```sql
call_date >= now() - interval '60 days'
AND call_date < now() - interval '30 days'
```

## Approval-gated follow-ups

Explicit approval required before any of these:

- production schema migration for score lifecycle/status;
- production stats-writer formula/ranking changes;
- production stats recompute;
- production extraction rerun;
- HH read API restart;
- any change that re-enables 30d official ranking;
- any change that lowers official thresholds.

## Certification status

| Area | Status |
| --- | --- |
| Call scoring methodology | PARTIAL — implemented, now documented more accurately, lifecycle/value split pending. |
| Creator ranking methodology | PARTIAL — public/read/UI gates are strict; writer/source alignment pending. |
| 17 official creator result | ACCEPTABLE WITH PRODUCT COPY CHANGES. |
| Native HH read API bucket contract | MERGED CODE; RUNTIME NOT CERTIFIED. |
| Homepage compatibility bucketing | DEPLOYED / REPORTED SAFE; should remain until native HH buckets are live. |
| 30d methodology | APPROVAL-GATED; official ranking disabled. |
| Methodology v2 implementation | APPROVAL-GATED. |
