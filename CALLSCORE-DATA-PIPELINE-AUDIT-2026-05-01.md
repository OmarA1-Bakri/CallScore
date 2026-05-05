# CallScore Data Pipeline Audit — 2026-05-01

Generated: 2026-05-01 19:10 UTC
Database: Neon `neondb`
Production checked: `https://www.call-score.com`

## Executive summary

The production number is not wrong in the narrow technical sense: the public site is showing the number produced by the current public scoring definition. But the number is misleading relative to the amount of data we have.

Current production/public counts:

| Metric | Count |
|---|---:|
| Creators | 123 |
| Videos in DB | 13,157 |
| Videos in last 365 days | 7,790 |
| Videos with transcripts | 8,879 total / 3,524 in last 365 days |
| Videos marked extracted | 8,871 total / 3,516 in last 365 days |
| Raw extracted calls | 17,028 |
| Public scored calls | 46 |
| Ranked creators | 24 |
| Creators beating BTC | 5 |

Root cause of the tiny scored-call number:

1. 16,756 of 17,028 raw calls were created by the local keyword extractor with `extraction_confidence = 0.6`.
2. Public scoring excludes anything below `extraction_confidence >= 0.7`.
3. Therefore 98.4% of extracted calls are excluded before price/scoring logic even matters.
4. Only 272 calls are high-confidence LLM/model-extracted calls (`extraction_confidence = 1`).
5. Of those 272, only 46 currently satisfy the public scoring eligibility rules.

So the real problem is not “we only have 46 calls”. We have 17,028 raw calls. The problem is that almost all of them are low-confidence local regex/keyword calls and are intentionally excluded from public scoring.

## What counts as “scored” today

The public scoring eligibility is defined in `src/lib/public-methodology.ts`.

A call is public-scored only if all of this is true:

```sql
price_at_call IS NOT NULL
AND return_30d IS NOT NULL
AND price_30d IS NOT NULL
AND extraction_confidence >= 0.7
AND call_date <= NOW() - INTERVAL '30 days'
AND (
  target_price IS NULL
  OR (
    call_date <= NOW() - INTERVAL '90 days'
    AND price_90d IS NOT NULL
    AND hit_target IS NOT NULL
  )
)
```

The homepage/public count is defined in `src/lib/public-counts.ts`:

```sql
SELECT COALESCE(SUM(total_calls), 0)
FROM creator_stats
WHERE period = 'all_time'
```

`creator_stats.total_calls` is computed from the eligibility SQL above. So “scored calls” on the site means “public-score-eligible calls”, not “all extracted calls”.

## Pipeline map

Current pipeline stages:

1. Creator universe
   - Table: `creators`
   - Current count: 123

2. Video discovery
   - Table: `videos`
   - Script: `src/scripts/discover-videos-365.ts`
   - Inputs: creator YouTube handle/channel, 365-day window, explicit publication date required
   - Current count: 13,157 total videos; 7,790 in last 365 days

3. Transcript backfill
   - Table field: `videos.transcript`, `videos.transcript_quality`
   - Scripts: `scrape-transcripts-v2.ts`, Apify transcript backfills
   - Current count: 8,879 videos with transcript; 3,524 last-365 videos with transcript

4. Call extraction
   - Table: `calls`
   - Scripts:
     - `extract-calls-local.ts`: local keyword extractor; writes confidence 0.6
     - `extract-calls-openrouter.ts`: LLM extractor; current accepted calls are confidence 1
   - Current count: 17,028 raw calls

5. Price matching
   - Table fields on `calls`: `price_at_call`, `price_7d`, `price_30d`, `price_90d`, BTC benchmark prices, returns, alpha, hit_target
   - Script: `match-prices.ts`
   - Candle table: `candles`, estimated 33,676,240 rows

6. Public scoring/stat recomputation
   - Tables: `calls.score`, `creator_stats`
   - Script: `compute-scores.ts`
   - Library: `src/lib/recompute-stats.ts`
   - Current public scored calls: 46
   - Last score recompute: 2026-05-01 10:45:32–10:45:34 UTC

