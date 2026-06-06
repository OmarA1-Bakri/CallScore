import type { Period } from "./types";

/** @deprecated Use MIN_PUBLIC_LEADERBOARD_CALLS for new leaderboard visibility checks. */
export const OBSOLETE_LEADERBOARD_CALL_THRESHOLD = 25;
// Keep the legacy threshold name and the public-facing alias tied together:
// OBSOLETE_LEADERBOARD_CALL_THRESHOLD preserves older call sites while
// MIN_PUBLIC_LEADERBOARD_CALLS states the product meaning for new code.
export const MIN_PUBLIC_LEADERBOARD_CALLS = OBSOLETE_LEADERBOARD_CALL_THRESHOLD;
export const LOW_N_WARNING_CALLS = 50;
export const RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS = 10;
export const RECENT_CONTEXT_LOW_N_WARNING_CALLS = 20;

export interface LeaderboardSampleThreshold {
  readonly min_public_scored_calls: number;
  readonly low_n_warning_calls: number;
  readonly sample_floor_label: string;
}

export function getLeaderboardSampleThreshold(period: Period): LeaderboardSampleThreshold {
  if (period === "all_time") {
    return {
      min_public_scored_calls: MIN_PUBLIC_LEADERBOARD_CALLS,
      low_n_warning_calls: LOW_N_WARNING_CALLS,
      sample_floor_label: "N = public-scored calls in rolling 12 months",
    };
  }

  if (period === "90d") {
    return {
      min_public_scored_calls: RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS,
      low_n_warning_calls: RECENT_CONTEXT_LOW_N_WARNING_CALLS,
      sample_floor_label: "Recent context; lower sample floor applies",
    };
  }

  return {
    min_public_scored_calls: RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS,
    low_n_warning_calls: RECENT_CONTEXT_LOW_N_WARNING_CALLS,
    sample_floor_label: "30 days · internal experimental sample view",
  };
}

const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

/**
 * Returns a SQL expression checking leaderboard eligibility for a creator_stats alias.
 * The alias defaults to "cs", must pass SAFE_SQL_IDENTIFIER, and the threshold is
 * period-aware.
 */
export function getLeaderboardEligibilitySql(alias = "cs", period: Period = "all_time"): string {
  if (!SAFE_SQL_IDENTIFIER.test(alias)) {
    throw new Error(`Unsafe SQL alias for leaderboard eligibility: ${alias}`);
  }
  const threshold = getLeaderboardSampleThreshold(period);
  return `${alias}.total_calls >= ${threshold.min_public_scored_calls}`;
}
