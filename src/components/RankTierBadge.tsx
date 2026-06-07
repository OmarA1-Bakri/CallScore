"use client";

interface RankTierBadgeProps {
  readonly rank: number;
  readonly totalCalls: number;
  readonly minPublicScoredCalls: number;
  readonly lowNWarningCalls: number;
  readonly sampleFloorLabel: string;
}

function getTier(rank: number): { label: string; color: string } {
  if (rank <= 5) return { label: "T1", color: "bg-accent/20 text-accent border-accent/30" };
  if (rank <= 12) return { label: "T2", color: "bg-new/20 text-new border-new/30" };
  return { label: "T3", color: "bg-ink-500/20 text-ink-600 border-ink-300/30" };
}

export default function RankTierBadge({
  rank,
  totalCalls,
  minPublicScoredCalls,
  lowNWarningCalls,
  sampleFloorLabel,
}: RankTierBadgeProps) {
  if (minPublicScoredCalls > lowNWarningCalls) {
    throw new Error("minPublicScoredCalls must be <= lowNWarningCalls");
  }
  const tier = getTier(rank);
  // Ordering invariant: obsoleteData is the stricter floor, lowData covers the visible low-N band above it.
  const obsoleteData = totalCalls < minPublicScoredCalls;
  const lowData = !obsoleteData && totalCalls < lowNWarningCalls;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded-none text-[11px] font-bold uppercase border ${tier.color}`}
      >
        {tier.label}
      </span>
      {obsoleteData && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-none text-[11px] font-medium bg-ink-100 text-ink-600 border border-ink-300/70"
          title={`Only ${totalCalls} public-scored calls — below the ${minPublicScoredCalls}-call floor. ${sampleFloorLabel}`}
        >
          Obsolete
        </span>
      )}
      {lowData && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-none text-[11px] font-medium bg-accent/10 text-accent border border-accent/20"
          title={`Only ${totalCalls} public-scored calls — visible but still below the ${lowNWarningCalls}-call low-N warning line. ${sampleFloorLabel}`}
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
    <span className="text-[11px] text-ink-500 tabular-nums" title="Wilson 95% lower bound">
      {displayLb}–{displayWr}%
    </span>
  );
}
