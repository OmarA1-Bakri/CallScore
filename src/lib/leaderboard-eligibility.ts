/** @deprecated 5-call public leaderboard floor was retired after Data Integrity Audit. */
export const OBSOLETE_LEADERBOARD_CALL_THRESHOLD = 5;
export const MIN_PUBLIC_LEADERBOARD_CALLS = 25;
export const LOW_N_WARNING_CALLS = 50;
export const MIN_PRO_90D_LEADERBOARD_CALLS = 10;
export const LOW_N_90D_WARNING_CALLS = 20;

const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

export function assertSafeSqlIdentifier(alias: string, label: string): void {
  if (!SAFE_SQL_IDENTIFIER.test(alias)) {
    throw new Error(`Unsafe SQL alias for ${label}: ${alias}`);
  }
}

export function getMinimumLeaderboardCalls(period = "all_time"): number {
  return period === "90d" ? MIN_PRO_90D_LEADERBOARD_CALLS : MIN_PUBLIC_LEADERBOARD_CALLS;
}

export function getLowNWarningCalls(period = "all_time"): number {
  return period === "90d" ? LOW_N_90D_WARNING_CALLS : LOW_N_WARNING_CALLS;
}

/**
 * Returns SQL checking period-aware leaderboard sample-floor eligibility for a creator_stats alias.
 * Legacy creator exclusion is applied separately where the creators table is joined.
 */
export function getLeaderboardEligibilitySql(alias = "cs", period = "all_time"): string {
  assertSafeSqlIdentifier(alias, "leaderboard eligibility");
  return `${alias}.total_calls >= ${getMinimumLeaderboardCalls(period)}`;
}