7. Production API/UI
   - API: `/api/leaderboard`
   - Production alias: `https://www.call-score.com`
   - Current production API reports 24 ranked creators, updated at 2026-05-01T10:45:32.765Z

## Stage-by-stage counts

### Videos

| Stage | Count |
|---|---:|
| Total videos | 13,157 |
| With `published_at` | 12,458 |
| Missing `published_at` | 699 |
| Last-365 videos | 7,790 |
| With transcript | 8,879 |
| Missing transcript | 4,278 |
| Extraction-eligible transcripts (`transcript_quality > 0.2`) | 8,878 |
| Low-quality transcript (`<= 0.2`) | 1 |
| Marked calls_extracted | 8,871 |
| Not marked calls_extracted | 4,286 |
| Eligible transcripts not extracted | 7 |
| Extracted videos with zero calls | 1,653 |
| Videos with at least one call | 7,218 |

Last-365 subset:

| Stage | Count |
|---|---:|
| Last-365 videos | 7,790 |
| Last-365 transcripts | 3,524 |
| Last-365 extraction-eligible transcripts | 3,523 |
| Last-365 extracted videos | 3,516 |
| Last-365 eligible transcripts pending extraction | 7 |

Important: transcript acquisition is the largest remaining inventory gap. Last-365 discovered video coverage is strong, but only 3,524 / 7,790 last-365 videos currently have transcripts. That leaves 4,266 last-365 videos without transcripts.

### Transcript quality

| Bucket | Videos |
|---|---:|
| Missing | 4,278 |
| <=0.2 | 1 |
| 0.2–0.5 | 149 |
| 0.5–0.8 | 1,209 |
| >=0.8 | 7,520 |

### Calls

| Stage | Count |
|---|---:|
| Total raw calls | 17,028 |
| Videos with calls | 7,218 |
| Creators with calls | 90 |
| Calls with confidence >= 0.7 | 272 |
| Calls with confidence < 0.7 | 16,756 |
| Calls with price_at_call | 11,558 |
| Calls missing price_at_call | 5,470 |
| Calls where 30d horizon has elapsed | 13,482 |
| Calls still within 30d horizon | 3,546 |
| Calls with 30d price + 30d return | 9,736 |
| Calls missing 30d price/return | 7,292 |
| Calls with target_price | 2,307 |
| Target calls pending/missing 90d target evaluation | 1,146 |
| Public scored eligible calls | 46 |
| Calls with score > 0 | 46 |

### Public score status breakdown

| Status | Calls |
|---|---:|
| Excluded: confidence < 0.7 | 16,756 |
| Pending: no price_at_call | 117 |
| Pending: 30d horizon not elapsed | 77 |
| Public scored eligible | 46 |
| Pending: missing 30d price/return | 19 |
| Pending: target 90d horizon not elapsed | 12 |
| Pending: target missing 90d price/hit_target | 1 |

The status breakdown is decisive: the confidence threshold is the dominant reason the public score is tiny.

## Extraction confidence audit

There are only two confidence values in the current calls table:

| extraction_confidence | Calls | Videos | Created range |
|---:|---:|---:|---|
| 0.6 | 16,756 | 6,977 | 2026-04-25 11:01:31 → 2026-04-25 11:34:50 UTC |
| 1.0 | 272 | 241 | 2026-04-28 14:05:19 → 2026-04-30 22:47:45 UTC |

This maps directly to the two extraction paths:

- `extract-calls-local.ts` hardcodes `extraction_confidence: 0.6`.
- `extract-calls-openrouter.ts`/LLM extraction produced accepted calls with confidence 1.0.

That means the big extraction run did produce volume, but it was local keyword-based volume. It was never eligible for public scoring under the current methodology.

If the confidence threshold alone were lowered or those calls were upgraded by validated re-extraction, 9,463 low-confidence calls already meet the non-confidence scoring requirements. Those span 24 creators. This is why the 46 number feels absurd: the data exists, but the public methodology gate excludes it.

## High-confidence calls audit

Only 272 high-confidence calls exist today.

Breakdown by status among high-confidence calls:

