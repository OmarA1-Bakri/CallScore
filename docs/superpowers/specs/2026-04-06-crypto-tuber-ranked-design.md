# CRYPTO-TUBER RANKED v2 - Design Specification

> Superseded infrastructure note (2026-06-07): this April design is retained
> for historical product context only. Its Vercel/Neon hosting and database
> assumptions are superseded by `docs/legacy-infra-superseded.md`: Netlify and
> call-score.com are canonical for hosting/scheduling, HH VM PostgreSQL/pgsql is
> primary storage, and Neon is backup/legacy compatibility only.

**Date:** 2026-04-06
**Status:** Approved (autonomous build)

## One-Line Summary

A website that tracks, ranks, and scores the top 20 crypto YouTube influencers by the actual accuracy of their altcoin calls — backtested against 2 years of real price data, with alpha-adjusted scoring that penalizes easy calls and rewards genuine market insight.

## The Hook

"Stop watching 20 YouTube channels. We watch them for you and tell you who actually beats the market."

## Key Improvements Over v1 Spec

### 1. Alpha Score System (replaces simple win/loss)

Every call is scored on a 0-100 scale with five weighted components:

| Component | Max Points | What It Measures |
|-----------|-----------|-----------------|
| Direction Correct (30d) | 40 | Was the directional call right? |
| Alpha Over BTC (30d) | 25 | Did the coin outperform just holding BTC? |
| Specificity Bonus | 15 | Did they give entry/target/stop/timeframe? |
| Regime Difficulty | 10 | How hard was this call given market conditions? |
| Target Hit | 10 | Did price reach their stated target? |

**Why alpha matters:** Anyone can say "bullish" in a bull market. The alpha component (excess return over BTC) separates real insight from market-riding. A bullish SOL call that returns +20% when BTC returned +18% scores much less alpha than one where BTC returned +2%.

**Why regime difficulty matters:** We have 7 market regime classifications (Strong Bull through Crash) on every candle in our database. A bullish call during a Crash (regime 6) is regime_difficulty=1.0, while the same call during Strong Bull (regime 0) is only 0.1. This rewards contrarian insight.

### 2. Dynamic Tier Gating

Tiers are determined by actual ranking, not arbitrary assignment:
- **Elite ($99/mo):** Top 5 creators by Alpha Score
- **Pro ($50/mo):** Creators ranked 6-10
- **Free ($0):** Creators ranked 11-20

As rankings shift, which creators are gated shifts too. This creates FOMO and incentivizes upgrades when a creator's ranking improves.

### 3. Multi-Pass AI Extraction

Two-pass extraction using Claude API reduces false positives:
- **Pass 1:** Identify all coin mentions + surrounding context. Fast, broad sweep.
- **Pass 2:** For each identified mention, classify as actionable call vs commentary and extract structured data. Slow, precise.

Each extraction gets a confidence score (0-1). Only calls with confidence >= 0.7 are stored.

### 4. Consensus Signals (Elite Feature)

When 3+ top-10 creators make the same directional call on the same coin within a 7-day window, a "Consensus Signal" is generated. Historical consensus accuracy is tracked. Elite subscribers get these signals.

## Architecture

```
YouTube --> yt-dlp (transcripts) --> Claude API (2-pass extraction) --> HH pgsql primary (price matching) --> Scoring Engine --> Next.js Frontend
                                                                                                                          |
                                                                                                                     Whop (payments)
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend/API | Next.js API Routes |
| Database | Superseded: originally Neon PostgreSQL. Current canonical primary is HH VM PostgreSQL/pgsql; Neon is backup/legacy compatibility only. |
| Transcript extraction | yt-dlp (Python CLI, called from Node) |
| AI call extraction | Claude API (Anthropic SDK) |
| Charts | Recharts |
| Payments & access | Whop SDK |
| Hosting | Superseded: originally Vercel. Current canonical host is Netlify for `call-score.com`. |
| Automation | Superseded: originally Vercel Cron + Rube recipes. Current canonical scheduler is Netlify plus Hermes/Hetzner worker. |

## Database Schema

### Existing: `candles` table
- 18.7M 1-minute candles across 18 pairs
- ~2 years of history per symbol
- Includes regime classification (0-6) and confidence

### New Tables
- `creators` — 20 YouTubers with computed alpha_score and rank
- `videos` — scraped transcripts with quality score
- `calls` — extracted predictions with full price/alpha/score data
- `creator_stats` — precomputed leaderboard data per period
- `consensus_signals` — multi-creator convergence events

See `schema.sql` for full DDL.

## Scoring Formula

### Per-Call Alpha Score (0-100)

```
score = direction_points + alpha_points + specificity_points + regime_points + target_points
```

- `direction_points`: 40 if correct direction at 30d, else 0
- `alpha_points`: min(25, max(0, alpha_30d * 2.5)) — 1% alpha = 2.5pts
- `specificity_points`: specificity_score * 15 — 0.25 per component (entry/target/stop/timeframe)
- `regime_points`: regime_difficulty * 10 — based on direction vs market regime
- `target_points`: 10 if stated target was hit, else 0

### Creator Alpha Score (aggregate)

Average of all individual call alpha scores, used for ranking.

## Pages & Access

| Route | Description | Access |
|-------|------------|--------|
| `/` | Leaderboard — all 20 ranked by Alpha Score | Public (stats blurred for gated tiers) |
| `/creator/[handle]` | Creator profile + call history | Free: rank 11-20, Pro: 6-10, Elite: 1-5 |
| `/call/[id]` | Individual call detail | Same tier gating as creator |
| `/pricing` | Pricing with Whop checkout | Public |

## Frontend Design

- Dark theme (#0a0a0f background)
- Gold (#F7B731) accent for rankings and scores
- Green (#26de81) for wins, red (#fc5c65) for losses
- Clean, data-dense layout
- Mobile responsive
- ISR for dynamic data, SSG where possible

## The 20 Creators

Initial list of 20 crypto YouTubers (see seed script). Initial tier placement is arbitrary — after first backtest run, rankings determine tiers automatically.

## Data Pipeline (Daily)

1. Check each creator for new videos since last scrape
2. Download transcripts via yt-dlp
3. Run 2-pass AI extraction on new transcripts
4. Match extracted calls against candle price data
5. Compute Alpha Scores for all calls
6. Recompute creator aggregate stats and rankings
7. Detect new consensus signals
8. Update creator tiers based on new rankings

## Monetization

| Tier | Price | Access |
|------|-------|--------|
| Free | $0 | Creators ranked 11-20 (full stats) |
| Pro | $50/mo | + Creators ranked 6-10 |
| Elite | $99/mo | + Creators ranked 1-5 + Consensus Signals |

## Success Metrics

- Week 1: Pipeline works end-to-end for 1 creator
- Week 2: All 20 creators backtested, leaderboard live
- Week 3: Whop integration, first paying users
- Month 1: 100 free / 10 Pro / 5 Elite = ~$1,000 MRR

## Disclaimer

The site must include: "This is not financial advice. Past performance does not guarantee future results. CRYPTO-TUBER RANKED tracks public predictions for informational purposes only."
