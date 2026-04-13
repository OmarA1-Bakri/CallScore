import { query } from "./db";
import { PUBLIC_COUNT_LABELS } from "./public-methodology";
import { TRACKED_CREATOR_COUNT } from "./tracked-creators";

interface CountsRow {
  readonly tracked_calls: string;
  readonly scored_calls: string;
  readonly ranked_creators: string;
  readonly beat_btc_creators: string;
}

export interface PublicCounts {
  readonly trackedCreators: number;
  readonly rankedCreators: number;
  readonly trackedCalls: number;
  readonly scoredCalls: number;
  readonly beatBtcCreators: number;
}

export const DEFAULT_PUBLIC_COUNTS: PublicCounts = {
  trackedCreators: TRACKED_CREATOR_COUNT,
  rankedCreators: 0,
  trackedCalls: 0,
  scoredCalls: 0,
  beatBtcCreators: 0,
};

export async function getPublicCounts(): Promise<PublicCounts> {
  const rows = await query<CountsRow>(
    `SELECT
      (SELECT COUNT(*)::text FROM calls) AS tracked_calls,
      (SELECT COALESCE(SUM(total_calls), 0)::text FROM creator_stats WHERE period = 'all_time') AS scored_calls,
      (SELECT COUNT(*)::text FROM creator_stats WHERE period = 'all_time' AND total_calls > 0) AS ranked_creators,
      (SELECT COUNT(*)::text FROM creator_stats WHERE period = 'all_time' AND total_calls > 0 AND avg_alpha_30d > 0) AS beat_btc_creators`,
  );

  const row = rows[0];
  if (!row) return DEFAULT_PUBLIC_COUNTS;

  return {
    trackedCreators: TRACKED_CREATOR_COUNT,
    rankedCreators: Number(row.ranked_creators),
    trackedCalls: Number(row.tracked_calls),
    scoredCalls: Number(row.scored_calls),
    beatBtcCreators: Number(row.beat_btc_creators),
  };
}

export { PUBLIC_COUNT_LABELS };
