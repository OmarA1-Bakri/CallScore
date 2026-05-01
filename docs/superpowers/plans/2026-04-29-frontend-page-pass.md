# Frontend Page Rebuild Pass Implementation Plan (Phase 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each route is rebuilt in an isolated git worktree by a fresh subagent. All page-rebuild tasks are mutually parallelizable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every public route's composition to match the editorial-terminal spec, retiring the two routes still on the SUPERSEDED B Terminal phosphor-green direction (`/about`, `/pricing`) and migrating four others (`/`, `/methodology`, `/creator/[handle]`, `/call/[id]`) to use the editorial primitives + spec-shaped components.

**Architecture:** Six independent route rebuilds, each with its own worktree and subagent. They share zero modified files (each subagent edits only its own page directory + an optional metadata helper). After all six merge, a final guardrail task runs across the whole repo.

**Tech Stack:** Next.js 14.2 App Router · React 18 · Tailwind 3.4 · Phase-1 token foundation · Phase-2 editorial primitives (`Wordmark`, `Hairline`, `EditorialSection`, `MetaStrip`, `Chip`) and rebuilt components (`Leaderboard`, `AlphaScoreBadge`, `TierGate`, `PeriodFilter`, `FloatingFeedbackButton`).

**Prerequisites — Phases 1 and 2 must be merged first.** Verify:

```bash
# Phase 1 commits
git log --oneline | grep -E "wire next/font|spec contract|brand-\* alias"
# Phase 2 commits
git log --oneline | grep -E "editorial primitives|editorial 5-col|hairline numeric chip"
```

Both should return matches. If not, do not start Phase 3.

**Reference dev-pack files (each task points at the relevant one):**
- `/` (home + leaderboard) → [.tmp/dev-archive/phase-2-components-screens-v0.2.html](../../../.tmp/dev-archive/phase-2-components-screens-v0.2.html) §Leaderboard mock
- `/about` → editorial composition guidance in [docs/frontend-design-spec.md](../../frontend-design-spec.md), patterned on the dev-pack hero + sections
- `/pricing` → [.tmp/dev-archive/phase-3-d4-pricing-v0.1.html](../../../.tmp/dev-archive/phase-3-d4-pricing-v0.1.html)
- `/methodology` → [.tmp/dev-archive/phase-3-d7-methodology-drawer-v0.1.1 (1).html](../../../.tmp/dev-archive/phase-3-d7-methodology-drawer-v0.1.1%20(1).html)
- `/creator/[handle]` → [phase-2-components-screens-v0.2.html](../../../.tmp/dev-archive/phase-2-components-screens-v0.2.html) §Profile (~line 1492 onward)
- `/call/[id]` → same file, §Call (~line 1276 "SOL long · consensus")

---

## Worktree Strategy

Six parallel page rebuilds, one orchestrator merge, one guardrail sweep:

```
.worktrees/
  page-home/             — Task 1
  page-about/            — Task 2
  page-pricing/          — Task 3
  page-methodology/      — Task 4
  page-creator/          — Task 5
  page-call/             — Task 6
  page-sweep/            — Task 7
```

```
        ┌──────┬──────┬──────┬──────┬──────┐
        │      │      │      │      │      │
        T1     T2     T3     T4     T5     T6
       home  about price method creat  call
        │      │      │      │      │      │
        └──────┴──────┴──────┴──────┴──────┘
                          │
                          ▼
                    T7 (sweep + guardrails)
```

Per-worktree lifecycle (same convention as Phase 2):

```bash
git worktree add .worktrees/<name> -b chore/<branch> integrate/gtm-seo-legal-auth-hardening
cd .worktrees/<name>
# subagent works
npm test && npm run typecheck && npm run lint && npm run build
git push -u origin chore/<branch>
cd ../..
git worktree remove .worktrees/<name>
```

---

## Shared Test Infrastructure

Add a helper at the start of Phase 3 (Task 0, orchestrator does this) that the page tasks reuse.

**Task 0 (orchestrator setup):** Create [tests/page-helpers.ts](../../../tests/page-helpers.ts). The `npm test` glob is `tests/**/*.test.ts`, which does not match `page-helpers.ts` (no `.test.ts` suffix), so the file will be imported by tests but never executed as one. Do not add `test()` calls to this file.

```ts
// tests/page-helpers.ts — shared helpers, no test() calls
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const root = join(__dirname, "..");

export function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

export const FORBIDDEN_PHOSPHOR = [
  /#0B0F0E/i,
  /#121815/i,
  /#3FD67A/i,
  /#5B6B63/i,
  /#C8D3CA/i,
];

export const FORBIDDEN_ROUNDED = /\brounded-(lg|xl|2xl|3xl|full)\b/g;
// Tighten to Tailwind color-stop patterns only — naive `to-` matches false-positive
// on classes like `auto-rows-`, `tracking-`, etc., even though `\b` should prevent it
// in theory.
export const FORBIDDEN_GRADIENT =
  /\bbg-gradient-|\b(from|to|via)-(black|white|transparent|current|inherit|[a-z]+-\d{2,3})\b/g;
```

(Subagents import via `import { read, FORBIDDEN_PHOSPHOR } from "./page-helpers";`.)

---

## Task 1: Rebuild `/` (home + leaderboard) `[parallel]`

**Worktree:** `.worktrees/page-home` · **Branch:** `chore/page-home`

**Subagent prompt:**

> Rebuild [src/app/page.tsx](../../../src/app/page.tsx) for editorial composition. Current issues: centered Trophy pill, gold gradient h1, hardcoded phosphor-green premise strip (`#5B6B63`/`#C8D3CA`/`#121815`), `bg-brand-gold/10 rounded-full` stat pills.
> Replacement structure:
> 1. Editorial hero: left-aligned 52px Source Serif 4 h1 with italic accent on the headline word; serif lede paragraph below; `<MetaStrip>` with 4 cells (creators tracked / scored calls / beat-BTC creators / methodology link). Use `<EditorialSection first>` to hold the hero.
> 2. Premise strip: `<EditorialSection index="01" title="The premise" meta={...}>` with a `<ul>` of 3 sourced claims and 1 self-correction note. Each `<li>` is `flex-between` with `font-serif` claim + `font-mono` source chip.
> 3. Leaderboard section: `<EditorialSection index="02" title="The ranking, by alpha">` containing the `<PeriodFilter />` and `<Leaderboard />` (already spec-shaped from Phase 2).
> 4. Consensus signals: `<EditorialSection index="03">` containing `<ConsensusSignals />` (untouched).
> Server-side data fetching is unchanged — `query()`, `getPublicCounts()`, etc., as in the current file. Only the JSX composition changes.

**Files:**
- Rewrite: `src/app/page.tsx` (JSX only — keep data-fetch block intact)
- Test: `tests/page-home-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/page-home -b chore/page-home integrate/gtm-seo-legal-auth-hardening
cd .worktrees/page-home
```

- [ ] **Step 2: Write failing test**

```ts
// tests/page-home-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read, FORBIDDEN_PHOSPHOR } from "./page-helpers";

const src = read("src/app/page.tsx");

test("home uses editorial primitives, not Trophy pill", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
  assert.doesNotMatch(src, /Trophy/);
});

test("no phosphor-green hardcoded colors", () => {
  for (const re of FORBIDDEN_PHOSPHOR) assert.doesNotMatch(src, re);
});

test("no rounded-full or pill chrome", () => {
  assert.doesNotMatch(src, /\brounded-full\b/);
});

test("hero h1 uses font-serif", () => {
  // The new hero h1 must carry font-serif (or be inside a serif-defaulting block).
  assert.match(src, /font-serif/);
});

test("server-side data fetch preserved (query() and getPublicCounts())", () => {
  assert.match(src, /query<LeaderboardQueryRow>/);
  assert.match(src, /getPublicCounts/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/page-home-shape.test.ts
```

