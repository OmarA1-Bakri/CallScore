import { query } from "./db";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  PUBLIC_COUNT_LABELS,
  getCallEligibilitySql,
} from "./public-methodology";
import { TRACKED_CREATOR_COUNT } from "./tracked-creators";

interface CountsRow {
  readonly tracked_calls: string;
  readonly llm_validated_calls: string;
  readonly public_scored_calls: string;
  readonly pending_horizon_calls: string;
  readonly missing_price_calls: string;
  readonly missing_30d_calls: string;
  readonly target_pending_calls: string;
  readonly excluded_low_confidence_calls: string;
  readonly ranked_creators: string;
  readonly beat_btc_creators: string;
}

export interface PublicCounts {
  readonly trackedCreators: number;
  readonly rankedCreators: number;
  readonly trackedCalls: number;
  readonly scoredCalls: number;
  readonly beatBtcCreators: number;
  readonly llmValidatedCalls: number;
  readonly confidencePassCalls: number;
  readonly publicScoredCalls: number;
  readonly pendingPublicScoringCalls: number;
  readonly liveOpenCalls: number;
  readonly pending30dCalls: number;
  readonly pendingTarget90dCalls: number;
  readonly pendingHorizonCalls: number;
  readonly missingPriceCalls: number;
  readonly missing30dCalls: number;
  readonly missingTargetCalls: number;
  readonly targetPendingCalls: number;
  readonly excludedLowConfidenceCalls: number;
}

export const DEFAULT_PUBLIC_COUNTS: PublicCounts = {
  trackedCreators: TRACKED_CREATOR_COUNT,
  rankedCreators: 0,
  trackedCalls: 0,
  scoredCalls: 0,
  beatBtcCreators: 0,
  llmValidatedCalls: 0,
  confidencePassCalls: 0,
  publicScoredCalls: 0,
  pendingPublicScoringCalls: 0,
  liveOpenCalls: 0,
  pending30dCalls: 0,
  pendingTarget90dCalls: 0,
  pendingHorizonCalls: 0,
  missingPriceCalls: 0,
  missing30dCalls: 0,
  missingTargetCalls: 0,
  targetPendingCalls: 0,
  excludedLowConfidenceCalls: 0,
};

export async function getPublicCounts(): Promise<PublicCounts> {
  const eligibleSql = getCallEligibilitySql("c");
  const rows = await query<CountsRow>(
    `SELECT
      COUNT(c.id)::text AS tracked_calls,
      COUNT(c.id) FILTER (WHERE c.extraction_confidence >= $1)::text AS llm_validated_calls,
      COUNT(c.id) FILTER (WHERE ${eligibleSql})::text AS public_scored_calls,
      COUNT(c.id) FILTER (
        WHERE c.extraction_confidence >= $1
          AND c.price_at_call IS NOT NULL
          AND (
            c.call_date > NOW() - INTERVAL '30 days'
            OR (c.target_price IS NOT NULL AND c.call_date > NOW() - INTERVAL '90 days')
          )
      )::text AS pending_horizon_calls,
      COUNT(c.id) FILTER (
        WHERE c.extraction_confidence >= $1
          AND c.price_at_call IS NULL
      )::text AS missing_price_calls,
      COUNT(c.id) FILTER (
        WHERE c.extraction_confidence >= $1
          AND c.price_at_call IS NOT NULL
          AND c.call_date <= NOW() - INTERVAL '30 days'
          AND (c.price_30d IS NULL OR c.return_30d IS NULL)
      )::text AS missing_30d_calls,
      COUNT(c.id) FILTER (
        WHERE c.extraction_confidence >= $1
          AND c.price_at_call IS NOT NULL
          AND c.target_price IS NOT NULL
          AND (
            c.call_date > NOW() - INTERVAL '90 days'
            OR c.price_90d IS NULL
            OR c.hit_target IS NULL
          )
      )::text AS target_pending_calls,
      COUNT(c.id) FILTER (WHERE c.extraction_confidence < $1)::text AS excluded_low_confidence_calls,
      (SELECT COUNT(*)::text FROM creator_stats WHERE period = 'all_time' AND total_calls > 0) AS ranked_creators,
      (SELECT COUNT(*)::text FROM creator_stats WHERE period = 'all_time' AND total_calls > 0 AND avg_alpha_30d > 0) AS beat_btc_creators
     FROM calls c`,
    [EXTRACTION_CONFIDENCE_THRESHOLD],
  );

  const row = rows[0];
  if (!row) return DEFAULT_PUBLIC_COUNTS;

  const publicScoredCalls = Number(row.public_scored_calls);
  return {
    trackedCreators: TRACKED_CREATOR_COUNT,
    rankedCreators: Number(row.ranked_creators),
    trackedCalls: Number(row.tracked_calls),
    scoredCalls: publicScoredCalls,
    publicScoredCalls,
    beatBtcCreators: Number(row.beat_btc_creators),
    llmValidatedCalls: Number(row.llm_validated_calls),
    confidencePassCalls: Number(row.llm_validated_calls),
    pendingPublicScoringCalls: Number(row.pending_horizon_calls),
    liveOpenCalls: Number(row.pending_horizon_calls),
    pendingHorizonCalls: Number(row.pending_horizon_calls),
    pending30dCalls: Number(row.pending_horizon_calls),
    pendingTarget90dCalls: Number(row.target_pending_calls),
    missingPriceCalls: Number(row.missing_price_calls),
    missing30dCalls: Number(row.missing_30d_calls),
    missingTargetCalls: Number(row.target_pending_calls),
    targetPendingCalls: Number(row.target_pending_calls),
    excludedLowConfidenceCalls: Number(row.excluded_low_confidence_calls),
  };
}

export { PUBLIC_COUNT_LABELS };