| Status | Calls |
|---|---:|
| Missing price_at_call | 117 |
| 30d horizon not elapsed | 77 |
| Scored | 46 |
| Missing 30d price/return after horizon elapsed | 19 |
| Target 90d horizon not elapsed | 12 |
| Target missing 90d/hit_target | 1 |

Breakdown by symbol:

| Symbol | High-conf calls | No price_at_call | Waiting 30d | Scored |
|---|---:|---:|---:|---:|
| BTCUSDT | 159 | 27 | 104 | 37 |
| ETHUSDT | 40 | 27 | 25 | 5 |
| XRPUSDT | 26 | 23 | 22 | 0 |
| SOLUSDT | 10 | 8 | 8 | 2 |
| TAOUSDT | 9 | 9 | 9 | 0 |
| BNBUSDT | 6 | 4 | 4 | 0 |
| DOGEUSDT | 5 | 5 | 5 | 0 |
| LINKUSDT | 4 | 2 | 2 | 1 |
| ADAUSDT | 3 | 3 | 2 | 0 |
| DOTUSDT | 3 | 3 | 3 | 0 |
| FETUSDT | 2 | 1 | 1 | 1 |
| XLMUSDT | 2 | 2 | 2 | 0 |
| PENDLEUSDT | 1 | 1 | 1 | 0 |
| SUIUSDT | 1 | 1 | 1 | 0 |
| AVAXUSDT | 1 | 1 | 1 | 0 |

The high-confidence calls are mostly very recent: created Apr 28–30. Many cannot score yet because the 30-day horizon has not elapsed. That part is expected. The larger issue inside high-confidence calls is missing `price_at_call` for non-BTC symbols and some BTC calls.

## Candle / price coverage audit

Estimated `candles` rows: 33,676,240.

Coverage by high-confidence called symbol:

| Symbol | Candle rows | First candle | Last candle |
|---|---:|---|---|
| BTCUSDT | 2,687,918 | 2021-03-01 | 2026-04-30 23:05 |
| ETHUSDT | 2,668,627 | 2021-03-01 | 2026-03-29 13:39 |
| ADAUSDT | 2,004,364 | 2022-06-01 | 2026-03-29 13:55 |
| AVAXUSDT | 2,004,375 | 2022-06-01 | 2026-03-29 13:55 |
| BNBUSDT | 2,004,363 | 2022-06-01 | 2026-03-29 13:53 |
| DOGEUSDT | 2,004,363 | 2022-06-01 | 2026-03-29 13:54 |
| DOTUSDT | 2,004,376 | 2022-06-01 | 2026-03-29 13:56 |
| FETUSDT | 2,011,786 | 2022-06-01 | 2026-03-29 19:15 |
| LINKUSDT | 2,268,694 | 2021-11-30 | 2026-03-29 13:57 |
| PENDLEUSDT | 1,440,491 | 2023-07-03 | 2026-03-30 03:00 |
| SOLUSDT | 2,011,462 | 2022-06-01 | 2026-03-29 13:40 |
| SUIUSDT | 1,528,124 | 2023-05-03 | 2026-03-30 00:39 |
| TAOUSDT | 1,032,916 | 2024-04-11 | 2026-03-29 19:15 |
| XRPUSDT | 2,004,389 | 2022-06-01 | 2026-03-29 14:20 |
| XLMUSDT | 0 | null | null |

Critical finding: BTC candles are current to Apr 30, but most non-BTC symbols stop around Mar 29/30. That explains why many recent non-BTC high-confidence calls have no `price_at_call` and cannot even enter the horizon pipeline.

So there are two independent blockers:

1. Extraction confidence excludes 16,756 raw calls.
2. Candle freshness/coverage blocks many high-confidence non-BTC calls from price matching.

## Creator-level view

Top public-scored creators:

