/**
 * Markov predictor — computes future state distributions from current state.
 *
 * Uses the transition matrix to project N steps ahead:
 * P(s_{t+k}) = initial * P_matrix^k
 *
 * Also provides backtest accuracy computation against observed transitions.
 */
import type { TransitionMatrix, CreatorPrediction, StepPrediction, StatePrediction, HMMConfig, MarkovBacktestReport, MatrixBacktestResult } from "../validation/markov-schema";
import type { CreatorTransitionStateRecord } from "../validation/transition-schema";
import { CREATOR_TRANSITION_STATES } from "./markov-schemas";

/**
 * Predict state distribution N steps ahead from a starting state index.
 *
 * Uses matrix exponentiation: P(s_{t+k}) = initial * P_matrix^k
 */
export function predictNextStates(
  matrix: TransitionMatrix,
  currentStateIndex: number,
  steps: number,
): StepPrediction[] {
  const N = matrix.matrix.length;
  const predictions: StepPrediction[] = [];

  // Current state as one-hot vector
  let distribution: number[] = new Array(N).fill(0);
  distribution[currentStateIndex] = 1;

  for (let step = 1; step <= steps; step++) {
    // Multiply distribution by transition matrix
    const next: number[] = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        next[j] += distribution[i] * matrix.matrix[i][j];
      }
    }

    // Normalize floating point drift
    const sum = next.reduce((a: number, b: number) => a + b, 0);
    const normalized = sum > 0 ? next.map((v: number) => Number((v / sum).toFixed(6))) : next;

    // Compute entropy as confidence measure
    const entropy = -normalized.reduce((agg: number, p: number) => agg + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(N);
    const lowConfidence = entropy > maxEntropy * 0.8;

    const distributionMap: StatePrediction[] = normalized
      .map((prob: number, idx: number) => ({
        state: matrix.states[idx],
        probability: prob,
      }))
      .sort((a: StatePrediction, b: StatePrediction) => b.probability - a.probability);

    predictions.push({
      step,
      distribution: distributionMap.slice(0, 5), // top 5 most likely
      entropy: Number(entropy.toFixed(4)),
      low_confidence: lowConfidence,
    });

    distribution = normalized;
  }

  return predictions;
}

/**
 * Compute stability score for a creator: how much their state probability
 * distribution changes between consecutive periods (Jensen-Shannon-like).
 * Lower = more stable trajectory.
 */
export function stabilityScore(
  predictions: StepPrediction[],
): number {
  if (predictions.length < 2) return 1;
  let totalDivergence = 0;
  let count = 0;

  for (let i = 1; i < predictions.length; i++) {
    const prev = predictions[i - 1].distribution;
    const curr = predictions[i].distribution;
    const stateSet = new Set([...prev.map((s) => s.state), ...curr.map((s) => s.state)]);
    let divergence = 0;
    for (const state of stateSet) {
      const pProb = prev.find((s) => s.state === state)?.probability ?? 0;
      const cProb = curr.find((s) => s.state === state)?.probability ?? 0;
      const m = (pProb + cProb) / 2;
      if (m > 0) {
        if (pProb > 0) divergence += pProb * Math.log2(pProb / m);
        if (cProb > 0) divergence += cProb * Math.log2(cProb / m);
      }
    }
    totalDivergence += divergence / 2; // JS divergence
    count++;
  }

  return Number(Math.max(0, Math.min(1, 1 - totalDivergence / count)).toFixed(4));
}

/**
 * Run backtest: compare Markov predictions against observed following states.
 * For each creator state transition, check if the predicted most-likely
 * next state matches the actual next state.
 */
export function backtestMarkov(
  matrix: TransitionMatrix,
  states: readonly CreatorTransitionStateRecord[],
): MarkovBacktestReport {
  // Group by creator, sort by period
  const byCreator = new Map<number, CreatorTransitionStateRecord[]>();
  for (const s of states) {
    const bucket = byCreator.get(s.creator_id) ?? [];
    bucket.push(s);
    byCreator.set(s.creator_id, bucket);
  }
  for (const [, bucket] of byCreator) {
    bucket.sort((a, b) => a.period_start.localeCompare(b.period_start));
  }

  // For each transition, predict from "from" state and check if "to" state matches
  const correctByState = new Map<string, { correct: number; total: number }>();
  for (const s of CREATOR_TRANSITION_STATES) {
    correctByState.set(s, { correct: 0, total: 0 });
  }

  for (const [, bucket] of byCreator) {
    for (let i = 0; i < bucket.length - 1; i++) {
      const fromState = bucket[i].state;
      const fromIdx = CREATOR_TRANSITION_STATES.indexOf(fromState as typeof CREATOR_TRANSITION_STATES[number]);
      const actualNext = bucket[i + 1].state;
      if (fromIdx === -1) continue;

      const preds = predictNextStates(matrix, fromIdx, 1);
      const predicted = preds[0]?.distribution[0]?.state;
      const entry = correctByState.get(fromState);
      if (entry) {
        entry.total++;
        if (predicted === actualNext) entry.correct++;
      }
    }
  }

  const byState: MatrixBacktestResult[] = [...CREATOR_TRANSITION_STATES]
    .map((state: string) => {
      const data = correctByState.get(state)!;
      return {
        state: state as MatrixBacktestResult["state"],
        accuracy: data.total > 0 ? Number((data.correct / data.total).toFixed(4)) : 0,
        observations: data.total,
        precision: data.total > 0 ? Number((data.correct / data.total).toFixed(4)) : undefined,
        recall: data.total > 0 ? Number((data.correct / data.total).toFixed(4)) : undefined,
      };
    })
    .sort((a: MatrixBacktestResult, b: MatrixBacktestResult) => b.observations - a.observations);

  const totalCorrect = byState.reduce((s: number, r: MatrixBacktestResult) => s + (r.precision ?? 0) * r.observations, 0);
  const totalObs = byState.reduce((s: number, r: MatrixBacktestResult) => s + r.observations, 0);
  const overallAccuracy = totalObs > 0 ? Number((totalCorrect / totalObs).toFixed(4)) : 0;

  return {
    schema_version: "callscore_markov_backtest.v1",
    generated_at: new Date().toISOString(),
    period: "full",
    total_predictions: totalObs,
    overall_accuracy: overallAccuracy,
    by_state: byState,
    warnings: byState
      .filter((r: MatrixBacktestResult) => r.observations < 10)
      .map((r: MatrixBacktestResult) => `State ${r.state}: only ${r.observations} observations — treat accuracy as unreliable`),
  };
}
