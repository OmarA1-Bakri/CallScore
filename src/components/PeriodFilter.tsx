"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactElement } from "react";
import { CREATOR_JUDGMENT_WINDOW_LABEL } from "@/lib/judgment-window";
import type { Period } from "@/lib/types";

const PERIODS: ReadonlyArray<{ readonly value: Period; readonly label: string }> = [
  { value: "all_time", label: CREATOR_JUDGMENT_WINDOW_LABEL },
  { value: "90d", label: "90 days · Pro" },
];

interface PeriodFilterProps {
  readonly value: Period;
  readonly canUseRecent?: boolean;
}

export default function PeriodFilter({ value, canUseRecent = true }: PeriodFilterProps): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick(period: Period): void {
    if (!canUseRecent && period !== "all_time") {
      router.push("/pricing");
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (period === "all_time") params.delete("period");
    else params.set("period", period);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="flex flex-col items-start tab:items-end gap-1.5">
      <div role="tablist" aria-label="Period filter" className="inline-flex border-b border-ink-250">
        {PERIODS.map((p) => {
        const active = value === p.value;
        return (
          <button
            key={p.value}
            role="tab"
            aria-selected={active}
            onClick={() => handleClick(p.value)}
            className={`font-mono text-[12px] tracking-caps uppercase px-4 py-2.5 -mb-px border-b-2 transition-colors ${
              active
                ? "border-accent text-ink-900"
                : !canUseRecent && p.value !== "all_time"
                  ? "border-transparent text-ink-400"
                  : "border-transparent text-ink-500 hover:text-ink-700"
            }`}
          >
            {p.label}
          </button>
        );
        })}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-caps text-ink-500">
        Viewing Last 12 months. The 90-day context filter requires Pro.
      </p>
    </div>
  );
}
