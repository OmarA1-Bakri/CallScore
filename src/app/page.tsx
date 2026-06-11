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
import {
  getLeaderboardEligibilitySql,
  getLeaderboardSampleThreshold,
} from "@/lib/leaderboard-eligibility";
import { getLegacyCreatorExclusionSql } from "@/lib/legacy-creator-overrides";
import {
  getLeaderboardEmptyMessage,
  getOfficialRankedReadApiRows,
  type ReadApiLeaderboardContract,
} from "@/lib/home-read-api-contract";
import { CREATOR_JUDGMENT_WINDOW_DETAIL_LABEL, CREATOR_JUDGMENT_WINDOW_LABEL, RECENT_PUBLIC_SCORING_MATURITY_NOTE } from "@/lib/judgment-window";
import { getCreatorTier } from "@/lib/creator-tier";
import { toReadApiLeaderboardContract } from "@/lib/leaderboard-safety.mjs";
import { hasAccess } from "@/lib/whop";
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
  title: "Crypto Market Calls Tracker | Score Alpha. Find Edge — CallScore",
  description:
    "CallScore is the crypto market calls tracker that scores every prediction against real price data. Ranked alpha. Transparent methodology. No noise.",
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
  readonly latest_video_date: string | null;
}

interface StatsRow {
  readonly total_calls: string;
  readonly avg_accuracy: string;
  readonly creator_count: string;
}

interface HomeReadApiCounts {
  readonly trackedCreators?: number;
  readonly rankedCreators?: number;
  readonly trackedCalls?: number;
  readonly scoredCalls?: number;
  readonly beatBtcCreators?: number;
  readonly llmValidatedCalls?: number;
  readonly confidencePassCalls?: number;
  readonly publicScoredCalls?: number;
  readonly pendingPublicScoringCalls?: number;
  readonly liveOpenCalls?: number;
  readonly pendingHorizonCalls?: number;
  readonly pending30dCalls?: number;
  readonly pendingTarget90dCalls?: number;
  readonly missingPriceCalls?: number;
  readonly missing30dCalls?: number;
  readonly missingTargetCalls?: number;
  readonly targetPendingCalls?: number;
  readonly excludedLowConfidenceCalls?: number;
}

