import { NextRequest, NextResponse } from "next/server";
import { captureApiException } from "@/lib/monitoring";
import { query } from "@/lib/db";
import { getCreatorTier } from "@/lib/creator-tier";
import { hasAccess } from "@/lib/whop";
import { getUserTier } from "@/lib/whop-access";
import { computeTrend } from "@/lib/scoring";
import { computeAllSelfCorrectionAggregates } from "@/lib/self-correction";
import { getLeaderboardEligibilitySql } from "@/lib/leaderboard-eligibility";
import { getLegacyCreatorExclusionSql } from "@/lib/legacy-creator-overrides";
import { getRequestAuthContext } from "@/lib/auth";
import { leaderboardQueryRowSchema, parseApiRows, type LeaderboardQueryRow } from "@/lib/api-schemas";
import type {
  Creator,
  CreatorStats,
  Call,
  LeaderboardRow,
  Period,
  Tier,
} from "@/lib/types";

const VALID_PERIODS: readonly Period[] = ["all_time", "90d", "30d"] as const;

interface PrevScoreRow {
  readonly creator_id: number;
  readonly alpha_score: number;
}

function isValidPeriod(value: string): value is Period {
  return (VALID_PERIODS as readonly string[]).includes(value);
}

function buildCreator(row: LeaderboardQueryRow): Creator {
  return {
    id: row.creator_id,
    name: row.name,
    youtube_handle: row.youtube_handle,
    youtube_channel_id: row.youtube_channel_id,
    subscribers: row.subscribers,
    focus: row.focus,
    tier: row.tier,
    total_calls: row.creator_total_calls,
    win_rate: row.creator_win_rate,
    avg_return: row.creator_avg_return,
    alpha_score: row.creator_alpha_score,
    accuracy_rank: row.creator_accuracy_rank,
    last_scraped_at: row.creator_last_scraped_at,
    created_at: row.creator_created_at,
  };
}

function buildStats(row: LeaderboardQueryRow): CreatorStats {
  return {
    id: row.id,
    creator_id: row.creator_id,
    period: row.period,
    total_calls: row.total_calls,
    win_rate: row.win_rate,
    avg_return_7d: row.avg_return_7d,
    avg_return_30d: row.avg_return_30d,
    avg_return_90d: row.avg_return_90d,
    avg_alpha_30d: row.avg_alpha_30d,
    best_call_id: row.best_call_id,
    worst_call_id: row.worst_call_id,
    hit_rate: row.hit_rate,
    most_called_symbol: row.most_called_symbol,
    strategy_consistency: row.strategy_consistency,
    specificity_avg: row.specificity_avg,
    alpha_score: row.alpha_score,
    accuracy_rank: row.accuracy_rank,
    effective_n: row.effective_n,
    wilson_lb: row.wilson_lb,
    bullish_win_rate: row.bullish_win_rate,
    bearish_win_rate: row.bearish_win_rate,
    bullish_pct: row.bullish_pct,
    sharpe_ratio: row.sharpe_ratio,
    updated_at: row.updated_at,
  };
}

