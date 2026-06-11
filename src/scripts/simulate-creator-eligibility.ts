import { query } from "../lib/db";
import { sampleAdjustedCreatorScore } from "../lib/creator-stats-eligibility";
import { loadEnv } from "./script-helpers";

type Period = "all_time" | "12m" | "90d" | "30d";
type Bucket = "official" | "provisional" | "watchlist" | "stale" | "excluded" | "pending";

interface StrategyRule {
  readonly official: number | null;
  readonly certified: number | null;
  readonly provisional: number | null;
  readonly priorN: number;
}

interface Strategy {
  readonly name: string;
  readonly rules: Record<Period, StrategyRule>;
}

const DISABLED = 2147483647;

const strategies: readonly Strategy[] = [
  {
    name: "A_current_strict",
    rules: {
      all_time: { official: 50, certified: 50, provisional: 10, priorN: 25 },
      "12m": { official: 25, certified: 25, provisional: 10, priorN: 25 },
      "90d": { official: 25, certified: 25, provisional: 5, priorN: 10 },
      "30d": { official: null, certified: null, provisional: null, priorN: 10 },
    },
  },
  {
    name: "B_one_call_per_month",
    rules: {
      all_time: { official: 24, certified: 50, provisional: 6, priorN: 24 },
      "12m": { official: 12, certified: 25, provisional: 6, priorN: 25 },
      "90d": { official: 3, certified: 10, provisional: 1, priorN: 10 },
      "30d": { official: null, certified: null, provisional: null, priorN: 10 },
    },
  },
  {
    name: "C_balanced_confidence",
    rules: {
      all_time: { official: 36, certified: 50, provisional: 6, priorN: 24 },
      "12m": { official: 12, certified: 25, provisional: 6, priorN: 25 },
      "90d": { official: 6, certified: 10, provisional: 1, priorN: 10 },
      "30d": { official: null, certified: null, provisional: null, priorN: 10 },
    },
  },
  {
    name: "D_official_certified_sample_adjusted",
    rules: {
      all_time: { official: 24, certified: 50, provisional: 6, priorN: 24 },
      "12m": { official: 12, certified: 25, provisional: 6, priorN: 25 },
      "90d": { official: 3, certified: 10, provisional: 1, priorN: 10 },
      "30d": { official: null, certified: null, provisional: null, priorN: 10 },
    },
  },
];

interface CreatorAggregate {
  readonly period: Period;
  readonly creator_id: number;
  readonly name: string;
  readonly youtube_handle: string | null;
  readonly youtube_channel_id: string | null;
  readonly total_calls: number;
  readonly alpha_score: number;
  readonly win_rate: number;
  readonly latest_video_date: string | null;
  readonly excluded: boolean;
  readonly stale: boolean;
}

function classify(row: CreatorAggregate, rule: StrategyRule): Bucket {
  if (row.excluded) return "excluded";
  if (row.period === "30d" || rule.official === null) return "pending";
  if (row.stale) return "stale";
  if (row.total_calls > 0 && row.total_calls >= rule.official) return "official";
  if (rule.provisional !== null && row.total_calls > 0 && row.total_calls >= rule.provisional) return "provisional";
  return "watchlist";
}

function unsafe(row: CreatorAggregate, bucket: Bucket, rule: StrategyRule): boolean {
  if (bucket !== "official") return false;
  if (row.excluded || row.stale || row.total_calls <= 0) return true;
  if (rule.official === null) return true;
  return row.total_calls < rule.official;
}

async function loadAggregates(): Promise<CreatorAggregate[]> {
  return query<CreatorAggregate>(
    `WITH periods(period, since_days) AS (
       VALUES ('all_time'::text, NULL::int), ('12m'::text, 365), ('90d'::text, 90), ('30d'::text, 30)
     ), latest AS (
       SELECT creator_id, MAX(published_at) AS latest_video_date
       FROM videos
       GROUP BY creator_id
     )
     SELECT
       p.period,
       cr.id AS creator_id,
       cr.name,
       cr.youtube_handle,
       cr.youtube_channel_id,
       COUNT(c.id) FILTER (
         WHERE c.score > 0
           AND c.extraction_confidence >= 0.70
           AND (p.since_days IS NULL OR c.call_date >= NOW() - (p.since_days * INTERVAL '1 day'))
       )::int AS total_calls,
       COALESCE(AVG(c.score) FILTER (
         WHERE c.score > 0
           AND c.extraction_confidence >= 0.70
           AND (p.since_days IS NULL OR c.call_date >= NOW() - (p.since_days * INTERVAL '1 day'))
       ), 0)::float8 AS alpha_score,
       COALESCE(AVG(CASE WHEN c.correct_direction THEN 1.0 ELSE 0.0 END) FILTER (
         WHERE c.score > 0
           AND c.extraction_confidence >= 0.70
           AND (p.since_days IS NULL OR c.call_date >= NOW() - (p.since_days * INTERVAL '1 day'))
       ), 0)::float8 AS win_rate,
       latest.latest_video_date::text,
       (
         LOWER(COALESCE(cr.name, '')) LIKE '%altcoin daily%'
         OR LOWER(REPLACE(COALESCE(cr.youtube_handle, ''), '@', '')) = 'altcoindaily'
         OR LOWER(COALESCE(cr.youtube_channel_id, '')) = 'ucblhgkvy-bjpcawebgtnfbw'
         OR LOWER(REGEXP_REPLACE(COALESCE(cr.name, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('alexbeckerschannel','moneyzg','cryptoinspector')
         OR LOWER(REGEXP_REPLACE(COALESCE(cr.youtube_handle, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('alexbeckerschannel','moneyzg','cryptoinspector')
       ) AS excluded,
       (latest.latest_video_date IS NOT NULL AND latest.latest_video_date < NOW() - INTERVAL '180 days') AS stale
     FROM periods p
     CROSS JOIN creators cr
     LEFT JOIN latest ON latest.creator_id = cr.id
     LEFT JOIN calls c ON c.creator_id = cr.id
     GROUP BY p.period, cr.id, cr.name, cr.youtube_handle, cr.youtube_channel_id, latest.latest_video_date`,
  );
}

