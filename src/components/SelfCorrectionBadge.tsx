import type { ReactElement } from "react";
import type { SelfCorrectionTier } from "@/lib/self-correction";

interface SelfCorrectionBadgeProps {
  readonly score: number;
  readonly revisionCount: number;
  readonly tier: SelfCorrectionTier;
  readonly showLabel?: boolean;
}

const TIER_COLORS: Readonly<Record<SelfCorrectionTier, string>> = {
  honest: "#3FD67A",
  some: "#C8D3CA",
  rarely: "#5B6B63",
};

function formatScore(score: number): string {
  return score.toFixed(2);
}

function tierLabel(tier: SelfCorrectionTier): string {
  return tier;
}

export default function SelfCorrectionBadge({
  score,
  revisionCount,
  tier,
  showLabel = false,
}: SelfCorrectionBadgeProps): ReactElement {
  const color = TIER_COLORS[tier];
  const formatted = formatScore(score);
  const title = `Self-correction index ${formatted} (${revisionCount} revision${revisionCount === 1 ? "" : "s"}) — tier: ${tierLabel(tier)}. Rewards creators who publicly update or admit losing calls.`;

  if (showLabel) {
    return (
      <span
        className="font-mono text-xs inline-flex items-baseline gap-1.5"
        style={{ color }}
        title={title}
      >
        <span style={{ color: "#5B6B63" }}>{"//"}</span>
        <span className="uppercase tracking-[0.04em]">self-correction</span>
        <span style={{ color: "#5B6B63" }}>{"\u00b7"}</span>
        <span className="tabular-nums">{formatted}</span>
        <span style={{ color: "#5B6B63" }}>
          ({revisionCount} revision{revisionCount === 1 ? "" : "s"})
        </span>
      </span>
    );
  }

  return (
    <span
      className="font-mono text-[11px] inline-flex items-center"
      style={{ color }}
      title={title}
    >
      [SC {formatted}]
    </span>
  );
}
