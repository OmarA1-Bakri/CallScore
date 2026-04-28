"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Period } from "@/lib/types";

const PERIODS: readonly { readonly value: Period; readonly label: string }[] = [
  { value: "all_time", label: "All Time" },
  { value: "90d", label: "90 Days" },
  { value: "30d", label: "30 Days" },
] as const;

interface PeriodFilterProps {
  readonly value: Period;
}

export default function PeriodFilter({ value }: PeriodFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick(period: Period) {
    const params = new URLSearchParams(searchParams.toString());
    if (period === "all_time") {
      params.delete("period");
    } else {
      params.set("period", period);
    }
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="flex items-center bg-ink-100 border border-ink-200 rounded-lg p-1">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          onClick={() => handleClick(period.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            value === period.value
              ? "bg-accent/10 text-accent"
              : "text-ink-500 hover:text-ink-700"
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
