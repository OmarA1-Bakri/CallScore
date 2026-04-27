"use client";

import clsx from "clsx";

export type AlphaScoreVariant = "hero" | "inline";

export interface AlphaScoreProps {
  readonly value: number;
  readonly window: string;
  readonly variant?: AlphaScoreVariant;
  readonly confidence?: "normal" | "low";
  readonly stale?: boolean;
  readonly peerMedian?: number;
  readonly maxAbs?: number;
  readonly onOpenExplanation?: () => void;
}

function formatAlpha(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}α`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export default function AlphaScore({
  value,
  window,
  variant = "inline",
  confidence = "normal",
  stale = false,
  peerMedian = 0,
  maxAbs = 12,
  onOpenExplanation,
}: AlphaScoreProps) {
  const magnitude = clampPercent((Math.abs(value) / maxAbs) * 100);
  const tick = clampPercent(((peerMedian + maxAbs) / (maxAbs * 2)) * 100);
  const tone = value >= 0 ? "pos" : "neg";

  return (
    <button
      type="button"
      className={clsx(
        "alpha-score",
        `alpha-${variant}`,
        `alpha-${tone}`,
        confidence === "low" && "alpha-low-confidence",
        stale && "alpha-stale",
      )}
      onClick={onOpenExplanation}
      aria-label={`${formatAlpha(value)} alpha over ${window}. Open score explanation.`}
    >
      <span className="alpha-figure">{formatAlpha(value)}</span>
      <span className="alpha-caption">alpha · {window}</span>
      <span className="alpha-rail" aria-hidden="true">
        <span className="alpha-fill" style={{ width: `${magnitude}%` }} />
        <span className="alpha-tick" style={{ left: `${tick}%` }} />
      </span>
    </button>
  );
}