| Creator | Videos | 365 videos | Transcripts | Extracted videos | Raw calls | Public scored |
|---|---:|---:|---:|---:|---:|---:|
| Altcoin Buzz | 164 | 164 | 123 | 123 | 95 | 7 |
| Coin Bureau | 302 | 302 | 136 | 136 | 108 | 6 |
| Anthony Pompliano | 200 | 200 | 162 | 162 | 144 | 4 |
| MMCrypto | 136 | 136 | 97 | 97 | 75 | 4 |
| Paul Barron Network | 189 | 189 | 150 | 150 | 132 | 2 |
| MoneyZG | 120 | 120 | 25 | 25 | 8 | 2 |
| Earn With Rk | 12 | 12 | 4 | 4 | 2 | 2 |
| JRNY Crypto | 16 | 15 | 3 | 3 | 2 | 2 |
| Brandon Kelly Crypto Trader | 3 | 3 | 2 | 2 | 2 | 2 |
| Wolf of All Streets | 156 | 155 | 155 | 155 | 126 | 1 |

Priority re-extraction candidates if we want to turn raw volume into public-scored data:

| Creator | Low-conf raw calls | Videos with low-conf calls | Low-conf calls that would score if confidence-qualified |
|---|---:|---:|---:|
| Altcoin Daily | 6,982 | 2,956 | 4,408 |
| Discover Crypto | 1,681 | 719 | 1,561 |
| Crypto Banter | 1,643 | 548 | 976 |
| CryptosRUs | 1,171 | 624 | 938 |
| Alex Becker | 631 | 156 | 365 |
| Miles Deutscher | 178 | 61 | 174 |
| Crypto Zombie | 134 | 59 | 134 |
| The Moon Carl | 159 | 69 | 121 |
| Sheldon Evans | 181 | 52 | 114 |
| Michael Wrubel | 124 | 52 | 104 |
| DataDash | 140 | 65 | 101 |
| Satoshi Stacker | 202 | 73 | 93 |

This is where the leverage is. Re-validating/re-extracting these with the LLM extractor will move the public scored count far more than discovering more videos.

## Production status

Production alias is wired to the populated DB and serving data.

Verified production endpoints:

- `https://www.call-score.com/api/leaderboard`
- `https://call-score.com/api/leaderboard`

Both report:

- ranked creators: 24
- updated_at: 2026-05-01T10:45:32.765Z

Production homepage is also rendering the dataset:

- creators tracked: 123
- ranked creators: 24
- scored calls: 46
- beating BTC: 5/24

If a browser/UI showed 45, that is likely a stale deploy/cache/client render issue. The database and API currently report 46.

## What we have

We have:

1. A real creator universe: 123 creators.
2. A large video inventory: 13,157 total videos, 7,790 in the last year.
3. A substantial transcript base: 8,879 transcripts total, 3,524 in last year.
4. A large raw call base: 17,028 extracted calls.
5. A working public site/API reading the production DB.
6. A scoring system that correctly enforces the current public eligibility criteria.
7. Candle data at meaningful scale: ~33.7M rows.
8. Current BTC candle coverage through Apr 30.

## What we do not have

We do not yet have:

1. Enough LLM-validated public-grade calls.
   - Only 272 calls are confidence >= 0.7.
   - 16,756 calls are local keyword extraction confidence 0.6 and excluded.

2. Fresh non-BTC candle data.
   - Most non-BTC symbols stop around Mar 29/30.
   - Recent non-BTC calls from Apr 27+ cannot price-match.

3. Complete transcript coverage.
   - 4,266 last-365 videos are missing transcripts.

4. Fully current extraction.
   - Only 7 eligible transcript videos are pending extraction right now, but the bigger issue is that existing extraction is mostly local low-confidence and needs LLM re-extraction/validation.

5. Enough elapsed horizon for newest high-confidence calls.
   - 77 high-confidence calls are too recent for 30d scoring.
   - 12 target-bearing high-confidence calls are too recent for 90d target evaluation.

6. A reliable public distinction between:
   - raw extracted calls,
   - public-score-eligible calls,
   - pending-horizon calls,
   - excluded-low-confidence calls.

The UI currently collapses this into “scored calls”, which hides the much larger raw pipeline state.

## Why “46 scored calls” is possible despite thousands of transcripts

Because the transcript-to-call pipeline succeeded mostly through the wrong extraction mode for public scoring.

The local extractor produced a lot of calls quickly:

- 16,756 calls
- 6,977 videos
- hardcoded confidence 0.6

But the public methodology requires >=0.7 confidence. So all 16,756 are excluded.

The LLM extractor produced much less volume so far:

- 272 high-confidence calls
- 241 videos

Then public scoring filters those 272 further:

- 77 are too recent for 30d scoring.
- 117 do not have price_at_call yet.
- 19 are missing 30d price/return after horizon elapsed.
- 13 are target/90d pending or missing.
- 46 score.

Therefore:

```text
17,028 raw calls
- 16,756 low-confidence local calls
= 272 high-confidence calls
- 226 pending/unpriceable/unelapsed high-confidence calls
= 46 public-scored calls
```

## Required next work

### Priority 1 — Re-extract or validate low-confidence calls with LLM

This is the main unlock.

Goal:

- Convert the highest-value low-confidence raw calls/videos into confidence >=0.7 calls, or replace them with audited LLM outputs.

Recommended sequence:

1. Start with creators that already have many low-confidence calls that otherwise meet scoring requirements:
   - Altcoin Daily
   - Discover Crypto
   - Crypto Banter
   - CryptosRUs
   - Alex Becker
   - Miles Deutscher
   - Crypto Zombie
   - The Moon Carl
   - Sheldon Evans
   - Michael Wrubel

2. Re-extract bounded batches using `extract-calls-openrouter.ts` or Ollama Cloud with `--write`, not local extraction.

3. After each batch:
   - run `match-prices.ts`
   - run `compute-scores.ts`
   - audit public counts

Important safety note: this is a writeback/model-quota operation. It should be approved and bounded per batch.

### Priority 2 — Refresh non-BTC candles

Most non-BTC symbols are stale at Mar 29/30. That blocks recent non-BTC price matching.

Need to backfill/refresh at least:

- ETHUSDT
- XRPUSDT
- SOLUSDT
- LINKUSDT
- ADAUSDT
- DOGEUSDT
- BNBUSDT
- TAOUSDT
- FETUSDT
- SUIUSDT
- PENDLEUSDT
- AVAXUSDT
- DOTUSDT
- XLMUSDT has zero candle rows but appears in high-confidence calls.

After refresh:

- run `match-prices.ts`
- run `compute-scores.ts`

### Priority 3 — Backfill missing transcripts

Last-365 gap:

- 7,790 videos discovered
- 3,524 transcripts acquired
- 4,266 missing transcripts

This is the biggest upstream data gap, but it is not the reason the public score is 46. The reason is extraction confidence. Transcript backfill matters for future coverage and scale.

Recommended approach:

- Continue Apify transcript backfill in bounded batches.
- Prioritize creators with high signal or high audience first.
- Keep exact `published_at` requirement intact.

### Priority 4 — Improve public reporting labels

The product should expose multiple counts instead of one ambiguous “scored calls” number.

Suggested UI/API metrics:

- Creators tracked: 123
- Videos discovered: 7,790 last 365d
- Transcripts collected: 3,524 last 365d
- Raw calls extracted: 17,028
- LLM-validated calls: 272
- Public scored calls: 46
- Pending 30d horizon: 77
- Excluded low-confidence: 16,756

This would prevent the “how is that possible?” reaction because the funnel becomes visible.

## Recommended operating plan

Safe, high-leverage plan:

1. Do not lower the confidence threshold just to inflate numbers.
   - That would turn noisy local regex calls into public rankings.
   - It would damage trust.

2. Do not rerun the full pipeline blindly.
   - The data exists.
   - The problem is quality gating and candle freshness.

3. First batch: LLM re-extract top creator subset.
   - Pick 100–250 videos from top priority creators whose low-confidence calls already have price/30d data.
   - Write results.
   - Match prices.
   - Recompute scores.
   - Compare public scored count and spot-check examples.

4. Parallel: refresh candle data for non-BTC symbols to current date.

5. Continue transcript backfill after the scoring bottleneck is moving.

## Audit artifacts

Raw audit outputs saved locally:

- `/tmp/callscore_pipeline_audit_fast.json`
- `/tmp/callscore_deep_counts.json`
- `/tmp/callscore_extra_counts.json`

This report file:

- `/mnt/c/Users/albak/xdev/crypto-tuber-ranked/CALLSCORE-DATA-PIPELINE-AUDIT-2026-05-01.md`
