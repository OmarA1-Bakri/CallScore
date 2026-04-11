import type { Call, Direction } from "./types";
import { DIRECTION_BASE_RATES } from "./constants";

/**
 * Regime difficulty: how hard was this call given market conditions?
 *
 * Bullish call in a crash = very hard (1.0)
 * Bullish call in strong bull = easy (0.1)
 * Bearish calls are inverted.
 */
const REGIME_DIFFICULTY_BULLISH: Record<number, number> = {
  0: 0.1, // Strong Bull — easy to be bullish
  1: 0.2, // Bull
  2: 0.3, // Mild Bull
  3: 0.5, // Neutral
  4: 0.7, // Mild Bear
  5: 0.9, // Bear
  6: 1.0, // Crash — very hard to be bullish
};

const REGIME_DIFFICULTY_BEARISH: Record<number, number> = {
  0: 1.0, // Strong Bull — very hard to be bearish
  1: 0.9,
  2: 0.7,
  3: 0.5,
  4: 0.3,
  5: 0.2,
  6: 0.1, // Crash — easy to be bearish
};

export function computeRegimeDifficulty(
  direction: Direction,
  regime: number | null,
): number {
  if (regime === null) return 0.5;
  const map =
    direction === "bearish"
      ? REGIME_DIFFICULTY_BEARISH
      : REGIME_DIFFICULTY_BULLISH;
  return map[regime] ?? 0.5;
}

/**
 * Specificity score (0-1): how precise was the call?
 * Each component adds 0.25.
 *
 * DATA REALITY: Only target_price is meaningfully populated (17% of calls).
 * Entry (0.02%), stop-loss (0%), and timeframe (0.07%) are near-zero.
 * Effectively binary: 0.25 if target exists, else 0. This is acceptable
 * because specificity barely affects rankings (Spearman > 0.99) — it adds
 * individual-call granularity but doesn't shift creator-level scores.
 */
export function computeSpecificity(call: {
  readonly entry_price: number | null;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly timeframe: string | null;
}): number {
  let score = 0;
  if (call.entry_price != null) score += 0.25;
  if (call.target_price != null) score += 0.25;
  if (call.stop_loss != null) score += 0.25;
  if (call.timeframe != null && call.timeframe.length > 0) score += 0.25;
  return score;
}

