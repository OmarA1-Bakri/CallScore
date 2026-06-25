/**
 * Markov transition matrix builder.
 *
 * Consumes CreatorTransitionStateRecord[] from the transition-state-classifier
 * and produces a 10-state TransitionProbabilityMatrix with add-1 smoothing.
 */
import type { CreatorTransitionStateRecord } from "../validation/transition-schema";
import type { TransitionMatrix, HMMConfig } from "../validation/markov-schema";
import { CREATOR_TRANSITION_STATES } from "./markov-schemas";

/**
 * Build a transition count matrix from creator state sequences.
 *
 * Algorithm:
 * 1. Group state records by creator_id, sort by period_start
 * 2. For each consecutive pair (s_t, s_{t+1}) increment C[s_t][s_{t+1}]
 * 3. Apply add-1 smoothing: C_smooth[i][j] = C[i][j] + 1
 * 4. Normalize: P[i][j] = C_smooth[i][j] / sum_k C_smooth[i][k]
 */
export function buildTransitionMatrix(
  states: readonly CreatorTransitionStateRecord[],
  config: HMMConfig = { smoothing: "add_one", alpha: 1, min_observations_per_row: 10, max_sparsity_ratio: 0.6, prediction_steps: 4 },
): TransitionMatrix {
  // 1. Group by creator, sort by period
  const byCreator = new Map<number, CreatorTransitionStateRecord[]>();
  for (const s of states) {
    const bucket = byCreator.get(s.creator_id) ?? [];
    bucket.push(s);
    byCreator.set(s.creator_id, bucket);
  }
  for (const [, bucket] of byCreator) {
    bucket.sort((a, b) => a.period_start.localeCompare(b.period_start));
  }

  // 2. Build count matrix as a Map-of-Maps
  const countMatrix = new Map<string, Map<string, number>>();
  for (const fromState of CREATOR_TRANSITION_STATES) {
    const row = new Map<string, number>();
    for (const toState of CREATOR_TRANSITION_STATES) {
      row.set(toState, 0);
    }
    countMatrix.set(fromState, row);
  }

  let totalObservations = 0;
  for (const [, bucket] of byCreator) {
    for (let i = 0; i < bucket.length - 1; i++) {
      const from = bucket[i].state;
      const to = bucket[i + 1].state;
      const row = countMatrix.get(from);
      if (row) {
        row.set(to, (row.get(to) ?? 0) + 1);
      }
      totalObservations++;
    }
  }

  // 3. Add-1 smoothing + normalize to probability matrix
  const alpha = config.alpha;
  const matrix: number[][] = [];
  let zeroRows = 0;

  for (const from of CREATOR_TRANSITION_STATES) {
    const row = countMatrix.get(from)!;
    const rawCounts: number[] = [];
    for (const to of CREATOR_TRANSITION_STATES) {
      rawCounts.push(row.get(to) ?? 0);
    }
    const smoothed = rawCounts.map((c: number) => c + alpha);
    const sum = smoothed.reduce((a: number, b: number) => a + b, 0);
    const probRow = smoothed.map((c: number) => Number((c / sum).toFixed(6)));
    // Normalize floating point drift
    const rowSum = probRow.reduce((a: number, b: number) => a + b, 0);
    if (Math.abs(rowSum - 1) > 0.001) {
      matrix.push(probRow.map((v: number) => Number((v / rowSum).toFixed(6))));
    } else {
      matrix.push(probRow);
    }
    if (rawCounts.every((c: number) => c === 0)) zeroRows++;
  }

  const nStates = CREATOR_TRANSITION_STATES.length;
  const sparsityRatio = Number(
    ((totalObservations === 0 ? 1 : (zeroRows * nStates) / (nStates * nStates))).toFixed(4),
  );

  return {
    schema_version: "callscore_markov_matrix.v1",
    generated_at: new Date().toISOString(),
    states: [...CREATOR_TRANSITION_STATES],
    matrix,
    total_observations: totalObservations,
    sparsity_ratio: sparsityRatio,
    smoothing: config.smoothing,
    creator_count: byCreator.size,
  };
}

/**
 * Extract per-creator observation sequences from state records.
 * Returns creator_id → sequence of state names.
 */
export function extractSequences(
  states: readonly CreatorTransitionStateRecord[],
): Map<number, string[]> {
  const byCreator = new Map<number, CreatorTransitionStateRecord[]>();
  for (const s of states) {
    const bucket = byCreator.get(s.creator_id) ?? [];
    bucket.push(s);
    byCreator.set(s.creator_id, bucket);
  }
  for (const [, bucket] of byCreator) {
    bucket.sort((a, b) => a.period_start.localeCompare(b.period_start));
  }
  const result = new Map<number, string[]>();
  for (const [cid, bucket] of byCreator) {
    result.set(cid, bucket.map((s: CreatorTransitionStateRecord) => s.state));
  }
  return result;
}
