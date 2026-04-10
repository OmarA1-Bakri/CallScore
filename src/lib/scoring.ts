import type { Call, Direction } from "./types";

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
 * Components (range: ~-30 to ~120):
 *   Direction correct at 30d:  0 or 40 points
 *   Alpha over BTC at 30d:    -25 to +25 points (two-sided, 1% = 2.5pts)
 *   Specificity bonus:        0-15 points  (GATED on correct direction)
 *   Regime difficulty bonus:   0-10 points  (GATED on correct direction)
 *   Target hit:               0 or 10 points
 *
 * Confidence multiplier (applied to final score):
 *   high:   1.15x — bold correct calls rewarded more, bold wrong calls punished more
 *   medium: 1.00x — baseline
 *   low:    0.85x — hedged calls dampen both reward and penalty
 *
 * Bonuses for specificity and regime difficulty only apply when the
 * direction call was correct — being specific or contrarian on a
 * wrong call should not be rewarded.
 *
 * Alpha is two-sided: underperforming BTC yields negative points,
 * outperforming yields positive. This prevents skill-washing where
 * a correct-direction call that massively trails BTC still scores high.
 */
export function computeAlphaScore(call: Call): number {
  const isCorrect = call.correct_direction === true;

  const directionPoints = isCorrect ? 40 : 0;

  const alpha30d = call.alpha_30d ?? 0;
  const alphaPoints = Math.min(25, Math.max(-25, alpha30d * 2.5));

  const specificityPoints = isCorrect ? (call.specificity_score ?? 0) * 15 : 0;

  const regimePoints = isCorrect ? (call.regime_difficulty ?? 0.5) * 10 : 0;

  const targetPoints = call.hit_target ? 10 : 0;

  const raw =
    directionPoints + alphaPoints + specificityPoints + regimePoints + targetPoints;

  // Confidence multiplier: high-conviction calls have amplified impact.
  // A creator who loudly says "BUY NOW" and is wrong gets punished harder.
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
