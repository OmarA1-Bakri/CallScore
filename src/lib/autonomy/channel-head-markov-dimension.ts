/**
 * Markov prediction dimension for channel head scoring.
 *
 * Takes Markov predictions from the markov-agent and feeds them
 * into the channel head scoring as an 11th dimension:
 * "trajectory_predictability".
 *
 * High-stability creators (stability_score > 0.7) contribute
 * positively to the decision; volatile/unpredictable trajectories
 * lower confidence.
 */
import type { CreatorPrediction } from "../validation/markov-schema";

export interface MarkovScoringInput {
  readonly prediction: CreatorPrediction | null;
  readonly matrix_observations: number;
  readonly backtest_accuracy: number;
}

export interface MarkovScoreDimension {
  readonly score: number;
  readonly reason_codes: readonly string[];
  readonly trajectory_tag: string;
}

/**
 * Score the Markov trajectory dimension for a creator.
 *
 * Rules:
 * - No prediction available → neutral (0.5), reason: "markov_not_ready"
 * - stability_score >= 0.7 → positive (0.8-1.0), reason: "stable_trajectory"
 * - stability_score >= 0.4 → neutral (0.5-0.7), reason: "moderate_trajectory"
 * - stability_score < 0.4 → negative (0-0.4), reason: "unstable_trajectory"
 * - entropy > 0.8 on next step → lower score (prediction uncertainty)
 * - backtest accuracy < 0.3 → cap score at 0.4
 * - matrix_observations < 50 → cap score at 0.5 (insufficient training data)
 */
export function scoreMarkovDimension(input: MarkovScoringInput): MarkovScoreDimension {
  const { prediction, matrix_observations, backtest_accuracy } = input;

  // No prediction available — neutral
  if (!prediction) {
    return {
      score: 0.5,
      reason_codes: ["markov_not_ready"],
      trajectory_tag: "unknown",
    };
  }

  const stability = prediction.stability_score ?? 0.5;
  const firstStep = prediction.predictions[0];
  const entropy = firstStep?.entropy ?? 1;
  const lowConfidence = firstStep?.low_confidence ?? false;

  // Insufficient training data — cap
  const dataCap = matrix_observations >= 50 ? 1 : 0.5;
  const accuracyCap = backtest_accuracy >= 0.3 ? 1 : 0.4;

  // Base score from stability
  let baseScore: number;
  let trajectoryTag: string;
  let reasonCodes: string[];

  if (stability >= 0.7) {
    baseScore = 0.8 + Math.min(stability - 0.7, 0.3) * (1 / 0.3);
    trajectoryTag = "stable";
    reasonCodes = ["stable_trajectory", `stability_${(stability * 100).toFixed(0)}`];
  } else if (stability >= 0.4) {
    baseScore = 0.5 + (stability - 0.4) * (0.3 / 0.3);
    trajectoryTag = "moderate";
    reasonCodes = ["moderate_trajectory", `stability_${(stability * 100).toFixed(0)}`];
  } else {
    baseScore = Math.max(0, stability * 1.0);
    trajectoryTag = "unstable";
    reasonCodes = ["unstable_trajectory", `stability_${(stability * 100).toFixed(0)}`];
  }

  // Entropy penalty — high uncertainty = lower score
  const entropyPenalty = lowConfidence ? 0.2 : Math.min(1, entropy) * 0.1;

  // Combine: base * dataCap * accuracyCap - entropyPenalty
  const score = Math.max(0, Math.min(1, Number((baseScore * dataCap * accuracyCap - entropyPenalty).toFixed(4))));

  // Additional reason codes
  if (lowConfidence) reasonCodes.push("high_prediction_entropy");
  if (matrix_observations < 50) reasonCodes.push("markov_insufficient_data");
  if (backtest_accuracy < 0.3) reasonCodes.push("markov_low_backtest_accuracy");

  return {
    score,
    reason_codes: reasonCodes,
    trajectory_tag: trajectoryTag,
  };
}
