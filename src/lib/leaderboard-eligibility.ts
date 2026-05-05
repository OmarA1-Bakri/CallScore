export const OBSOLETE_LEADERBOARD_CALL_THRESHOLD = 5;
export const MIN_PUBLIC_LEADERBOARD_CALLS = OBSOLETE_LEADERBOARD_CALL_THRESHOLD;
export const LOW_N_WARNING_CALLS = 15;

export function getLeaderboardEligibilitySql(alias = "cs"): string {
  return `${alias}.total_calls >= ${MIN_PUBLIC_LEADERBOARD_CALLS}`;
}
