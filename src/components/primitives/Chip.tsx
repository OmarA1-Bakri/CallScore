import type { ReactElement, ReactNode } from "react";

type ChipTone = "neutral" | "accent" | "pos" | "neg" | "warn" | "new" | "low";

interface ChipProps {
  readonly tone?: ChipTone;
  readonly children: ReactNode;
}

const STYLES: Record<ChipTone, string> = {
  neutral: "border-ink-300 text-ink-600",
  accent: "border-accent-dim text-accent bg-accent-low",
  pos: "border-pos-dim text-pos bg-pos/5",
  neg: "border-neg-dim text-neg bg-neg/5",
  warn: "border-warn text-warn bg-warn/5",
  new: "border-new text-new bg-new/5",
  low: "border-lown text-lown bg-lown/5",
};

export default function Chip({
  tone = "neutral",
  children,
}: ChipProps): ReactElement {
  return (
    <span
      className={`inline-block font-mono text-[9.5px] px-1.5 py-0.5 tracking-caps uppercase border ${STYLES[tone]}`}
      style={{ borderRadius: 2 }}
    >
      {children}
    </span>
  );
}
