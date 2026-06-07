import type { Period } from "./types";

/** @deprecated 5-call public leaderboard floor was retired after Data Integrity Audit. */
export const OBSOLETE_LEADERBOARD_CALL_THRESHOLD = 5;
export const MIN_PUBLIC_LEADERBOARD_CALLS = 25;
export const LOW_N_WARNING_CALLS = 50;
export const MIN_PRO_90D_LEADERBOARD_CALLS = 10;
export const LOW_N_90D_WARNING_CALLS = 20;

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
      min_public_scored_calls: MIN_PRO_90D_LEADERBOARD_CALLS,
      low_n_warning_calls: LOW_N_90D_WARNING_CALLS,
      sample_floor_label: "Recent context; lower sample floor applies",
    };
  }

  return {
    min_public_scored_calls: MIN_PRO_90D_LEADERBOARD_CALLS,
    low_n_warning_calls: LOW_N_90D_WARNING_CALLS,
    sample_floor_label: "30 days · internal experimental sample view",
  };
}

const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

export function assertSafeSqlIdentifier(alias: string, label: string): void {
  if (!SAFE_SQL_IDENTIFIER.test(alias)) {
    throw new Error(`Unsafe SQL alias for ${label}: ${alias}`);
  }
}

export function getMinimumLeaderboardCalls(period: Period | "all_time" = "all_time"): number {
  return period === "90d" ? MIN_PRO_90D_LEADERBOARD_CALLS : MIN_PUBLIC_LEADERBOARD_CALLS;
}

export function getLowNWarningCalls(period: Period | "all_time" = "all_time"): number {
  return period === "90d" ? LOW_N_90D_WARNING_CALLS : LOW_N_WARNING_CALLS;
}

/**
 * Returns SQL checking period-aware leaderboard sample-floor eligibility for a creator_stats alias.
 * Legacy creator exclusion is applied separately where the creators table is joined.
 */
export function getLeaderboardEligibilitySql(alias = "cs", period: Period | "all_time" = "all_time"): string {
  assertSafeSqlIdentifier(alias, "leaderboard eligibility");
  return `${alias}.total_calls >= ${getMinimumLeaderboardCalls(period)}`;
}
