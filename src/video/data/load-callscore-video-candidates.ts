import { query } from "../../lib/db";
import { CreatorScoreSchema, type CreatorScore } from "../schemas/video.schemas";

interface CandidateRow {
  readonly creator_id: string | number;
  readonly name: string;
  readonly youtube_handle: string | null;
  readonly youtube_channel_id: string | null;
  readonly total_calls: string | number | null;
  readonly win_rate: string | number | null;
  readonly alpha_score: string | number | null;
  readonly accuracy_rank: string | number | null;
  readonly recent_resolved_calls: string | number | null;
  readonly score_delta: string | number | null;
  readonly rank_movement: string | number | null;
}

interface CallRow {
  readonly id: string | number;
  readonly creator_id: string | number;
  readonly video_id: string | number | null;
  readonly symbol: string;
  readonly direction: string | null;
  readonly raw_quote: string | null;
  readonly call_date: string;
  readonly score: string | number | null;
  readonly return_30d: string | number | null;
  readonly alpha_30d: string | number | null;
  readonly extraction_confidence: string | number | null;
  readonly correct_direction: boolean | null;
}

export type VideoCandidateQuery = <T>(sql: string, params?: readonly unknown[]) => Promise<T[]>;

const asNumber = (value: string | number | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asInt = (value: string | number | null | undefined, fallback = 0): number => Math.trunc(asNumber(value, fallback));

function outcome(row: CallRow): "won" | "lost" | "open" | "neutral" | "unknown" {
  if (row.correct_direction === true) return "won";
  if (row.correct_direction === false) return "lost";
  if (row.return_30d === null && row.alpha_30d === null) return "open";
  return "unknown";
}

export async function loadCallScoreVideoCandidates(options: { readonly limit?: number; readonly queryFn?: VideoCandidateQuery } = {}): Promise<readonly CreatorScore[]> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 12));
  const queryFn = options.queryFn ?? query;
  const rows = await queryFn<CandidateRow>(
    `SELECT
       cr.id AS creator_id,
       cr.name,
       cr.youtube_handle,
       cr.youtube_channel_id,
       COALESCE(cs.total_calls, cr.total_calls, 0)::text AS total_calls,
       COALESCE(cs.win_rate, cr.win_rate, 0)::text AS win_rate,
       COALESCE(cs.alpha_score, cr.alpha_score, 0)::text AS alpha_score,
       COALESCE(cs.accuracy_rank, cr.accuracy_rank)::text AS accuracy_rank,
       COALESCE((SELECT COUNT(*) FROM calls c WHERE c.creator_id = cr.id AND c.call_date >= NOW() - INTERVAL '30 days' AND c.correct_direction IS NOT NULL), 0)::text AS recent_resolved_calls,
       0::text AS score_delta,
       0::text AS rank_movement
     FROM creators cr
     LEFT JOIN creator_stats cs ON cs.creator_id = cr.id AND cs.period = 'all_time'
     ORDER BY COALESCE(cs.accuracy_rank, cr.accuracy_rank, 999999), COALESCE(cs.total_calls, cr.total_calls, 0) DESC
     LIMIT $1`,
    [limit],
  );
  const creatorIds = rows.map((row) => asInt(row.creator_id)).filter((id) => id > 0);
  const callRows = creatorIds.length === 0 ? [] : await queryFn<CallRow>(
    `SELECT id, creator_id, video_id, symbol, direction, raw_quote, call_date::text, score::text, return_30d::text, alpha_30d::text, extraction_confidence::text, correct_direction
     FROM calls
     WHERE creator_id = ANY($1::int[])
     ORDER BY call_date DESC
     LIMIT 120`,
    [creatorIds],
  );
  return rows.map((row) => {
    const creatorId = asInt(row.creator_id);
    const recentCalls = callRows
      .filter((call) => asInt(call.creator_id) === creatorId)
      .slice(0, 8)
      .map((call) => ({
        id: asInt(call.id),
        creatorId,
        videoId: call.video_id === null ? null : asInt(call.video_id),
        symbol: call.symbol,
        direction: call.direction === "bearish" || call.direction === "neutral" ? call.direction : "bullish",
        outcome: outcome(call),
        rawQuote: call.raw_quote,
        callDate: new Date(call.call_date).toISOString(),
        score: asNumber(call.score),
        return30d: call.return_30d === null ? null : asNumber(call.return_30d),
        alpha30d: call.alpha_30d === null ? null : asNumber(call.alpha_30d),
        extractionConfidence: call.extraction_confidence === null ? null : asNumber(call.extraction_confidence),
      }));
    return CreatorScoreSchema.parse({
      creatorId,
      name: row.name,
      youtubeHandle: row.youtube_handle,
      youtubeChannelId: row.youtube_channel_id,
      totalCalls: asInt(row.total_calls),
      winRate: row.win_rate === null ? null : asNumber(row.win_rate),
      alphaScore: asNumber(row.alpha_score),
      rank: row.accuracy_rank === null ? null : asInt(row.accuracy_rank),
      scoreDelta: asNumber(row.score_delta),
      rankMovement: asNumber(row.rank_movement),
      recentResolvedCalls: asInt(row.recent_resolved_calls),
      recentCalls,
    });
  });
}
