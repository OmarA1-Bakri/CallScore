# Frontend Component Pass Implementation Plan (Phase 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task is self-contained and executable in an isolated git worktree by a fresh subagent. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks marked `[parallel]` are independent and can run concurrently in separate worktrees; tasks marked `[sequential]` must complete in order.

**Goal:** Rebuild the seven core leaf components and shared primitives to match the editorial-terminal spec — square corners, hairlines, ochre accent, mono numerics, no gradients, no random pastel avatars, no `glass-card` wrapper boxes around content.

**Architecture:** Three sub-phases. (2a) Extract shared editorial primitives (`Wordmark`, `Hairline`, `EditorialSection`, `MetaStrip`, `Chip`) — sequential, all components depend on them. (2b) Rebuild leaf components in parallel — `Leaderboard`, `AlphaScoreBadge`, `TierGate`, `PeriodFilter`, `FloatingFeedbackButton`. Each owns its own worktree. (2c) Sweep — Lucide icon audit, `glass-card` removal, dead-utility cleanup. Sequential after 2b lands.

**Tech Stack:** Next.js 14.2 / React 18 / Tailwind 3.4 (with foundation tokens already wired) / TypeScript 5 / Node `node --test` with `tsx`.

**Prerequisites — Phase 1 must be merged first.** Verify: `git log --oneline | grep -E 'wire next/font|spec contract|brand-\* alias'` shows the foundation commits on the current branch. If not, do not start Phase 2.

**Reference docs:**
- Spec: [docs/frontend-design-spec.md](../../frontend-design-spec.md)
- Component primitives reference: [.tmp/dev-archive/phase-2-components-screens-v0.2.html](../../../.tmp/dev-archive/phase-2-components-screens-v0.2.html)
- Tokens: [.tmp/dev-archive/phase-3-development-pack-v0.1.html](../../../.tmp/dev-archive/phase-3-development-pack-v0.1.html)

---

## Worktree Strategy

The repo already ignores `.worktrees/` ([gitignore commit `de263bb`](../../../.gitignore)). Each parallel task gets its own worktree:

```
.worktrees/
  comp-primitives/        — Task 1 (sequential foundation)
  comp-leaderboard/       — Task 2 (parallel)
  comp-alphascore/        — Task 3 (parallel)
  comp-tiergate/          — Task 4 (parallel)
  comp-periodfilter/      — Task 5 (parallel)
  comp-floatingfeedback/  — Task 6 (parallel)
  comp-sweep/             — Task 7+8 (sequential, after parallels)
```

**Per-worktree lifecycle (used in every task):**

```bash
# Create
git worktree add .worktrees/<name> -b chore/<branch>
cd .worktrees/<name>
# (subagent works here)

# Finish
npm test && npm run typecheck && npm run lint && npm run build
git push -u origin chore/<branch>     # optional
cd ..
git worktree remove .worktrees/<name>
git branch -d chore/<branch>          # if merged
```

**Parallel orchestration (orchestrator dispatches T2–T6 concurrently after T1 lands):**

```
T1 (primitives) ──► merge to integrate/gtm-…
                     │
        ┌────────────┼────────────┬─────────────┬────────────┐
        ▼            ▼            ▼             ▼            ▼
        T2           T3           T4            T5           T6
   leaderboard  alphascore   tiergate     periodfilter  floatfeedback
        └────────────┴────────────┴─────────────┴────────────┘
                     │
                     ▼
              T7 (lucide audit)
                     │
                     ▼
              T8 (glass-card sweep)
                     │
                     ▼
              T9 (final guardrails)
```

---

## File Structure

```
src/components/
  primitives/                  [Create] — shared editorial primitives
    Wordmark.tsx               [Create] — "CTR · credibility that ranks"
    Hairline.tsx               [Create] — 1px divider in --hair-strong/--hair/--hair-soft
    EditorialSection.tsx       [Create] — 96/1fr/280 grid layout per spec §
    MetaStrip.tsx              [Create] — k/v hairline-divided cells
    Chip.tsx                   [Create] — mono uppercase 2px-rounded chip
    index.ts                   [Create] — barrel
  Leaderboard.tsx              [Rewrite] — 5-col tier-grouped table
  LeaderboardRow.tsx           [Create] — extracted row sub-component
  AlphaScoreBadge.tsx          [Rewrite] — hairline numeric chip + bar
  TierGate.tsx                 [Rewrite] — flat editorial unlock card
  PeriodFilter.tsx             [Rewrite] — mono tabs + accent underline
  FloatingFeedbackButton.tsx   [Rewrite] — accent-bordered Link, no shadow
tests/
  primitives.test.ts           [Create] — primitives renderable
  leaderboard-shape.test.ts    [Create] — column set matches spec
  components-no-rounded.test.ts [Create] — no rounded-{lg,xl,full}
  components-no-lucide-decoration.test.ts [Create] — Lucide whitelist
```

---

## Task 1: Extract shared editorial primitives `[sequential]`

**Worktree:** `.worktrees/comp-primitives` · **Branch:** `chore/comp-primitives`

**Subagent prompt (self-contained):**

> You are implementing Task 1 of the Frontend Component Pass. Your job: create five small editorial primitives that every other component will import. Read [.tmp/dev-archive/phase-3-development-pack-v0.1.html](../../../.tmp/dev-archive/phase-3-development-pack-v0.1.html) to see the exact patterns being extracted (`.wm`, `.section`, `.sh`, `.hero-meta`, `.chip` selectors).
> The spec tokens (`--ink-*`, `--accent`, `--hair*`, `var(--font-serif|sans|mono)`) are already in [src/app/globals.css](../../../src/app/globals.css) and Tailwind. Use them directly.

