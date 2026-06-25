/**
 * Markov HMM core algorithms — forward, backward, Viterbi.
 *
 * Implements the Hidden Markov Model primitives for creator trajectory prediction.
 * Emissions are determined by snapshot confidence scores. The transition matrix
 * comes from markov-transition-matrix.ts.
 */
import type { CreatorTransitionState } from "../validation/transition-schema";
import type { TransitionMatrix } from "../validation/markov-schema";

/**
 * Compute emission probabilities from a CreatorTransitionStateRecord's
 * confidence score for each state.
 *
 * The observation is the state classifier's confidence. A high-confidence
 * observation strongly favors the classified state; low confidence spreads
 * probability across neighbors.
 */
export function emissionProbabilities(
  observationConfidence: number,
  stateCount: number,
  currentStateIndex: number,
): number[] {
  const probs: number[] = new Array(stateCount).fill(0);
  // Distribute confidence: observationConfidence to observed state,
  // (1 - observationConfidence) / (stateCount - 1) to all others
  probs[currentStateIndex] = observationConfidence;
  const residual = (1 - observationConfidence) / Math.max(stateCount - 1, 1);
  for (let i = 0; i < stateCount; i++) {
    if (i !== currentStateIndex) probs[i] = residual;
  }
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map((v) => v / sum);
}

/**
 * Forward algorithm: computes alpha_t[j] = P(O_1..O_t, X_t = s_j | lambda)
 *
 * Returns the forward probability matrix alpha[t][j] where t indexes
 * observation steps and j indexes states.
 */
export function forward(
  observations: number[],       // confidence scores per time step
  transitionMatrix: TransitionMatrix,
  initial: number[],           // initial state distribution
): number[][] {
  const T = observations.length;
  const N = transitionMatrix.matrix.length;
  const alpha: number[][] = Array.from({ length: T }, () => new Array(N).fill(0));

  // Initialization: alpha_1[j] = pi[j] * E_j[O_1]
  for (let j = 0; j < N; j++) {
    alpha[0][j] = initial[j] * emissionProbabilities(observations[0], N, j)[j];
  }

  // Induction: alpha_t[j] = sum_i alpha_{t-1}[i] * P[i][j] * E_j[O_t]
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += alpha[t - 1][i] * transitionMatrix.matrix[i][j];
      }
      alpha[t][j] = sum * emissionProbabilities(observations[t], N, j)[j];
    }
  }

  return alpha;
}

/**
 * Backward algorithm: computes beta_t[i] = P(O_{t+1}..O_T | X_t = s_i, lambda)
 */
export function backward(
  observations: number[],
  transitionMatrix: TransitionMatrix,
): number[][] {
  const T = observations.length;
  const N = transitionMatrix.matrix.length;
  const beta: number[][] = Array.from({ length: T }, () => new Array(N).fill(0));

  // Initialization: beta_T[i] = 1
  for (let i = 0; i < N; i++) beta[T - 1][i] = 1;

  // Induction: beta_t[i] = sum_j P[i][j] * E_j[O_{t+1}] * beta_{t+1}[j]
  for (let t = T - 2; t >= 0; t--) {
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = 0; j < N; j++) {
        const em = emissionProbabilities(observations[t + 1], N, j);
        sum += transitionMatrix.matrix[i][j] * em[j] * beta[t + 1][j];
      }
      beta[t][i] = sum;
    }
  }

  return beta;
}

/**
 * Viterbi algorithm: finds the most likely state sequence for a given
 * observation sequence and transition matrix.
 *
 * Returns the most probable state sequence as state string indices
 * into the transition matrix's states array.
 */
export function viterbi(
  observations: number[],
  transitionMatrix: TransitionMatrix,
  initial: number[],
): { states: number[]; probability: number } {
  const T = observations.length;
  const N = transitionMatrix.matrix.length;

  if (T === 0) return { states: [], probability: 1 };

  // delta_t[j] = max probability of path ending in state j at time t
  const delta: number[][] = Array.from({ length: T }, () => new Array(N).fill(0));
  // psi_t[j] = argmax for backtracking
  const psi: number[][] = Array.from({ length: T }, () => new Array(N).fill(0));

  // Initialization
  for (let j = 0; j < N; j++) {
    const em = emissionProbabilities(observations[0], N, j);
    delta[0][j] = initial[j] * em[j];
    psi[0][j] = 0;
  }

  // Recursion
  for (let t = 1; t < T; t++) {
    for (let j = 0; j < N; j++) {
      let maxVal = -Infinity;
      let maxIdx = 0;
      for (let i = 0; i < N; i++) {
        const val = delta[t - 1][i] * transitionMatrix.matrix[i][j];
        if (val > maxVal) {
          maxVal = val;
          maxIdx = i;
        }
      }
      const em = emissionProbabilities(observations[t], N, j);
      delta[t][j] = maxVal * em[j];
      psi[t][j] = maxIdx;
    }
  }

  // Termination
  let bestProb = -Infinity;
  let bestState = 0;
  for (let j = 0; j < N; j++) {
    if (delta[T - 1][j] > bestProb) {
      bestProb = delta[T - 1][j];
      bestState = j;
    }
  }

  // Backtrack
  const states: number[] = new Array(T).fill(0);
  states[T - 1] = bestState;
  for (let t = T - 2; t >= 0; t--) {
    states[t] = psi[t + 1][states[t + 1]];
  }

  return { states, probability: bestProb };
}
