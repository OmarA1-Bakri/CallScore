import Link from "next/link";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import AlphaScoreBadge from "./AlphaScoreBadge";
import type { Creator, CreatorStats } from "@/lib/types";

interface CreatorCardProps {
  readonly creator: Creator;
  readonly stats: CreatorStats;
  readonly trend: "up" | "down" | "stable";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-accent/20 text-accent",
    "bg-accent/20 text-accent",
    "bg-pos/20 text-pos",
    "bg-new/20 text-new",
    "bg-accent-low/20 text-accent",
    "bg-new/20 text-new",
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

function TrendIcon({ trend }: { readonly trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-pos" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-neg" />;
  return <Minus className="w-4 h-4 text-ink-500" />;
}

export default function CreatorCard({ creator, stats, trend }: CreatorCardProps) {
  return (
    <Link
      href={`/creator/${creator.youtube_handle}`}
      className="glass-card-hover p-5 block"
    >
      <div className="flex items-start gap-4 mb-4">
        {/* Avatar */}
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${getAvatarColor(creator.name)}`}
        >
          {getInitials(creator.name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-ink-900 font-semibold text-sm truncate">
              {creator.name}
            </h3>
            <TrendIcon trend={trend} />
          </div>
          <p className="text-ink-500 text-xs truncate flex items-center gap-1">
            {creator.youtube_handle}
            <ExternalLink className="w-3 h-3" />
          </p>
        </div>

        <AlphaScoreBadge score={stats.alpha_score} size="sm" />
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatItem label="Win Rate" value={`${(stats.win_rate * 100).toFixed(1)}%`} />
        <StatItem
          label="Avg Alpha"
          value={`${stats.avg_alpha_30d >= 0 ? "+" : ""}${stats.avg_alpha_30d.toFixed(1)}%`}
          positive={stats.avg_alpha_30d >= 0}
        />
        <StatItem label="Scored Calls" value={String(stats.total_calls)} />
        <StatItem label="Hit Rate" value={`${(stats.hit_rate * 100).toFixed(1)}%`} />
      </div>
    </Link>
  );
}

interface StatItemProps {
  readonly label: string;
  readonly value: string;
  readonly positive?: boolean;
}

function StatItem({ label, value, positive }: StatItemProps) {
  const valueColor =
    positive === undefined
      ? "text-ink-900"
      : positive
        ? "text-pos"
        : "text-neg";

  return (
    <div>
      <p className="text-ink-500 text-[10px] uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className={`text-sm font-semibold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