**Files:**
- Create: `src/components/primitives/Wordmark.tsx`
- Create: `src/components/primitives/Hairline.tsx`
- Create: `src/components/primitives/EditorialSection.tsx`
- Create: `src/components/primitives/MetaStrip.tsx`
- Create: `src/components/primitives/Chip.tsx`
- Create: `src/components/primitives/index.ts`
- Test: `tests/primitives.test.ts`

- [ ] **Step 1: Create worktree**

```bash
git worktree add .worktrees/comp-primitives -b chore/comp-primitives integrate/gtm-seo-legal-auth-hardening
cd .worktrees/comp-primitives
```

- [ ] **Step 2: Write the failing test**

Create [tests/primitives.test.ts](../../../tests/primitives.test.ts):

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const PRIMITIVES = ["Wordmark", "Hairline", "EditorialSection", "MetaStrip", "Chip"] as const;

test("each primitive exists and exports a default React component", () => {
  for (const name of PRIMITIVES) {
    const path = join(root, `src/components/primitives/${name}.tsx`);
    assert.ok(existsSync(path), `${name}.tsx must exist`);
    const src = readFileSync(path, "utf8");
    assert.match(src, /export default function/, `${name} must export default function`);
  }
});

test("primitives barrel re-exports all five", () => {
  const src = readFileSync(join(root, "src/components/primitives/index.ts"), "utf8");
  for (const name of PRIMITIVES) {
    assert.match(src, new RegExp(`export\\s*\\{[^}]*default as ${name}[^}]*\\}|export\\s*\\{ default as ${name} \\}|from\\s+["']\\.\\/${name}["']`), `${name} must be re-exported`);
  }
});

test("Wordmark uses serif font and italic accent", () => {
  const src = readFileSync(join(root, "src/components/primitives/Wordmark.tsx"), "utf8");
  assert.match(src, /font-serif/, "must use spec serif font class");
  assert.match(src, /italic/, "must include italic accent");
  assert.match(src, /text-accent/, "italic accent must be ochre");
});

