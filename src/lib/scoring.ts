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
 * Components (max 100):
 *   Direction correct at 30d:  0 or 40 points
 *   Alpha over BTC at 30d:    0-25 points (1% alpha = 2.5pts, capped)
 *   Specificity bonus:        0-15 points
 *   Regime difficulty bonus:   0-10 points
 *   Target hit:               0 or 10 points
 */
export function computeAlphaScore(call: Call): number {
  const directionPoints = call.correct_direction ? 40 : 0;

  const alpha30d = call.alpha_30d ?? 0;
  const alphaPoints = Math.min(25, Math.max(0, alpha30d * 2.5));

  const specificityPoints = (call.specificity_score ?? 0) * 15;

  const regimePoints = (call.regime_difficulty ?? 0.5) * 10;

  const targetPoints = call.hit_target ? 10 : 0;

  return (
    directionPoints + alphaPoints + specificityPoints + regimePoints + targetPoints
  );
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
 */
export function isDirectionCorrect(
  direction: Direction,
  return30d: number,
): boolean {
  if (direction === "neutral") return Math.abs(return30d) < 5;
  if (direction === "bullish") return return30d > 0;
  return return30d < 0; // bearish
}

/**
 * Did the price hit the stated target between call date and evaluation window?
 * For bullish: did price go above target at any point?
 * For bearish: did price go below target at any point?
 */
export function didHitTarget(
  direction: Direction,
  targetPrice: number | null,
  highBetween: number | null,
  lowBetween: number | null,
): boolean {
  if (targetPrice === null) return false;
  if (direction === "bullish" && highBetween !== null) {
    return highBetween >= targetPrice;
  }
  if (direction === "bearish" && lowBetween !== null) {
    return lowBetween <= targetPrice;
  }
  return false;
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
