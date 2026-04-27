import type { Metadata } from "next";
import { PageShell } from "@/components/layout";
import {
  ConsensusSnapshotRail,
  ControlsRow,
  LeaderboardTable,
  ThesisBlock,
} from "@/components/composites";
import { Badge } from "@/components/primitives";
import { query } from "@/lib/db";
import { getPublicCounts } from "@/lib/public-counts";
import { getCreatorTier } from "@/lib/whop";
import { computeTrend } from "@/lib/scoring";
import type {
  Creator,
  CreatorStats,
  Call,
  LeaderboardRow,
  Period,
  Tier,
} from "@/lib/types";

const VALID_PERIODS: readonly Period[] = ["all_time", "90d", "30d"];

interface LeaderboardQueryRow {
  readonly id: number;
  readonly creator_id: number;
  readonly period: Period;
  readonly total_calls: number;
  readonly win_rate: number;
  readonly avg_return_7d: number;
  readonly avg_return_30d: number;
  readonly avg_return_90d: number;
  readonly avg_alpha_30d: number;
  readonly best_call_id: number | null;
  readonly worst_call_id: number | null;
  readonly hit_rate: number;
  readonly most_called_symbol: string | null;
  readonly strategy_consistency: number;
  readonly specificity_avg: number;
  readonly alpha_score: number;
  readonly accuracy_rank: number | null;
  readonly effective_n: number;
  readonly wilson_lb: number;
  readonly bullish_win_rate: number;
  readonly bearish_win_rate: number;
  readonly bullish_pct: number;
  readonly sharpe_ratio: number;
  readonly updated_at: string;
  readonly name: string;
  readonly youtube_handle: string;
  readonly youtube_channel_id: string | null;
  readonly subscribers: string | null;
  readonly focus: string | null;
  readonly tier: Tier;
  readonly creator_alpha_score: number;
  readonly creator_total_calls: number;
  readonly creator_win_rate: number;
  readonly creator_avg_return: number;
  readonly creator_accuracy_rank: number | null;
  readonly creator_last_scraped_at: string | null;
  readonly creator_created_at: string;
  readonly best_call_symbol: string | null;
  readonly best_call_return: number | null;
  readonly best_call_score: number | null;
  readonly best_call_date: string | null;
  readonly best_call_direction: string | null;
  readonly worst_call_symbol: string | null;
  readonly worst_call_return: number | null;
  readonly worst_call_score: number | null;
  readonly worst_call_date: string | null;
  readonly worst_call_direction: string | null;
}

interface StatsRow {
  readonly total_calls: string;
  readonly avg_accuracy: string;
  readonly creator_count: string;
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

interface PageProps {
  readonly searchParams: { period?: string };
}

export default async function HomePage({ searchParams }: PageProps) {
  const periodParam = searchParams.period ?? "all_time";
  const period: Period = (VALID_PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : "all_time";

  // Fetch leaderboard from DB
  let leaderboard: LeaderboardRow[] = [];
  try {
    const rows = await query<LeaderboardQueryRow>(
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
        AND cs.total_calls > 0
      ORDER BY cs.accuracy_rank ASC NULLS LAST`,
      [period],
    );

    const prevPeriod: Period = period === "30d" ? "90d" : "all_time";
    const prevScores =
      period !== "all_time"
        ? await query<{ creator_id: number; alpha_score: number }>(
            `SELECT creator_id, alpha_score FROM creator_stats WHERE period = $1`,
            [prevPeriod],
          )
        : [];

    const prevScoreMap = new Map(
      prevScores.map((r) => [r.creator_id, r.alpha_score]),
    );

    leaderboard = rows.map((row, index) => {
      const rank = row.accuracy_rank ?? index + 1;
      const prev = prevScoreMap.get(row.creator_id);
      const trend = prev !== undefined ? computeTrend(row.alpha_score, prev) : ("stable" as const);

      return {
        rank,
        creator: buildCreator(row),
        stats: buildStats(row),
        best_call: row.best_call_symbol
          ? ({
              symbol: row.best_call_symbol,
              return_30d: row.best_call_return,
              score: row.best_call_score ?? 0,
              call_date: row.best_call_date ?? "",
              direction: (row.best_call_direction as Call["direction"]) ?? "neutral",
            } as Call)
          : null,
        worst_call: row.worst_call_symbol
          ? ({
              symbol: row.worst_call_symbol,
              return_30d: row.worst_call_return,
              score: row.worst_call_score ?? 0,
              call_date: row.worst_call_date ?? "",
              direction: (row.worst_call_direction as Call["direction"]) ?? "neutral",
            } as Call)
          : null,
        tier_required: getCreatorTier(rank),
        trend,
      };
    });
  } catch (err) {
    // Re-throw in development to surface errors
    if (process.env.NODE_ENV === "development") {
      throw err;
    }
  }

  let publicCounts = await getPublicCounts().catch(() => null);
  if (!publicCounts) {
    publicCounts = {
      trackedCreators: 20,
      rankedCreators: 0,
      trackedCalls: 0,
      scoredCalls: 0,
      beatBtcCreators: 0,
    };
  }

  // Aggregate stats
  let totalCalls = String(publicCounts.scoredCalls);
  try {
    const statsRows = await query<StatsRow>(
      `SELECT
        COALESCE(SUM(total_calls), 0)::text AS total_calls,
        CASE WHEN COUNT(*) > 0 THEN ROUND((AVG(win_rate) * 100)::numeric, 1)::text ELSE '--' END AS avg_accuracy,
        COUNT(DISTINCT creator_id) FILTER (WHERE total_calls > 0)::text AS creator_count
      FROM creator_stats WHERE period = 'all_time'`,
    );
    if (statsRows.length > 0) {
      totalCalls = Number(statsRows[0].total_calls) > 0 ? statsRows[0].total_calls : "0";
    }
  } catch {
    // Stats not available
  }

  const periodLabel = period === "all_time" ? "all" : period;
  const liveSubtitle = `Calls scored against the chain · N≥10 · ranked by α (log-return excess vs benchmark) · ${periodLabel} window.`;

  return (
    <PageShell>
      <ThesisBlock
        title="Who's actually worth listening to."
        subtitle={liveSubtitle}
        creators={publicCounts.rankedCreators || publicCounts.trackedCreators}
        calls={Number(totalCalls)}
        lastUpdated="public ledger"
      />

      <ControlsRow />

      <section className="leaderboard-layout" aria-label="Leaderboard and consensus snapshot">
        <LeaderboardTable rows={leaderboard} />
        <ConsensusSnapshotRail />
      </section>

      <section className="leaderboard-proof-strip" aria-label="Public data coverage">
        <Badge tone="accent">{publicCounts.trackedCreators} tracked creators</Badge>
        <Badge tone="neutral">{publicCounts.scoredCalls} scored calls</Badge>
        <Badge tone="pos">{publicCounts.beatBtcCreators} beating BTC</Badge>
        <Badge tone="lock">Pro filters pending</Badge>
      </section>
    </PageShell>
  );
}