- [ ] **Step 4: Implement** — rewrite the JSX block in [src/app/page.tsx](../../../src/app/page.tsx) starting at the `return (...)` statement. Preserve the entire data-fetch block (lines ~135-285). Replace from the `return (` onward with:

```tsx
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      {/* HERO */}
      <section className="pb-12 border-b border-ink-250">
        <h1 className="font-serif text-[34px] tab:text-[44px] desk:text-[52px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[880px] mb-5">
          Most crypto YouTubers are noise.{" "}
          <em className="italic font-normal text-accent">We found the signal.</em>
        </h1>
        <p className="font-serif text-[19px] text-ink-700 leading-relaxed max-w-[760px] mb-7">
          We track {publicCounts.trackedCreators} crypto YouTubers and score every
          eligible altcoin call against real market data. <em className="italic text-accent">{totalCalls}</em> scored
          calls across 18.7M Binance candles.
        </p>
        <MetaStrip
          cells={[
            { k: "creators", v: <>{publicCounts.trackedCreators}</> },
            { k: "scored calls", v: totalCalls },
            { k: "beating BTC", v: <>{publicCounts.beatBtcCreators} <span className="text-ink-500">/ {publicCounts.rankedCreators}</span></> },
            { k: "methodology", v: <Link href="/methodology" className="text-accent hover:text-accent-dim underline-offset-4 hover:underline">read</Link> },
          ]}
        />
      </section>

      {/* 01 · PREMISE */}
      <EditorialSection
        index="01"
        title={<>The <em className="italic text-accent">premise</em>, sourced.</>}
        meta={<>three claims · <b className="text-ink-900">peer-reviewed</b><br />one signature signal · <b className="text-ink-900">self-correction</b></>}
      >
        <ul className="border-y border-ink-150">
          <PremiseRow claim="76% of influencer-endorsed tokens fail to deliver." source="Arkham · Mar 2025" />
          <PremiseRow claim="Top crypto YouTubers are directionally correct ~22% of the time." source="Finance Research Letters · 2024" />
          <PremiseRow claim="Influencer-tweeted tokens returned −19% over 3 months." source="HBS · Pacelli" />
          <li className="flex flex-col tab:flex-row tab:items-baseline tab:justify-between gap-1 px-4 py-3 border-t border-ink-150">
            <span className="font-serif text-[14px] text-ink-700">
              We also score who admits when they're wrong. <em className="italic text-accent">No other tracker does.</em>
            </span>
            <span className="font-mono text-[10px] text-ink-500 tracking-wide whitespace-nowrap">
              [self-correction index]
            </span>
          </li>
        </ul>
      </EditorialSection>

      {/* 02 · LEADERBOARD */}
      <EditorialSection
        index="02"
        title={<>The ranking, <em className="italic text-accent">by alpha</em>.</>}
        meta={<>{publicCounts.rankedCreators} ranked creators · {totalCalls} scored calls<br />tier S/A/B/C · low-N flagged</>}
      >
        <div className="flex flex-col tab:flex-row tab:items-end tab:justify-between gap-3 mb-4">
          <p className="font-mono text-[11px] text-ink-500 tracking-wide">
            Sorted by alpha; ties broken by Wilson lower bound.
          </p>
          <PeriodFilter value={period} />
        </div>
        {leaderboard.length > 0 ? (
          <Leaderboard rows={leaderboard} />
        ) : (
          <div className="border-t border-ink-250 py-12 text-center">
            <p className="font-mono text-[11px] text-ink-500 tracking-wide">
              Leaderboard data is being computed. Run the data pipeline to populate scores.
            </p>
          </div>
        )}
      </EditorialSection>

      {/* 03 · CONSENSUS */}
      <EditorialSection
        index="03"
        title={<>What's <em className="italic text-accent">forming</em> across creators.</>}
      >
        <ConsensusSignals signals={signals} />
      </EditorialSection>
    </div>
  );
}

interface PremiseRowProps {
  readonly claim: string;
  readonly source: string;
}

function PremiseRow({ claim, source }: PremiseRowProps): ReactElement {
  return (
    <li className="flex flex-col tab:flex-row tab:items-baseline tab:justify-between gap-1 px-4 py-3 border-t border-ink-150 first:border-t-0">
      <span className="font-serif text-[14px] text-ink-700">{claim}</span>
      <span className="font-mono text-[10px] text-ink-500 tracking-wide whitespace-nowrap">
        [{source}]
      </span>
    </li>
  );
}
```

Add at the top of the file (alongside existing imports):

```tsx
import Link from "next/link";
import { EditorialSection, MetaStrip } from "@/components/primitives";
```

Drop the `import { Trophy, BarChart3, Target, Users } from "lucide-react";` line and the `StatPill` helper.

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/page-home-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit + push + exit**

```bash
git add src/app/page.tsx tests/page-home-shape.test.ts
git commit -m "refactor(home): editorial hero + premise + section composition (drops Trophy pill)"
git push -u origin chore/page-home
cd ../..
```

---

## Task 2: Rebuild `/about` `[parallel]`

**Worktree:** `.worktrees/page-about` · **Branch:** `chore/page-about`

**Subagent prompt:**

> [src/app/about/page.tsx](../../../src/app/about/page.tsx) is currently rendered in the SUPERSEDED B Terminal phosphor-green palette (`#0B0F0E`, `#3FD67A`, etc.) — explicitly forbidden by the design lock. Rebuild as a long-form editorial page using the canonical primitives. Structure:
> 1. Hero: 52px serif h1 with italic accent ("Why I track every crypto YouTuber's call. *Against real prices*."); serif lede explaining motivation.
> 2. `<EditorialSection index="01" title="The premise">` — bullet list of the four sourced claims (re-use rows from `PREMISE_LINES` in current file).
> 3. `<EditorialSection index="02" title="What this is">` — three short paragraphs on methodology principles (no opinions, no sponsorships, no deletion).
> 4. `<EditorialSection index="03" title="What this isn't">` — three paragraphs disclaiming financial advice / endorsement / picking sides.
> 5. `<EditorialSection index="04" title="Founder accountability">` — short bio, contact, "audit me" link.
> Drop `BrandWordmark.tsx` (use `<Wordmark />` primitive). Drop the inline phosphor token CSS-in-JS in favor of Tailwind classes.

**Files:**
- Rewrite: `src/app/about/page.tsx`
- Delete: `src/app/about/BrandWordmark.tsx`
- Test: `tests/page-about-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/page-about -b chore/page-about integrate/gtm-seo-legal-auth-hardening
cd .worktrees/page-about
```

- [ ] **Step 2: Write failing test**

```ts
// tests/page-about-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read, FORBIDDEN_PHOSPHOR } from "./page-helpers";
import { existsSync } from "node:fs";
import { join } from "node:path";

const src = read("src/app/about/page.tsx");
const root = join(__dirname, "..");

test("/about uses editorial primitives", () => {
  assert.match(src, /EditorialSection/);
});

test("/about contains no phosphor-green hardcoded colors", () => {
  for (const re of FORBIDDEN_PHOSPHOR) assert.doesNotMatch(src, re);
});

test("/about does not import BrandWordmark", () => {
  assert.doesNotMatch(src, /BrandWordmark/);
});

test("BrandWordmark.tsx has been deleted", () => {
  assert.equal(existsSync(join(root, "src/app/about/BrandWordmark.tsx")), false);
});

test("/about uses font-serif for the hero", () => {
  assert.match(src, /font-serif/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/page-about-shape.test.ts
```

- [ ] **Step 4: Implement (full rewrite)**

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip } from "@/components/primitives";

const TITLE = "About — CryptoTubers Ranked";
const DESCRIPTION =
  "Why I track every crypto YouTuber's call against real prices. No opinions, no sponsorships, no deletion. Public methodology, auditable data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

interface PremiseLine {
  readonly claim: string;
  readonly source: string;
}

