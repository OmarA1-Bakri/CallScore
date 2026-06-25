/**
 * Markov agent node — LangGraph-compatible wrapper.
 *
 * Reads CreatorTransitionStateRecord[] from pipeline state,
 * builds the transition matrix, runs predictions, and writes
 * results back to state.
 *
 * This is a pure function: no side effects, no DB writes.
 */
import type { CreatorTransitionStateRecord } from "../validation/transition-schema";
import type { TransitionMatrix, HMMConfig, CreatorPrediction, MarkovReport } from "../validation/markov-schema";
import { buildTransitionMatrix } from "./markov-transition-matrix";
import { predictNextStates, stabilityScore, backtestMarkov } from "./markov-predictor";
import { CREATOR_TRANSITION_STATES } from "./markov-schemas";

/**
 * Run the full Markov pipeline: matrix → predictions → backtest → report.
 */
export async function runMarkov(
  transitionStates: readonly CreatorTransitionStateRecord[],
  config?: Partial<HMMConfig>,
): Promise<MarkovReport> {
  const fullConfig: HMMConfig = {
    smoothing: "add_one",
    alpha: 1,
    min_observations_per_row: 10,
    max_sparsity_ratio: 0.6,
    prediction_steps: 4,
    ...config,
  };

  // Build transition matrix
  const matrix = buildTransitionMatrix(transitionStates, fullConfig);

  // Build creator-level predictions
  const byCreator = groupByCreator(transitionStates);
  const predictions: CreatorPrediction[] = [];

  for (const [creatorId, records] of byCreator) {
    const last = records[records.length - 1];
    const stateIdx = CREATOR_TRANSITION_STATES.indexOf(last.state as typeof CREATOR_TRANSITION_STATES[number]);
    if (stateIdx === -1) continue;

    const preds = predictNextStates(matrix, stateIdx, fullConfig.prediction_steps);
    const stabScore = stabilityScore(preds);

    predictions.push({
      creator_id: creatorId,
      creator_name: last.creator_name,
      current_state: last.state,
      current_state_confidence: last.confidence,
      current_period: last.period_end,
      predictions: preds,
      stability_score: stabScore,
    });
  }

  // Run backtest
  const backtest = backtestMarkov(matrix, transitionStates);

  // Determine readiness
  const sparsityWarnings: string[] = [];
  if (matrix.total_observations < 50) {
    sparsityWarnings.push(`Only ${matrix.total_observations} total observations — less than the 50 minimum`);
  }
  if (matrix.sparsity_ratio > 0.6) {
    sparsityWarnings.push(`Matrix sparsity ${(matrix.sparsity_ratio * 100).toFixed(1)}% exceeds 60% threshold`);
  }

  // Check each row for minimum observations
  const sparseRows: string[] = [];
  for (const state of CREATOR_TRANSITION_STATES) {
    const rowIdx = CREATOR_TRANSITION_STATES.indexOf(state);
    const rowObs = transitionStates.filter((s) => s.state === state).length;
    if (rowObs < fullConfig.min_observations_per_row) {
      sparseRows.push(state);
    }
  }
  if (sparseRows.length > 0) {
    sparsityWarnings.push(`Low-observation rows: ${sparseRows.join(", ")}`);
  }

  const hasEnoughData = matrix.total_observations >= 50 && matrix.sparsity_ratio <= 0.6 && sparseRows.length < CREATOR_TRANSITION_STATES.length / 2;
  const readiness = hasEnoughData ? "pass" : backtest.overall_accuracy > 0.3 ? "warn" : "block";

  return {
    matrix,
    predictions,
    backtest: backtest.total_predictions > 0 ? backtest : undefined,
    sparsity_warnings: sparsityWarnings,
    readiness,
    creator_count: byCreator.size,
  };
}

function groupByCreator(states: readonly CreatorTransitionStateRecord[]): Map<number, CreatorTransitionStateRecord[]> {
  const byCreator = new Map<number, CreatorTransitionStateRecord[]>();
  for (const s of states) {
    const bucket = byCreator.get(s.creator_id) ?? [];
    bucket.push(s);
    byCreator.set(s.creator_id, bucket);
  }
  for (const [, bucket] of byCreator) {
    bucket.sort((a, b) => a.period_start.localeCompare(b.period_start));
  }
  return byCreator;
}
