import { query } from "./db";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  PUBLIC_COUNT_LABELS,
  getCallEligibilitySql,
  getScoreReadyIgnoringConfidenceSql,
} from "./public-methodology";
import { TRACKED_CREATOR_COUNT } from "./tracked-creators";
import { getLeaderboardEligibilitySql } from "./leaderboard-eligibility";
import { getJudgmentWindowSql } from "./judgment-window";

interface CountsRow {
  readonly tracked_calls: string;
  readonly confidence_pass_calls: string;
  readonly public_scored_calls: string;
  readonly pending_public_scoring_calls: string;
  readonly pending_horizon_calls: string;
  readonly pending_30d_calls: string;
  readonly pending_target_90d_calls: string;
  readonly missing_price_calls: string;
  readonly missing_30d_calls: string;
  readonly missing_target_calls: string;
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
  readonly pendingHorizonCalls: number;
  readonly pending30dCalls: number;
  readonly pendingTarget90dCalls: number;
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
  pendingHorizonCalls: 0,
  pending30dCalls: 0,
  pendingTarget90dCalls: 0,
  missingPriceCalls: 0,
  missing30dCalls: 0,
  missingTargetCalls: 0,
  targetPendingCalls: 0,
  excludedLowConfidenceCalls: 0,
};

export async function getPublicCounts(): Promise<PublicCounts> {
  const eligibleSql = getCallEligibilitySql("c");
  const scoreReadyIgnoringConfidenceSql = getScoreReadyIgnoringConfidenceSql("c");
  const judgmentWindowSql = getJudgmentWindowSql("c");
  const leaderboardEligibleSql = getLeaderboardEligibilitySql("cs");
  const rows = await query<CountsRow>(
    `SELECT
      COUNT(c.id) FILTER (WHERE ${judgmentWindowSql})::text AS tracked_calls,
      COUNT(c.id) FILTER (WHERE ${judgmentWindowSql} AND c.extraction_confidence >= $1)::text AS confidence_pass_calls,
      COUNT(c.id) FILTER (WHERE ${judgmentWindowSql} AND ${eligibleSql})::text AS public_scored_calls,
      COUNT(c.id) FILTER (
        WHERE ${judgmentWindowSql}
          AND c.extraction_confidence >= $1
          AND NOT (${scoreReadyIgnoringConfidenceSql})
      )::text AS pending_public_scoring_calls,
      COUNT(c.id) FILTER (
        WHERE ${judgmentWindowSql}
          AND c.extraction_confidence >= $1
          AND c.price_at_call IS NOT NULL
          AND c.call_date > NOW() - INTERVAL '30 days'
      )::text AS pending_30d_calls,
      COUNT(c.id) FILTER (
        WHERE ${judgmentWindowSql}
          AND c.extraction_confidence >= $1
          AND c.price_at_call IS NOT NULL
          AND c.call_date <= NOW() - INTERVAL '30 days'
          AND c.price_30d IS NOT NULL
          AND c.return_30d IS NOT NULL
          AND c.target_price IS NOT NULL
          AND c.call_date > NOW() - INTERVAL '90 days'
      )::text AS pending_target_90d_calls,
      COUNT(c.id) FILTER (
        WHERE ${judgmentWindowSql}
          AND c.extraction_confidence >= $1
          AND c.price_at_call IS NOT NULL
          AND (
            c.call_date > NOW() - INTERVAL '30 days'
            OR (
              c.call_date <= NOW() - INTERVAL '30 days'
              AND c.price_30d IS NOT NULL
              AND c.return_30d IS NOT NULL
              AND c.target_price IS NOT NULL
              AND c.call_date > NOW() - INTERVAL '90 days'
            )
          )
      )::text AS pending_horizon_calls,
      COUNT(c.id) FILTER (
        WHERE ${judgmentWindowSql}
          AND c.extraction_confidence >= $1
          AND c.price_at_call IS NULL
      )::text AS missing_price_calls,
      COUNT(c.id) FILTER (
        WHERE ${judgmentWindowSql}
          AND c.extraction_confidence >= $1
          AND c.price_at_call IS NOT NULL
          AND c.call_date <= NOW() - INTERVAL '30 days'
          AND (c.price_30d IS NULL OR c.return_30d IS NULL)
      )::text AS missing_30d_calls,
      COUNT(c.id) FILTER (
        WHERE ${judgmentWindowSql}
          AND c.extraction_confidence >= $1
          AND c.price_at_call IS NOT NULL
          AND c.call_date <= NOW() - INTERVAL '30 days'
          AND c.price_30d IS NOT NULL
          AND c.return_30d IS NOT NULL
          AND c.target_price IS NOT NULL
          AND c.call_date <= NOW() - INTERVAL '90 days'
          AND (c.price_90d IS NULL OR c.hit_target IS NULL)
      )::text AS missing_target_calls,
      COUNT(c.id) FILTER (WHERE ${judgmentWindowSql} AND c.extraction_confidence < $1)::text AS excluded_low_confidence_calls,
      (SELECT COUNT(*)::text FROM creator_stats cs WHERE cs.period = 'all_time' AND ${leaderboardEligibleSql}) AS ranked_creators,
      (SELECT COUNT(*)::text FROM creator_stats cs WHERE cs.period = 'all_time' AND ${leaderboardEligibleSql} AND cs.avg_alpha_30d > 0) AS beat_btc_creators
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
    // Backward-compatibility aliases for the same confidence-passing count.
    llmValidatedCalls: Number(row.confidence_pass_calls),
    confidencePassCalls: Number(row.confidence_pass_calls),
    pendingPublicScoringCalls: Number(row.pending_public_scoring_calls),
    // Backward-compatibility aliases for calls still inside the 30-day horizon.
    liveOpenCalls: Number(row.pending_30d_calls),
    pendingHorizonCalls: Number(row.pending_horizon_calls),
    pending30dCalls: Number(row.pending_30d_calls),
    pendingTarget90dCalls: Number(row.pending_target_90d_calls),
    missingPriceCalls: Number(row.missing_price_calls),
    missing30dCalls: Number(row.missing_30d_calls),
    missingTargetCalls: Number(row.missing_target_calls),
    targetPendingCalls: Number(row.pending_target_90d_calls),
    excludedLowConfidenceCalls: Number(row.excluded_low_confidence_calls),
  };
}

export { PUBLIC_COUNT_LABELS };