const PREMISE: readonly PremiseLine[] = [
  { claim: "76% of influencer-endorsed tokens fail to deliver.", source: "Arkham · Mar 2025" },
  { claim: "Top crypto YouTubers are directionally correct ~22% of the time.", source: "Finance Research Letters · 2024" },
  { claim: "Influencer-tweeted tokens returned −19% over 3 months.", source: "HBS · Pacelli" },
  { claim: "We score who admits when they're wrong. No other tracker does.", source: "self-correction index" },
];

export default function AboutPage(): ReactElement {
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      <section className="pb-12 border-b border-ink-250">
        <h1 className="font-serif text-[34px] tab:text-[44px] desk:text-[52px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[880px] mb-5">
          Why I track every crypto YouTuber's call.{" "}
          <em className="italic font-normal text-accent">Against real prices.</em>
        </h1>
        <p className="font-serif text-[19px] text-ink-700 leading-relaxed max-w-[760px]">
          No opinions, no sponsorships, no deletion. Public methodology, auditable data.
          <em className="italic text-accent"> Founder-accountable.</em>
        </p>
        <MetaStrip
          cells={[
            { k: "started", v: "2026" },
            { k: "tracked", v: "20" },
            { k: "scored against", v: "18.7M candles" },
            { k: "audit me", v: <Link href="mailto:dave.shipsbuilds@proton.me" className="text-accent hover:underline">contact</Link> },
          ]}
        />
      </section>

      <EditorialSection
        index="01"
        title={<>The <em className="italic text-accent">premise</em>, sourced.</>}
      >
        <ul className="border-y border-ink-150">
          {PREMISE.map((p, i) => (
            <li
              key={p.source}
              className={`flex flex-col tab:flex-row tab:items-baseline tab:justify-between gap-1 px-4 py-3 ${
                i > 0 ? "border-t border-ink-150" : ""
              }`}
            >
              <span className="font-serif text-[14px] text-ink-700">{p.claim}</span>
              <span className="font-mono text-[10px] text-ink-500 tracking-wide whitespace-nowrap">
                [{p.source}]
              </span>
            </li>
          ))}
        </ul>
      </EditorialSection>

      <EditorialSection
        index="02"
        title={<>What this <em className="italic text-accent">is</em>.</>}
      >
        <Prose>
          <p>
            <b>An accuracy tracker.</b> Every eligible altcoin call from 20 crypto
            YouTubers, scored against 18.7M Binance candles. Five-component Alpha Score,
            published methodology, recompute pipeline open to inspection.
          </p>
          <p>
            <b>An honesty index.</b> Self-correction signal: who explicitly admits when a
            call goes wrong, scored separately from raw accuracy. Most trackers reward
            survivorship; we don't.
          </p>
          <p>
            <b>A consensus monitor.</b> When ≥3 ranked creators converge on the same call
            within a window, we surface the signal. Diverse-by-construction, not echo-chamber.
          </p>
        </Prose>
      </EditorialSection>

      <EditorialSection
        index="03"
        title={<>What this <em className="italic text-accent">isn't</em>.</>}
      >
        <Prose>
          <p>
            <b>Not financial advice.</b> Past performance doesn't predict future returns.
            Crypto is volatile and you can lose everything. Always DYOR.
          </p>
          <p>
            <b>Not an endorsement.</b> Ranking #1 doesn't mean a creator is right about
            the next call. The score is a measurement, not a recommendation.
          </p>
          <p>
            <b>Not picking sides.</b> Bullish and bearish calls scored on the same axes.
            Self-correction credit awarded for honest reversals regardless of direction.
          </p>
        </Prose>
      </EditorialSection>

      <EditorialSection
        index="04"
        title={<>Founder <em className="italic text-accent">accountability</em>.</>}
      >
        <Prose>
          <p>
            Built by <b>Omar Albakri</b>. The code is auditable, the methodology is public,
            and the data pipeline is reproducible. If a creator's score looks wrong, send a
            recompute request and we'll trace it from transcript to candle.
          </p>
          <p>
            <Link href="/methodology" className="text-accent hover:underline underline-offset-4">
              Read the full methodology
            </Link>
            {" · "}
            <a
              href="mailto:dave.shipsbuilds@proton.me"
              className="text-accent hover:underline underline-offset-4"
            >
              contact
            </a>
          </p>
        </Prose>
      </EditorialSection>
    </div>
  );
}

function Prose({ children }: { readonly children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <div className="font-serif text-[16px] text-ink-700 leading-relaxed space-y-4 max-w-[680px]">
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Delete BrandWordmark**

```bash
rm src/app/about/BrandWordmark.tsx
```

- [ ] **Step 6: Run tests + typecheck + build**

```bash
node --import tsx --test tests/page-about-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit + push + exit**

```bash
git add src/app/about/ tests/page-about-shape.test.ts
git commit -m "refactor(about): editorial rebuild (drops B Terminal phosphor direction)"
git push -u origin chore/page-about
cd ../..
```

---

## Task 3: Rebuild `/pricing` `[parallel]`

**Worktree:** `.worktrees/page-pricing` · **Branch:** `chore/page-pricing`

**Subagent prompt:**

> [src/app/pricing/page.tsx](../../../src/app/pricing/page.tsx) is on the SUPERSEDED B Terminal phosphor-green direction (`#0B0F0E`, `#3FD67A`, dot-leader rows, `cat /docs/pricing.md` blinking-prompt header). Rebuild against [.tmp/dev-archive/phase-3-d4-pricing-v0.1.html](../../../.tmp/dev-archive/phase-3-d4-pricing-v0.1.html). Spec structure:
> 1. Editorial hero: serif h1 ("Pay once alerts earn their keep. *Free research, forever.*"); serif lede.
> 2. 3-column plan grid (Free / Pro $19 / Alpha $49) — each column is a hairline-bordered card with mono price chip, serif tagline, mono feature list with `✓` (pos) / `·` (ink-400) / `→` (warn) glyphs from current `glyphChar`/`glyphClass` helpers (which are correct semantics, just need recoloring to spec semantic tokens).
> 3. Feature matrix below: full table of 12 features × 3 plans. Sticky thead, hairline rows, mono labels, glyphs.
> 4. FAQ-style closing section: serif paragraphs answering "why these tiers", "what's still free", "no-questions refunds".

**Files:**
- Rewrite: `src/app/pricing/page.tsx`
- Test: `tests/page-pricing-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/page-pricing -b chore/page-pricing integrate/gtm-seo-legal-auth-hardening
cd .worktrees/page-pricing
```

- [ ] **Step 2: Write failing test**

```ts
// tests/page-pricing-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read, FORBIDDEN_PHOSPHOR } from "./page-helpers";

const src = read("src/app/pricing/page.tsx");

test("/pricing has no phosphor-green hardcoded colors", () => {
  for (const re of FORBIDDEN_PHOSPHOR) assert.doesNotMatch(src, re);
});

test("/pricing uses editorial primitives", () => {
  assert.match(src, /EditorialSection|MetaStrip|font-serif/);
});

test("/pricing has a 3-column plan grid", () => {
  assert.match(src, /tab:grid-cols-3|desk:grid-cols-3|grid-cols-3/);
});

test("/pricing keeps the feature matrix table with 12 features", () => {
  assert.match(src, /const FEATURES/);
});

test("/pricing does not use the `cat /docs/pricing.md` terminal-prompt header", () => {
  assert.doesNotMatch(src, /cat \/docs/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/page-pricing-shape.test.ts
```

- [ ] **Step 4: Implement**

Visual reference: [phase-3-d4-pricing-v0.1.html](../../../.tmp/dev-archive/phase-3-d4-pricing-v0.1.html). Preserve the existing `FEATURES`, `Glyph`, `glyphChar`, `glyphAriaLabel` definitions; restyle `glyphClass` to use spec tokens. Banned patterns: equal-width 3-col grid, "Most Popular" ribbon, `rounded-2xl shadow-lg` cards.

Replace the entire `PricingPage()` body with this skeleton (subagent: fill in the clearly-marked extension points):

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip, Chip } from "@/components/primitives";

const TITLE = "Pricing — CryptoTubers Ranked";
const DESCRIPTION =
  "Three tiers: free, pro ($19/mo), alpha ($49/mo). Full research free. Alerts, exports, and API on paid.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
};