interface HomeReadApiResponse extends ReadApiLeaderboardContract<LeaderboardQueryRow> {
  readonly publicCounts?: HomeReadApiCounts;
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

function normalizeReadApiBase(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

async function fetchHomeReadApi(period: Period): Promise<HomeReadApiResponse | null> {
  const base = process.env.HH_READ_API_BASE;
  if (!base?.trim()) return null;

  const response = await fetch(`${normalizeReadApiBase(base)}/home?period=${encodeURIComponent(period)}`, {
    cache: "no-store",
  });

  if (!response.ok) return null;
  return (await response.json()) as HomeReadApiResponse;
}

function mergeReadApiCounts(
  fallback: Awaited<ReturnType<typeof getPublicCounts>>,
  readApiCounts: HomeReadApiCounts | undefined,
): Awaited<ReturnType<typeof getPublicCounts>> {
  if (!readApiCounts) return fallback;

  return {
    trackedCreators: readApiCounts.trackedCreators ?? fallback.trackedCreators,
    rankedCreators: readApiCounts.rankedCreators ?? fallback.rankedCreators,
    trackedCalls: readApiCounts.trackedCalls ?? fallback.trackedCalls,
    scoredCalls: readApiCounts.scoredCalls ?? fallback.scoredCalls,
    beatBtcCreators: readApiCounts.beatBtcCreators ?? fallback.beatBtcCreators,
    llmValidatedCalls: readApiCounts.llmValidatedCalls ?? fallback.llmValidatedCalls,
    confidencePassCalls: readApiCounts.confidencePassCalls ?? fallback.confidencePassCalls,
    publicScoredCalls: readApiCounts.publicScoredCalls ?? fallback.publicScoredCalls,
    pendingPublicScoringCalls:
      readApiCounts.pendingPublicScoringCalls ?? fallback.pendingPublicScoringCalls,
    liveOpenCalls: readApiCounts.liveOpenCalls ?? fallback.liveOpenCalls,
    pendingHorizonCalls: readApiCounts.pendingHorizonCalls ?? fallback.pendingHorizonCalls,
    pending30dCalls: readApiCounts.pending30dCalls ?? fallback.pending30dCalls,
    pendingTarget90dCalls: readApiCounts.pendingTarget90dCalls ?? fallback.pendingTarget90dCalls,
    missingPriceCalls: readApiCounts.missingPriceCalls ?? fallback.missingPriceCalls,
    missing30dCalls: readApiCounts.missing30dCalls ?? fallback.missing30dCalls,
    missingTargetCalls: readApiCounts.missingTargetCalls ?? fallback.missingTargetCalls,
    targetPendingCalls: readApiCounts.targetPendingCalls ?? fallback.targetPendingCalls,
    excludedLowConfidenceCalls:
      readApiCounts.excludedLowConfidenceCalls ?? fallback.excludedLowConfidenceCalls,
  };
}

function buildLeaderboardRows(
  rows: readonly LeaderboardQueryRow[],
  prevScoreMap: ReadonlyMap<number, number>,
  selfCorrectionMap: ReadonlyMap<number, { readonly score: number; readonly revisionCount: number; readonly tier: "honest" | "some" | "rarely" }>,
): LeaderboardRow[] {
  return rows.map((row, index) => {
    const rank = index + 1;
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
}

interface PageProps {
  readonly searchParams: Promise<{ period?: string }>;
}

export default async function HomePage({
  searchParams: searchParamsPromise,
}: PageProps): Promise<ReactElement> {
  const searchParams = await searchParamsPromise;
  const periodParam = searchParams.period ?? "all_time";
  const requestedPeriod: Period = (VALID_PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : "all_time";
  const currentTier = await getCurrentTier();
  const canUseRecent = hasAccess(currentTier, "pro");
  const period: Period = canUseRecent ? requestedPeriod : "all_time";

  const sampleThreshold = getLeaderboardSampleThreshold(period);
  const leaderboardEligibleSql = getLeaderboardEligibilitySql("cs", period);
  const legacyCreatorExclusionSql = getLegacyCreatorExclusionSql("c");

  const fallbackPublicCounts: Awaited<ReturnType<typeof getPublicCounts>> = {
    trackedCreators: 20,
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

  const readApiHome = await fetchHomeReadApi(period).catch(() => null);
  let publicCounts: Awaited<ReturnType<typeof getPublicCounts>> | null = readApiHome
    ? mergeReadApiCounts(fallbackPublicCounts, readApiHome.publicCounts)
    : null;

  let leaderboardEmptyContract: Pick<ReadApiLeaderboardContract<unknown>, "emptyReason"> | null =
    readApiHome ? { emptyReason: readApiHome.emptyReason ?? null } : null;

  // Fetch leaderboard from HH read API first. The official homepage rows must
  // come from officialRankedRows, never from compatibility leaderboard.rows or
  // from audit buckets such as excludedRows/staleRows/provisionalRows.
  let leaderboard: LeaderboardRow[] = [];
  const readApiOfficialRows = getOfficialRankedReadApiRows(readApiHome);

  if (readApiHome) {
    leaderboard = buildLeaderboardRows(readApiOfficialRows, new Map(), new Map());
  } else {
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
        latest.latest_video_date,
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
      LEFT JOIN LATERAL (
        SELECT MAX(v.published_at) AS latest_video_date
        FROM videos v
        WHERE v.creator_id = c.id
      ) latest ON TRUE
      LEFT JOIN calls bc ON bc.id = cs.best_call_id
      LEFT JOIN calls wc ON wc.id = cs.worst_call_id
      WHERE cs.period = $1
        AND ${leaderboardEligibleSql}
        AND ${legacyCreatorExclusionSql}
      ORDER BY cs.accuracy_rank ASC NULLS LAST`,
      [period],
    );

    const safeContract = toReadApiLeaderboardContract(period, rows, { period });
    const officialRows = getOfficialRankedReadApiRows(safeContract);
    leaderboardEmptyContract = { emptyReason: safeContract.emptyReason };

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

    leaderboard = buildLeaderboardRows(officialRows, prevScoreMap, selfCorrectionMap);
  } catch (err) {
    // Re-throw in development to surface errors
    if (process.env.NODE_ENV === "development") {
      throw err;
    }
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

  publicCounts = publicCounts ?? await getPublicCounts().catch(() => null);
  if (!publicCounts) {
    publicCounts = fallbackPublicCounts;
  }
  const officialRankedCreatorCount = leaderboard.length;

  // Aggregate stats
  let totalCalls = String(publicCounts.scoredCalls);
  try {
    const statsRows = await query<StatsRow>(
      `SELECT
        COALESCE(SUM(total_calls), 0)::text AS total_calls,
        CASE WHEN COUNT(*) > 0 THEN ROUND((AVG(win_rate) * 100)::numeric, 1)::text ELSE '--' END AS avg_accuracy,
        COUNT(DISTINCT creator_id)::text AS creator_count
      FROM creator_stats cs JOIN creators c ON c.id = cs.creator_id WHERE cs.period = $1 AND ${leaderboardEligibleSql} AND ${legacyCreatorExclusionSql}`,
      [period],
    );
    if (statsRows.length > 0) {
      totalCalls = Number(statsRows[0].total_calls) > 0 ? statsRows[0].total_calls : "0";
    }
  } catch {
    // Stats not available
  }

  return (
    <div className="max-w-page mx-auto px-4 tab:px-8 desk:px-10">
      {/* HERO */}
      <section className="relative min-h-[calc(100vh-80px)] pb-8 desk:pb-12 border-b border-ink-250 overflow-hidden">
        <div
          className="absolute inset-x-[-32px] bottom-[-220px] h-[420px] opacity-40 pointer-events-none"
          style={{
            background:
              "repeating-radial-gradient(ellipse at center, rgba(201,162,75,0.28) 0 1px, transparent 1px 22px)",
            transform: "perspective(720px) rotateX(68deg)",
            transformOrigin: "50% 100%",
          }}
          aria-hidden="true"
        />
        <div className="relative grid grid-cols-1 desk:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 desk:gap-14 items-center pt-10 tab:pt-14 desk:pt-8">
          <div className="desk:pt-6">
            <p
              className="inline-flex items-center gap-2 border border-accent/30 bg-accent/5 px-3 py-2 font-mono text-[12px] text-accent tracking-caps uppercase mb-6"
              style={{ borderRadius: 2 }}
            >
              <span className="h-1.5 w-1.5 bg-accent" style={{ borderRadius: 2 }} aria-hidden="true" />
              The standard for crypto calls
            </p>
            <h1 className="font-serif text-[65px] tab:text-[97px] desk:text-[119px] text-ink-900 font-normal tracking-tight leading-[0.88] text-balance max-w-[880px] mb-3">
              Market calls, <em className="italic font-normal text-accent">measured.</em>
            </h1>
            <h2 className="font-sans text-[16px] tab:text-[18px] text-ink-600 font-medium leading-relaxed max-w-[760px] mb-8">
              The crypto market calls tracker that scores alpha against real price data.
            </h2>
            <p className="font-serif text-[21px] tab:text-[24px] text-ink-700 leading-relaxed max-w-[760px] mb-8">
              Track crypto creators&apos; market calls against real price data.
              Score every eligible call. Rank signal, not noise.
            </p>
            <div className="flex flex-col tab:flex-row gap-3 mb-7">
              <Link
                href="#leaderboard"
                className="inline-flex items-center justify-center gap-3 bg-accent hover:bg-accent-dim text-ink-0 font-mono text-[13px] tracking-caps uppercase px-7 py-4 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                style={{ borderRadius: 2 }}
              >
                View leaderboard
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/pricing"
                className="inline-flex justify-center border border-ink-300 text-ink-900 hover:border-accent/60 hover:text-accent font-mono text-[13px] tracking-caps uppercase px-7 py-4 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                style={{ borderRadius: 2 }}
              >
                Compare plans
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ink-600 font-sans text-[16px]">
              <HeroTrustItem label="Transparent" />
              <HeroTrustItem label="Evidence-based" />
              <HeroTrustItem label="Unbiased" />
            </div>
            <p className="mt-4 max-w-[620px] font-mono text-[11px] uppercase tracking-caps text-ink-500">
              Every eligible score ties back to source calls, timestamped evidence,
              and the published price-window methodology.
            </p>
            <MetaStrip
              cells={[
                { k: "raw calls", v: publicCounts.trackedCalls.toLocaleString() },
                { k: "confidence pass", v: publicCounts.confidencePassCalls.toLocaleString() },
                { k: "public scored", v: publicCounts.publicScoredCalls.toLocaleString() },
                { k: "low-conf excluded", v: publicCounts.excludedLowConfidenceCalls.toLocaleString() },
              ]}
            />
          </div>

          <MarketCallPreview
            totalCalls={totalCalls}
            creatorCount={publicCounts.trackedCreators}
            beatBtcCreators={publicCounts.beatBtcCreators}
            rankedCreators={officialRankedCreatorCount}
            liveOpenCalls={publicCounts.liveOpenCalls}
            excludedLowConfidenceCalls={publicCounts.excludedLowConfidenceCalls}
            confidencePassCalls={publicCounts.confidencePassCalls}
            rows={leaderboard}
          />
        </div>
        <HeroFeatureRail />
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
            <span className="font-serif text-[15px] text-ink-700">
              We also score who admits when they&apos;re wrong.{" "}
              <em className="italic text-accent">No other tracker does.</em>
            </span>
            <span className="font-mono text-[11px] text-ink-500 tracking-wide whitespace-nowrap">
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
            {officialRankedCreatorCount} ranked creators · {totalCalls} public-scored calls
            <br />
            {CREATOR_JUDGMENT_WINDOW_DETAIL_LABEL}
          </>
        }
      >
        <div className="flex flex-col tab:flex-row tab:items-end tab:justify-between gap-3 mb-4">
          <div className="space-y-1">
            <p className="font-mono text-[12px] text-ink-500 tracking-wide">
              {sampleThreshold.sample_floor_label}; floor {sampleThreshold.min_public_scored_calls}, Low N below {sampleThreshold.low_n_warning_calls}.
            </p>
            <p className="font-mono text-[11px] text-ink-500 tracking-wide max-w-[720px]">
              {RECENT_PUBLIC_SCORING_MATURITY_NOTE}
            </p>
          </div>
          <PeriodFilter value={period} canUseRecent={canUseRecent} />
        </div>
        {leaderboard.length > 0 ? (
          <Leaderboard rows={leaderboard} sampleThreshold={sampleThreshold} />
        ) : (
          <div className="border-t border-ink-250 py-12 text-center">
            <p className="font-mono text-[12px] text-ink-500 tracking-wide">
              {getLeaderboardEmptyMessage(leaderboardEmptyContract)}
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

function HeroTrustItem({ label }: { readonly label: string }): ReactElement {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-[11px] text-accent" aria-hidden="true">✓</span>
      {label}
    </span>
  );
}

function HeroFeatureRail(): ReactElement {
  const features = [
    { mark: "01", title: "Track Every Eligible Call", body: "We extract market calls from creator videos." },
    { mark: "02", title: "Score with Evidence", body: "Objective scoring based on real market outcomes." },
    { mark: "03", title: "Rank by Signal, Not Noise", body: "Creators ranked by alpha, consistency and accuracy." },
    { mark: "04", title: "See Who Adapts", body: "We score corrections and course changes." },
    { mark: "05", title: "Unlock More Power", body: "Alerts, exports, backtests, API access and webhooks." },
  ] as const;

  return (
    <div
      className="relative mt-10 desk:mt-4 border border-ink-250 bg-ink-50/70 shadow-popover"
      style={{ borderRadius: 2 }}
    >
      <div className="absolute inset-x-8 top-0 h-px bg-accent/70" aria-hidden="true" />
      <div className="grid grid-cols-1 tab:grid-cols-2 desk:grid-cols-5">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="min-w-0 border-b tab:border-r desk:border-b-0 border-ink-200 last:border-b-0 desk:last:border-r-0 px-5 py-6"
          >
            <p className="font-mono text-[11px] text-accent tracking-caps uppercase mb-4">
              {feature.mark}
            </p>
            <h2 className="font-sans text-[17px] text-ink-900 font-medium leading-tight mb-2">
              {feature.title}
            </h2>
            <p className="text-[14px] text-ink-600 leading-relaxed">{feature.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PremiseRow({ claim, source }: PremiseRowProps): ReactElement {
  return (
    <li className="flex flex-col tab:flex-row tab:items-baseline tab:justify-between gap-1 px-4 py-3 border-t border-ink-150 first:border-t-0">
      <span className="font-serif text-[15px] text-ink-700">{claim}</span>
      <span className="font-mono text-[11px] text-ink-500 tracking-wide whitespace-nowrap">
        [{source}]
      </span>
    </li>
  );
}

interface MarketCallPreviewProps {
  readonly totalCalls: string;
  readonly creatorCount: number;
  readonly beatBtcCreators: number;
  readonly rankedCreators: number;
  readonly liveOpenCalls: number;
  readonly excludedLowConfidenceCalls: number;
  readonly confidencePassCalls: number;
  readonly rows: readonly LeaderboardRow[];
}

function MarketCallPreview({
  totalCalls,
  creatorCount,
  beatBtcCreators,
  rankedCreators,
  liveOpenCalls,
  excludedLowConfidenceCalls,
  confidencePassCalls,
  rows,
}: MarketCallPreviewProps): ReactElement {
  const previewRows = rows.slice(0, 5);
  const hitRate =
    previewRows.length > 0
      ? previewRows.reduce((sum, row) => sum + row.stats.win_rate, 0) / previewRows.length
      : 0;
  const avgAlpha =
    previewRows.length > 0
      ? previewRows.reduce((sum, row) => sum + row.stats.avg_alpha_30d, 0) / previewRows.length
      : 0;
  const missedShare = Math.max(0, Math.round((1 - hitRate) * 100));
  const hitShare = Math.max(0, Math.round(hitRate * 100));
  const neutralShare = Math.max(0, 100 - missedShare - hitShare);
  const topCreator = previewRows[0];

  return (
    <div
      className="relative mx-auto w-full max-w-[1040px] border border-ink-250 bg-ink-0/85 p-4 tab:p-5 shadow-popover overflow-hidden"
      style={{ borderRadius: 2 }}
      aria-label="CallScore product preview"
    >
      <div
        className="absolute inset-0 opacity-45 pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(201,162,75,0.12), transparent 32%), radial-gradient(circle at 78% 12%, rgba(201,162,75,0.11), transparent 34%)",
        }}
        aria-hidden="true"
      />
      <div
        className="relative border border-ink-200 bg-ink-50/70 p-4 mb-4"
        style={{ borderRadius: 2 }}
      >
        <p className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-3">
          Call Summary
        </p>
        <div className="grid grid-cols-2 tab:grid-cols-4 gap-y-4 tab:gap-y-0">
          <PreviewMetric label="creators tracked" value={String(creatorCount)} />
          <PreviewMetric label="ranked creators" value={String(rankedCreators)} />
          <PreviewMetric label="public-scored" value={totalCalls} />
          <PreviewMetric
            label="beating BTC"
            value={`${beatBtcCreators}/${Math.max(rankedCreators, beatBtcCreators)}`}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-y-4 border-t border-ink-200 pt-4">
          <PreviewMetric label="confidence pass" value={String(confidencePassCalls)} />
          <PreviewMetric label="live/open" value={String(liveOpenCalls)} />
          <PreviewMetric label="low-conf excluded" value={String(excludedLowConfidenceCalls)} />
        </div>
      </div>

      {topCreator && (
        <div
          className="relative tab:hidden border border-ink-200 bg-ink-50/70 p-4 mb-4"
          style={{ borderRadius: 2 }}
        >
          <p className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-3">
            Current leader
          </p>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-serif text-[27px] leading-none text-ink-900">
                {topCreator.creator.name}
              </p>
              <p className="mt-2 truncate font-mono text-[11px] text-ink-500">
                {topCreator.creator.youtube_handle}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-serif text-[36px] leading-none text-pos">
                {topCreator.stats.alpha_score.toFixed(1)}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-caps text-ink-500">
                alpha
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="relative hidden tab:grid tab:grid-cols-[minmax(0,1fr)_156px] gap-4 mb-4">
        <div className="border border-ink-200 bg-ink-50/70 p-4" style={{ borderRadius: 2 }}>
          <p className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-4">
            Score Distribution
          </p>
          <div
            className="h-3 grid gap-0.5 mb-3"
            style={{
              gridTemplateColumns: `${Math.max(missedShare, 1)}fr ${Math.max(neutralShare, 1)}fr ${Math.max(hitShare, 1)}fr`,
            }}
          >
            <span className="bg-neg" style={{ borderRadius: 2 }} />
            <span className="bg-accent" style={{ borderRadius: 2 }} />
            <span className="bg-pos" style={{ borderRadius: 2 }} />
          </div>
          <div className="grid grid-cols-3 font-mono text-[11px] text-ink-500">
            <span><b className="text-neg font-normal">{missedShare}%</b><br />Missed</span>
            <span><b className="text-accent font-normal">{neutralShare}%</b><br />Neutral</span>
            <span><b className="text-pos font-normal">{hitShare}%</b><br />Hit</span>
          </div>
        </div>
        <div className="border border-ink-200 bg-ink-50/70 p-4" style={{ borderRadius: 2 }}>
          <p className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-2">
            Avg Alpha Delta
          </p>
          <p className={`font-serif text-[43px] leading-none ${avgAlpha >= 0 ? "text-pos" : "text-neg"}`}>
            {formatSignedNumber(avgAlpha)}
          </p>
          <p className="font-mono text-[11px] text-ink-500 mt-2">vs BTC</p>
        </div>
      </div>

      <div
        className="relative hidden tab:block border border-ink-200 bg-ink-50/70 p-4"
        style={{ borderRadius: 2 }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-ink-200 pb-3 mb-3">
          <p className="font-mono text-[10px] text-ink-500 tracking-caps uppercase">
            Top Creators
          </p>
          <div className="hidden tab:flex items-center gap-6 font-mono text-[11px] text-ink-500 tracking-caps uppercase">
            <span className="text-ink-900 border-b border-accent pb-1">{CREATOR_JUDGMENT_WINDOW_LABEL}</span>
            <span>90 Days · Pro</span>
          </div>
        </div>
        <div className="overflow-hidden">
          <div className="min-w-0">
            <div className="grid grid-cols-[32px_minmax(88px,1fr)_58px_52px_50px_42px] gap-2 pb-2 font-mono text-[10px] text-ink-500 tracking-caps uppercase">
              <span>rank</span>
              <span>creator</span>
              <span>alpha</span>
              <span>Avg α</span>
              <span>win %</span>
              <span>best coin</span>
            </div>
            {previewRows.length > 0 ? (
              previewRows.map((row) => {
                const alphaTone =
                  row.stats.alpha_score >= 50
                    ? "text-pos"
                    : row.stats.alpha_score < 30
                      ? "text-neg"
                      : "text-ink-800";
                const deltaTone = row.stats.avg_alpha_30d >= 0 ? "text-pos" : "text-neg";
                const bestCoin = row.best_call;
                return (
                  <div
                    key={row.creator.id}
                    className="grid grid-cols-[32px_minmax(88px,1fr)_58px_52px_50px_42px] gap-2 border-t border-ink-200 py-3 font-mono text-[13px] items-center"
                  >
                    <span className="text-accent">{String(row.rank).padStart(2, "0")}</span>
                    <span className="flex items-center gap-3 min-w-0 text-ink-900">
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center border border-ink-300 bg-ink-100 text-[12px] text-ink-800"
                        style={{ borderRadius: 2 }}
                        aria-hidden="true"
                      >
                        {getInitials(row.creator.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{row.creator.name}</span>
                        <span className="block truncate text-[11px] text-ink-500">
                          {row.creator.youtube_handle}
                        </span>
                      </span>
                    </span>
                    <span className={`${alphaTone} tabular-nums`}>
                      {row.stats.alpha_score.toFixed(1)}
                      <span className="text-ink-500 text-[11px] ml-1">α</span>
                    </span>
                    <span className={`${deltaTone} tabular-nums`}>
                      {formatSignedNumber(row.stats.avg_alpha_30d)}
                    </span>
                    <span className="text-ink-800 tabular-nums">
                      {formatPercent(row.stats.win_rate)}
                    </span>
                    <span className="min-w-0 truncate text-ink-800">
                      {bestCoin?.symbol?.replace("USDT", "") ?? "—"}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="border-t border-ink-200 py-8 text-center font-mono text-[12px] text-ink-500 tracking-wide">
                No public-scored calls in this rolling 12-month window yet. Newer tracked calls may still be awaiting extraction, confidence review, or outcome windows.
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="absolute inset-x-12 bottom-[-24px] h-10 bg-accent/25 blur-2xl"
        aria-hidden="true"
      />
    </div>
  );
}

function PreviewMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className="min-w-0 border-r border-ink-150 last:border-r-0 px-4 first:pl-0 last:pr-0 py-1">
      <p className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-1 truncate">
        {label}
      </p>
      <p className="font-serif text-[23px] tab:text-[29px] text-ink-900 leading-none tabular-nums">
        {value}
      </p>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}
