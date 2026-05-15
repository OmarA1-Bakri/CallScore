import Link from "next/link";
import type { ReactElement } from "react";
import { creatorHandlePath } from "@/lib/creator-handles";
import type { LeaderboardRow as Row } from "@/lib/types";
import RankTierBadge from "./RankTierBadge";

interface LeaderboardRowProps {
  readonly row: Row;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function LeaderboardRow({ row }: LeaderboardRowProps): ReactElement {
  const alpha = row.stats.alpha_score;
  const delta30 = row.stats.avg_alpha_30d;
  const winPct = (row.stats.win_rate * 100).toFixed(1);
  const lastCall = row.best_call?.symbol?.replace("USDT", "") ?? "—";
  const alphaTone = alpha >= 50 ? "text-pos" : alpha < 30 ? "text-neg" : "text-ink-700";

  return (
    <tr className="border-b border-ink-150 hover:bg-ink-100/60 transition-colors">
      {/* Rank — serif numeral */}
      <td className="py-3 pr-4 align-baseline w-[56px]">
        <span className="font-serif text-[19px] text-accent font-medium tabular-nums">
          {String(row.rank).padStart(2, "0")}
        </span>
      </td>
      {/* Creator — initial-letter avatar + name + handle (matches dev-pack) */}
      <td className="py-3 pr-4 align-baseline">
        <Link
          href={`/creator/${creatorHandlePath(row.creator.youtube_handle)}`}
          className="flex items-baseline gap-2.5 group focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          <span
            className="inline-flex items-center justify-center w-[22px] h-[22px] bg-ink-200 border border-ink-300 font-serif text-[11px] text-ink-800 shrink-0"
            style={{ borderRadius: 2 }}
            aria-hidden="true"
          >
            {getInitials(row.creator.name)}
          </span>
          <span className="min-w-0">
            <span className="block font-serif text-[16px] text-ink-900 group-hover:text-accent transition-colors leading-tight truncate">
              {row.creator.name}
            </span>
            <span className="block font-mono text-[11px] text-ink-500 tracking-wide mt-0.5 truncate">
              {row.creator.youtube_handle}
            </span>
          </span>
        </Link>
      </td>
      {/* Alpha — score with unit */}
      <td className={`py-3 pr-4 text-right tabular-nums font-mono text-[14px] ${alphaTone}`}>
        {alpha.toFixed(1)}
        <span className="text-ink-500 text-[11px] ml-1">α</span>
      </td>
      {/* 30d Δ */}
      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[13px]">
        <span className={delta30 >= 0 ? "text-pos" : "text-neg"}>
          {delta30 >= 0 ? "+" : ""}
          {delta30.toFixed(1)}
        </span>
      </td>
      {/* Win % */}
      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[13px] text-ink-700">
        {winPct}<span className="text-ink-500">%</span>
      </td>
      {/* N — scored-call count */}
      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[13px] text-ink-600">
        {row.stats.total_calls}
      </td>
      {/* Tier — score-based S/A/B/C (distinct from auth-tier row grouping) */}
      <td className="py-3 pr-4 text-center">
        <RankTierBadge
          rank={row.rank}
          totalCalls={row.stats.total_calls}
          wilsonLb={row.stats.wilson_lb}
        />
      </td>
      {/* Last call — most recent scored symbol */}
      <td className="py-3 text-right font-mono text-[12px] text-ink-600">{lastCall}</td>
    </tr>
  );
}
