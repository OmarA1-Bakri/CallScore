import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, ArrowLeft } from "lucide-react";
import AlphaScoreBadge from "@/components/AlphaScoreBadge";
import RankTierBadge from "@/components/RankTierBadge";
import PerformanceChart from "@/components/PerformanceChart";
import CallHistory from "@/components/CallHistory";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import { query } from "@/lib/db";
import {
  computeCreatorAvgAlpha30d,
  computeCreatorHitRate,
  computeCreatorScoreAverages,
  computeCreatorWinRate,
  getScoredCalls,
  serializeCalls,
} from "@/lib/public-serializer";
import type { Creator, CreatorStats, Call } from "@/lib/types";

interface PageProps {
  readonly params: { handle: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const handle = decodeURIComponent(params.handle);

  try {
    const creators = await query<Creator>(
      `SELECT * FROM creators WHERE youtube_handle = $1 LIMIT 1`,
      [handle],
    );

    if (creators.length === 0) {
      return { title: "Creator Not Found | CryptoTubers Ranked" };
    }

    const creator = creators[0];
    return {
      title: `${creator.name} — Creator Profile | CryptoTubers Ranked`,
      description: `See ${creator.name}'s crypto call track record, alpha score, win rate, and full call history on CryptoTubers Ranked.`,
      alternates: { canonical: `/creator/${handle}` },
    };
  } catch {
    return { title: "Creator Not Found | CryptoTubers Ranked" };
  }
}

interface PerformancePoint {
  readonly date: string;
  readonly score: number;
}

export default async function CreatorPage({ params }: PageProps) {
  const handle = decodeURIComponent(params.handle);

  // Fetch creator — handle missing table gracefully
  let creator: Creator;
  try {
    const creators = await query<Creator>(
      `SELECT * FROM creators WHERE youtube_handle = $1 LIMIT 1`,
      [handle],
    );
    if (creators.length === 0) {
      notFound();
    }
    creator = creators[0];
  } catch {
    notFound();
  }

  // Fetch creator stats (all_time period)
  let stats: CreatorStats | null = null;
  try {
    const statsRows = await query<CreatorStats>(
      `SELECT * FROM creator_stats WHERE creator_id = $1 AND period = 'all_time' LIMIT 1`,
      [creator.id],
    );
    stats = statsRows.length > 0 ? statsRows[0] : null;
  } catch {
    // Stats table may not exist yet
  }

  // Fetch all calls so the creator-level aggregates use the same eligibility
  // rules as the call page and recompute pipeline.
  const CALL_LIMIT = 50;
  let allCalls: Call[] = [];
  try {
    allCalls = await query<Call>(
      `SELECT *
       FROM calls
       WHERE creator_id = $1
       ORDER BY call_date DESC`,
      [creator.id],
    );
  } catch {
    // Calls table may not exist yet
  }

  const serializedCalls = serializeCalls(allCalls);
  const displayCalls = serializedCalls.slice(0, CALL_LIMIT);
  const trackedCallCount = allCalls.length;
  const scoreAverages = computeCreatorScoreAverages(allCalls);
  const scoredCalls = getScoredCalls(allCalls);

  const monthlyMap = new Map<string, { label: string; total: number; count: number; ts: number }>();
  for (const call of scoredCalls) {
    const callDate = new Date(call.call_date);
    const monthKey = `${callDate.getUTCFullYear()}-${String(callDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyMap.get(monthKey) ?? {
      label: callDate.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      total: 0,
      count: 0,
      ts: Date.UTC(callDate.getUTCFullYear(), callDate.getUTCMonth(), 1),
    };
    monthlyMap.set(monthKey, {
      ...existing,
      total: existing.total + (call.public_score ?? 0),
      count: existing.count + 1,
    });
  }

  const performance: PerformancePoint[] = Array.from(monthlyMap.values())
    .sort((a, b) => a.ts - b.ts)
    .map((row) => ({
      date: row.label,
      score: Number((row.total / row.count).toFixed(1)),
    }));

  const alphaScore = Number(scoreAverages.total.toFixed(1));
  const winRate = computeCreatorWinRate(allCalls);
  const avgAlpha30d = computeCreatorAvgAlpha30d(allCalls);
  const scoredCallCount = scoredCalls.length;
  const hitRate = computeCreatorHitRate(allCalls);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-700 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leaderboard
      </Link>

      {/* Hero section */}
      <section className="border border-ink-200 p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-accent/20 flex items-center justify-center text-accent font-bold text-2xl shrink-0">
            {creator.name
              .split(" ")
              .map((p) => p[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-ink-900">
                {creator.name}
              </h1>
              {stats && (
                <RankTierBadge
                  rank={stats.accuracy_rank ?? 99}
                  totalCalls={stats.total_calls}
                  wilsonLb={stats.wilson_lb}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-600 mb-3">
              <span>{creator.youtube_handle}</span>
              {creator.subscribers && (
                <span>{creator.subscribers} subscribers</span>
              )}
              {creator.focus && <span>{creator.focus}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <a
                href={`https://youtube.com/${creator.youtube_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:text-accent-dim text-sm transition-colors"
              >
                View on YouTube
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <Link
                href={`/creator/${encodeURIComponent(creator.youtube_handle)}/backtest`}
                className="inline-flex items-center gap-1 text-ink-500 hover:text-ink-700 text-sm transition-colors"
                prefetch={false}
              >
                simulate returns →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats row */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="border border-ink-200 p-4 flex flex-col items-center">
          <AlphaScoreBadge score={alphaScore} size="lg" />
        </div>
        <StatCard label="Win Rate" value={`${(winRate * 100).toFixed(1)}%`} />
        <StatCard
          label="Win Rate Floor"
          // TODO: wilson_lb from stats — may be stale; consider live compute when creator_stats refresh job is fixed
          value={`≥${((stats?.wilson_lb ?? 0) * 100).toFixed(1)}%`}
        />
        <StatCard
          label="Avg Alpha (30d)"
          value={`${avgAlpha30d >= 0 ? "+" : ""}${avgAlpha30d.toFixed(1)}%`}
          positive={avgAlpha30d >= 0}
        />
        <StatCard label="Scored Calls" value={String(scoredCallCount)} />
        <StatCard label="Hit Rate" value={`${(hitRate * 100).toFixed(1)}%`} />
      </section>

      {/* Score breakdown + Chart row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <ScoreBreakdown
          direction={Number(scoreAverages.direction.toFixed(1))}
          alpha={Number(scoreAverages.alpha.toFixed(1))}
          specificity={Number(scoreAverages.specificity.toFixed(1))}
          regime={Number(scoreAverages.regime.toFixed(1))}
          target={Number(scoreAverages.target.toFixed(1))}
        />
        {performance.length > 0 ? (
          <PerformanceChart data={performance} />
        ) : (
          <div className="border border-ink-200 p-5 flex items-center justify-center">
            <p className="text-ink-500 text-sm">No performance data yet</p>
          </div>
        )}
      </section>

      {/* Call history */}
      <section>
        {displayCalls.length > 0 ? (
          <CallHistory
            calls={displayCalls}
            totalCount={trackedCallCount}
            scoredCount={scoredCallCount}
          />
        ) : (
          <div className="border-t border-ink-250 py-12 text-center">
            <p className="text-ink-500">No calls tracked yet for this creator.</p>
          </div>
        )}
      </section>
    </div>
  );
}

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly positive?: boolean;
}

function StatCard({ label, value, positive }: StatCardProps) {
  const valueColor =
    positive === undefined
      ? "text-ink-900"
      : positive
        ? "text-pos"
        : "text-neg";

  return (
    <div className="border border-ink-200 p-4 text-center">
      <p className="text-ink-500 text-[10px] uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
