import type { Period } from "./types";
import { assertSafeSqlIdentifier } from "./leaderboard-eligibility";

export const CREATOR_STATS_OFFICIAL_THRESHOLDS: Record<Period, number | null> = {
  all_time: 24,
  "12m": 12,
  "90d": 3,
  "30d": null,
};

export const CREATOR_STATS_CERTIFIED_THRESHOLDS: Record<Period, number | null> = {
  all_time: 50,
  "12m": 25,
  "90d": 10,
  "30d": null,
};

export const CREATOR_STATS_PROVISIONAL_THRESHOLDS: Record<Period, number | null> = {
  all_time: 6,
  "12m": 6,
  "90d": 1,
  "30d": null,
};

export const CREATOR_STATS_SAMPLE_PRIOR_N: Record<Period, number | null> = {
  all_time: 24,
  "12m": 25,
  "90d": 10,
  "30d": null,
};

export const CREATOR_STATS_DEFAULT_BASELINE_SCORE = 50;

export type CreatorConfidenceTier = "certified" | "official" | "provisional" | "watchlist" | "pending_maturity";

export function getCreatorStatsOfficialThreshold(period: Period): number | null {
  return CREATOR_STATS_OFFICIAL_THRESHOLDS[period];
}

export function getCreatorStatsCertifiedThreshold(period: Period): number | null {
  return CREATOR_STATS_CERTIFIED_THRESHOLDS[period];
}

export function getCreatorStatsProvisionalThreshold(period: Period): number | null {
  return CREATOR_STATS_PROVISIONAL_THRESHOLDS[period];
}

export function getCreatorStatsSamplePriorN(period: Period): number | null {
  return CREATOR_STATS_SAMPLE_PRIOR_N[period];
}

export function sampleAdjustedCreatorScore(
  creatorRawScore: number,
  sampleSize: number,
  baselineScore = CREATOR_STATS_DEFAULT_BASELINE_SCORE,
  priorN = 25,
): number {
  const raw = Number.isFinite(creatorRawScore) ? creatorRawScore : 0;
  const n = Math.max(0, Number.isFinite(sampleSize) ? sampleSize : 0);
  const baseline = Number.isFinite(baselineScore) ? baselineScore : CREATOR_STATS_DEFAULT_BASELINE_SCORE;
  const prior = Math.max(0, Number.isFinite(priorN) ? priorN : 0);
  if (n + prior === 0) return baseline;
  return ((raw * n) + (baseline * prior)) / (n + prior);
}

export function getCreatorConfidenceTier(period: Period, totalCalls: number): CreatorConfidenceTier {
  if (period === "30d") return "pending_maturity";
  const calls = Math.max(0, totalCalls);
  const certified = getCreatorStatsCertifiedThreshold(period) ?? Number.POSITIVE_INFINITY;
  const official = getCreatorStatsOfficialThreshold(period) ?? Number.POSITIVE_INFINITY;
  const provisional = getCreatorStatsProvisionalThreshold(period) ?? Number.POSITIVE_INFINITY;
  if (calls >= certified) return "certified";
  if (calls >= official) return "official";
  if (calls >= provisional) return "provisional";
  return "watchlist";
}

export function getCreatorStatsHardExclusionSql(creatorAlias = "cr"): string {
  assertSafeSqlIdentifier(creatorAlias, "creator stats creator exclusion");
  return `NOT (
    LOWER(COALESCE(${creatorAlias}.name, '')) LIKE '%altcoin daily%'
    OR LOWER(REPLACE(COALESCE(${creatorAlias}.youtube_handle, ''), '@', '')) = 'altcoindaily'
    OR LOWER(COALESCE(${creatorAlias}.youtube_channel_id, '')) = 'ucblhgkvy-bjpcawebgtnfbw'
    OR LOWER(REGEXP_REPLACE(COALESCE(${creatorAlias}.name, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('alexbeckerschannel','moneyzg','cryptoinspector')
    OR LOWER(REGEXP_REPLACE(COALESCE(${creatorAlias}.youtube_handle, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('alexbeckerschannel','moneyzg','cryptoinspector')
  )`;
}

export interface CreatorStatsOfficialEligibilitySqlArgs {
  readonly statsAlias?: string;
  readonly creatorAlias?: string;
  readonly freshnessAlias?: string;
}

export function getCreatorStatsOfficialEligibilitySql(
  args: CreatorStatsOfficialEligibilitySqlArgs = {},
): string {
  const statsAlias = args.statsAlias ?? "cs";
  const creatorAlias = args.creatorAlias ?? "cr";
  const freshnessAlias = args.freshnessAlias ?? "vf";
  assertSafeSqlIdentifier(statsAlias, "creator stats official stats");
  assertSafeSqlIdentifier(creatorAlias, "creator stats official creator");
  assertSafeSqlIdentifier(freshnessAlias, "creator stats official freshness");

  return `
    ${statsAlias}.total_calls > 0
    AND ${statsAlias}.total_calls >= CASE
      WHEN ${statsAlias}.period = 'all_time' THEN ${CREATOR_STATS_OFFICIAL_THRESHOLDS.all_time}
      WHEN ${statsAlias}.period = '12m' THEN ${CREATOR_STATS_OFFICIAL_THRESHOLDS["12m"]}
      WHEN ${statsAlias}.period = '90d' THEN ${CREATOR_STATS_OFFICIAL_THRESHOLDS["90d"]}
      ELSE 2147483647
    END
    AND ${statsAlias}.period <> '30d'
    AND ${freshnessAlias}.latest_video_date IS NOT NULL
    AND ${freshnessAlias}.latest_video_date >= NOW() - INTERVAL '180 days'
    AND ${getCreatorStatsHardExclusionSql(creatorAlias)}
  `.trim();
}