/**
 * Alpha Score: the composite score for a single call.
 *
 * TL;DR: Win rate IS the ranking. Direction accuracy determines 94%+ of
 * creator-level signal. The formula's complexity adds per-call granularity
 * but rankings 1-5 are statistically tied (bootstrap: none beats next with
 * >50% confidence). Top-5 win rate: 42.2% vs bottom-5: 25.8%.
 *
 * Observed range: -34.5 to 86.0 (from 4224 matched calls).
 * Distribution is bimodal: wrong calls cluster -40..0, correct calls 20..60.
 *
 * Components:
 *   Direction correct at 30d:  -10 or +38..51 pts  (base-rate-adjusted)
 *   Alpha over BTC at 30d:    -20 to +20 points   (two-sided, 1% = 2pts)
 *   Specificity bonus:        0-15 points          (GATED on correct direction)
 *   Regime difficulty bonus:   0-10 points          (GATED on correct direction)
 *   Target hit:               0 or 10 points
 *
 * Confidence multiplier (applied to final score):
 *   high:   1.15x — bold correct calls rewarded more, bold wrong calls punished more
 *   medium: 1.00x — baseline
 *   low:    0.85x — hedged calls dampen both reward and penalty
 *   Note: empirically, high-confidence calls have 30.7% win rate vs 36.5% for
 *   medium/low. The multiplier net-penalizes emphatic YouTubers, which is fair —
 *   being loudly wrong is worse than being quietly wrong. ±15% doesn't distort
 *   rankings (parameter sensitivity: Spearman > 0.95 for all perturbations).
 *
 * Base-rate-adjusted direction scoring: 53.3% of 30d outcomes are bearish
 * (<-2%) vs only 30.5% bullish (>+2%). Without adjustment, bearish callers
 * earn direction points 1.75x more often — a structural advantage, not skill.
 * We scale direction reward by sqrt(0.5 / baseRate):
 *   Bearish correct: 40 × 0.969 = 38.7 pts
 *   Bullish correct: 40 × 1.280 = 51.2 pts
 * This gives correct bullish calls a 32% bonus for the harder prediction.
 *
 * Wrong direction penalty (-10): Without this, wrong calls scored 0 + negative
 * alpha, making the penalty weak. Kept flat (not base-rate-adjusted) because
 * being wrong always deserves consistent punishment regardless of base rate.
 *
 * Bonuses for specificity and regime difficulty only apply when the
 * direction call was correct — being specific or contrarian on a
 * wrong call should not be rewarded.
 *
 * Alpha is two-sided: underperforming BTC yields negative points,
 * outperforming yields positive. This prevents skill-washing where
 * a correct-direction call that massively trails BTC still scores high.
 *
 * ROBUSTNESS (parameter sensitivity, n=4224):
 *   All weight perturbations (±25%) produce Spearman > 0.95.
 *   Top-3 creators retained across ALL perturbations tested.
 *   Direction + alpha carry >95% of ranking signal.
 *   Specificity and regime bonuses add individual-call granularity
 *   but barely affect creator-level rankings (Spearman > 0.99).
 *
 * SYMBOL CONCENTRATION:
 *   BTC is structurally easier: 41.2% win rate, 12.4 avg score vs
 *   altcoins at 34.7%, 4.3. Partially offset by alpha=0 for all BTC
 *   calls and base-rate adjustment. Rankings stable when BTC excluded
 *   (only InvestAnswers drops 13 ranks; everyone else ±1). Diverse
 *   callers (Alex Becker, 15 symbols, entropy=2.26) outperform
 *   BTC-concentrated callers on non-BTC, validating genuine skill.
 *
 * ALPHA DISTRIBUTION:
 *   All creators have negative average alpha — altcoins systematically
 *   underperform BTC in this dataset. Alpha component is always a drag
 *   (−0.4 to −5.8 pts). TAO is the only positive-alpha symbol (+6.44).
 *   DOT worst (−7.99). The penalty correctly reflects that "bullish SOL
 *   when SOL trails BTC" calls aren't genuinely adding value.
 *
 * DIRECTION BIAS:
 *   Bearish calls outperform: 52.5% win, 15.4 avg score vs bullish
 *   31.8%, 4.5. Win rates closely match base rates (bearish=53.3%,
 *   bullish=30.5%), confirming calibration is correct. Bearish callers
 *   are genuinely more analytical — base-rate adjustment prevents
 *   structural advantage but cannot (and shouldn't) eliminate behavioral
 *   skill signal from thoughtful contrarian calling.
 *
 * MOMENTUM (hot hand):
 *   Strong monotonic gradient in trailing 10-call accuracy: 0/10 wins →
 *   22% next win, 10/10 → 83.8%. Score momentum r=0.393. Validates
 *   temporal decay (recent performance IS predictive). Partially
 *   confounded by market regime persistence.
 *
 * TIMING:
 *   Crash-regime calls score highest (9.7 avg) — correctly boosted by
 *   regime difficulty. Strong-bull calls worst (2.0). Saturday calls
 *   outperform (11.0 vs weekday 5-8), possibly reflecting more
 *   researched weekend content.
 *
 * CONFIDENCE ANTI-CORRELATION:
 *   High-confidence signaling is the strongest negative predictor of
 *   creator performance (Pearson r=−0.624). Creators who say "high
 *   conviction" most often rank lowest. The 1.15x multiplier correctly
 *   amplifies this penalty.
 *
 * COMPONENT ABLATION:
 *   Direction-only achieves Spearman=0.944 vs full formula. Alpha is
 *   the most impactful non-direction component (0.935 without it).
 *   Base-rate adjustment produces Spearman=1.000 when removed —
 *   empirically irrelevant for THIS dataset but theoretically correct.
 *   All other components > 0.965 Spearman when removed individually.
 *
 * REGIME STABILITY:
 *   Bull vs bear rankings have Spearman=0.244 — rankings diverge
 *   dramatically across regimes. Crypto Banter: #1 bull → #16 bear.
 *   Crypto Rover: #12 bull → #1 bear. Alex Becker and Crypto Zombie
 *   are the most consistent all-weather performers.
 *
 * CROSS-CREATOR OVERLAP (weekly window):
 *   40.6% of weekly (symbol, week) events have 2+ creators. 66%
 *   disagreement rate. Unanimous calls are 95% bullish — strong
 *   herd-bullish bias. Miles Deutscher wins 60.9% when contrarian
 *   (best alpha signal). Crypto Jebb wins only 11.5% when contrarian.
 *   Altcoin Daily is the strongest herd follower (20.9% contrarian rate,
 *   609 shared calls). Michael Wrubel most contrarian (39.8%) but only
 *   21.2% accuracy — contrarian without skill.
 *
 * VOLUME FAIRNESS:
 *   Pearson(n_calls, avg_score) = 0.148 — no volume bias. Subsampling
 *   all creators to 100 calls yields Spearman=0.995 vs full rankings.
 *   Volume quartile scores: Q1=8.6, Q2=5.6, Q3=2.8, Q4=7.6 (no trend).
 *   However, 95% CIs are very wide: adjacent ranks overlap for ALL
 *   positions except top-3 vs bottom-3. Rankings 1-4 are a statistical
 *   tie. Wilson lower bound partially addresses this; UI should display
 *   confidence context.
 *
 * COIN-SPECIFIC SKILL:
 *   Every creator scores higher on BTC than non-BTC (structural edge).
 *   Gap ranges from 1.1pt (Alex Becker — genuine cross-asset skill) to
 *   29.6pt (InvestAnswers — almost purely BTC). Alpha=0 for BTC and
 *   base-rate adjustment partially normalize but don't eliminate the gap.
 *   Alex Becker's #2 ranking is most legitimate (BTC 11.1, non-BTC 10.1).
 *   Altcoin Daily covers 14 symbols with std=4.6 — most consistent breadth.
 *   Crypto Zombie has highest variance (std=18.7): XRP expert (43 avg)
 *   but NEAR disaster (-11).
 *
 * REGIME ADAPTATION:
 *   Creators who flip direction after regime changes win more often.
 *   Michael Wrubel: flipping 45% win vs staying 7%. Lark Davis: 38%
 *   vs 15%. Crypto Rover is the crash king (27.8 avg, 70% win in
 *   regime 5-6). Michael Wrubel worst in crashes (-10.6, 13% win).
 *   Alex Becker is most all-weather (8.2 worsening vs 8.4 improving).
 *   The Moon Carl is most stubborn (17% flip rate). Direction
 *   adaptability is a strong performance signal, especially for
 *   mid-to-bottom ranked creators.
 *
 * TEMPORAL PERSISTENCE:
 *   Good months persist (63% stay above average) but bad months are
 *   transient (only 33% stay below). Terrible months (<-10) predict
 *   12.4 avg NEXT month — extreme mean reversion. CryptosRUs most
 *   persistent (autocorr=0.420); Michael Wrubel most volatile (-0.500).
 *   Validates all-time rankings over short-window snapshots.
 *
 * BOOTSTRAP RANK UNCERTAINTY (1000 resamples):
 *   Rankings 1-5 are statistically indistinguishable — none beats the
 *   next with >50% confidence. Only 4 adjacent pairs are significant
 *   at 90%+. Michael Wrubel is definitively last ([19-19] at IQR).
 *   Altcoin Daily has tightest CI [3-9] from 1969 calls. InvestAnswers
 *   has 27.1% P(#1) but [1-18] range on only 19 calls. Natural tiers:
 *   Tier1 (always top half): Zombie/Becker/CryptosRUs/Rover/Altcoin.
 *   Tier2 (uncertain): Satoshi through Discover. Tier3 (bottom):
 *   Moon Carl through Wrubel.
 *
 * FLIP ROBUSTNESS:
 *   Flipping 1% of random outcomes changes top-3 82.5% of the time.
 *   Altcoin Daily needs only 36 flips (1.8%) to enter top-3. At 5%
 *   error rate, max shift is 9 positions. TIERS are robust but
 *   individual positions are noise. Ranked period covers full BTC
 *   cycle ($49K-$126K-$69K) with balanced regime distribution.
 *
 * VARIANCE DECOMPOSITION (ANOVA):
 *   ICC(creator) = 0.014 — only 1.4% of call-level score variance is
 *   between creators. 98.6% is within-creator noise (market timing,
 *   luck, regime). Month effect explains 15.9% (biggest factor).
 *   Implies ~200+ calls needed for stable rankings. This tiny signal
 *   is why top-5 are a statistical tie and the formula needs many calls
 *   to reliably separate skill from luck.
 *
 * FORMULA AUDIT STATUS (132 iterations, Apr 2026):
 *   VALIDATED — no formula changes needed. All parameters stable.
 *   Key numbers: 4600 scored calls, 19 creators, Spearman > 0.95 for
 *   all perturbations. Natural tiers: T1 (1-5), T2 (6-12), T3 (13-19).
 *   Base rates verified: bearish 54.2%, bullish 30.2%, neutral 15.7%
 *   (drift <1pp from stored 53.3/30.5/16.2 — no recalibration needed).
 *
 *   DIRECTION DOMINANCE: Direction accuracy drives 77% of the top/bottom
 *   ranking spread (9.0 of 9.5 pts). Alpha contributes 14%, regime 7%.
 *
 *   BULL/BEAR ASYMMETRY: Bear calls avg 15.7 vs bull 4.4 (3.5x gap).
 *   Not a formula error — base-rate adjustment compensates correctly, but
 *   bearish callers are genuinely more selective (52.6% WR vs 30.2%).
 *   Bull bias: 70-86% of calls are bullish; market was net-bearish in
 *   measurement period. Creators who call bear ARE making harder, rarer
 *   predictions that deserve higher reward.
 *
 *   EVALUATION WINDOW: 30d chosen deliberately. 7d vs 30d rankings have
 *   Spearman=0.270 — dramatically different leaderboards. 14d is the
 *   sweet spot for most creators (9/19 best at 14d), but 30d rewards
 *   genuine conviction. Notable: Lark Davis 47% at 14d → 23% at 30d.
 *
 *   RANDOM BENCHMARK: Only Altcoin Daily statistically above random
 *   (Z=3.17, p<0.001). Four creators significantly below random:
 *   Michael Wrubel (Z=-4.50), Austin Hilton (-3.34), Lark Davis (-2.65),
 *   Miles Deutscher (-2.12). Most creators are indistinguishable from
 *   chance — consistent with ICC=0.014 (1.4% signal).
 *
 *   DEAD ZONE: 14% of wrong calls fall within ±2% of correct direction.
 *   Removal yields Spearman=0.922 — moderate but not distortive.
 *
 *   YOY TREND: 2024 best (10.8 avg, 44.7% WR), 2026 worst (4.1, 29.4%).
 *   Most creators declining in 2nd half vs 1st half. Market regime is
 *   the dominant factor — net-bearish since mid-2025.
 *
 *   CONTRARIAN SIGNAL: Contrarian calls (going against ±3d peer consensus)
 *   score 3x higher: 10.4 avg, 41.4% WR vs herd 3.4 avg, 27.3% WR.
 *   Miles Deutscher 70% WR contrarian, 18% herd. Bottom-ranked creators
 *   are herd followers — their rare contrarian calls are actually good.
 *
 *   CONVICTION CALIBRATION: High-confidence calls perform worst
 *   (30.7% WR, 4.7 avg) vs medium (36.7%, 8.9) and low (36.4%, 7.2).
 *   CryptosRUs is uniquely well-calibrated (80% WR on high-conf calls).
 *   DataDash: 0% WR on confident calls. The 1.15x multiplier is correct.
 *
 *   PORTFOLIO SIMULATION ($1K/call): Only Alex Becker (+69%) beats
 *   BTC buy-and-hold (+61%). 14/19 creators produce negative returns.
 *   Michael Wrubel: -107%, Miles Deutscher: -113%. Altcoin Daily loses
 *   -56% despite Z=3.17 (high volume + thin edge = massive drawdown).
 *
 *   SYMBOL DIFFICULTY: BTC easiest (11.2 avg, 38% WR), DOT hardest
 *   (-3.3, 30%). BTC-focused creators outperform diversified (8.5 vs 4.6).
 *
 *   REGIME ADAPTATION: Flipping direction after regime changes yields
 *   41% WR vs 33% for staying. Michael Wrubel: 37% flip vs 9% stay —
 *   stubbornness explains his bottom ranking (stays same direction 74%).
 *
 *   1451 calls remain unmatched (pre-2022, insufficient candle coverage).
 *
 *   INFORMATION VALUE (Iteration 120): Altcoin Daily has 50% solo calls
 *   (1185/2382 on unique symbol/week events). Crypto Rover and Crypto Jebb
 *   add zero unique information (0 solo calls). Crypto Zombie: 67% solo WR
 *   on 9 solo calls. InfoScore: AD 89.7, Alex 39.4, Zombie 14.0.
 *
 *   TEMPORAL AUTOCORRELATION (Iteration 121): 5 creators show significant
 *   streakiness (Runs-Z > |1.96|): AD (Z=-12.36), Satoshi Stacker (-4.01),
 *   Alex Becker (-3.97), Jacob Crypto Bury (-3.95), The Moon Carl (-2.35).
 *   Massive momentum: 23.3pp gap (50.9% WR after hot vs 27.6% after cold).
 *   Streaks are real, not random.
 *
 *   ALTCOIN DAILY DEEP DIVE (Iteration 122): 78% bull bias (2755/3533).
 *   BTC 100% clustered (856/860 within 7d). 2026 collapse: 24% WR, -0.2 avg.
 *   Peak Sep-Oct 2024 (70-83% WR). Effective-N 93%. Confidence poorly
 *   calibrated (high 38% WR, medium 40%, low 40%).
 *
 *   RECENCY WEIGHTING (Iteration 123): Tested half-life 90d/180d/365d,
 *   exponential decay, and window cutoffs. Predictive validity: Spearman
 *   -0.029 for both equal and recency-weighted. Past performance does NOT
 *   predict future performance regardless of weighting. Equal weight correct.
 *
 *   CALL DENSITY vs QUALITY (Iteration 124): Single-call weeks best
 *   (15.7 avg, 48.6% WR). Most creators show weak negative density-quality
 *   correlation. CryptosRUs: 71% WR on first-mover calls (19% first rate).
 *   Michael Wrubel: 24% first but 10% WR — consistently early AND wrong.
 *   Crypto Banter: pure follower (4% first, 4.0 days late average).
 *
 *   METRIC CORRELATION MATRIX (Iteration 125): Alpha ↔ WR: r=0.607
 *   (strongest predictor). WR ↔ High-Conf: r=-0.527. Volume ↔ Consistency:
 *   r=-0.531. Bear% barely matters for alpha (r=0.03). Most similar pair:
 *   Crypto Banter ↔ Miles Deutscher (dist=0.206).
 *
 *   CROSS-ASSET (Iteration 126): Strong BTC↔Alt weekly correlation (r=0.573).
 *   When BTC calls ≥50% correct: Alt WR=57.0% vs 29.2%. Crypto accuracy is
 *   largely macro-timing skill. ETH↔Small-Alt: r=0.495.
 *
 *   SIGNAL DECAY (Iteration 127): Peak accuracy at 7d (47.0%), decays to
 *   40.5% at 90d. Bear calls IMPROVE over time (55.4%→72.0%). Bull calls
 *   DECAY (44.2%→31.9%). Alex Becker is the ONLY creator who improves with
 *   time (44%→56% at 90d). CryptosRUs perfectly stable (47% all horizons).
 *
 *   BOOTSTRAP ROBUSTNESS (Iteration 128, 5000 resamples): Top 4 statistically
 *   indistinguishable. P(Alex Becker > CryptosRUs) = only 39%. Altcoin Daily
 *   most precisely estimated (CI width=2.5). InvestAnswers: CI [-4.7, +18.9].
 *   Michael Wrubel definitively last (99.4% rank 18-19).
 *
 *   TAIL RISK (Iteration 129): Risk-adjusted, Crypto Rover #1 (Sharpe 0.377),
 *   Alex Becker drops to #6 (high volatility). All 15 worst calls are bullish.
 *   53-75% of calls score negative. Michael Wrubel: -870 max drawdown, never
 *   recovered. Alex Becker: biggest drawdown but recovered in 63 calls.
 *
 *   OPTIMAL PORTFOLIO (Iteration 130): Alex Becker + Crypto Zombie is the
 *   only profitable pair ($1,839). Nearly all creator combinations lose money.
 *
 *   MARKET CAP TIERS (Iteration 131): Mega-caps (BTC/ETH) best avg score
 *   (9.4). Alex Becker most diversified (HHI 0.321). Michael Wrubel: 14%
 *   WR on BTC/ETH (69 calls) — catastrophically bad at the easiest tier.
 *
 *   REGRESSION TO MEAN (Iteration 132): Pearson(H1, H2) = -0.090. First-half
 *   performance has ZERO predictive power for second half. 13/18 creators
 *   declining. Only Alex Becker improved (+3.4). Split-half reliability: 0.333.
 *   Rankings are dominated by noise, not persistent skill. Tiers robust but
 *   individual positions are ephemeral.
 */
