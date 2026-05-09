import type { Tier } from "./types";

/**
 * Leaderboard visibility tier.
 *
 * The public research surface stays open: leaderboard, creator pages,
 * call history, and per-call score breakdowns all remain visible.
 *
 * Premium tiers are reserved for future delivery workflows, not for
 * hiding the public methodology or public history.
 */
export function getCreatorTier(_rank: number): Tier {
  return "free";
}