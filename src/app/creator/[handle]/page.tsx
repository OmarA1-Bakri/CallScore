import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ExternalLink,
  Users,
  Focus,
  Youtube,
  ArrowLeft,
} from "lucide-react";
import AlphaScoreBadge from "@/components/AlphaScoreBadge";
import PerformanceChart from "@/components/PerformanceChart";
import CallHistory from "@/components/CallHistory";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import { query } from "@/lib/db";
import type { Creator, CreatorStats, Call } from "@/lib/types";

interface PageProps {
  readonly params: { handle: string };
}

interface PerformancePoint {
  readonly date: string;
  readonly score: number;
}

interface MonthlyScore {
  readonly month: string;
  readonly avg_score: number;
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

  // Fetch calls for this creator
  let calls: Call[] = [];
  try {
    calls = await query<Call>(
      `SELECT * FROM calls WHERE creator_id = $1 ORDER BY call_date DESC`,
      [creator.id],
    );
  } catch {
    // Calls table may not exist yet
  }

  // Compute monthly performance for chart
  let performance: PerformancePoint[] = [];
  if (calls.length > 0) {
    try {
      const monthlyRows = await query<MonthlyScore>(
        `SELECT
          TO_CHAR(call_date, 'Mon YYYY') AS month,
          ROUND(AVG(score)::numeric, 1) AS avg_score
        FROM calls
        WHERE creator_id = $1 AND score > 0
        GROUP BY TO_CHAR(call_date, 'Mon YYYY'), DATE_TRUNC('month', call_date)
        ORDER BY DATE_TRUNC('month', call_date) ASC`,
        [creator.id],
      );
      performance = monthlyRows.map((r) => ({
        date: r.month,
        score: Number(r.avg_score),
      }));
    } catch {
      // Performance data not available
    }
  }

  // Compute average score breakdown from calls
  const scoredCalls = calls.filter((c) => c.score > 0);
  const avgDirection = scoredCalls.length > 0
    ? (scoredCalls.filter((c) => c.correct_direction).length / scoredCalls.length) * 40
    : 0;
  const avgAlpha = scoredCalls.length > 0
    ? Math.min(25, Math.max(0, scoredCalls.reduce((s, c) => s + (c.alpha_30d ?? 0), 0) / scoredCalls.length * 2.5))
    : 0;
  const avgSpecificity = scoredCalls.length > 0
    ? (scoredCalls.reduce((s, c) => s + c.specificity_score, 0) / scoredCalls.length) * 15
    : 0;
  const avgRegime = scoredCalls.length > 0
    ? (scoredCalls.reduce((s, c) => s + c.regime_difficulty, 0) / scoredCalls.length) * 10
    : 0;
  const avgTarget = scoredCalls.length > 0
    ? (scoredCalls.filter((c) => c.hit_target).length / scoredCalls.length) * 10
    : 0;

  const alphaScore = stats?.alpha_score ?? creator.alpha_score;
  const winRate = stats?.win_rate ?? creator.win_rate;
  const avgAlpha30d = stats?.avg_alpha_30d ?? 0;
  const totalCalls = stats?.total_calls ?? creator.total_calls;
  const hitRate = stats?.hit_rate ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leaderboard
      </Link>

      {/* Hero section */}
      <section className="glass-card p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-brand-gold/20 flex items-center justify-center text-brand-gold font-bold text-2xl shrink-0">
            {creator.name
              .split(" ")
              .map((p) => p[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
              {creator.name}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-3">
              <span className="flex items-center gap-1">
                <Youtube className="w-4 h-4 text-red-500" />
                {creator.youtube_handle}
              </span>
              {creator.subscribers && (
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {creator.subscribers} subscribers
                </span>
              )}
              {creator.focus && (
                <span className="flex items-center gap-1">
                  <Focus className="w-3.5 h-3.5" />
                  {creator.focus}
                </span>
              )}
            </div>

            <a
              href={`https://youtube.com/${creator.youtube_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand-gold hover:text-brand-gold-dim text-sm transition-colors"
            >
              View on YouTube
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Stats row */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <div className="glass-card p-4 flex flex-col items-center">
          <AlphaScoreBadge score={alphaScore} size="lg" />
        </div>
        <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} />
        <StatCard
          label="Avg Alpha (30d)"
          value={`${avgAlpha30d >= 0 ? "+" : ""}${avgAlpha30d.toFixed(1)}%`}
          positive={avgAlpha30d >= 0}
        />
        <StatCard label="Total Calls" value={String(totalCalls)} />
        <StatCard label="Hit Rate" value={`${hitRate.toFixed(1)}%`} />
      </section>

      {/* Score breakdown + Chart row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <ScoreBreakdown
          direction={Number(avgDirection.toFixed(1))}
          alpha={Number(avgAlpha.toFixed(1))}
          specificity={Number(avgSpecificity.toFixed(1))}
          regime={Number(avgRegime.toFixed(1))}
          target={Number(avgTarget.toFixed(1))}
        />
        {performance.length > 0 ? (
          <PerformanceChart data={performance} />
        ) : (
          <div className="glass-card p-5 flex items-center justify-center">
            <p className="text-gray-500 text-sm">No performance data yet</p>
          </div>
        )}
      </section>

      {/* Call history */}
      <section>
        {calls.length > 0 ? (
          <CallHistory calls={calls} />
        ) : (
          <div className="glass-card p-12 text-center">
            <p className="text-gray-500">No calls tracked yet for this creator.</p>
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
      ? "text-white"
      : positive
        ? "text-brand-green"
        : "text-brand-red";

  return (
    <div className="glass-card p-4 text-center">
      <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
