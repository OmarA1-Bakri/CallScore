import Link from "next/link";
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
import {
  MOCK_ALL_CREATORS,
  MOCK_CALLS_LIST,
  MOCK_PERFORMANCE,
} from "@/lib/mock-data";

interface PageProps {
  readonly params: { handle: string };
}

export default function CreatorPage({ params }: PageProps) {
  // In production: fetch from /api/creator/[handle]
  const creator =
    MOCK_ALL_CREATORS.find((c) => c.youtube_handle === params.handle) ??
    MOCK_ALL_CREATORS[0];

  const calls = MOCK_CALLS_LIST.filter((c) => c.creator_id === creator.id);
  const performance = MOCK_PERFORMANCE;

  const stats = {
    alpha_score: creator.alpha_score,
    win_rate: creator.win_rate,
    avg_alpha: creator.avg_return - 3.2,
    total_calls: creator.total_calls,
    hit_rate: creator.win_rate * 0.85,
  };

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
                <Youtube className="w-4 h-4 text-red-500" />@
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
              href={`https://youtube.com/@${creator.youtube_handle}`}
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
          <AlphaScoreBadge score={stats.alpha_score} size="lg" />
        </div>
        <StatCard label="Win Rate" value={`${stats.win_rate.toFixed(1)}%`} />
        <StatCard
          label="Avg Alpha (30d)"
          value={`${stats.avg_alpha >= 0 ? "+" : ""}${stats.avg_alpha.toFixed(1)}%`}
          positive={stats.avg_alpha >= 0}
        />
        <StatCard label="Total Calls" value={String(stats.total_calls)} />
        <StatCard label="Hit Rate" value={`${stats.hit_rate.toFixed(1)}%`} />
      </section>

      {/* Score breakdown + Chart row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <ScoreBreakdown
          direction={42}
          alpha={22}
          specificity={12}
          regime={7}
          target={9}
        />
        <PerformanceChart data={performance} />
      </section>

      {/* Call history */}
      <section>
        <CallHistory calls={calls} />
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
