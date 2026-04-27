"use client";

import clsx from "clsx";

export type Timeframe = "7d" | "30d" | "90d" | "ytd" | "all";

const OPTIONS: readonly Timeframe[] = ["7d", "30d", "90d", "ytd", "all"];

export interface TimeframeSelectorProps {
  readonly value: Timeframe;
  readonly onChange?: (value: Timeframe) => void;
}

export default function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  return (
    <div className="segmented" role="group" aria-label="Timeframe">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={clsx(value === option && "on")}
          aria-pressed={value === option}
          onClick={() => onChange?.(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