function summarizeStrategy(strategy: Strategy, rows: readonly CreatorAggregate[]) {
  const currentOfficial = new Map<string, Set<number>>();
  const current = strategies[0];
  for (const row of rows) {
    const rule = current.rules[row.period];
    if (classify(row, rule) === "official") {
      const set = currentOfficial.get(row.period) ?? new Set<number>();
      set.add(row.creator_id);
      currentOfficial.set(row.period, set);
    }
  }

  return (Object.keys(strategy.rules) as Period[]).map((period) => {
    const rule = strategy.rules[period];
    const periodRows = rows.filter((row) => row.period === period);
    const baselineRows = periodRows.filter((row) => row.total_calls > 0 && !row.excluded && !row.stale);
    const baseline = baselineRows.length > 0
      ? baselineRows.reduce((sum, row) => sum + row.alpha_score, 0) / baselineRows.length
      : 50;
    const classified = periodRows.map((row) => {
      const bucket = classify(row, rule);
      const adjustedScore = sampleAdjustedCreatorScore(row.alpha_score, row.total_calls, baseline, rule.priorN);
      return {
        ...row,
        bucket,
        certified: rule.certified !== null && bucket === "official" && row.total_calls >= rule.certified,
        adjustedScore,
        unsafe: unsafe(row, bucket, rule),
      };
    });
    const official = classified
      .filter((row) => row.bucket === "official")
      .sort((a, b) => b.adjustedScore - a.adjustedScore || b.alpha_score - a.alpha_score || b.win_rate - a.win_rate || b.total_calls - a.total_calls || a.creator_id - b.creator_id);
    const currentSet = currentOfficial.get(period) ?? new Set<number>();
    return {
      period,
      baseline: Number(baseline.toFixed(2)),
      counts: {
        official: official.length,
        certified: official.filter((row) => row.certified).length,
        provisional: classified.filter((row) => row.bucket === "provisional").length,
        watchlist: classified.filter((row) => row.bucket === "watchlist").length,
        stale: classified.filter((row) => row.bucket === "stale").length,
        excluded: classified.filter((row) => row.bucket === "excluded").length,
        pending: classified.filter((row) => row.bucket === "pending").length,
        unsafeOfficial: classified.filter((row) => row.unsafe).length,
      },
      totalCallsDistribution: {
        min: official.length ? Math.min(...official.map((row) => row.total_calls)) : null,
        median: official.length ? official.map((row) => row.total_calls).sort((a, b) => a - b)[Math.floor(official.length / 2)] : null,
        max: official.length ? Math.max(...official.map((row) => row.total_calls)) : null,
      },
      newlyAdmitted: official.filter((row) => !currentSet.has(row.creator_id)).slice(0, 25).map((row) => ({ name: row.name, handle: row.youtube_handle, calls: row.total_calls, adjustedScore: Number(row.adjustedScore.toFixed(2)) })),
      top25: official.slice(0, 25).map((row, index) => ({ rank: index + 1, name: row.name, handle: row.youtube_handle, calls: row.total_calls, rawScore: Number(row.alpha_score.toFixed(2)), adjustedScore: Number(row.adjustedScore.toFixed(2)), certified: row.certified })),
      unsafeOfficialRows: classified.filter((row) => row.unsafe).map((row) => ({ name: row.name, handle: row.youtube_handle, calls: row.total_calls })),
    };
  });
}

async function main() {
  loadEnv();
  const rows = await loadAggregates();
  const result = {
    generatedAt: new Date().toISOString(),
    verdict: "D_official_certified_sample_adjusted is preferred if unsafeOfficialRows remain empty; it supports one-call/month via 12m=12 and controls variance with sample adjustment/certified tiers.",
    strategies: strategies.map((strategy) => ({
      name: strategy.name,
      periods: summarizeStrategy(strategy, rows),
    })),
  };
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
