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
    "bg-brand-gold/20 text-brand-gold",
    "bg-brand-accent/20 text-brand-accent",
    "bg-brand-green/20 text-brand-green",
    "bg-blue-500/20 text-blue-400",
    "bg-pink-500/20 text-pink-400",
    "bg-cyan-500/20 text-cyan-400",
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

function TrendIcon({ trend }: { readonly trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-brand-green" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-brand-red" />;
  return <Minus className="w-4 h-4 text-gray-500" />;
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
            <h3 className="text-white font-semibold text-sm truncate">
              {creator.name}
            </h3>
            <TrendIcon trend={trend} />
          </div>
          <p className="text-gray-500 text-xs truncate flex items-center gap-1">
            @{creator.youtube_handle}
            <ExternalLink className="w-3 h-3" />
          </p>
        </div>

        <AlphaScoreBadge score={stats.alpha_score} size="sm" />
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatItem label="Win Rate" value={`${stats.win_rate.toFixed(1)}%`} />
        <StatItem
          label="Avg Alpha"
          value={`${stats.avg_alpha_30d >= 0 ? "+" : ""}${stats.avg_alpha_30d.toFixed(1)}%`}
          positive={stats.avg_alpha_30d >= 0}
        />
        <StatItem label="Total Calls" value={String(stats.total_calls)} />
        <StatItem label="Hit Rate" value={`${stats.hit_rate.toFixed(1)}%`} />
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
      ? "text-white"
      : positive
        ? "text-brand-green"
        : "text-brand-red";

  return (
    <div>
      <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className={`text-sm font-semibold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
