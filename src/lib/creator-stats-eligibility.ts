import type { Period } from "./types";
import { assertSafeSqlIdentifier } from "./leaderboard-eligibility";

const OFFICIAL_CREATOR_STATS_THRESHOLDS: Record<Period, number | null> = {
  all_time: 50,
  "90d": 25,
  "30d": null,
};

export function getCreatorStatsOfficialThreshold(period: Period): number | null {
  return OFFICIAL_CREATOR_STATS_THRESHOLDS[period];
}

export function getCreatorStatsHardExclusionSql(creatorAlias = "cr"): string {
  assertSafeSqlIdentifier(creatorAlias, "creator stats creator exclusion");
  return `NOT (
    LOWER(COALESCE(${creatorAlias}.name, '')) LIKE '%altcoin daily%'
    OR LOWER(REPLACE(COALESCE(${creatorAlias}.youtube_handle, ''), '@', '')) = 'altcoindaily'
    OR LOWER(COALESCE(${creatorAlias}.youtube_channel_id, '')) = 'ucblhgkvy-bjpcawebgtnfbw'
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
      WHEN ${statsAlias}.period = 'all_time' THEN 50
      WHEN ${statsAlias}.period = '90d' THEN 25
      ELSE 2147483647
    END
    AND ${statsAlias}.period <> '30d'
    AND ${freshnessAlias}.latest_video_date IS NOT NULL
    AND ${freshnessAlias}.latest_video_date >= NOW() - INTERVAL '180 days'
    AND ${getCreatorStatsHardExclusionSql(creatorAlias)}
  `.trim();
}
