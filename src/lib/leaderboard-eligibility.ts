import type { Period } from "./types";

export const ALL_TIME_MIN_PUBLIC_LEADERBOARD_CALLS = 24;
export const TWELVE_MONTH_MIN_PUBLIC_LEADERBOARD_CALLS = 12;
export const RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS = 3;

export const ALL_TIME_CERTIFIED_CALLS = 50;
export const TWELVE_MONTH_CERTIFIED_CALLS = 25;
export const RECENT_CONTEXT_CERTIFIED_CALLS = 10;

/** @deprecated Use period-aware threshold helpers for new leaderboard visibility checks. */
export const OBSOLETE_LEADERBOARD_CALL_THRESHOLD = ALL_TIME_MIN_PUBLIC_LEADERBOARD_CALLS;
export const MIN_PUBLIC_LEADERBOARD_CALLS = ALL_TIME_MIN_PUBLIC_LEADERBOARD_CALLS;
export const LOW_N_WARNING_CALLS = ALL_TIME_CERTIFIED_CALLS;
export const RECENT_CONTEXT_LOW_N_WARNING_CALLS = RECENT_CONTEXT_CERTIFIED_CALLS;
export const MIN_PRO_90D_LEADERBOARD_CALLS = RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS;
export const LOW_N_90D_WARNING_CALLS = RECENT_CONTEXT_LOW_N_WARNING_CALLS;

export interface LeaderboardSampleThreshold {
  readonly min_public_scored_calls: number;
  readonly low_n_warning_calls: number;
  readonly sample_floor_label: string;
}

export function getLeaderboardSampleThreshold(period: Period): LeaderboardSampleThreshold {
  if (period === "all_time") {
    return {
      min_public_scored_calls: ALL_TIME_MIN_PUBLIC_LEADERBOARD_CALLS,
      low_n_warning_calls: ALL_TIME_CERTIFIED_CALLS,
      sample_floor_label: "All-time official floor; certified at 50+ mature qualifying calls",
    };
  }

  if (period === "12m") {
    return {
      min_public_scored_calls: TWELVE_MONTH_MIN_PUBLIC_LEADERBOARD_CALLS,
      low_n_warning_calls: TWELVE_MONTH_CERTIFIED_CALLS,
      sample_floor_label: "12 months · one mature qualifying call per month; certified at 25+",
    };
  }

  if (period === "90d") {
    return {
      min_public_scored_calls: RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS,
      low_n_warning_calls: RECENT_CONTEXT_CERTIFIED_CALLS,
      sample_floor_label: "90-day recent form; lower-confidence official floor; certified at 10+",
    };
  }

  return {
    min_public_scored_calls: RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS,
    low_n_warning_calls: RECENT_CONTEXT_CERTIFIED_CALLS,
    sample_floor_label: "30 days · pending maturity; official ranking disabled",
  };
}

const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

export function assertSafeSqlIdentifier(alias: string, label: string): void {
  if (!SAFE_SQL_IDENTIFIER.test(alias)) {
    throw new Error(`Unsafe SQL alias for ${label}: ${alias}`);
  }
}

export function getMinimumLeaderboardCalls(period: Period | "all_time" = "all_time"): number {
  return getLeaderboardSampleThreshold(period).min_public_scored_calls;
}

export function getLowNWarningCalls(period: Period | "all_time" = "all_time"): number {
  return getLeaderboardSampleThreshold(period).low_n_warning_calls;
}

/**
 * Returns a SQL expression checking leaderboard eligibility for a creator_stats alias.
 * The alias defaults to "cs", must pass SAFE_SQL_IDENTIFIER, and the threshold is
 * period-aware. Legacy creator exclusion is applied separately where creators join.
 */
export function getLeaderboardEligibilitySql(alias = "cs", period: Period = "all_time"): string {
  assertSafeSqlIdentifier(alias, "leaderboard eligibility");
  const threshold = getLeaderboardSampleThreshold(period);
  if (period === "30d") return "FALSE";
  return `${alias}.total_calls >= ${threshold.min_public_scored_calls}`;
}
