"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactElement } from "react";
import type { Period } from "@/lib/types";

const PERIODS: ReadonlyArray<{ readonly value: Period; readonly label: string }> = [
  { value: "all_time", label: "All time" },
  { value: "90d", label: "90 days" },
  { value: "30d", label: "30 days" },
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
  );
}
