import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import Leaderboard from "@/components/Leaderboard";
import ConsensusSignals from "@/components/ConsensusSignals";
import PeriodFilter from "@/components/PeriodFilter";
import { EditorialSection, MetaStrip } from "@/components/primitives";
import { getCurrentTier } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPublicCounts } from "@/lib/public-counts";
import { getCreatorTier, hasAccess } from "@/lib/whop";
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
  title: "CallScore — Market Calls, Measured",
  description:
    "Market calls scored against real price data, with every Alpha Score tied to the published methodology.",
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

function MarketCallPreview({ totalCalls }: { readonly totalCalls: string }): ReactElement {
  const rows = [
    { label: "recorded", value: totalCalls },
    { label: "scored", value: "price matched" },
    { label: "ranked", value: "methodology" },
  ];

  return (
    <aside className="border border-ink-250 bg-paper p-5 shadow-paper">
      <div className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-5">
        Live market record
      </div>
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.label} className="border-t border-ink-150 pt-3 first:border-t-0 first:pt-0">
            <div className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-1">
              {row.label}
            </div>
            <div className="font-serif text-[24px] text-ink-900 leading-none">
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
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
  const requestedPeriod: Period = (VALID_PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : "all_time";
  const currentTier = await getCurrentTier();
  const canUseRecent = hasAccess(currentTier, "pro");
  const period: Period = canUseRecent ? requestedPeriod : "all_time";

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

  // Fetch consensus signals only for Alpha users.
  let signals: ConsensusSignal[] = [];
  const canUseConsensus = hasAccess(currentTier, "alpha");
  if (canUseConsensus) {
    try {
      signals = await query<ConsensusSignal>(
        `SELECT * FROM consensus_signals ORDER BY signal_date DESC LIMIT 10`,
      );
    } catch {
      // No signals yet
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

  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      {/* HERO */}
      <section className="min-h-[calc(100vh-80px)] pb-12 border-b border-ink-250 flex flex-col justify-center">
        <div className="grid grid-cols-1 desk:grid-cols-[minmax(0,0.95fr)_minmax(440px,0.75fr)] gap-8 desk:gap-12 items-center">
          <div>
            <p className="font-mono text-[11px] text-accent tracking-caps uppercase mb-4">
              CallScore
            </p>
            <h1 className="font-serif text-[42px] tab:text-[58px] desk:text-[72px] text-ink-900 font-medium tracking-tight leading-[0.98] text-balance max-w-[920px] mb-5">
              Market calls, <em className="italic font-normal text-accent">measured.</em>
            </h1>
            <p className="font-serif text-[18px] tab:text-[21px] text-ink-700 leading-relaxed max-w-[720px] mb-7">
              Track creator calls against real price data. See who finds alpha,
              who misses, and who corrects course.
            </p>
            <div className="flex flex-col tab:flex-row gap-3 mb-8">
              <Link
                href="#leaderboard"
                className="inline-flex justify-center bg-accent hover:bg-accent-dim text-ink-0 font-mono text-[11px] tracking-caps uppercase px-5 py-3 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                style={{ borderRadius: 2 }}
              >
                View leaderboard
              </Link>
              <Link
                href="/pricing"
                className="inline-flex justify-center border border-ink-300 text-ink-800 hover:bg-ink-100 font-mono text-[11px] tracking-caps uppercase px-5 py-3 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                style={{ borderRadius: 2 }}
              >
                Get alerts
              </Link>
            </div>
            <MetaStrip
              cells={[
                { k: "creators", v: <>{publicCounts.trackedCreators}</> },
                { k: "scored calls", v: totalCalls },
                {
                  k: "beating BTC",
                  v: (
                    <>
                      {publicCounts.beatBtcCreators}{" "}
                      <span className="text-ink-500">/ {publicCounts.rankedCreators}</span>
                    </>
                  ),
                },
                {
                  k: "methodology",
                  v: (
                    <Link
                      href="/methodology"
                      className="text-accent hover:text-accent-dim underline-offset-4 hover:underline"
                    >
                      read
                    </Link>
                  ),
                },
              ]}
            />
          </div>

          <MarketCallPreview totalCalls={totalCalls} />
        </div>
      </section>

      {/* 01 · PREMISE */}
      <EditorialSection
        index="01"
        title={
          <>
            The <em className="italic text-accent">premise</em>, sourced.
          </>
        }
        meta={
          <>
            three claims · <b className="text-ink-900">peer-reviewed</b>
            <br />
            one signature signal · <b className="text-ink-900">self-correction</b>
          </>
        }
      >
        <ul className="border-y border-ink-150">
          <PremiseRow
            claim="76% of influencer-endorsed tokens fail to deliver."
            source={"Arkham · Mar 2025"}
          />
          <PremiseRow
            claim="Top crypto YouTubers are directionally correct ~22% of the time."
            source={"Finance Research Letters · 2024"}
          />
          <PremiseRow
            claim={"Influencer-tweeted tokens returned −19% over 3 months."}
            source={"HBS · Pacelli"}
          />
          <li className="flex flex-col tab:flex-row tab:items-baseline tab:justify-between gap-1 px-4 py-3 border-t border-ink-150">
            <span className="font-serif text-[14px] text-ink-700">
              We also score who admits when they&apos;re wrong.{" "}
              <em className="italic text-accent">No other tracker does.</em>
            </span>
            <span className="font-mono text-[10px] text-ink-500 tracking-wide whitespace-nowrap">
              [self-correction index]
            </span>
          </li>
        </ul>
      </EditorialSection>

      {/* 02 · LEADERBOARD */}
      <EditorialSection
        id="leaderboard"
        index="02"
        title={
          <>
            The ranking, <em className="italic text-accent">by alpha</em>.
          </>
        }
        meta={
          <>
            {publicCounts.rankedCreators} ranked creators · {totalCalls} scored calls
            <br />
            tier S/A/B/C · low-N flagged
          </>
        }
      >
        <div className="flex flex-col tab:flex-row tab:items-end tab:justify-between gap-3 mb-4">
          <p className="font-mono text-[11px] text-ink-500 tracking-wide">
            Sorted by alpha; ties broken by Wilson lower bound.
          </p>
          <PeriodFilter value={period} canUseRecent={canUseRecent} />
        </div>
        {leaderboard.length > 0 ? (
          <Leaderboard rows={leaderboard} />
        ) : (
          <div className="border-t border-ink-250 py-12 text-center">
            <p className="font-mono text-[11px] text-ink-500 tracking-wide">
              Leaderboard data is being computed. Run the data pipeline to populate
              scores.
            </p>
          </div>
        )}
      </EditorialSection>

      {/* 03 · CONSENSUS */}
      <EditorialSection
        index="03"
        title={
          <>
            What&apos;s <em className="italic text-accent">forming</em> across creators.
          </>
        }
      >
        <ConsensusSignals signals={signals} locked={!canUseConsensus} />
      </EditorialSection>
    </div>
  );
}

interface PremiseRowProps {
  readonly claim: string;
  readonly source: string;
}

function PremiseRow({ claim, source }: PremiseRowProps): ReactElement {
  return (
    <li className="flex flex-col tab:flex-row tab:items-baseline tab:justify-between gap-1 px-4 py-3 border-t border-ink-150 first:border-t-0">
      <span className="font-serif text-[14px] text-ink-700">{claim}</span>
      <span className="font-mono text-[10px] text-ink-500 tracking-wide whitespace-nowrap">
        [{source}]
      </span>
    </li>
  );
}