test("Hairline emits a div with one of the spec hairline tokens", () => {
  const src = readFileSync(join(root, "src/components/primitives/Hairline.tsx"), "utf8");
  assert.match(src, /border-(ink-150|ink-200|ink-250)/);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --import tsx --test tests/primitives.test.ts
```

Expected: FAIL — files don't exist yet.

- [ ] **Step 4: Create `Wordmark.tsx`**

```tsx
import Link from "next/link";
import type { ReactElement } from "react";

interface WordmarkProps {
  readonly href?: string;
  readonly size?: "sm" | "md";
}

export default function Wordmark({
  href = "/",
  size = "md",
}: WordmarkProps): ReactElement {
  const fontSize = size === "sm" ? "text-[14px]" : "text-[17px]";
  return (
    <Link
      href={href}
      className={`font-serif font-medium ${fontSize} text-ink-900 tracking-tight leading-none inline-flex items-baseline`}
      aria-label="CryptoTubers Ranked home"
    >
      CTR
      <span className="text-ink-500 mx-1.5">·</span>
      <em className="italic font-normal text-accent">credibility that ranks</em>
    </Link>
  );
}
```

- [ ] **Step 5: Create `Hairline.tsx`**

```tsx
import type { ReactElement } from "react";

interface HairlineProps {
  readonly weight?: "soft" | "default" | "strong";
  readonly className?: string;
}

const TOKEN: Record<NonNullable<HairlineProps["weight"]>, string> = {
  soft: "border-ink-150",
  default: "border-ink-200",
  strong: "border-ink-250",
};

export default function Hairline({
  weight = "default",
  className = "",
}: HairlineProps): ReactElement {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={`border-t ${TOKEN[weight]} ${className}`}
    />
  );
}
```

- [ ] **Step 6: Create `EditorialSection.tsx`**

```tsx
import type { ReactElement, ReactNode } from "react";

interface EditorialSectionProps {
  readonly index: string;          // "01", "02"
  readonly title: ReactNode;       // can include <em> via JSX
  readonly meta?: ReactNode;       // right-rail mono caption
  readonly children: ReactNode;
  readonly first?: boolean;        // suppress top border
}

export default function EditorialSection({
  index,
  title,
  meta,
  children,
  first = false,
}: EditorialSectionProps): ReactElement {
  return (
    <section className={`py-12 ${first ? "" : "border-t border-ink-250"}`}>
      <header className="grid grid-cols-1 desk:grid-cols-[96px_1fr_280px] gap-8 items-baseline mb-8">
        <div className="font-mono text-[11px] text-ink-500 tracking-caps uppercase">{index}</div>
        <h2 className="font-serif text-[28px] desk:text-[32px] text-ink-900 font-medium tracking-tight leading-snug text-balance">
          {title}
        </h2>
        {meta && (
          <div className="font-mono text-[10px] text-ink-500 tracking-wide leading-relaxed desk:text-right">
            {meta}
          </div>
        )}
      </header>
      <div className="desk:ml-[128px] max-w-[820px]">{children}</div>
    </section>
  );
}
```

- [ ] **Step 7: Create `MetaStrip.tsx`**

```tsx
import type { ReactElement, ReactNode } from "react";

export interface MetaCell {
  readonly k: string;
  readonly v: ReactNode;
}

interface MetaStripProps {
  readonly cells: readonly MetaCell[];
}

export default function MetaStrip({ cells }: MetaStripProps): ReactElement {
  return (
    <dl
      className="grid grid-cols-2 tab:grid-cols-4 gap-[18px] mt-8"
      aria-label="Section metadata"
    >
      {cells.map((cell) => (
        <div key={cell.k} className="border-t border-ink-250 pt-3.5">
          <dt className="font-mono text-[9.5px] text-ink-500 tracking-caps uppercase mb-1.5">
            {cell.k}
          </dt>
          <dd className="font-serif text-[24px] text-ink-900 font-medium tracking-tight">
            {cell.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 8: Create `Chip.tsx`**

```tsx
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
```

- [ ] **Step 9: Create barrel `index.ts`**

```ts
export { default as Wordmark } from "./Wordmark";
export { default as Hairline } from "./Hairline";
export { default as EditorialSection } from "./EditorialSection";
export { default as MetaStrip } from "./MetaStrip";
export { default as Chip } from "./Chip";
export type { MetaCell } from "./MetaStrip";
```

- [ ] **Step 10: Run tests + typecheck + build**

```bash
node --import tsx --test tests/primitives.test.ts
npm run typecheck
npm run build
```

Expected: 4 tests pass; typecheck clean; build green.

- [ ] **Step 11: Commit, push, exit worktree**

```bash
git add src/components/primitives/ tests/primitives.test.ts
git commit -m "feat(frontend): extract editorial primitives (Wordmark/Hairline/Section/MetaStrip/Chip)"
git push -u origin chore/comp-primitives
cd ../..
```

- [ ] **Step 12: Merge into integration branch (orchestrator action)**

```bash
git checkout integrate/gtm-seo-legal-auth-hardening
git merge --ff-only chore/comp-primitives
npm test && npm run typecheck && npm run build
git worktree remove .worktrees/comp-primitives
git branch -d chore/comp-primitives
```

**Merge gate before T2–T6 dispatch:** primitives must be on `integrate/gtm-seo-legal-auth-hardening` before parallel components branch off them.

---

## Task 2: Rebuild `Leaderboard` to spec column set `[parallel]`

**Worktree:** `.worktrees/comp-leaderboard` · **Branch:** `chore/comp-leaderboard`

**Subagent prompt:**

> You are rebuilding the Leaderboard component. Reference: [.tmp/dev-archive/phase-2-components-screens-v0.2.html](../../../.tmp/dev-archive/phase-2-components-screens-v0.2.html) lines 1050-1080, class `.lb-table`. The dev-pack mockup has 11 columns; this Phase 2 task ships an **8-column subset** with the remaining 3 deferred to follow-on phases:
>
> **Phase 2 column set (ship these):** Rank · Creator (with initial-letter avatar matching dev-pack) · Alpha (with hairline bar) · 30d Δ · Win % · N · **Tier (S/A/B/C, score-based)** · Last call
>
> **Deferred from Phase 2 with rationale:**
> - **Trend (sparkline)** → defer: needs PerformanceChart-grade rendering work; Phase 4 sparkline component
> - **Provenance** → defer: needs creator-verification data not in current schema
> - **Multi-select checkbox** → defer: requires bulk-action UI (Phase 4)
>
> **Auth-tier gating decision (P0 from review):** the existing app filters rows by `tier_required` (free/pro/elite) and wraps elite/pro groups in `<TierGate>` to lock content behind subscription. The dev-pack mockup shows all rows visible to all viewers with score-tier as a column. **For Phase 2 we keep the existing auth-tier grouping** (preserves Whop monetization until product decides otherwise) but ALSO add the score-Tier column so the two concepts are visually distinct: auth-gating happens at the row-group level (TierGate), score-tier renders per-row in its own column. Document this clearly in the rebuilt component header comment.
>
> **Initial-letter avatars (P1 from review):** the dev-pack keeps initial-letter avatars (`<span class="avatar">CI</span>`, 22px serif initials with ink borders) — they're an editorial feature, not pastel decoration. Restore them with the spec styling: `bg-ink-200 border border-ink-300 font-serif text-[10px] text-ink-800 w-[22px] h-[22px] inline-flex items-center justify-center` (no `rounded-full` — square or 2px-rounded per spec).
>
> Original lucide chrome and `glass-card` wrapper must go. Serif rank cell with mono "+N" delta.

**Files:**
- Rewrite: `src/components/Leaderboard.tsx`
- Create: `src/components/LeaderboardRow.tsx` (extracted row, keeps Leaderboard.tsx focused)
- Test: `tests/leaderboard-shape.test.ts`

- [ ] **Step 1: Create worktree**

```bash
git worktree add .worktrees/comp-leaderboard -b chore/comp-leaderboard integrate/gtm-seo-legal-auth-hardening
cd .worktrees/comp-leaderboard
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/leaderboard-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/Leaderboard.tsx"),
  "utf8",
);

test("Leaderboard exposes the 8-column spec subset", () => {
  // Spec headers (case-insensitive match on the rendered text).
  // Per Phase 2 scope: 8 of 11 dev-pack columns. Trend, Provenance, multi-select
  // checkbox are explicitly deferred — see Task 2 prompt.
  for (const h of ["Rank", "Creator", "Alpha", "30d", "Win", "Tier", "Last"]) {
    assert.match(src, new RegExp(`>\\s*${h}`, "i"), `header ${h} missing`);
  }
});

test("Leaderboard does not render pastel avatar circles (initial-letter avatars allowed)", () => {
  // Pastel/random palettes banned per Phase 1; initial-letter avatars per
  // dev-pack are kept (square or 2px corners only — no rounded-full).
  assert.doesNotMatch(src, /bg-(blue|pink|cyan|purple|emerald|teal)-\d{3}/);
  assert.doesNotMatch(src, /rounded-full/);
});

test("Leaderboard is not wrapped in glass-card", () => {
  assert.doesNotMatch(src, /\bglass-card\b/);
});

test("Leaderboard renders score-Tier column distinct from auth-tier grouping", () => {
  // Score tier (S/A/B/C) is a per-row cell; auth tier (free/pro/elite) is the
  // group wrapper. Both must coexist.
  assert.match(src, /tier_required/, "auth-tier grouping must be preserved");
  assert.match(src, /score.*tier|tier.*score|RankTierBadge/i, "score-Tier column must render");
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --import tsx --test tests/leaderboard-shape.test.ts
```

Expected: FAIL — current file has 9 columns and pastel avatars.

- [ ] **Step 4: Implement `LeaderboardRow.tsx`**

```tsx
import Link from "next/link";
import type { ReactElement } from "react";
import type { LeaderboardRow as Row } from "@/lib/types";
import RankTierBadge from "./RankTierBadge";

interface LeaderboardRowProps {
  readonly row: Row;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function LeaderboardRow({ row }: LeaderboardRowProps): ReactElement {
  const alpha = row.stats.alpha_score;
  const delta30 = row.stats.avg_alpha_30d;
  const winPct = (row.stats.win_rate * 100).toFixed(1);
  const lastCall = row.best_call?.symbol?.replace("USDT", "") ?? "—";
  const alphaTone = alpha >= 50 ? "text-pos" : alpha < 30 ? "text-neg" : "text-ink-700";

  return (
    <tr className="border-b border-ink-150 hover:bg-ink-100/60 transition-colors">
      {/* Rank — serif numeral */}
      <td className="py-3 pr-4 align-baseline w-[56px]">
        <span className="font-serif text-[18px] text-accent font-medium tabular-nums">
          {String(row.rank).padStart(2, "0")}
        </span>
      </td>
      {/* Creator — initial-letter avatar + name + handle (matches dev-pack) */}
      <td className="py-3 pr-4 align-baseline">
        <Link
          href={`/creator/${row.creator.youtube_handle}`}
          className="flex items-baseline gap-2.5 group focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          <span
            className="inline-flex items-center justify-center w-[22px] h-[22px] bg-ink-200 border border-ink-300 font-serif text-[10px] text-ink-800 shrink-0"
            style={{ borderRadius: 2 }}
            aria-hidden="true"
          >
            {getInitials(row.creator.name)}
          </span>
          <span className="min-w-0">
            <span className="block font-serif text-[15px] text-ink-900 group-hover:text-accent transition-colors leading-tight truncate">
              {row.creator.name}
            </span>
            <span className="block font-mono text-[10px] text-ink-500 tracking-wide mt-0.5 truncate">
              {row.creator.youtube_handle}
            </span>
          </span>
        </Link>
      </td>
      {/* Alpha — score with unit */}
      <td className={`py-3 pr-4 text-right tabular-nums font-mono text-[13px] ${alphaTone}`}>
        {alpha.toFixed(1)}
        <span className="text-ink-500 text-[10px] ml-1">α</span>
      </td>
      {/* 30d Δ */}
      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[12px]">
        <span className={delta30 >= 0 ? "text-pos" : "text-neg"}>
          {delta30 >= 0 ? "+" : ""}
          {delta30.toFixed(1)}
        </span>
      </td>
      {/* Win % */}
      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[12px] text-ink-700">
        {winPct}<span className="text-ink-500">%</span>
      </td>
      {/* N — scored-call count */}
      <td className="py-3 pr-4 text-right tabular-nums font-mono text-[12px] text-ink-600">
        {row.stats.total_calls}
      </td>
      {/* Tier — score-based S/A/B/C (distinct from auth-tier row grouping) */}
      <td className="py-3 pr-4 text-center">
        <RankTierBadge
          rank={row.rank}
          totalCalls={row.stats.total_calls}
          wilsonLb={row.stats.wilson_lb}
        />
      </td>
      {/* Last call — most recent scored symbol */}
      <td className="py-3 text-right font-mono text-[11px] text-ink-600">{lastCall}</td>
    </tr>
  );
}
```

- [ ] **Step 5: Implement `Leaderboard.tsx`**

```tsx
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

const HEADERS: ReadonlyArray<{ key: string; label: string; align: "left" | "right" | "center" }> = [
  { key: "rank", label: "Rank", align: "left" },
  { key: "creator", label: "Creator", align: "left" },
  { key: "alpha", label: "Alpha", align: "right" },
  { key: "delta", label: "30d Δ", align: "right" },
  { key: "win", label: "Win %", align: "right" },
  { key: "n", label: "N", align: "right" },
  { key: "tier", label: "Tier", align: "center" },
  { key: "last", label: "Last call", align: "right" },
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
```

- [ ] **Step 6: Run tests + typecheck + build**

```bash
node --import tsx --test tests/leaderboard-shape.test.ts
npm run typecheck
npm run build
```

Expected: tests pass; typecheck clean; build green.

- [ ] **Step 7: Commit + push + exit worktree**

```bash
git add src/components/Leaderboard.tsx src/components/LeaderboardRow.tsx tests/leaderboard-shape.test.ts
git commit -m "refactor(leaderboard): editorial 5-col tier-grouped table per spec"
git push -u origin chore/comp-leaderboard
cd ../..
```

---

## Task 3: Rebuild `AlphaScoreBadge` `[parallel]`

**Worktree:** `.worktrees/comp-alphascore` · **Branch:** `chore/comp-alphascore`

**Subagent prompt:**

> Replace the SVG ring badge in [src/components/AlphaScoreBadge.tsx](../../../src/components/AlphaScoreBadge.tsx) with the spec's hairline numeric chip + bar pattern. The badge primitive needs two exports: `AlphaScoreBadge` (block-level for cards) and `AlphaScoreBar` (inline horizontal bar for rows). Use `font-serif` for the numeral, `font-mono` for the unit "α", spec semantic colors only (`pos` ≥70 / `accent` 50–69 / `warn` 30–49 / `neg` <30). No `rounded-full`, no SVG glow, no `--ink-200` ring (the bar is enough).

**Files:**
- Rewrite: `src/components/AlphaScoreBadge.tsx`
- Test: `tests/alphascore-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/comp-alphascore -b chore/comp-alphascore integrate/gtm-seo-legal-auth-hardening
cd .worktrees/comp-alphascore
```

- [ ] **Step 2: Write failing test**

```ts
// tests/alphascore-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/AlphaScoreBadge.tsx"),
  "utf8",
);

test("uses spec semantic tokens only (no ink-yellow/orange/blue/etc.)", () => {
  assert.doesNotMatch(src, /\b(text|bg|border)-(yellow|orange|blue|pink|cyan|purple)-\d/);
});

test("does not use rounded-full or rounded-xl", () => {
  assert.doesNotMatch(src, /\brounded-(full|xl|lg)\b/);
});

test("uses serif numeral and mono unit", () => {
  assert.match(src, /font-serif/);
  assert.match(src, /α/);
});

test("exports AlphaScoreBar (horizontal bar variant)", () => {
  assert.match(src, /export function AlphaScoreBar/);
});

test("does not render an SVG ring", () => {
  assert.doesNotMatch(src, /<svg[^>]*viewBox="0 0 100 100"/);
});
```

- [ ] **Step 3: Run test, expect fail**

```bash
node --import tsx --test tests/alphascore-shape.test.ts
```

- [ ] **Step 4: Implement**

```tsx
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
    <div className="inline-flex flex-col items-start gap-1.5 border border-ink-200 bg-ink-50 px-3 py-2.5"
         style={{ borderRadius: 2 }}>
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
```

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/alphascore-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit, push, exit worktree**

```bash
git add src/components/AlphaScoreBadge.tsx tests/alphascore-shape.test.ts
git commit -m "refactor(alphascore): hairline numeric chip + bar per spec semantics"
git push -u origin chore/comp-alphascore
cd ../..
```

---

## Task 4: Rebuild `TierGate` `[parallel]`

**Worktree:** `.worktrees/comp-tiergate` · **Branch:** `chore/comp-tiergate`

**Subagent prompt:**

> Strip gradients, glow shadows, and `rounded-xl` chrome from [src/components/TierGate.tsx](../../../src/components/TierGate.tsx). Replace with: blurred-content underlay (existing pattern, keep), overlay panel using flat `bg-accent-low` background + 2px-rounded border + serif "Upgrade to {Tier}" headline + mono CTA. Lucide `Lock`/`Crown` allowed (action-essential). No `glow-gold` / `bg-gradient-*`.

**Files:**
- Rewrite: `src/components/TierGate.tsx`
- Test: `tests/tiergate-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/comp-tiergate -b chore/comp-tiergate integrate/gtm-seo-legal-auth-hardening
cd .worktrees/comp-tiergate
```

- [ ] **Step 2: Write failing test**

```ts
// tests/tiergate-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/TierGate.tsx"),
  "utf8",
);

test("no gradients", () => {
  // Match Tailwind color-stop patterns specifically; bare `\b(from|to|via)-`
  // would false-positive on classes like `tracking-`, `auto-`, etc.
  assert.doesNotMatch(src, /\bbg-gradient-/);
  assert.doesNotMatch(
    src,
    /\b(from|to|via)-(black|white|transparent|current|inherit|[a-z]+-\d{2,3})\b/,
  );
});

test("no rounded-xl/full chrome", () => {
  assert.doesNotMatch(src, /\brounded-(xl|2xl|3xl|full)\b/);
});

test("no glow-* utility classes", () => {
  assert.doesNotMatch(src, /\bglow-(gold|purple|silver)\b/);
});

test("uses serif headline and mono CTA", () => {
  assert.match(src, /font-serif/);
  assert.match(src, /font-mono/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/tiergate-shape.test.ts
```

- [ ] **Step 4: Implement**

```tsx
import Link from "next/link";
import { Lock, Crown } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

interface TierGateProps {
  readonly tier: "pro" | "elite";
  readonly children: ReactNode;
}

const TIERS = {
  pro: {
    label: "Pro",
    price: "$19/mo",
    description: "Deep analytics on every creator",
    Icon: Lock,
  },
  elite: {
    label: "Alpha",
    price: "$49/mo",
    description: "Actionable signals, not just rankings",
    Icon: Crown,
  },
} as const;

export default function TierGate({
  tier,
  children,
}: TierGateProps): ReactElement {
  const t = TIERS[tier];
  const Icon = t.Icon;

  return (
    <div className="relative">
      <div
        className="blur-[6px] select-none pointer-events-none"
        aria-hidden="true"
        // @ts-expect-error -- `inert` is valid HTML5 but not yet in React 18 types
        inert=""
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-ink-0/60 backdrop-blur-sm">
        <div
          className="text-center px-6 py-5 border border-accent-dim bg-accent-low max-w-[320px]"
          style={{ borderRadius: 2 }}
        >
          <Icon className="w-5 h-5 mx-auto mb-2 text-accent" aria-hidden="true" />
          <p className="font-serif text-[18px] text-ink-900 font-medium leading-tight mb-1">
            Upgrade to <em className="italic text-accent">{t.label}</em>
          </p>
          <p className="font-mono text-[11px] text-ink-500 tracking-wide mb-3">
            {t.description}
          </p>
          <p className="font-serif text-[20px] text-ink-900 mb-4 tabular-nums">
            {t.price}
          </p>
          <Link
            href="/pricing"
            className="inline-block bg-accent hover:bg-accent-dim text-ink-0 font-mono text-[11px] tracking-caps uppercase px-4 py-2 transition-colors"
            style={{ borderRadius: 2 }}
          >
            Unlock
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/tiergate-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit, push, exit worktree**

```bash
git add src/components/TierGate.tsx tests/tiergate-shape.test.ts
git commit -m "refactor(tiergate): editorial composition (no gradients, hairline + accent-low)"
git push -u origin chore/comp-tiergate
cd ../..
```

---

## Task 5: Rebuild `PeriodFilter` `[parallel]`

**Worktree:** `.worktrees/comp-periodfilter` · **Branch:** `chore/comp-periodfilter`

**Subagent prompt:**

> Replace the `rounded-lg` segmented control in [src/components/PeriodFilter.tsx](../../../src/components/PeriodFilter.tsx) with mono uppercase tabs separated by hairlines, with the active tab marked by a 2px accent underline. No background pill on active. Keep the `useRouter`/`useSearchParams` interaction.

**Files:**
- Rewrite: `src/components/PeriodFilter.tsx`
- Test: `tests/periodfilter-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/comp-periodfilter -b chore/comp-periodfilter integrate/gtm-seo-legal-auth-hardening
cd .worktrees/comp-periodfilter
```

- [ ] **Step 2: Write failing test**

```ts
// tests/periodfilter-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/PeriodFilter.tsx"),
  "utf8",
);

test("no rounded-lg/md pill chrome", () => {
  assert.doesNotMatch(src, /\brounded-(lg|md|xl)\b/);
});

test("active state uses accent underline (border-b)", () => {
  assert.match(src, /border-b-2/);
  assert.match(src, /border-accent/);
});

test("font-mono uppercase tabs", () => {
  assert.match(src, /font-mono/);
  assert.match(src, /uppercase/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/periodfilter-shape.test.ts
```

- [ ] **Step 4: Implement**

```tsx
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
}

export default function PeriodFilter({ value }: PeriodFilterProps): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick(period: Period): void {
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
            className={`font-mono text-[11px] tracking-caps uppercase px-4 py-2.5 -mb-px border-b-2 transition-colors ${
              active
                ? "border-accent text-ink-900"
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
```

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/periodfilter-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit, push, exit worktree**

```bash
git add src/components/PeriodFilter.tsx tests/periodfilter-shape.test.ts
git commit -m "refactor(periodfilter): mono tabs with accent underline (no pill chrome)"
git push -u origin chore/comp-periodfilter
cd ../..
```

---

## Task 6: Simplify `FloatingFeedbackButton` to a `<Link>` `[parallel]`

**Worktree:** `.worktrees/comp-floatingfeedback` · **Branch:** `chore/comp-floatingfeedback`

**Subagent prompt:**

> [src/components/FloatingFeedbackButton.tsx](../../../src/components/FloatingFeedbackButton.tsx) is over-engineered: `rounded-full`, `glow-gold`, `hover:scale-110`. Spec is restrained — replace with a fixed-position 2px-rounded bordered `<Link>` that links to `/feedback`. Keep the icon if useful (a small mono "?" glyph or `MessageSquare` from lucide).

**Files:**
- Rewrite: `src/components/FloatingFeedbackButton.tsx`
- Test: `tests/floatingfeedback-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/comp-floatingfeedback -b chore/comp-floatingfeedback integrate/gtm-seo-legal-auth-hardening
cd .worktrees/comp-floatingfeedback
```

- [ ] **Step 2: Write failing test**

```ts
// tests/floatingfeedback-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/FloatingFeedbackButton.tsx"),
  "utf8",
);

test("no rounded-full or hover:scale chrome", () => {
  assert.doesNotMatch(src, /\brounded-full\b/);
  assert.doesNotMatch(src, /\bhover:scale-/);
  assert.doesNotMatch(src, /\bglow-/);
});

test("renders a next/link, not a button", () => {
  assert.match(src, /from\s+["']next\/link["']/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/floatingfeedback-shape.test.ts
```

- [ ] **Step 4: Implement**

```tsx
import Link from "next/link";
import type { ReactElement } from "react";

export default function FloatingFeedbackButton(): ReactElement {
  return (
    <Link
      href="/feedback"
      className="fixed bottom-6 right-6 z-toast inline-flex items-center gap-2 px-3 py-2 border border-accent-dim bg-ink-50/90 backdrop-blur-bar text-accent font-mono text-[11px] tracking-caps uppercase hover:bg-accent-low transition-colors"
      style={{ borderRadius: 2 }}
      aria-label="Send feedback"
    >
      <span aria-hidden="true">?</span>
      <span>Feedback</span>
    </Link>
  );
}
```

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/floatingfeedback-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit, push, exit worktree**

```bash
git add src/components/FloatingFeedbackButton.tsx tests/floatingfeedback-shape.test.ts
git commit -m "refactor(feedback-button): editorial Link, no shadow/scale/round-full"
git push -u origin chore/comp-floatingfeedback
cd ../..
```

---

## Merge gate after T2–T6

After T2–T6 land, the orchestrator merges all five into integration:

```bash
git checkout integrate/gtm-seo-legal-auth-hardening
for branch in comp-leaderboard comp-alphascore comp-tiergate comp-periodfilter comp-floatingfeedback; do
  git merge --no-ff chore/$branch -m "Merge chore/$branch into integration"
done
npm test && npm run typecheck && npm run build
```

If any merge produces conflicts (unlikely — components don't share files), resolve and re-test. Then proceed to T7.

---

## Task 7: Lucide icon audit `[sequential]`

**Worktree:** `.worktrees/comp-sweep` · **Branch:** `chore/comp-sweep`

**Subagent prompt:**

> Audit every `lucide-react` import. Allowed: `Menu`, `X`, `ArrowLeft`, `ArrowUpRight`, `ExternalLink`, `Lock`, `Crown` (auth/nav essentials). Forbidden: `Trophy`, `BarChart3`, `Target`, `Users`, `Zap`, `Crosshair`, `Activity`, `Layers`, `Award`, `Database`, `Video`, `Brain`, `Eye`, `Filter`, `ChevronRight`, `TrendingUp/Down`, `Minus`, `LogIn/Out` (decorative chrome — replace with Unicode glyph or text). Add a guardrail test enforcing the whitelist.

**Files:**
- Modify (codemod): every `*.tsx` importing forbidden lucide icons
- Test: `tests/components-no-lucide-decoration.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/comp-sweep -b chore/comp-sweep integrate/gtm-seo-legal-auth-hardening
cd .worktrees/comp-sweep
```

- [ ] **Step 2: Write failing test**

```ts
// tests/components-no-lucide-decoration.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const ALLOWED = new Set([
  "Menu", "X", "ArrowLeft", "ArrowUpRight", "ExternalLink", "Lock", "Crown",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return walk(f);
    return /\.tsx$/.test(n) ? [f] : [];
  });
}

test("only whitelisted lucide-react icons are imported", () => {
  const offenders: string[] = [];
  for (const file of walk(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    const m = src.match(/from\s+["']lucide-react["'][^;]*/g);
    if (!m) continue;
    const importLine = src.match(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/);
    if (!importLine) continue;
    const names = importLine[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    const bad = names.filter((n) => !ALLOWED.has(n));
    if (bad.length) offenders.push(`${file}: ${bad.join(", ")}`);
  }
  assert.deepEqual(offenders, [], `Forbidden lucide icons:\n${offenders.join("\n")}`);
});
```

- [ ] **Step 3: Run test, list offenders**

```bash
node --import tsx --test tests/components-no-lucide-decoration.test.ts
```

- [ ] **Step 4: For each offender file, replace forbidden imports**

Common substitutions:
- `<TrendingUp />` / `<TrendingDown />` → `<span aria-hidden="true">↑</span>` / `<span>↓</span>`
- `<Trophy />` / `<BarChart3 />` / `<Target />` → drop entirely (caption text is enough)
- `<ChevronRight />` → `<span aria-hidden="true">›</span>`
- `<Minus />` → `<span aria-hidden="true">—</span>`
- `<LogIn />` / `<LogOut />` → drop, just text "Sign in" / "Logout"
- `<Zap />` / `<Crown />` (in tier badge) → `<Crown />` is allowed; `<Zap />` becomes `<span>★</span>`

Walk through the offender list one file at a time. Trim each import line, replace JSX usages with the substitution above, run the test until it passes.

- [ ] **Step 5: Run tests + typecheck + build**

```bash
npm test
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit (do not push yet — Task 8 also commits to this worktree)**

```bash
git add -u tests/components-no-lucide-decoration.test.ts
git commit -m "refactor(frontend): restrict lucide-react to nav/auth essentials"
```

---

## Task 8: `glass-card` removal sweep `[sequential]`

(Same worktree as Task 7.)

**Subagent prompt:**

> The `.glass-card` utility wraps content in a bordered box with backdrop-blur. The spec uses bare hairlines + section grids instead. Remove `.glass-card` and `.glass-card-hover` from every component. Replace each usage with the appropriate spec primitive: a wrapper card → `<EditorialSection>` or just `<div className="border-t border-ink-250">`; an inline card → no wrapper, content flows under a `<Hairline />`. Delete the CSS classes from globals.css.

**Files:**
- Modify: every `.tsx` using `glass-card` or `glass-card-hover`
- Modify: `src/app/globals.css` — delete the two `@layer components` rules
- Test: `tests/components-no-rounded.test.ts` (also adds the `glass-card` ban)

- [ ] **Step 1: Write failing test**

```ts
// tests/components-no-rounded.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return walk(f);
    return /\.(tsx?|css)$/.test(n) ? [f] : [];
  });
}

test("no glass-card or glass-card-hover usages remain", () => {
  const offenders: string[] = [];
  for (const file of walk(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    if (/\bglass-card(-hover)?\b/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `glass-card found in:\n${offenders.join("\n")}`);
});

test("no rounded-lg/xl/full chrome on src/components/", () => {
  const offenders: string[] = [];
  const re = /\brounded-(lg|xl|2xl|3xl|full)\b/g;
  for (const file of walk(join(root, "src/components"))) {
    const src = readFileSync(file, "utf8");
    const matches = src.match(re);
    if (matches) offenders.push(`${file}: ${Array.from(new Set(matches)).join(", ")}`);
  }
  assert.deepEqual(offenders, [], `rounded chrome found:\n${offenders.join("\n")}`);
});
```

- [ ] **Step 2: Run, list offenders**

```bash
node --import tsx --test tests/components-no-rounded.test.ts
```

- [ ] **Step 3: For each offender, replace `glass-card` wrapper**

Pattern:
- `<div className="glass-card overflow-hidden">` → `<div className="border border-ink-200 overflow-hidden">` (preserve content boundary if needed)
- `<div className="glass-card p-12 text-center">` (empty state) → `<div className="border-t border-ink-250 py-12 text-center">`

For `rounded-{lg,xl,full}` outside the auth/icon-button minor uses, replace with `style={{ borderRadius: 2 }}` (or remove if it was decorative).

- [ ] **Step 4: Delete the CSS**

In [src/app/globals.css](../../../src/app/globals.css), remove:

```css
.glass-card { @apply rounded-none border border-ink-200 bg-ink-50/90 backdrop-blur-bar; }
.glass-card-hover { @apply glass-card transition-colors duration-200 hover:bg-ink-100 hover:border-ink-300; }
```

- [ ] **Step 5: Run all tests + typecheck + build**

```bash
npm test
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit + push**

```bash
git add -u tests/components-no-rounded.test.ts
git commit -m "refactor(frontend): remove glass-card wrapper and rounded chrome from components"
git push -u origin chore/comp-sweep
cd ../..
```

---

## Task 9: Final guardrails `[sequential]`

After T7+T8 merge, run the full suite from `integrate/gtm-…`.

- [ ] **Step 1: Merge sweep into integration**

```bash
git checkout integrate/gtm-seo-legal-auth-hardening
git merge --no-ff chore/comp-sweep -m "Merge chore/comp-sweep into integration"
git worktree remove .worktrees/comp-sweep
```

- [ ] **Step 2: Run full suite**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all green. Test count grows by ~25 (T1 primitives ~4, T2 leaderboard ~4, T3 alphascore ~5, T4 tiergate ~4, T5 periodfilter ~3, T6 floatingfeedback ~2, T7 lucide ~1, T8 sweep ~2). Phase 1 ended at 160; Phase 2 should land around 185.

- [ ] **Step 3: Visual smoke**

```bash
npm run dev
```

Walk through every public page and confirm:
- Editorial typography renders (Source Serif 4 hero, Inter Tight body, JetBrains Mono numerics)
- Leaderboard uses 5-col table with no avatar circles
- AlphaScoreBar appears as a hairline bar in rows; AlphaScoreBadge as a numeric chip in profile/call pages
- TierGate overlay is flat editorial, no gradients
- PeriodFilter is mono tabs with an accent underline
- FloatingFeedbackButton is a flat hairline link
- No `rounded-full` chrome anywhere except focused-ring or scrollbar (allowed)

---

## Self-review

**Coverage check:**
- ✅ Editorial primitives (T1)
- ✅ Leaderboard column-set rebuild (T2)
- ✅ AlphaScoreBadge restructure (T3)
- ✅ TierGate gradient removal (T4)
- ✅ PeriodFilter spec composition (T5)
- ✅ FloatingFeedbackButton simplification (T6)
- ✅ Lucide icon audit (T7)
- ✅ glass-card / rounded chrome sweep (T8)
- ✅ Final guardrails (T9)

**Type consistency:** `LeaderboardRow` props match `@/lib/types` `LeaderboardRow`. `AlphaScoreBadge` and `AlphaScoreBar` retain backward-compatible props for existing call sites. `TierGate` keeps `tier: "pro" | "elite"` API. `PeriodFilter` keeps `value: Period`.

**Out of scope (Phase 3):**
- Header wordmark swap (currently keeps logo PNG; Phase 3 page rebuilds will swap to `<Wordmark />`)
- Footer wordmark swap (same)
- Any page-level layout changes (Phase 3)

---

## Execution Handoff

**Subagent dispatch order:**

1. **T1** — sequential, single subagent.
2. After T1 merges → dispatch **T2, T3, T4, T5, T6** as five parallel subagents (one worktree each).
3. After all five merge → **T7** + **T8** in one sequential subagent (shared worktree).
4. **T9** is orchestrator action.

Each subagent prompt is the markdown block from "Subagent prompt" through "Step 6 / Commit, push, exit worktree" of its task. Hand the subagent the file paths and the failing test; it writes code until tests pass and the build is green.
