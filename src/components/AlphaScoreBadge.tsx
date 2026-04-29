import type { ReactElement } from "react";

interface AlphaScoreBadgeProps {
  readonly score: number;
  readonly size?: "sm" | "md" | "lg";
}

function tone(score: number): { fg: string; bar: string } {
  if (score >= 70) return { fg: "text-pos", bar: "bg-pos" };
  if (score >= 50) return { fg: "text-accent", bar: "bg-accent" };
  if (score >= 30) return { fg: "text-warn", bar: "bg-warn" };
  return { fg: "text-neg", bar: "bg-neg" };
}

const SIZES = {
  sm: { num: "text-[20px]", unit: "text-[10px]" },
  md: { num: "text-[28px]", unit: "text-[11px]" },
  lg: { num: "text-[40px]", unit: "text-[13px]" },
} as const;

export default function AlphaScoreBadge({
  score,
  size = "md",
}: AlphaScoreBadgeProps): ReactElement {
  const rounded = Math.round(score);
  const t = tone(rounded);
  const s = SIZES[size];

  return (
    <div
      className="inline-flex flex-col items-start gap-1.5 border border-ink-200 bg-ink-50 px-3 py-2.5"
      style={{ borderRadius: 2 }}
    >
      <div className="flex items-baseline gap-1">
        <span className={`font-serif ${s.num} font-medium tabular-nums tracking-tight ${t.fg}`}>
          {rounded}
        </span>
        <span className={`font-mono ${s.unit} text-ink-500 tracking-wide`}>α</span>
      </div>
      <div className="font-mono text-[9px] text-ink-500 tracking-caps uppercase">
        Alpha Score
      </div>
    </div>
  );
}

export function AlphaScoreBar({ score }: { readonly score: number }): ReactElement {
  const rounded = Math.round(score);
  const pct = Math.min(100, Math.max(0, rounded));
  const t = tone(rounded);
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <span className={`font-mono text-[12px] tabular-nums w-9 text-right ${t.fg}`}>
        {rounded}
      </span>
      <div className="flex-1 h-px relative bg-ink-200">
        <div
          className={`absolute inset-y-0 left-0 ${t.bar} transition-[width] duration-500`}
          style={{ width: `${pct}%`, height: 2, top: -0.5 }}
        />
      </div>
    </div>
  );
}