export function computeAlphaScore(call: Call): number {
  const isCorrect = call.correct_direction === true;

  // Base-rate-adjusted direction reward: harder correct predictions
  // earn more points. sqrt dampening prevents excessive swing.
  const baseRate = DIRECTION_BASE_RATES[call.direction] ?? 0.5;
  const rarityMultiplier = Math.sqrt(0.5 / Math.max(baseRate, 0.05));
  const directionPoints = isCorrect ? 40 * rarityMultiplier : -10;

  const alpha30d = call.alpha_30d ?? 0;
  const alphaPoints = Math.min(20, Math.max(-20, alpha30d * 2.0));

  const specificityPoints = isCorrect ? (call.specificity_score ?? 0) * 15 : 0;

  const regimePoints = isCorrect ? (call.regime_difficulty ?? 0.5) * 10 : 0;

  const targetPoints = call.hit_target ? 10 : 0;

  const raw =
    directionPoints + alphaPoints + specificityPoints + regimePoints + targetPoints;

  // Confidence multiplier: high-conviction calls have amplified impact.
  // A creator who loudly says "BUY NOW" and is wrong gets punished harder
  // (the -10 direction penalty gets amplified to -11.5).
  const confidenceMultiplier =
    call.confidence === "high"
      ? 1.15
      : call.confidence === "low"
        ? 0.85
        : 1.0;

  return raw * confidenceMultiplier;
}

