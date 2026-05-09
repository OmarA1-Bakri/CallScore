/** @deprecated Use MIN_PUBLIC_LEADERBOARD_CALLS for new leaderboard visibility checks. */
export const OBSOLETE_LEADERBOARD_CALL_THRESHOLD = 5;
// Keep the legacy threshold name and the public-facing alias tied together:
// OBSOLETE_LEADERBOARD_CALL_THRESHOLD preserves older call sites while
// MIN_PUBLIC_LEADERBOARD_CALLS states the product meaning for new code.
export const MIN_PUBLIC_LEADERBOARD_CALLS = OBSOLETE_LEADERBOARD_CALL_THRESHOLD;
export const LOW_N_WARNING_CALLS = 15;

const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

/**
 * Returns a SQL expression checking leaderboard eligibility for a creator_stats alias.
 * The alias defaults to "cs", must pass SAFE_SQL_IDENTIFIER, and the threshold uses
 * MIN_PUBLIC_LEADERBOARD_CALLS.
 */
export function getLeaderboardEligibilitySql(alias = "cs"): string {
  if (!SAFE_SQL_IDENTIFIER.test(alias)) {
    throw new Error(`Unsafe SQL alias for leaderboard eligibility: ${alias}`);
  }
  return `${alias}.total_calls >= ${MIN_PUBLIC_LEADERBOARD_CALLS}`;
}
