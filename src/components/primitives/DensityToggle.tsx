"use client";

import clsx from "clsx";

export type Density = "compact" | "comfortable" | "spacious";

const OPTIONS: readonly Density[] = ["compact", "comfortable", "spacious"];

export interface DensityToggleProps {
  readonly value: Density;
  readonly onChange?: (value: Density) => void;
}

export default function DensityToggle({ value, onChange }: DensityToggleProps) {
  return (
    <div className="segmented segmented-density" role="group" aria-label="Density">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={clsx(value === option && "on")}
          aria-pressed={value === option}
          onClick={() => onChange?.(option)}
        >
          {option.slice(0, 1)}
        </button>
      ))}
    </div>
  );
}