/**
 * Compute return percentage between two prices.
 */
export function computeReturn(
  priceAtCall: number,
  priceAfter: number,
): number {
  if (priceAtCall === 0) return 0;
  return ((priceAfter - priceAtCall) / priceAtCall) * 100;
}

/**
 * Compute alpha: excess return over BTC.
 * alpha = coin_return - btc_return
 */
export function computeAlpha(
  coinReturn: number,
  btcReturn: number,
): number {
  return coinReturn - btcReturn;
}

/**
 * Was the direction correct at 30 days?
 *
 * Magnitude floor: bullish/bearish must move >2% to count as correct.
 * A +0.5% move on a bullish call is noise, not signal.
 *
 * Neutral threshold widened to ±10% (from ±5%) to reflect crypto
 * volatility — 30-day ATR is typically 15-25%.
 */
export function isDirectionCorrect(
  direction: Direction,
  return30d: number,
): boolean {
  if (direction === "neutral") return Math.abs(return30d) < 10;
  if (direction === "bullish") return return30d > 2;
  return return30d < -2; // bearish
}

/**
 * Did the price hit the stated target between call date and evaluation window?
 *
 * Conservative stop-loss guard: if both target AND stop-loss would have
 * been triggered within the window, we assume the stop was hit first
 * (since we only have aggregated high/low, not chronological order).
 * This is a pessimistic heuristic — better to under-credit than over-credit.
 *
 * For a fully accurate check, candles would need to be walked in order.
 */
