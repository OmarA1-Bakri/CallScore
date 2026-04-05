"use client";

import { useState } from "react";
import type { Period } from "@/lib/types";

const PERIODS: readonly { readonly value: Period; readonly label: string }[] = [
  { value: "all_time", label: "All Time" },
  { value: "90d", label: "90 Days" },
  { value: "30d", label: "30 Days" },
] as const;

export default function PeriodFilter() {
  const [active, setActive] = useState<Period>("all_time");

  return (
    <div className="flex items-center bg-brand-card border border-brand-border rounded-lg p-1">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          onClick={() => setActive(period.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            active === period.value
              ? "bg-brand-gold/10 text-brand-gold"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
