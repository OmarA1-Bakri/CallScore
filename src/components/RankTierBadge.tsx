"use client";

interface RankTierBadgeProps {
  readonly rank: number;
  readonly totalCalls: number;
  readonly wilsonLb: number;
}

function getTier(rank: number): { label: string; color: string } {
  if (rank <= 5) return { label: "T1", color: "bg-accent/20 text-accent border-accent/30" };
  if (rank <= 12) return { label: "T2", color: "bg-new/20 text-new border-new/30" };
  return { label: "T3", color: "bg-ink-500/20 text-ink-600 border-ink-300/30" };
}

export default function RankTierBadge({ rank, totalCalls, wilsonLb }: RankTierBadgeProps) {
  const tier = getTier(rank);
  const lowData = totalCalls < 50;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${tier.color}`}
      >
        {tier.label}
      </span>
      {lowData && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent border border-accent/20"
          title={`Only ${totalCalls} scored calls — ranking may shift with more data`}
        >
          Low N
        </span>
      )}
    </div>
  );
}

export function WilsonRange({ wilsonLb, winRate }: { readonly wilsonLb: number; readonly winRate: number }) {
  const displayLb = (wilsonLb * 100).toFixed(0);
  const displayWr = (winRate * 100).toFixed(0);

  return (
    <span className="text-[10px] text-ink-500 tabular-nums" title="Wilson 95% lower bound">
      {displayLb}–{displayWr}%
    </span>
  );
}
