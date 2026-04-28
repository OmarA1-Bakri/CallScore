"use client";

import Link from "next/link";
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
} from "lucide-react";
import { AlphaScoreBar } from "./AlphaScoreBadge";
import RankTierBadge from "./RankTierBadge";
import SelfCorrectionBadge from "./SelfCorrectionBadge";
import TierGate from "./TierGate";
import type { LeaderboardRow } from "@/lib/types";
import { SYMBOL_TICKERS } from "@/lib/constants";

interface LeaderboardProps {
  readonly rows: readonly LeaderboardRow[];
}

function RankCell({ rank }: { readonly rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center gap-1.5">
        <Crown className="w-4 h-4 text-accent" />
        <span className="text-accent font-bold">1</span>
      </div>
    );
  }
  if (rank === 2) {
    return <span className="text-gray-300 font-bold">{rank}</span>;
  }
  if (rank === 3) {
    return <span className="text-orange-400 font-bold">{rank}</span>;
  }
  return <span className="text-gray-500 font-medium">{rank}</span>;
}

function TrendCell({ trend }: { readonly trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-pos" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-neg" />;
  return <Minus className="w-4 h-4 text-gray-600" />;
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
    "bg-blue-500/20 text-blue-400",
    "bg-pink-500/20 text-pink-400",
    "bg-cyan-500/20 text-cyan-400",
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

function LeaderboardTable({
  rows,
}: {
  readonly rows: readonly LeaderboardRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200">
            <th className="text-left text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 w-12">
              #
            </th>
            <th className="text-left text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3">
              Creator
            </th>
            <th className="text-left text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3">
              Alpha Score
            </th>
            <th className="text-right text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
              Win Rate
            </th>
            <th className="text-right text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
              Self-Correction
            </th>
            <th className="text-right text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">
              Avg Alpha
            </th>
            <th className="text-right text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
              Scored Calls
            </th>
            <th className="text-left text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden xl:table-cell">
              Best Call
            </th>
            <th className="text-center text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden sm:table-cell w-16">
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const bestTicker = row.best_call
              ? SYMBOL_TICKERS[row.best_call.symbol] ??
                row.best_call.symbol.replace("USDT", "")
              : null;

            return (
              <tr
                key={row.creator.id}
                className="table-row-hover border-b border-ink-200/50"
              >
                <td className="px-4 py-3">
                  <RankCell rank={row.rank} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/creator/${row.creator.youtube_handle}`}
                    className="flex items-center gap-3 group"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getAvatarColor(row.creator.name)}`}
                    >
                      {getInitials(row.creator.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium group-hover:text-accent transition-colors truncate">
                          {row.creator.name}
                        </p>
                        <RankTierBadge
                          rank={row.rank}
                          totalCalls={row.stats.total_calls}
                          wilsonLb={row.stats.wilson_lb}
                        />
                      </div>
                      <p className="text-gray-500 text-xs truncate">
                        {row.creator.youtube_handle}
                      </p>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-accent transition-colors shrink-0 hidden md:block" />
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AlphaScoreBar score={row.stats.alpha_score} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                  <div className="flex flex-col items-end">
                    <span className="text-white">
                      {(row.stats.win_rate * 100).toFixed(1)}%
                    </span>
                    {row.stats.wilson_lb > 0 && (
                      <span className="text-[10px] text-gray-500" title="Wilson 95% lower bound">
                        &ge;{(row.stats.wilson_lb * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                  <SelfCorrectionBadge
                    score={row.selfCorrectionScore ?? 0}
                    revisionCount={row.revisionCount ?? 0}
                    tier={row.selfCorrectionTier ?? "rarely"}
                  />
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                  <span
                    className={
                      row.stats.avg_alpha_30d >= 0
                        ? "value-positive"
                        : "value-negative"
                    }
                  >
                    {row.stats.avg_alpha_30d >= 0 ? "+" : ""}
                    {row.stats.avg_alpha_30d.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-400 hidden lg:table-cell">
                  {row.stats.total_calls}
                </td>
                <td className="px-4 py-3 hidden xl:table-cell">
                  {bestTicker && row.best_call?.id ? (
                    <Link
                      href={`/call/${row.best_call.id}`}
                      aria-label={`View ${row.creator.name} best call: ${bestTicker} +${row.best_call.return_30d?.toFixed(0) ?? "?"}%`}
                      className="text-xs text-gray-400 hover:text-accent transition-colors"
                    >
                      {bestTicker}{" "}
                      <span className="value-positive">
                        +{row.best_call.return_30d?.toFixed(0) ?? "?"}%
                      </span>
                    </Link>
                  ) : (
                    <span className="text-gray-600 text-xs">--</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <TrendCell trend={row.trend} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Leaderboard({ rows }: LeaderboardProps) {
  const eliteRows = rows.filter((r) => r.tier_required === "elite");
  const proRows = rows.filter((r) => r.tier_required === "pro");
  const freeRows = rows.filter((r) => r.tier_required === "free");

  return (
    <div className="glass-card overflow-hidden">
      {/* Elite tier (1-5): gated */}
      {eliteRows.length > 0 && (
        <TierGate tier="elite">
          <LeaderboardTable rows={eliteRows} />
        </TierGate>
      )}

      {/* Pro tier (6-10): gated */}
      {proRows.length > 0 && (
        <TierGate tier="pro">
          <LeaderboardTable rows={proRows} />
        </TierGate>
      )}

      {/* Free tier (11-20): fully visible */}
      {freeRows.length > 0 && (
        <LeaderboardTable rows={freeRows} />
      )}
    </div>
  );
}