type Glyph = "yes" | "no" | "soon";

interface FeatureRow {
  readonly label: string;
  readonly free: Glyph;
  readonly pro: Glyph;
  readonly alpha: Glyph;
}

const FEATURES: readonly FeatureRow[] = [
  // Preserve from current src/app/pricing/page.tsx — 12 rows total
  { label: "Full leaderboard (all ranks)",            free: "yes", pro: "yes", alpha: "yes" },
  { label: "Creator profiles + full call history",    free: "yes", pro: "yes", alpha: "yes" },
  { label: "Per-call Alpha Score breakdowns",         free: "yes", pro: "yes", alpha: "yes" },
  { label: "Methodology transparency",                free: "yes", pro: "yes", alpha: "yes" },
  { label: "Per-creator email alerts",                free: "no",  pro: "yes", alpha: "yes" },
  { label: "Watchlists (unlimited)",                  free: "no",  pro: "yes", alpha: "yes" },
  { label: "Recent-performance filter (30/90d)",      free: "no",  pro: "yes", alpha: "yes" },
  { label: "CSV export of call history",              free: "no",  pro: "yes", alpha: "yes" },
  { label: "Historical backtest simulator",           free: "no",  pro: "no",  alpha: "yes" },
  { label: "Anti-consensus / convergence alerts",     free: "no",  pro: "no",  alpha: "yes" },
  { label: "API access (read-only)",                  free: "no",  pro: "no",  alpha: "yes" },
  { label: "Webhook notifications",                   free: "no",  pro: "no",  alpha: "yes" },
] as const;

function glyphChar(g: Glyph): string {
  return g === "yes" ? "✓" : g === "soon" ? "→" : "·";
}

function glyphClass(g: Glyph): string {
  return g === "yes" ? "text-pos font-bold" : g === "soon" ? "text-warn font-medium" : "text-ink-500";
}

function glyphAriaLabel(g: Glyph): string {
  return g === "yes" ? "included" : g === "soon" ? "coming soon" : "not in this tier";
}

interface PlanCardProps {
  readonly name: string;
  readonly price: string;
  readonly cadence: string;
  readonly tagline: string;
  readonly cta: string;
  readonly ctaHref: string;
  readonly emphasis?: boolean;          // editorial anchor — slightly wider, accent-low background
  readonly ctaVariant?: "button" | "soft" | "none";  // round2-005: free tier has no purchase, use soft link
}

