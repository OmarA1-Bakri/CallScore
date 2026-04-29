"use client";  // only because we may need sticky headers + future sort interactions
// (If sort is server-side via searchParams, this can become an RSC; current scope keeps it simple.)
//
// Two-tier model — distinct concepts:
//
//   1. AUTH TIER (free / pro / elite) — `row.tier_required`, set by getCreatorTier(rank).
//      Drives row-group VISIBILITY (Whop subscription gating). Wraps elite/pro groups
//      in <TierGate> overlay. Free tier renders ungated.
//
//   2. SCORE TIER (S / A / B / C) — derived in <RankTierBadge> from rank + N + wilson_lb.
//      Drives PER-ROW BADGE in the "Tier" column. Visible to all viewers regardless of
//      auth tier (the badge itself is not gated, even if the row group is).
//
// The dev-pack mockup shows score-tier as a column with all rows visible; this app
// keeps Whop auth-tier gating until product decides to ungate. Both concepts coexist
// — see Phase 2 Task 2 prompt for the documented decision.

import type { ReactElement } from "react";
import LeaderboardRow from "./LeaderboardRow";
import TierGate from "./TierGate";
import type { LeaderboardRow as Row } from "@/lib/types";

interface LeaderboardProps {
  readonly rows: readonly Row[];
}

const HEADERS: ReadonlyArray<{ key: string; label: ReactElement; align: "left" | "right" | "center" }> = [
  { key: "rank", label: <>Rank</>, align: "left" },
  { key: "creator", label: <>Creator</>, align: "left" },
  { key: "alpha", label: <>Alpha</>, align: "right" },
  { key: "delta", label: <>30d Δ</>, align: "right" },
  { key: "win", label: <>Win %</>, align: "right" },
  { key: "n", label: <>N</>, align: "right" },
  { key: "tier", label: <>Tier</>, align: "center" },
  { key: "last", label: <>Last call</>, align: "right" },
];

function renderTable(rows: readonly Row[]): ReactElement {
  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-ink-50 z-sticky">
        <tr>
          {HEADERS.map((h) => (
            <th
              key={h.key}
              scope="col"
              className={`font-mono text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3 border-b border-ink-250 ${
                h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"
              }`}
            >
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => <LeaderboardRow key={row.creator.id} row={row} />)}
      </tbody>
    </table>
  );
}

export default function Leaderboard({ rows }: LeaderboardProps): ReactElement {
  const elite = rows.filter((r) => r.tier_required === "elite");
  const pro = rows.filter((r) => r.tier_required === "pro");
  const free = rows.filter((r) => r.tier_required === "free");

  return (
    <div className="overflow-x-auto">
      {elite.length > 0 && <TierGate tier="elite">{renderTable(elite)}</TierGate>}
      {pro.length > 0 && <TierGate tier="pro">{renderTable(pro)}</TierGate>}
      {free.length > 0 && renderTable(free)}
    </div>
  );
}