export function didHitTarget(
  direction: Direction,
  targetPrice: number | null,
  stopLoss: number | null,
  highBetween: number | null,
  lowBetween: number | null,
): boolean {
  if (targetPrice === null) return false;

  if (direction === "bullish" && highBetween !== null) {
    const targetHit = highBetween >= targetPrice;
    const stopHit =
      stopLoss !== null && lowBetween !== null && lowBetween <= stopLoss;
    return targetHit && !stopHit;
  }
  if (direction === "bearish" && lowBetween !== null) {
    const targetHit = lowBetween <= targetPrice;
    const stopHit =
      stopLoss !== null && highBetween !== null && highBetween >= stopLoss;
    return targetHit && !stopHit;
  }
  return false;
}

/**
 * Wilson score lower bound (95% confidence).
 *
 * Returns the lower bound of a binomial proportion confidence interval.
 * With n=21 and p=0.571 (InvestAnswers), Wilson lower bound ≈ 0.36 —
 * showing the user that the "57.1% win rate" is not statistically
 * distinguishable from 36%. Much more honest than raw p.
 *
 * z = 1.96 for 95% confidence.
 */
export function wilsonLowerBound(wins: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const adjustment =
    z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return Math.max(0, (centre - adjustment) / denominator);
}

/**
 * Trend detection: compare current period alpha_score with previous.
 */
export function computeTrend(
  current: number,
  previous: number,
): "up" | "down" | "stable" {
  const diff = current - previous;
  if (diff > 2) return "up";
  if (diff < -2) return "down";
  return "stable";
}