function PlanCard({
  name, price, cadence, tagline, cta, ctaHref, emphasis = false, ctaVariant = "button",
}: PlanCardProps): ReactElement {
  return (
    <div
      className={`flex flex-col p-6 border ${
        emphasis
          ? "border-accent-dim bg-accent-low tab:col-span-2 desk:col-span-1"
          : "border-ink-200 bg-ink-50"
      }`}
      style={{ borderRadius: 2 }}
    >
      {/* Plan name as a styled label, NOT a Chip — Chip is reserved for status/category
          microlabels (round2-004). Plan-tier identifier sits between Chip (9.5px) and h2. */}
      <div className={`font-mono text-[12px] tracking-caps uppercase mb-3 ${
        emphasis ? "text-accent" : "text-ink-700"
      }`}>{name}</div>
      <div className="mt-1 mb-3 flex items-baseline gap-1.5">
        <span className="font-serif text-[40px] text-ink-900 font-medium tabular-nums leading-none">{price}</span>
        <span className="font-mono text-[11px] text-ink-500 tracking-wide">{cadence}</span>
      </div>
      <p className="font-serif text-[15px] text-ink-700 leading-relaxed mb-6">{tagline}</p>
      {ctaVariant === "button" && (
        <Link
          href={ctaHref}
          className={`mt-auto inline-block text-center font-mono text-[11px] tracking-caps uppercase px-4 py-2.5 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${
            emphasis
              ? "bg-accent hover:bg-accent-dim text-ink-0"
              : "border border-ink-300 text-ink-700 hover:bg-ink-100"
          }`}
          style={{ borderRadius: 2 }}
        >
          {cta}
        </Link>
      )}
      {ctaVariant === "soft" && (
        <Link
          href={ctaHref}
          className="mt-auto font-mono text-[11px] tracking-wide text-accent hover:underline underline-offset-4 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          {cta} <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

export default function PricingPage(): ReactElement {
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      {/* HERO */}
      <section className="pb-12 border-b border-ink-250">
        <h1 className="font-serif text-[34px] tab:text-[44px] desk:text-[52px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[880px] mb-5">
          Pay once alerts earn their keep.{" "}
          <em className="italic font-normal text-accent">Free research, forever.</em>
        </h1>
        <p className="font-serif text-[19px] text-ink-700 leading-relaxed max-w-[760px]">
          The leaderboard, creator histories, score breakdowns, and methodology stay free.
          Paid tiers buy <em className="italic text-accent">delivery</em>: alerts, exports,
          simulators, API.
        </p>
        <MetaStrip
          cells={[
            { k: "free tier", v: "$0" },
            { k: "pro", v: <>$19<span className="text-ink-500 text-[14px]"> /mo</span></> },
            { k: "alpha", v: <>$49<span className="text-ink-500 text-[14px]"> /mo</span></> },
            { k: "refund", v: "30 days" },
          ]}
        />
      </section>

      {/* 01 — TIERS (asymmetric 1fr-1.2fr-1fr; pro is the editorial anchor) */}
      <EditorialSection
        index="01"
        title={<>Three <em className="italic text-accent">tiers</em>.</>}
        meta={<>billed monthly · no contracts<br />cancel anytime · refund within 30d</>}
      >
        <div className="grid grid-cols-1 tab:grid-cols-2 desk:grid-cols-[1fr_1.2fr_1fr] gap-4">
          <PlanCard
            name="Free"
            price="$0"
            cadence="forever"
            tagline="Full research access. Read every score, every methodology, every creator history."
            cta="Browse leaderboard"
            ctaHref="/"
            ctaVariant="soft"
          />
          <PlanCard
            name="Pro"
            price="$19"
            cadence="/mo"
            tagline="Alerts when ranked creators move. Watchlists, CSV export, recent-performance windows."
            cta="Upgrade to Pro"
            ctaHref="/api/checkout/pro"
            emphasis
          />
          <PlanCard
            name="Alpha"
            price="$49"
            cadence="/mo"
            tagline="The full apparatus. Backtest, anti-consensus alerts, API, webhooks."
            cta="Upgrade to Alpha"
            ctaHref="/api/checkout/elite"
          />
        </div>
      </EditorialSection>

      {/* 02 — FEATURE MATRIX */}
      <EditorialSection
        index="02"
        title={<>Feature <em className="italic text-accent">matrix</em>.</>}
        meta={<>{FEATURES.length} features · 3 plans<br />✓ included · → coming · · gated</>}
      >
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[12px]">
            <thead className="sticky top-0 bg-ink-50 z-sticky">
              <tr className="border-b border-ink-250">
                <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3">Feature</th>
                <th className="text-center text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3 w-20">Free</th>
                <th className="text-center text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3 w-20">Pro</th>
                <th className="text-center text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2.5 px-3 w-20">Alpha</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.label} className="border-b border-ink-150">
                  <td className="py-3 px-3 font-serif text-[14px] text-ink-800">{f.label}</td>
                  {(["free", "pro", "alpha"] as const).map((tier) => (
                    <td key={tier} className="py-3 px-3 text-center" aria-label={glyphAriaLabel(f[tier])}>
                      <span className={glyphClass(f[tier])}>{glyphChar(f[tier])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EditorialSection>

      {/* 03 — FAQ */}
      <EditorialSection
        index="03"
        title={<><em className="italic text-accent">Why</em> these tiers.</>}
      >
        <div className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[680px] space-y-4">
          <p><b className="text-ink-900">Why is research free?</b> Because the value of an accuracy tracker is in the public methodology, not the data lock. If we hid the leaderboard behind a paywall, no one could check our work — which would defeat the point.</p>
          <p><b className="text-ink-900">What do paid tiers actually buy?</b> Delivery, not data. Pro alerts you when ranked creators move so you don't have to refresh. Alpha adds the full apparatus — backtest, anti-consensus signals, API access — for users who want to build on the data.</p>
          <p><b className="text-ink-900">No-questions refund?</b> 30 days, full refund, no support thread. Email <a href="mailto:dave.shipsbuilds@proton.me" className="text-accent hover:underline">dave.shipsbuilds@proton.me</a>.</p>
        </div>
      </EditorialSection>
    </div>
  );
}
```

Verify after pasting: typecheck, build, and visit `/pricing` in dev mode. The Pro card should be visually anchored (slightly wider on desk, accent-low background); Free and Alpha should be flanking equal-weight cards.

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/page-pricing-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit + push + exit**

```bash
git add src/app/pricing/page.tsx tests/page-pricing-shape.test.ts
git commit -m "refactor(pricing): editorial rebuild against d4 spec (drops B Terminal phosphor)"
git push -u origin chore/page-pricing
cd ../..
```

---

## Task 4: Rebuild `/methodology` `[parallel]`

**Worktree:** `.worktrees/page-methodology` · **Branch:** `chore/page-methodology`

**Subagent prompt:**

> [src/app/methodology/page.tsx](../../../src/app/methodology/page.tsx) is 819 lines of `rounded-lg` cards, gold pill chrome, and lucide icons. Rebuild against [.tmp/dev-archive/phase-3-d7-methodology-drawer-v0.1.1 (1).html](../../../.tmp/dev-archive/phase-3-d7-methodology-drawer-v0.1.1%20(1).html). Structure:
> 1. Editorial hero: serif h1 ("How we score. *In public.*"), serif lede, `<MetaStrip>` (5 components / 18.7M candles / public methodology / open recompute).
> 2. `<EditorialSection index="01" title="The pipeline">` — 5-step pipeline rendered as a horizontal mono list with hairline separators (Scrape → Extract → Match → Score → Rank). Drop the per-step lucide icons.
> 3. `<EditorialSection index="02" title="The score">` — formula breakdown using a `.matrix` table pattern from the dev-pack (4-col: component / weight / how it's earned / how to lose it).
> 4. `<EditorialSection index="03" title="Tracked coins">` — `<Chip>` array of the 18 tracked tokens.
> 5. `<EditorialSection index="04" title="Tier ranges">` — table of S/A/B/C alpha thresholds.
> 6. `<EditorialSection index="05" title="Audit me">` — copy explaining the recompute pipeline + GitHub link.

**Files:**
- Rewrite: `src/app/methodology/page.tsx` (~400 lines target — half the current size)
- Test: `tests/page-methodology-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/page-methodology -b chore/page-methodology integrate/gtm-seo-legal-auth-hardening
cd .worktrees/page-methodology
```

- [ ] **Step 2: Write failing test**

```ts
// tests/page-methodology-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read } from "./page-helpers";

const src = read("src/app/methodology/page.tsx");

test("/methodology uses EditorialSection / MetaStrip / Chip", () => {
  assert.match(src, /EditorialSection/);
});

test("/methodology drops the lucide pipeline icons", () => {
  assert.doesNotMatch(src, /Crosshair|Brain|Video|Database|Award/);
});

test("/methodology has no rounded-{lg,xl} chrome", () => {
  assert.doesNotMatch(src, /\brounded-(lg|xl|2xl)\b/);
});

test("/methodology preserves SCORE_WEIGHTS-driven content", () => {
  assert.match(src, /SCORE_WEIGHTS/);
});

test("/methodology preserves TRACKED_CREATOR_COUNT reference", () => {
  assert.match(src, /TRACKED_CREATOR_COUNT|TRACKED_COINS/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/page-methodology-shape.test.ts
```

- [ ] **Step 4: Implement**

(Subagent: rewrite per the dev-pack methodology drawer. Preserve `TRACKED_COINS`, `SCORE_COMPONENTS` data definitions but drop their lucide icon entries. Drop `PIPELINE_STEPS` icons; render as a hairline-divided horizontal step list with serif step name + mono detail. Use `<EditorialSection>` to wrap each numbered section. Sample skeleton:)

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EditorialSection, MetaStrip, Chip } from "@/components/primitives";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  SCORE_WEIGHTS,
} from "@/lib/public-methodology";
import { TRACKED_CREATOR_COUNT } from "@/lib/tracked-creators";

const TRACKED_COINS = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","DOT","LINK","TAO","RENDER","FET","NEAR","AR","INJ","SUI","PENDLE"] as const;

export const metadata: Metadata = {
  title: "Methodology — How We Score Crypto YouTubers | CryptoTubers Ranked",
  description: "Our scoring methodology: one public Alpha Score formula, confidence-gated extraction, and real market-data verification.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage(): ReactElement {
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      {/* HERO */}
      <section className="pb-12 border-b border-ink-250">
        <h1 className="font-serif text-[34px] tab:text-[44px] desk:text-[52px] text-ink-900 font-medium tracking-tight leading-[1.05] text-balance max-w-[880px] mb-5">
          How we score. <em className="italic font-normal text-accent">In public.</em>
        </h1>
        <p className="font-serif text-[19px] text-ink-700 leading-relaxed max-w-[760px]">
          One formula, five components, capped 0–100. Every score reproducible from the
          published pipeline. <em className="italic text-accent">If a number looks wrong, audit me.</em>
        </p>
        <MetaStrip
          cells={[
            { k: "components", v: "5" },
            { k: "candles", v: "18.7M" },
            { k: "creators tracked", v: TRACKED_CREATOR_COUNT },
            { k: "extraction floor", v: <>{Math.round(EXTRACTION_CONFIDENCE_THRESHOLD * 100)}%</> },
          ]}
        />
      </section>

      {/* 01 — pipeline */}
      <EditorialSection index="01" title={<>The <em className="italic text-accent">pipeline</em>.</>}>
        <ol className="grid grid-cols-1 tab:grid-cols-5 gap-4">
          {[
            ["Scrape", "Auto-generated subtitles, daily"],
            ["Extract", "AI identifies actionable predictions"],
            ["Match", "Each call ↔ Binance candles"],
            ["Score", "5 components → 0–100"],
            ["Rank", "Avg Alpha across scored calls"],
          ].map(([name, detail], i) => (
            <li key={String(name)} className="border-t border-ink-250 pt-3">
              <div className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-1">
                step {String(i + 1).padStart(2, "0")}
              </div>
              <div className="font-serif text-[18px] text-ink-900 font-medium leading-tight mb-1">
                {name}
              </div>
              <div className="font-mono text-[11px] text-ink-600 leading-relaxed">
                {detail}
              </div>
            </li>
          ))}
        </ol>
      </EditorialSection>

      {/* 02 — score */}
      <EditorialSection index="02" title={<>The <em className="italic text-accent">score</em>.</>}>
        <table className="w-full font-mono text-[12px]">
          <thead>
            <tr className="border-b border-ink-250">
              <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2">Component</th>
              <th className="text-right text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 w-20">Max</th>
              <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 pl-6">How it's earned</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Direction correct", max: SCORE_WEIGHTS.direction, how: "Bullish call + price up at 30d (or vice versa)" },
              { label: "Alpha over BTC", max: SCORE_WEIGHTS.alpha, how: `Each 1% excess return = ${(SCORE_WEIGHTS.alpha / 10).toFixed(1)}pt, capped` },
              { label: "Specificity", max: SCORE_WEIGHTS.specificity, how: "Entry, target, stop-loss, timeframe (¼ each)" },
              { label: "Regime difficulty", max: SCORE_WEIGHTS.regime, how: "Bullish in bear / bearish in bull = max" },
              { label: "Target hit", max: SCORE_WEIGHTS.target, how: "Stated target reached within 90d" },
            ].map((c) => (
              <tr key={c.label} className="border-b border-ink-150">
                <td className="py-3 font-serif text-[14px] text-ink-900">{c.label}</td>
                <td className="py-3 text-right tabular-nums text-ink-700">{c.max}</td>
                <td className="py-3 pl-6 text-ink-600 leading-relaxed">{c.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </EditorialSection>

      {/* 03 — tracked coins */}
      <EditorialSection index="03" title={<>Tracked <em className="italic text-accent">coins</em>.</>}>
        <div className="flex flex-wrap gap-1.5">
          {TRACKED_COINS.map((c) => <Chip key={c}>{c}</Chip>)}
        </div>
      </EditorialSection>

      {/* 04 — tiers */}
      <EditorialSection index="04" title={<>Tier <em className="italic text-accent">ranges</em>.</>}>
        {/* table similar to 02 with tier thresholds */}
      </EditorialSection>

      {/* 05 — audit me */}
      <EditorialSection index="05" title={<><em className="italic text-accent">Audit</em> me.</>}>
        <div className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[680px] space-y-4">
          <p>The recompute pipeline is reproducible. Every score traces to a transcript, a Binance candle range, and a deterministic formula.</p>
          <p>
            <Link href="https://github.com/dave-builder/crypto-tuber-ranked" className="text-accent hover:underline underline-offset-4">View the source</Link>
            {" · "}
            <a href="mailto:dave.shipsbuilds@proton.me" className="text-accent hover:underline underline-offset-4">flag a wrong score</a>
          </p>
        </div>
      </EditorialSection>
    </div>
  );
}
```

(Fill in §04 tier table from current page's `TIERS` data.)

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/page-methodology-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit + push + exit**

```bash
git add src/app/methodology/page.tsx tests/page-methodology-shape.test.ts
git commit -m "refactor(methodology): editorial rebuild against d7 spec, drops decorative lucides"
git push -u origin chore/page-methodology
cd ../..
```

---

## Task 5: Rebuild `/creator/[handle]` `[parallel]`

**Worktree:** `.worktrees/page-creator` · **Branch:** `chore/page-creator`

**Subagent prompt:**

> Rebuild [src/app/creator/[handle]/page.tsx](../../../src/app/creator/[handle]/page.tsx) per the spec Profile screen ([phase-2-components-screens-v0.2.html](../../../.tmp/dev-archive/phase-2-components-screens-v0.2.html), search for "@CryptoInsights" around line 1492). Structure:
> 1. Editorial hero: creator name as 44px serif h1, mono handle below, `<MetaStrip>` with 4 cells (rank · alpha · win % · scored calls).
> 2. Synthesis paragraph: 1-paragraph serif summary explaining why this creator ranks where they rank.
> 3. `<EditorialSection index="01" title="Headline metrics">` — 4-tile metric block (avg α, hit rate, β-α, low-N flag if applicable). Each tile uses the spec hairline-bordered numeric chip pattern from `<AlphaScoreBadge>`.
> 4. `<EditorialSection index="02" title="Recent calls">` — `<CallHistory>` table.
> 5. `<EditorialSection index="03" title="Score breakdown">` — `<ScoreBreakdown>` (already migrated by Phase 2 codemods).
> 6. `<EditorialSection index="04" title="Backtest">` — link to `/creator/[handle]/backtest`.
> Preserve all data-fetch logic (notFound() handling, query() calls, `computeCreator*` aggregates).

**Files:**
- Rewrite: `src/app/creator/[handle]/page.tsx` (JSX only)
- Test: `tests/page-creator-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/page-creator -b chore/page-creator integrate/gtm-seo-legal-auth-hardening
cd .worktrees/page-creator
```

- [ ] **Step 2: Write failing test**

```ts
// tests/page-creator-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read } from "./page-helpers";

const src = read("src/app/creator/[handle]/page.tsx");

test("creator page uses editorial primitives", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
});

test("creator page preserves notFound and query fetches", () => {
  assert.match(src, /notFound\(\)/);
  assert.match(src, /query<Creator>/);
});

test("creator page does not use rounded-{lg,xl}", () => {
  assert.doesNotMatch(src, /\brounded-(lg|xl|2xl)\b/);
});

test("creator page imports AlphaScoreBadge (not AlphaScoreBar — that's leaderboard)", () => {
  assert.match(src, /import AlphaScoreBadge/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/page-creator-shape.test.ts
```

- [ ] **Step 4: Implement** — keep the current data-fetch block intact. Rewrite only the `return (...)` JSX block. Skeleton:

```tsx
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      <Link href="/" className="inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-500 hover:text-ink-700 tracking-caps uppercase mb-8">
        <span aria-hidden="true">←</span> Leaderboard
      </Link>

      {/* HERO */}
      <section className="pb-10 border-b border-ink-250">
        <div className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-2">
          Profile · Rank {stats?.accuracy_rank ?? "—"}
        </div>
        <h1 className="font-serif text-[34px] tab:text-[44px] text-ink-900 font-medium tracking-tight leading-[1.1] mb-2">
          {creator.name}
        </h1>
        <a
          href={`https://www.youtube.com/${creator.youtube_handle}`}
          className="font-mono text-[12px] text-ink-500 hover:text-ink-700 tracking-wide inline-flex items-center gap-1.5"
          target="_blank"
          rel="noopener noreferrer"
        >
          {creator.youtube_handle} <ExternalLink className="w-3 h-3" />
        </a>
        <MetaStrip
          cells={[
            { k: "rank", v: stats?.accuracy_rank ?? "—" },
            { k: "alpha", v: stats ? stats.alpha_score.toFixed(1) : "—" },
            { k: "win rate", v: stats ? `${(stats.win_rate * 100).toFixed(0)}%` : "—" },
            { k: "scored calls", v: stats?.total_calls ?? 0 },
          ]}
        />
      </section>

      {/* 01 — synthesis */}
      <EditorialSection index="01" title={<><em className="italic text-accent">Why</em> this rank.</>}>
        <p className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[680px]">
          {/* Generated synthesis: replace with computed sentence summarizing alpha, win rate, calls scored, top symbol */}
          {creator.name} ranks <em className="italic text-accent">#{stats?.accuracy_rank ?? "—"}</em>{" "}
          on average alpha across {stats?.total_calls ?? 0} scored calls
          {stats && stats.win_rate ? `, with a ${(stats.win_rate * 100).toFixed(0)}% directional hit rate at 30 days` : ""}.
        </p>
      </EditorialSection>

      {/* 02 — headline metrics */}
      <EditorialSection index="02" title={<>Headline <em className="italic text-accent">metrics</em>.</>}>
        <div className="grid grid-cols-2 tab:grid-cols-4 gap-4">
          {stats && (
            <>
              <AlphaScoreBadge score={stats.alpha_score} size="lg" />
              {/* TODO: 3 more tile components — hit rate, avg α 30d, scored calls */}
            </>
          )}
        </div>
      </EditorialSection>

      {/* 03 — calls */}
      <EditorialSection index="03" title={<>Recent <em className="italic text-accent">calls</em>.</>}>
        <CallHistory calls={serializeCalls(scoredCalls.slice(0, CALL_LIMIT))} />
      </EditorialSection>

      {/* 04 — score breakdown */}
      <EditorialSection index="04" title={<>Score <em className="italic text-accent">breakdown</em>.</>}>
        {stats && <ScoreBreakdown stats={stats} />}
      </EditorialSection>

      {/* 05 — backtest CTA */}
      <EditorialSection index="05" title={<>Simulate <em className="italic text-accent">returns</em>.</>}>
        <Link
          href={`/creator/${creator.youtube_handle}/backtest`}
          className="inline-block font-mono text-[11px] tracking-caps uppercase border border-accent-dim text-accent hover:bg-accent-low px-4 py-2.5 transition-colors"
          style={{ borderRadius: 2 }}
        >
          Run backtest →
        </Link>
      </EditorialSection>
    </div>
  );
```

(Subagent: fill in the missing 3 metric tiles. Replace `lucide-react` `ExternalLink` allowed; remove `Users`, `Focus`, `Youtube`, `ArrowLeft` — use Unicode + text instead.)

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/page-creator-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit + push + exit**

```bash
git add src/app/creator/[handle]/page.tsx tests/page-creator-shape.test.ts
git commit -m "refactor(creator): editorial profile composition per phase-2 spec"
git push -u origin chore/page-creator
cd ../..
```

---

## Task 6: Rebuild `/call/[id]` `[parallel]`

**Worktree:** `.worktrees/page-call` · **Branch:** `chore/page-call`

**Subagent prompt:**

> Rebuild [src/app/call/[id]/page.tsx](../../../src/app/call/[id]/page.tsx) per the spec Call detail screen ([phase-2-components-screens-v0.2.html](../../../.tmp/dev-archive/phase-2-components-screens-v0.2.html), search for "SOL long · consensus" around line 1276). Structure:
> 1. Editorial hero: serif h1 — `{symbol} {direction}` with italic accent on direction; mono caption with creator name + call date.
> 2. `<MetaStrip>` — 4 cells (Alpha component scores summed, return at 30d, win/loss, asymmetric flag).
> 3. `<EditorialSection index="01" title="Score breakdown">` — `<ScoreBreakdown>`.
> 4. `<EditorialSection index="02" title="Performance">` — `<PerformanceChart>`.
> 5. `<EditorialSection index="03" title="Source clip">` — embed YouTube iframe at the timestamped clip if available.
> 6. `<EditorialSection index="04" title="Recompute log">` — mono table of pipeline steps and their outputs.

**Files:**
- Rewrite: `src/app/call/[id]/page.tsx` (JSX only)
- Test: `tests/page-call-shape.test.ts`

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/page-call -b chore/page-call integrate/gtm-seo-legal-auth-hardening
cd .worktrees/page-call
```

- [ ] **Step 2: Write failing test**

```ts
// tests/page-call-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read } from "./page-helpers";

const src = read("src/app/call/[id]/page.tsx");

test("call page uses editorial primitives", () => {
  assert.match(src, /EditorialSection/);
  assert.match(src, /MetaStrip/);
});

test("call page preserves notFound and core data fetches", () => {
  assert.match(src, /notFound\(\)/);
});

test("call page does not use rounded-{lg,xl}", () => {
  assert.doesNotMatch(src, /\brounded-(lg|xl|2xl)\b/);
});
```

- [ ] **Step 3: Run, expect fail**

```bash
node --import tsx --test tests/page-call-shape.test.ts
```

- [ ] **Step 4: Implement**

Visual reference: [phase-2-components-screens-v0.2.html](../../../.tmp/dev-archive/phase-2-components-screens-v0.2.html) lines ~1276 ("SOL long · consensus"). Preserve the data-fetch block in the current `src/app/call/[id]/page.tsx` (the `query()` calls, `notFound()` handling, and call/creator/score lookups). Add the trader-vocab label map at the top of the file (after imports):

```tsx
// Map raw direction enum to trader vocabulary for display. Italic editorial accent
// reads naturally as "SOL Long" / "SOL Short" — never italicize lowercase enums
// like "bullish" / "neutral" directly (round2-003).
const DIRECTION_LABEL: Record<Call["direction"], string> = {
  bullish: "Long",
  bearish: "Short",
  neutral: "Sideways",
};
```

Replace the `return (...)` block with this skeleton:

```tsx
  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      <Link href={`/creator/${creator.youtube_handle}`} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-500 hover:text-ink-700 tracking-caps uppercase mb-8">
        <span aria-hidden="true">←</span> {creator.name}
      </Link>

      {/* HERO */}
      <section className="pb-10 border-b border-ink-250">
        <div className="font-mono text-[10px] text-ink-500 tracking-caps uppercase mb-2">
          Call · {new Date(call.call_date).toISOString().slice(0, 10)} · {creator.name}
        </div>
        <h1 className="font-serif text-[34px] tab:text-[44px] text-ink-900 font-medium tracking-tight leading-[1.1] mb-2">
          {call.symbol.replace("USDT", "")}{" "}
          <em className="italic font-normal text-accent">{DIRECTION_LABEL[call.direction]}</em>
        </h1>
        <p className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[680px]">
          Scored against Binance candles for the 30-day window following the call date.
          {call.target_price && <> Target was <em className="italic text-accent">${call.target_price.toFixed(2)}</em>.</>}
        </p>
        <MetaStrip
          cells={[
            { k: "alpha score", v: call.score?.toFixed(1) ?? "—" },
            { k: "30d return", v: call.return_30d != null ? `${call.return_30d >= 0 ? "+" : ""}${call.return_30d.toFixed(1)}%` : "—" },
            { k: "outcome", v: call.outcome ?? "pending" },
            { k: "target hit", v: call.target_hit === true ? "yes" : call.target_hit === false ? "no" : "—" },
          ]}
        />
      </section>

      {/* 01 — score breakdown */}
      <EditorialSection index="01" title={<>Score <em className="italic text-accent">breakdown</em>.</>}>
        {call.score != null ? (
          <ScoreBreakdown call={call} />
        ) : (
          <p className="font-mono text-[11px] text-ink-500 tracking-wide">
            Score is being computed. Check back after the next pipeline run.
          </p>
        )}
      </EditorialSection>

      {/* 02 — performance chart */}
      <EditorialSection
        index="02"
        title={<><em className="italic text-accent">Performance</em> over 30 days.</>}
        meta={<>price vs BTC benchmark<br />window: call date → +30d</>}
      >
        {call.return_30d != null ? (
          <PerformanceChart callId={call.id} symbol={call.symbol} />
        ) : (
          <div className="border-t border-ink-250 py-12 text-center">
            <p className="font-mono text-[11px] text-ink-500 tracking-wide">
              Performance data not yet computed for this call.
            </p>
          </div>
        )}
      </EditorialSection>

      {/* 03 — source clip
          Always render the section to preserve index numbering across calls
          (round2-009). Three states: (a) timestamped clip → embed iframe;
          (b) video known but no timestamp → fallback link to full video;
          (c) no video at all → editorial empty-state copy. */}
      <EditorialSection index="03" title={<>Source <em className="italic text-accent">clip</em>.</>}>
        {call.video_id && call.timestamp_seconds != null ? (
          <div className="aspect-video max-w-[680px] border border-ink-200" style={{ borderRadius: 2 }}>
            <iframe
              src={`https://www.youtube.com/embed/${call.video_id}?start=${call.timestamp_seconds}`}
              title={`${creator.name} — ${call.symbol} call`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : call.video_id ? (
          <p className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[680px]">
            Timestamp not yet linked.{" "}
            <a
              href={`https://www.youtube.com/watch?v=${call.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline underline-offset-4"
            >
              Open the full video on YouTube →
            </a>
          </p>
        ) : (
          <p className="font-mono text-[11px] text-ink-500 tracking-wide">
            Source clip not yet linked to this call. The transcript is in our pipeline but the video URL is pending.
          </p>
        )}
      </EditorialSection>

      {/* 04 — recompute log
          NOTE: pending real call_audit_log integration. Until then, show ONLY
          the deterministic extraction confidence (no synthesized timestamps).
          Do NOT use new Date() to fake "score computed at" timestamps — that
          would lie about provenance on every render. (round2-006) */}
      <EditorialSection
        index="04"
        title={<>Recompute <em className="italic text-accent">log</em>.</>}
        meta={<>extraction provenance<br />reproduce with: npm run audit:recompute</>}
      >
        {call.confidence != null ? (
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-ink-250">
                <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 w-32">When</th>
                <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 w-24">Stage</th>
                <th className="text-left text-[10px] text-ink-500 tracking-caps uppercase font-normal py-2 pl-4">Output</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink-150">
                <td className="py-2.5 text-ink-600 tabular-nums">
                  {new Date(call.call_date).toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="py-2.5 text-accent">extract</td>
                <td className="py-2.5 pl-4 text-ink-700">
                  Confidence {(call.confidence * 100).toFixed(0)}%
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="font-mono text-[11px] text-ink-500 tracking-wide">
            No recompute history yet. This call was scored once at extraction.
          </p>
        )}
        {/* TODO: when call_audit_log table lands, query it for this call.id and
            render real rows. Drop the single-row fallback above. */}
      </EditorialSection>
    </div>
  );
```

Add to top of file (alongside existing imports):

```tsx
import { EditorialSection, MetaStrip } from "@/components/primitives";
```

Drop existing lucide imports (`ArrowLeft`, `ExternalLink`, `Target`, `X`) — replaced with Unicode glyphs.

- [ ] **Step 5: Run tests + typecheck + build**

```bash
node --import tsx --test tests/page-call-shape.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit + push + exit**

```bash
git add src/app/call/[id]/page.tsx tests/page-call-shape.test.ts
git commit -m "refactor(call): editorial detail composition per phase-2 spec"
git push -u origin chore/page-call
cd ../..
```

---

## Merge gate after T1–T6

```bash
git checkout integrate/gtm-seo-legal-auth-hardening
for branch in page-home page-about page-pricing page-methodology page-creator page-call; do
  git merge --no-ff chore/$branch -m "Merge chore/$branch into integration"
  git worktree remove .worktrees/$branch
done
npm test && npm run typecheck && npm run build
```

If any merge produces conflicts (each task touches its own page directory; the only shared edits are in `tests/page-helpers.ts`, which is created once in Task 0 and not modified after), resolve and re-test.

---

## Task 7: Final guardrails + smoke `[sequential]`

**Worktree:** `.worktrees/page-sweep` (or just on integration directly — this task only adds tests).

**Subagent prompt:**

> Add cross-cutting guardrails that lock down the editorial composition across every page: no phosphor-green colors, no rounded-{lg,xl} on any page file, no `<main>` nesting (a11y), every page heading is `<h1>` exactly once. Then perform visual smoke on dev.

**Files:**
- Create: `tests/pages-cross-cutting.test.ts`

- [ ] **Step 1: Write the guardrail test**

```ts
// tests/pages-cross-cutting.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FORBIDDEN_PHOSPHOR } from "./page-helpers";

const root = join(__dirname, "..");

function pageFiles(): string[] {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const f = join(dir, n);
      if (statSync(f).isDirectory()) return walk(f);
      return /page\.tsx$/.test(n) ? [f] : [];
    });
  }
  return walk(join(root, "src/app"));
}

test("no page renders B Terminal phosphor colors", () => {
  const offenders: string[] = [];
  for (const file of pageFiles()) {
    const src = readFileSync(file, "utf8");
    for (const re of FORBIDDEN_PHOSPHOR) {
      if (re.test(src)) {
        offenders.push(`${file}: matches ${re}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], `Phosphor offenders:\n${offenders.join("\n")}`);
});

test("no page uses rounded-{lg,xl,2xl,full} chrome", () => {
  const offenders: string[] = [];
  for (const file of pageFiles()) {
    const src = readFileSync(file, "utf8");
    const m = src.match(/\brounded-(lg|xl|2xl|3xl|full)\b/g);
    if (m) offenders.push(`${file}: ${Array.from(new Set(m)).join(", ")}`);
  }
  assert.deepEqual(offenders, [], `Rounded chrome:\n${offenders.join("\n")}`);
});

test("no page nests <main> (root layout already provides it)", () => {
  const offenders: string[] = [];
  for (const file of pageFiles()) {
    const src = readFileSync(file, "utf8");
    if (/<main[\s>]/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `Nested <main>:\n${offenders.join("\n")}`);
});

test("every page declares exactly one <h1>", () => {
  const offenders: string[] = [];
  for (const file of pageFiles()) {
    const src = readFileSync(file, "utf8");
    const matches = src.match(/<h1[\s>]/g);
    const count = matches ? matches.length : 0;
    if (count !== 1) offenders.push(`${file}: ${count} h1 tags`);
  }
  assert.deepEqual(offenders, [], `H1 count:\n${offenders.join("\n")}`);
});
```

- [ ] **Step 2: Run + fix any offenders**

```bash
node --import tsx --test tests/pages-cross-cutting.test.ts
```

If any page violates a rule, return to the relevant Task 1–6 and patch.

- [ ] **Step 3: Full-suite green**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: ~175+ tests pass; build clean.

- [ ] **Step 4: Visual smoke**

```bash
npm run dev
```

Walk through:
- `/` → editorial hero, sourced premise, hairline-divided leaderboard, consensus
- `/about` → editorial four-section composition, no phosphor green
- `/pricing` → 3-col plan grid, feature matrix, no `cat /docs` prompt header
- `/methodology` → pipeline list, score table, tracked-coin chips, audit-me CTA
- `/creator/[any]` → editorial profile with metadata strip + sectioned layout
- `/call/[any]` → call detail with score breakdown + performance chart
- Mobile (375px viewport via DevTools) → all pages stack to single column, MetaStrip becomes 2-col, leaderboard horizontal-scrolls
- Tablet (768px) → tab breakpoint engages, EditorialSection 96/1fr/280 grid collapses

- [ ] **Step 5: Commit guardrails**

```bash
git add tests/pages-cross-cutting.test.ts
git commit -m "test(pages): cross-cutting guardrails (no phosphor, no rounded chrome, single h1)"
```

---

## Self-review

**Coverage check:**
- ✅ `/` editorial rebuild (T1)
- ✅ `/about` rebuild — drops B Terminal direction (T2)
- ✅ `/pricing` rebuild — drops B Terminal direction, follows d4 spec (T3)
- ✅ `/methodology` rebuild — d7 spec, drops decorative lucides (T4)
- ✅ `/creator/[handle]` rebuild — phase-2 profile spec (T5)
- ✅ `/call/[id]` rebuild — phase-2 call spec (T6)
- ✅ Cross-cutting guardrails (T7)

**Out of scope (future work):**
- New routes from the spec not yet in the app: Signals, Compare, Dashboard, Saved-views, Alerts. These are net-new feature routes, not rebuilds — separate plans.
- `/feedback` — already in service, not on B Terminal direction; minor token cleanup happened in Phase 1.
- `/privacy`, `/terms` — minor copy pages; same as feedback.
- `/creator/[handle]/backtest` — already on terminal-aesthetic per [50ba100](https://...); could be migrated separately or in a future page-pass extension.

**Type consistency:**
- All `EditorialSection`, `MetaStrip`, `Chip`, `Wordmark`, `Hairline` imports point at `@/components/primitives` (defined in Phase 2 Task 1).
- `<Leaderboard>`, `<AlphaScoreBadge>`, `<TierGate>`, `<PeriodFilter>`, `<FloatingFeedbackButton>` props match Phase 2 rebuilds.
- Page-data shapes (`Creator`, `CreatorStats`, `Call`, `LeaderboardRow`, `ConsensusSignal`, `Period`, `Tier`) come from `@/lib/types`, unchanged.

---

## Execution Handoff

**Subagent dispatch order:**

1. Orchestrator creates [tests/page-helpers.ts](../../../tests/page-helpers.ts) (Task 0). Trivial 20-line file — done by orchestrator before Phase 3 starts.
2. Dispatch **T1, T2, T3, T4, T5, T6** as six parallel subagents (one worktree each).
3. Orchestrator merges all six into integration in declared order, resolves any merge conflicts in shared `tests/page-helpers.ts` (none expected if Task 0 happened first).
4. Dispatch **T7** as a single sequential subagent for cross-cutting guardrails + smoke.

Each subagent gets the markdown block from "Subagent prompt" through "Step 6 / Commit, push, exit worktree" of its task. Hand the subagent the exact file paths and the failing test; it writes code until tests pass and the build is green.