function buildCallSummary(
  id: number | null,
  symbol: string | null,
  returnVal: number | null,
  score: number | null,
  date: string | null,
  direction: string | null,
): Partial<Call> | null {
  if (symbol === null) return null;
  return {
    id: id ?? undefined,
    symbol,
    return_30d: returnVal,
    score: score ?? 0,
    call_date: date ?? "",
    direction: (direction as Call["direction"]) ?? "neutral",
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let periodForMonitoring: string | null = null;
  try {
    const { searchParams } = request.nextUrl;
    const periodParam = searchParams.get("period") ?? "all_time";
    periodForMonitoring = periodParam;

    if (!isValidPeriod(periodParam)) {
      return NextResponse.json(
        {
          error: `Invalid period. Must be one of: ${VALID_PERIODS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const period: Period = periodParam;
    const leaderboardEligibleSql = getLeaderboardEligibilitySql("cs", period);
    const legacyCreatorExclusionSql = getLegacyCreatorExclusionSql("c");
    if (period !== "all_time") {
      const auth = getRequestAuthContext(request);
      const userTier = auth.session?.tier ?? (await getUserTier(auth.accessToken, auth.session?.userId));
      if (!hasAccess(userTier, "pro")) {
        return NextResponse.json(
          { error: "upgrade_required", required_tier: "pro", upgrade_url: "/pricing" },
          { status: 402 },
        );
      }
    }

    const rawRows = await query<LeaderboardQueryRow>(
      `SELECT
        cs.*,
        c.name,
        c.youtube_handle,
        c.youtube_channel_id,
        c.subscribers,
        c.focus,
        c.tier,
        c.alpha_score AS creator_alpha_score,
        c.total_calls AS creator_total_calls,
        c.win_rate AS creator_win_rate,
        c.avg_return AS creator_avg_return,
        c.accuracy_rank AS creator_accuracy_rank,
        c.last_scraped_at AS creator_last_scraped_at,
        c.created_at AS creator_created_at,
        bc.symbol AS best_call_symbol,
        bc.return_30d AS best_call_return,
        bc.score AS best_call_score,
        bc.call_date AS best_call_date,
        bc.direction AS best_call_direction,
        wc.symbol AS worst_call_symbol,
        wc.return_30d AS worst_call_return,
        wc.score AS worst_call_score,
        wc.call_date AS worst_call_date,
        wc.direction AS worst_call_direction
      FROM creator_stats cs
      JOIN creators c ON c.id = cs.creator_id
      LEFT JOIN calls bc ON bc.id = cs.best_call_id
      LEFT JOIN calls wc ON wc.id = cs.worst_call_id
      WHERE cs.period = $1
        AND ${leaderboardEligibleSql}
        AND ${legacyCreatorExclusionSql}
      ORDER BY cs.accuracy_rank ASC NULLS LAST`,
      [period],
    );

    const rows = parseApiRows(leaderboardQueryRowSchema, rawRows, "leaderboard");

    // Fetch previous period scores for trend calculation
    const prevPeriod: Period = period === "30d" ? "90d" : "all_time";
    const prevScores =
      period !== "all_time"
        ? await query<PrevScoreRow>(
            `SELECT creator_id, alpha_score
             FROM creator_stats
             WHERE period = $1`,
            [prevPeriod],
          )
        : [];

    const prevScoreMap = new Map(
      prevScores.map((row) => [row.creator_id, row.alpha_score]),
    );

    // Self-correction aggregates are optional: a brand-new deploy where the
    // `call_revisions` table does not yet exist should not break the main
    // leaderboard. Fall back to an empty map on any error.
    const selfCorrectionMap = await computeAllSelfCorrectionAggregates().catch(
      () => new Map<number, never>(),
    );

    const leaderboard: LeaderboardRow[] = rows.map((row, index) => {
      const rank = index + 1;
      const previousScore = prevScoreMap.get(row.creator_id);
      const trend =
        previousScore !== undefined
          ? computeTrend(row.alpha_score, previousScore)
          : ("stable" as const);

      const selfCorrection = selfCorrectionMap.get(row.creator_id);

      return {
        rank,
        creator: buildCreator(row),
        stats: buildStats(row),
        best_call: buildCallSummary(
          row.best_call_id,
          row.best_call_symbol,
          row.best_call_return,
          row.best_call_score,
          row.best_call_date,
          row.best_call_direction,
        ) as Call | null,
        worst_call: buildCallSummary(
          row.worst_call_id,
          row.worst_call_symbol,
          row.worst_call_return,
          row.worst_call_score,
          row.worst_call_date,
          row.worst_call_direction,
        ) as Call | null,
        tier_required: getCreatorTier(rank),
        trend,
        selfCorrectionScore: selfCorrection?.score ?? 0,
        revisionCount: selfCorrection?.revisionCount ?? 0,
        selfCorrectionTier: selfCorrection?.tier ?? "rarely",
      };
    });

    const latestUpdate = rows.length > 0 ? rows[0].updated_at : null;

    return NextResponse.json({
      data: {
        leaderboard,
        updated_at: latestUpdate ?? new Date().toISOString(),
      },
      meta: {
        total: leaderboard.length,
        period,
      },
    });
  } catch (error: unknown) {
    void captureApiException(error, "/api/leaderboard", { period: periodForMonitoring });
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
