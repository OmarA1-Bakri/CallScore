import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Trophy, BarChart3, Target, Users } from "lucide-react";
import Leaderboard from "@/components/Leaderboard";
import ConsensusSignals from "@/components/ConsensusSignals";
import PeriodFilter from "@/components/PeriodFilter";
import { query } from "@/lib/db";
import { getPublicCounts, PUBLIC_COUNT_LABELS } from "@/lib/public-counts";
import { getCreatorTier } from "@/lib/whop";
import { computeTrend } from "@/lib/scoring";
import { computeAllSelfCorrectionAggregates } from "@/lib/self-correction";
import type {
  Creator,
  CreatorStats,
  Call,
  LeaderboardRow,
  ConsensusSignal,
  Period,
  Tier,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Crypto YouTuber Leaderboard — Who Actually Beats The Market? | CryptoTubers Ranked",
  description:
    "See which crypto YouTubers have the best track record, with every public Alpha Score tied to the published methodology.",
  alternates: { canonical: "/" },
};

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

export default async function HomePage({
  searchParams,
}: PageProps): Promise<ReactElement> {
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

    // Self-correction aggregates are optional: tolerate a missing
    // call_revisions table so the home page still renders pre-migration.
    const selfCorrectionMap = await computeAllSelfCorrectionAggregates().catch(
      () => new Map<number, never>(),
    );

    leaderboard = rows.map((row, index) => {
      const rank = row.accuracy_rank ?? index + 1;
      const prev = prevScoreMap.get(row.creator_id);
      const trend = prev !== undefined ? computeTrend(row.alpha_score, prev) : ("stable" as const);
      const selfCorrection = selfCorrectionMap.get(row.creator_id);

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
        selfCorrectionScore: selfCorrection?.score ?? 0,
        revisionCount: selfCorrection?.revisionCount ?? 0,
        selfCorrectionTier: selfCorrection?.tier ?? "rarely",
      };
    });
  } catch (err) {
    // Re-throw in development to surface errors
    if (process.env.NODE_ENV === "development") {
      throw err;
    }
  }

  // Fetch consensus signals
  let signals: ConsensusSignal[] = [];
  try {
    signals = await query<ConsensusSignal>(
      `SELECT * FROM consensus_signals ORDER BY signal_date DESC LIMIT 10`,
    );
  } catch {
    // No signals yet
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5 mb-6">
          <Trophy className="w-4 h-4 text-accent" />
          <span className="text-accent text-xs font-medium">
            {totalCalls} calls scored against real price data
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
          Most crypto YouTubers are noise.
          <br />
          <span className="text-gradient-gold">
            We found the signal.
          </span>
        </h1>

        <p className="text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
          We track {publicCounts.trackedCreators} crypto YouTubers and score
          every eligible altcoin call against real market data. The current
          leaderboard includes {publicCounts.rankedCreators} creators with
          scored call histories across 18.7M candles of market data.
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-8">
          <StatPill
            icon={Users}
            label={PUBLIC_COUNT_LABELS.trackedCreators}
            value={String(publicCounts.trackedCreators)}
          />
          <StatPill
            icon={BarChart3}
            label={PUBLIC_COUNT_LABELS.scoredCalls}
            value={totalCalls}
          />
          <StatPill
            icon={Target}
            label="Creators Beating BTC"
            value={`${publicCounts.beatBtcCreators} of ${publicCounts.rankedCreators}`}
          />
        </div>
      </section>

      {/* Sourced premise strip — terminal aesthetic, muted dividers */}
      <section
        aria-labelledby="premise-title"
        className="mb-10 font-mono"
      >
        <h2
          id="premise-title"
          className="text-[#5B6B63] text-xs uppercase tracking-[0.08em] mb-3"
        >
          <span className="text-[#5B6B63] mr-1.5">{"//"}</span>
          the premise — sourced
        </h2>
        <ul className="divide-y divide-[rgba(200,211,202,0.08)] border-y border-[rgba(200,211,202,0.08)] bg-[#121815]">
          <PremiseRow
            claim="76% of influencer-endorsed tokens fail to deliver."
            source="Arkham · Mar 2025"
          />
          <PremiseRow
            claim="Top crypto YouTubers are directionally correct ~22% of the time."
            source="Finance Research Letters · 2024"
          />
          <PremiseRow
            claim={"Influencer-tweeted tokens returned \u221219% over 3 months."}
            source="HBS · Pacelli"
          />
          <li className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 px-4 py-3">
            <span className="text-[#5B6B63] text-sm leading-snug">
              We also score who admits when they&apos;re wrong. No other tracker does.
            </span>
            <span className="text-[#5B6B63] text-[11px] tracking-wide whitespace-nowrap">
              [self-correction index]
            </span>
          </li>
        </ul>
      </section>

      {/* Period filter + Leaderboard */}
      <section className="mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-white font-bold text-xl">Leaderboard</h2>
            <p className="text-gray-500 text-sm mt-1">
              Ranked by average Alpha Score across scored calls
            </p>
          </div>
          <PeriodFilter value={period} />
        </div>

        {leaderboard.length > 0 ? (
          <Leaderboard rows={leaderboard} />
        ) : (
          <div className="glass-card p-12 text-center">
            <p className="text-gray-500">
              Leaderboard data is being computed. Run the data pipeline to populate scores.
            </p>
          </div>
        )}
      </section>

      {/* Consensus Signals */}
      <section className="mb-12 max-w-lg">
        <ConsensusSignals signals={signals} />
      </section>
    </div>
  );
}

interface StatPillProps {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
  readonly value: string;
}

interface PremiseRowProps {
  readonly claim: string;
  readonly source: string;
}

function PremiseRow({ claim, source }: PremiseRowProps): ReactElement {
  return (
    <li className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 px-4 py-3">
      <span className="text-[#C8D3CA] text-sm leading-snug">{claim}</span>
      <span className="text-[#5B6B63] text-[11px] tracking-wide whitespace-nowrap">
        [{source}]
      </span>
    </li>
  );
}

function StatPill({ icon: Icon, label, value }: StatPillProps): ReactElement {
  return (
    <div className="flex items-center gap-2 bg-ink-100 border border-ink-200 rounded-lg px-4 py-2.5">
      <Icon className="w-4 h-4 text-accent" />
      <div className="text-left">
        <p className="text-white font-bold text-sm tabular-nums">{value}</p>
        <p className="text-gray-500 text-[10px] uppercase tracking-wider">
          {label}
        </p>
      </div>
    </div>
  );
}
