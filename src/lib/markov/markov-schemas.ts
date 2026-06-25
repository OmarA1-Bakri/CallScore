/**
 * Shared Markov constants and state lists.
 */
export const CREATOR_TRANSITION_STATES = [
  "INSUFFICIENT_DATA",
  "PROVISIONAL_SIGNAL",
  "STABLE_PERFORMER",
  "HOT_STREAK",
  "COLD_STREAK",
  "DETERIORATING",
  "RECOVERING",
  "DIRECTIONAL_BIAS_RISK",
  "HIGH_VOLATILITY",
  "STALE_OR_INACTIVE",
] as const;

export type CreatorTransitionState = (typeof CREATOR_TRANSITION_STATES)[number];
