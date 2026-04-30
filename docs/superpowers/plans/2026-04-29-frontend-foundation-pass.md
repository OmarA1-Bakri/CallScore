# Frontend Foundation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the editorial-terminal spec foundation — fonts, breakpoints, Server Component header, and removal of legacy/non-spec design tokens — so every subsequent UI rebuild lands on a consistent system.

**Architecture:** Three layered changes, applied bottom-up. (1) Token foundation: load the three spec fonts via `next/font/google`, fix Tailwind breakpoints to spec contract, delete legacy `brand-*` aliases and replace them via mechanical codemod, replace generic Tailwind grays and out-of-palette accents with spec tokens. (2) Component contract: convert `Header` from a Client Component (currently uses `useEffect` to fetch session) into a Server Component reading the cookie via `next/headers`, with a small `MobileMenu` client child. (3) Guardrails: filesystem assertions that block legacy tokens from re-entering the codebase, plus a green `next build` and `next lint`.

This plan is **Phase 1 of 3**. Phase 2 (component rebuilds — Leaderboard column set, AlphaScoreBadge, TierGate, FloatingFeedbackButton, PeriodFilter) and Phase 3 (page rebuilds — `/`, `/about`, `/pricing`, `/methodology`, `/creator`, `/call`) are separate plans to be drafted after Phase 1 is green.

**Tech Stack:** Next.js 14.2.21 · React 18.3 · Tailwind 3.4 · `next/font/google` · TypeScript 5 · Node's built-in test runner (`node --test`) with `tsx` loader.

**Reference docs:**
- Spec: [docs/frontend-design-spec.md](../../frontend-design-spec.md)
- Tokens & breakpoints: [.tmp/dev-archive/phase-3-development-pack-v0.1.html](../../../.tmp/dev-archive/phase-3-development-pack-v0.1.html)
- Component primitives: [.tmp/dev-archive/phase-2-components-screens-v0.2.html](../../../.tmp/dev-archive/phase-2-components-screens-v0.2.html)

---

## Pre-flight (do once before Task 1)

- [ ] **Commit or stash existing WIP**

```bash
git status
# If you have uncommitted changes, commit or stash them.
# This plan touches: tailwind.config.ts, src/app/globals.css, src/app/layout.tsx,
# src/components/Header.tsx, and ~15 other files via codemod.
git stash push -m "pre-foundation-pass-wip" || git status
```

- [ ] **Create a fresh branch for the foundation pass**

```bash
git checkout -b chore/frontend-foundation-pass
```

- [ ] **Confirm clean baseline**

```bash
npx tsc --noEmit
npm run lint
npm test
```

Expected: all three pass. If any fails, fix or note before proceeding (this plan assumes a green baseline).

---

## File Structure

```
src/app/
  fonts.ts                     [Create] — next/font/google declarations
  layout.tsx                   [Modify] — apply font CSS variables on <html>
  globals.css                  [Modify] — drop hard-coded font literals
src/components/
  Header.tsx                   [Rewrite] — Server Component, reads cookie
  MobileMenu.tsx               [Create] — client island for the mobile sheet
tailwind.config.ts             [Modify] — fix breakpoints, delete brand alias block
tests/
  frontend-tokens.test.ts      [Create] — guardrail: tokens present, legacy gone
  fonts.test.ts                [Create] — guardrail: next/font wired
  header-rsc.test.ts           [Create] — guardrail: Header is RSC, MobileMenu is client
package.json                   [Modify] — add typecheck script
```

---

## Task 1: Add `typecheck` npm script

The plan needs a single command for type-only verification. `next build` runs tsc as part of build, but a faster typecheck loop is useful per task.

**Files:**
- Modify: `package.json` — add `typecheck` script

- [ ] **Step 1: Inspect current scripts**

```bash
node -e "console.log(JSON.stringify(require('./package.json').scripts, null, 2))"
```

Expected: `dev`, `build`, `lint`, `test` exist; no `typecheck`.

- [ ] **Step 2: Add the script**

Edit [package.json](../../../package.json) `scripts` block, add:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Verify the script runs**

```bash
npm run typecheck
```

Expected: exits 0 (current code typechecks).

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add typecheck npm script"
```

---

## Task 2: Wire `next/font/google` for the three editorial fonts

The spec mandates Source Serif 4 (display, italic accent), Inter Tight (body), JetBrains Mono (numbers/chips). [globals.css:35-37](../../../src/app/globals.css#L35-L37) references the literals but [layout.tsx](../../../src/app/layout.tsx) does not load them, so every page silently falls back to Georgia / system / Menlo.

**Files:**
- Create: `src/app/fonts.ts`
- Modify: `src/app/layout.tsx:1-6,42-45` (add import + apply variable classes)
- Modify: `src/app/globals.css:35-37` (drop literals, keep variables)
- Test: `tests/fonts.test.ts`

- [ ] **Step 1: Write the failing test**

Create [tests/fonts.test.ts](../../../tests/fonts.test.ts):

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const fontsTs = readFileSync(join(root, "src/app/fonts.ts"), "utf8");
const layoutTsx = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("fonts.ts declares the three editorial faces", () => {
  assert.match(fontsTs, /Source_Serif_4/);
  assert.match(fontsTs, /Inter_Tight/);
  assert.match(fontsTs, /JetBrains_Mono/);
  assert.match(fontsTs, /variable:\s*"--font-serif"/);
  assert.match(fontsTs, /variable:\s*"--font-sans"/);
  assert.match(fontsTs, /variable:\s*"--font-mono"/);
});

test("layout.tsx applies the font CSS variables on <html>", () => {
  assert.match(layoutTsx, /from\s+["']\.\/fonts["']/);
  assert.match(layoutTsx, /serif\.variable/);
  assert.match(layoutTsx, /sans\.variable/);
  assert.match(layoutTsx, /mono\.variable/);
});

test("globals.css references CSS variables, not raw literals", () => {
  // Variables must still resolve through next/font's --font-* tokens.
  assert.match(globalsCss, /--font-serif:\s*var\(--font-serif\)/);
  assert.match(globalsCss, /--font-sans:\s*var\(--font-sans\)/);
  assert.match(globalsCss, /--font-mono:\s*var\(--font-mono\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --import tsx --test tests/fonts.test.ts
```

Expected: fails with "ENOENT: no such file or directory, open '.../src/app/fonts.ts'".

- [ ] **Step 3: Create `src/app/fonts.ts`**

```ts
import { Source_Serif_4, Inter_Tight, JetBrains_Mono } from "next/font/google";

export const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const sans = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
```

- [ ] **Step 4: Apply the variables in `layout.tsx`**

Replace [src/app/layout.tsx:43-52](../../../src/app/layout.tsx#L43-L52) with:

```tsx
import { serif, sans, mono } from "./fonts";

// ... existing metadata/viewport unchanged ...

export default function RootLayout({
  children,
}: RootLayoutProps): ReactElement {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} dark`}>
      <body className="min-h-screen flex flex-col bg-ink-0 text-ink-700 font-sans">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <FloatingFeedbackButton />
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Drop literals from `globals.css`**

Edit [src/app/globals.css:35-37](../../../src/app/globals.css#L35-L37) — **delete** the three `--font-*` lines from `:root`. Do NOT replace them with `--font-serif: var(--font-serif), Georgia, serif;` — that creates a self-referential CSS custom property that can resolve to `initial` at the same scope. `next/font` already binds `--font-serif`, `--font-sans`, `--font-mono` on `<html>` via `serif.variable`/`sans.variable`/`mono.variable` from Step 4, with metric-adjusted fallbacks built in. Leaving `:root` silent on these tokens lets next/font's binding flow through unmodified.

Replace the three lines with this comment instead:

```css
    /* --font-serif / --font-sans / --font-mono are bound by next/font/google
       in src/app/fonts.ts and applied via className on <html> in layout.tsx.
       Do not redefine them here — that would shadow next/font's metric-adjusted stack. */
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
node --import tsx --test tests/fonts.test.ts
```

Expected: PASS (3 assertions).

- [ ] **Step 7: Run typecheck + dev smoke**

```bash
npm run typecheck
npm run dev
# Visit http://localhost:3000 and inspect — body text should now be Inter Tight, not system sans.
# Stop with Ctrl+C.
```

- [ ] **Step 8: Commit**

```bash
git add src/app/fonts.ts src/app/layout.tsx src/app/globals.css tests/fonts.test.ts
git commit -m "feat(frontend): wire next/font/google for Source Serif 4, Inter Tight, JetBrains Mono"
```

---

## Task 3: Fix Tailwind breakpoints to spec contract

[tailwind.config.ts:13-16](../../../tailwind.config.ts#L13-L16) defines `tab: 768px` and `desk: 1280px`. The spec contract is `bp.phone ≤480`, `bp.tab 481–1024`, `bp.desk ≥1025` ([phase-3-development-pack-v0.1.html §03](../../../.tmp/dev-archive/phase-3-development-pack-v0.1.html)).

**Files:**
- Modify: `tailwind.config.ts:11-17`
- Test: `tests/frontend-tokens.test.ts` (new — will be extended in Task 5)

- [ ] **Step 1: Write the failing test**

Create [tests/frontend-tokens.test.ts](../../../tests/frontend-tokens.test.ts):

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import config from "../tailwind.config";

test("breakpoints match the spec contract (phone ≤480, tab 481-1024, desk ≥1025)", () => {
  const screens = config.theme?.extend?.screens as Record<string, string>;
  assert.equal(screens.tab, "481px", "tab breakpoint must be 481px (start of tab range)");
  assert.equal(screens.desk, "1025px", "desk breakpoint must be 1025px (start of desk range)");
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: FAIL — `tab` is `768px`, `desk` is `1280px`.

- [ ] **Step 3: Update the breakpoints**

Edit [tailwind.config.ts:11-17](../../../tailwind.config.ts#L11-L17):

```ts
      // Spec breakpoint contract: phone ≤480 · tab 481–1024 · desk ≥1025
      // (phase-3-development-pack §03). Tailwind defaults sm/md/lg/xl remain
      // available for legacy components during phased migration.
      screens: {
        tab: "481px",
        desk: "1025px",
      },
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build + lint to confirm no regression**

```bash
npm run typecheck
npm run lint
```

Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts tests/frontend-tokens.test.ts
git commit -m "fix(frontend): align tab/desk breakpoints with spec contract (481/1025)"
```

---

## Task 4: Codemod legacy `brand-*` Tailwind aliases → spec tokens

[tailwind.config.ts:46-57](../../../tailwind.config.ts#L46-L57) defines `brand-gold/dark/card/border/...` as compatibility aliases. ~85 references across [src/](../../../src) still use them. Codemod them to spec tokens. The mapping (verified by hex equivalence in tailwind.config.ts):

| legacy | spec | reason |
|---|---|---|
| `brand-gold` | `accent` | both `#C9A24B` |
| `brand-gold-dim` | `accent-dim` | both `#8E7235` |
| `brand-green` | `pos` | both `#6FA56A` |
| `brand-red` | `neg` | both `#D47A70` |
| `brand-dark` | `ink-0` | both `#0A0A0B` |
| `brand-card` | `ink-100` | both `#141517` |
| `brand-card-hover` | `ink-150` | both `#1A1B1E` |
| `brand-border` | `ink-200` | both `#22242A` |
| `brand-muted` | `ink-500` | both `#7A7F89` |
| `brand-accent` | `accent` | alias of accent |

**Files:**
- Modify (codemod): every file under `src/` containing `brand-*` classes — currently `src/app/page.tsx`, `src/app/methodology/page.tsx`, `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/Leaderboard.tsx`, `src/components/CallHistory.tsx`, `src/components/AlphaScoreBadge.tsx`, `src/components/ConsensusSignals.tsx`, `src/components/CreatorCard.tsx`, `src/components/PeriodFilter.tsx`, `src/components/TierGate.tsx`, `src/components/FloatingFeedbackButton.tsx`
- Test: `tests/frontend-tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to [tests/frontend-tokens.test.ts](../../../tests/frontend-tokens.test.ts):

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    if (/\.(tsx?|css)$/.test(name)) return [full];
    return [];
  });
}

const sourceFiles = walk(join(__dirname, "..", "src"));

test("no `brand-*` Tailwind aliases remain in src/", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf8");
    // Match Tailwind class fragments like `brand-gold`, `brand-border`, etc.
    // Allow `brand` as an English word (none currently exists), but flag `brand-`.
    const matches = content.match(/\bbrand-[a-z][a-z0-9-]*/g);
    if (matches) offenders.push(`${file}: ${[...new Set(matches)].join(", ")}`);
  }
  assert.deepEqual(offenders, [], `Found legacy brand-* aliases:\n${offenders.join("\n")}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: FAIL — many offenders listed.

- [ ] **Step 3: Run the codemod**

Use Node's built-in fs to do the rewrite (cross-platform; no `sed -i` portability issues on Windows):

Create temporary script `.tmp/codemod-brand.mjs`:

```js
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPLACEMENTS = [
  [/\bbrand-gold-dim\b/g, "accent-dim"],
  [/\bbrand-gold\b/g, "accent"],
  [/\bbrand-green\b/g, "pos"],
  [/\bbrand-red\b/g, "neg"],
  [/\bbrand-card-hover\b/g, "ink-150"],
  [/\bbrand-card\b/g, "ink-100"],
  [/\bbrand-border\b/g, "ink-200"],
  [/\bbrand-muted\b/g, "ink-500"],
  [/\bbrand-dark\b/g, "ink-0"],
  [/\bbrand-accent\b/g, "accent"],
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    if (/\.(tsx?|css)$/.test(name)) return [full];
    return [];
  });
}

let changed = 0;
for (const file of walk("src")) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [re, to] of REPLACEMENTS) after = after.replace(re, to);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
    console.log(`  rewrote ${file}`);
  }
}
console.log(`\n${changed} files rewritten.`);
```

Run it:

```bash
node .tmp/codemod-brand.mjs
```

Expected: ~12 files rewritten, listed by name.

- [ ] **Step 4: Run the guardrail test to verify it passes**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck + lint + build**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all green. The Tailwind compiler may flag `accent-dim` if it's not whitelisted under the `accent` color; verify by inspecting the build output. (`accent.dim` is already declared at [tailwind.config.ts:34-36](../../../tailwind.config.ts#L34-L36), so `bg-accent-dim` works as Tailwind nested color access.)

- [ ] **Step 6: Spot-check visual diff**

```bash
npm run dev
```

Visit `/`, `/methodology`, click into a creator profile. Confirm gold accents, green/red value colors, and ink-tone surfaces all render unchanged from before the codemod.

- [ ] **Step 7: Delete the codemod script + commit**

```bash
rm .tmp/codemod-brand.mjs
git add src/ tests/frontend-tokens.test.ts
git commit -m "refactor(frontend): codemod brand-* legacy aliases to spec tokens"
```

---

## Task 5: Delete the `brand` alias block from `tailwind.config.ts`

With Task 4 complete, the alias block is dead code. Removing it converts any future regression into a compile-time error.

**Files:**
- Modify: `tailwind.config.ts:45-57` (delete the `brand` block)
- Test: `tests/frontend-tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to [tests/frontend-tokens.test.ts](../../../tests/frontend-tokens.test.ts):

```ts
test("tailwind config does not declare a `brand` color block", () => {
  const colors = config.theme?.extend?.colors as Record<string, unknown>;
  assert.equal(
    colors.brand,
    undefined,
    "tailwind.config.ts must not re-export `brand` aliases — use spec tokens directly",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: FAIL — `brand` block still present.

- [ ] **Step 3: Delete the alias block**

In [tailwind.config.ts:45-57](../../../tailwind.config.ts#L45-L57), remove these lines:

```ts
        // Temporary compatibility aliases for legacy components while routes migrate.
        brand: {
          gold: "#C9A24B",
          "gold-dim": "#8E7235",
          green: "#6FA56A",
          red: "#D47A70",
          dark: "#0A0A0B",
          card: "#141517",
          "card-hover": "#1A1B1E",
          border: "#22242A",
          muted: "#7A7F89",
          accent: "#C9A24B",
        },
```

- [ ] **Step 4: Run test + build**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
npm run build
```

Expected: test PASS; build PASS (no remaining `brand-*` classes thanks to Task 4).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts tests/frontend-tokens.test.ts
git commit -m "chore(frontend): remove brand-* alias block from tailwind config"
```

---

## Task 6: Replace generic Tailwind `gray-*` with spec `ink-*`

~85 references to `text-gray-300/400/500/600` and `bg-gray-700/800` across [src/](../../../src). Tailwind's `gray` ramp is cool-blue; the spec `--ink-*` ramp is neutral. The mapping below is verified by hex similarity:

| legacy | spec | mapping rationale |
|---|---|---|
| `text-gray-300` | `text-ink-700` | `#d1d5db` ≈ `#C2C5CC` (body color) |
| `text-gray-400` | `text-ink-600` | `#9ca3af` ≈ `#9CA0A9` (secondary text) |
| `text-gray-500` | `text-ink-500` | `#6b7280` ≈ `#7A7F89` (muted/captions) |
| `text-gray-600` | `text-ink-400` | `#4b5563` ≈ `#5B5F68` (disabled) |
| `text-white` | `text-ink-900` | `#FFFFFF` → `#F4F5F7` (spec uses near-white, not pure white) |
| `bg-gray-700` | `bg-ink-300` | `#374151` ≈ `#3A3D44` |
| `bg-gray-800` | `bg-ink-100` | `#1f2937` ≈ `#141517` (closest editorial step) |
| `border-gray-700` | `border-ink-300` | same |

**Files:**
- Modify (codemod): every file under `src/` matching the patterns
- Test: `tests/frontend-tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to [tests/frontend-tokens.test.ts](../../../tests/frontend-tokens.test.ts):

```ts
test("no generic Tailwind gray utilities remain in src/", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf8");
    const matches = content.match(/\b(text|bg|border|ring|placeholder|divide)-gray-\d{2,3}\b/g);
    if (matches) offenders.push(`${file}: ${[...new Set(matches)].join(", ")}`);
  }
  assert.deepEqual(offenders, [], `Found generic gray utilities:\n${offenders.join("\n")}`);
});

test("no `text-white` literal remains in src/ (use text-ink-900 per spec)", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf8");
    if (/\btext-white\b/.test(content)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `Found text-white usages:\n${offenders.join("\n")}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: FAIL with offenders listed.

- [ ] **Step 3: Run the gray codemod**

Create `.tmp/codemod-gray.mjs`:

```js
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPLACEMENTS = [
  [/\btext-gray-300\b/g, "text-ink-700"],
  [/\btext-gray-400\b/g, "text-ink-600"],
  [/\btext-gray-500\b/g, "text-ink-500"],
  [/\btext-gray-600\b/g, "text-ink-400"],
  [/\btext-gray-700\b/g, "text-ink-300"],
  [/\btext-gray-800\b/g, "text-ink-200"],
  [/\bbg-gray-700\b/g, "bg-ink-300"],
  [/\bbg-gray-800\b/g, "bg-ink-100"],
  [/\bbg-gray-900\b/g, "bg-ink-0"],
  [/\bborder-gray-700\b/g, "border-ink-300"],
  [/\bborder-gray-800\b/g, "border-ink-200"],
  [/\bdivide-gray-(\d{2,3})\b/g, "divide-ink-$1"], // best-effort
  [/\btext-white\b/g, "text-ink-900"],
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    if (/\.(tsx?|css)$/.test(name)) return [full];
    return [];
  });
}

let changed = 0;
for (const file of walk("src")) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [re, to] of REPLACEMENTS) after = after.replace(re, to);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
    console.log(`  rewrote ${file}`);
  }
}
console.log(`\n${changed} files rewritten.`);
```

Run it:

```bash
node .tmp/codemod-gray.mjs
```

- [ ] **Step 4: Run guardrail test**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build + visual smoke**

```bash
npm run build
npm run dev
```

Visit `/`, `/methodology`, `/creator/[any]`. Body text should now read in the warmer ink ramp; no visible regression in muted captions or borders.

- [ ] **Step 6: Delete codemod script + commit**

```bash
rm .tmp/codemod-gray.mjs
git add src/ tests/frontend-tokens.test.ts
git commit -m "refactor(frontend): replace generic gray-* and text-white with ink-* spec tokens"
```

---

## Task 7: Replace out-of-palette accent colors with spec tokens

Remaining non-spec colors: `text-yellow-400`, `text-orange-400`, `text-blue-400/500`, `bg-blue-500/20`, `bg-pink-500/20`, `bg-cyan-500/20`. Sources: [AlphaScoreBadge.tsx:6-25](../../../src/components/AlphaScoreBadge.tsx#L6-L25), [methodology/page.tsx:67-89](../../../src/app/methodology/page.tsx#L67-L89), [Leaderboard.tsx:55-66](../../../src/components/Leaderboard.tsx#L55-L66), [CreatorCard.tsx:23-28](../../../src/components/CreatorCard.tsx#L23-L28), [Leaderboard.tsx:35](../../../src/components/Leaderboard.tsx#L35).

Mapping per spec semantic palette:

| legacy | spec | semantic |
|---|---|---|
| `yellow-400` | `accent` | mid-range / "good" non-best |
| `orange-400` | `warn` | rust — caution / mid-low |
| `blue-400` | `new` | steel-blue — informational |
| `blue-500` | `new` | (avatar palette) |
| `pink-500` | `accent` | (avatar palette — flatten to one accent) |
| `cyan-500` | `new` | (avatar palette) |

For the avatar circles in `Leaderboard.tsx` and `CreatorCard.tsx`, the spec doesn't show round avatars at all — but until Phase 2 rebuilds them, collapse the 6-color random palette to a single `bg-accent-low text-accent` chip. This removes palette pollution without changing layout.

**Files:**
- Modify: `src/components/AlphaScoreBadge.tsx:6-25`
- Modify: `src/components/Leaderboard.tsx:34-37,55-66`
- Modify: `src/components/CreatorCard.tsx:22-30`
- Modify: `src/app/methodology/page.tsx:66-89`
- Test: `tests/frontend-tokens.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to [tests/frontend-tokens.test.ts](../../../tests/frontend-tokens.test.ts):

```ts
test("no out-of-palette Tailwind colors in src/ (yellow/orange/blue/pink/cyan/purple)", () => {
  const offenders: string[] = [];
  const banned = /\b(text|bg|border|ring|from|to|via)-(yellow|orange|blue|pink|cyan|purple|indigo|teal|emerald|amber|lime|rose|fuchsia|violet|sky)-\d{2,3}\b/g;
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf8");
    const matches = content.match(banned);
    if (matches) offenders.push(`${file}: ${[...new Set(matches)].join(", ")}`);
  }
  assert.deepEqual(offenders, [], `Found out-of-palette colors:\n${offenders.join("\n")}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: FAIL with offenders.

- [ ] **Step 3: Patch `AlphaScoreBadge.tsx`**

Replace [src/components/AlphaScoreBadge.tsx:6-25](../../../src/components/AlphaScoreBadge.tsx#L6-L25) with:

```tsx
function getScoreColor(score: number): string {
  if (score >= 70) return "text-pos";
  if (score >= 50) return "text-accent";
  if (score >= 30) return "text-warn";
  return "text-neg";
}

function getBarColor(score: number): string {
  if (score >= 70) return "bg-pos";
  if (score >= 50) return "bg-accent";
  if (score >= 30) return "bg-warn";
  return "bg-neg";
}

function getGlowColor(score: number): string {
  // glow utilities are stubs (globals.css L206-209); kept for prop-shape compatibility.
  return "";
}
```

Also replace the hardcoded `stroke="#1e1e2e"` ring at [AlphaScoreBadge.tsx:53](../../../src/components/AlphaScoreBadge.tsx#L53) with `stroke="var(--ink-200)"`.

- [ ] **Step 4: Patch `Leaderboard.tsx` rank-3 color**

[src/components/Leaderboard.tsx:35](../../../src/components/Leaderboard.tsx#L35) — replace `text-orange-400` with `text-accent-dim`.

- [ ] **Step 5: Collapse Leaderboard avatar palette**

Replace [src/components/Leaderboard.tsx:55-66](../../../src/components/Leaderboard.tsx#L55-L66) with:

```tsx
function getAvatarColor(_name: string): string {
  return "bg-accent-low text-accent border border-accent-dim/40";
}
```

(Phase 2 rebuilds the leaderboard without avatar circles entirely; this is interim.)

- [ ] **Step 6: Same patch in `CreatorCard.tsx`**

Replace [src/components/CreatorCard.tsx:22-30](../../../src/components/CreatorCard.tsx#L22-L30) with the same single-color helper.

- [ ] **Step 7: Patch `methodology/page.tsx` score components**

In [src/app/methodology/page.tsx:66-89](../../../src/app/methodology/page.tsx#L66-L89), replace the per-component `color`/`bgColor`/`borderColor`:

```tsx
  {
    label: "Direction Correct",
    maxPoints: SCORE_WEIGHTS.direction,
    color: "text-pos",
    bgColor: "bg-pos",
    borderColor: "border-pos/30",
    description: /* unchanged */,
  },
  {
    label: "Alpha Over BTC",
    maxPoints: SCORE_WEIGHTS.alpha,
    color: "text-new",
    bgColor: "bg-new",
    borderColor: "border-new/30",
    description: /* unchanged */,
  },
  {
    label: "Specificity",
    maxPoints: SCORE_WEIGHTS.specificity,
    color: "text-accent",
    bgColor: "bg-accent",
    borderColor: "border-accent/30",
    description: /* unchanged */,
  },
  {
    label: "Regime Difficulty",
    maxPoints: SCORE_WEIGHTS.regime,
    color: "text-warn",
    bgColor: "bg-warn",
    borderColor: "border-warn/30",
    description: /* unchanged */,
  },
  {
    label: "Target Hit",
    maxPoints: SCORE_WEIGHTS.target,
    color: "text-accent",
    bgColor: "bg-accent",
    borderColor: "border-accent/30",
    description: /* unchanged */,
  },
```

- [ ] **Step 8: Patch the inline `text-blue-400` / `text-orange-400` in pipeline steps**

In [src/app/methodology/page.tsx:108-139](../../../src/app/methodology/page.tsx#L108-L139), inside `PIPELINE_STEPS`, replace:
- `color: "text-brand-red"` → already migrated to `text-neg` by Task 4
- `color: "text-blue-400"` → `color: "text-new"`

- [ ] **Step 9: Run guardrail test**

```bash
node --import tsx --test tests/frontend-tokens.test.ts
```

Expected: PASS.

- [ ] **Step 10: Build + visual smoke**

```bash
npm run build
npm run dev
```

Visit `/`, `/methodology`. The score-component bars in methodology change palette; the leaderboard avatars all become ochre. Both are intentional Phase 1 transitions.

- [ ] **Step 11: Commit**

```bash
git add src/ tests/frontend-tokens.test.ts
git commit -m "refactor(frontend): replace out-of-palette colors with spec semantic tokens"
```

---

## Task 8: Convert `Header` to a Server Component, extract `MobileMenu` client island

[src/components/Header.tsx:1-28](../../../src/components/Header.tsx#L1-L28) is `"use client"` only because it `fetch`es `/api/auth/session` from a `useEffect`. This causes a flash-of-default-state on every navigation. Per Vercel React best practices, read the cookie via `cookies()` from `next/headers` server-side.

**Files:**
- Rewrite: `src/components/Header.tsx` (now RSC)
- Create: `src/components/MobileMenu.tsx` (client island)
- Test: `tests/header-rsc.test.ts`

The session-reading helper depends on the existing auth module. Find it first:

- [ ] **Step 1: Identify the server-side session helper (HARD PREREQUISITE)**

```bash
grep -nE "export (async )?function|export const" src/lib/auth.ts src/lib/whop.ts src/app/api/auth/session/route.ts 2>&1 | head -20
```

The expected helper is `getSession()` from `@/lib/auth` — confirmed via the existing `src/app/api/auth/session/route.ts` which delegates to it. **It must return `Session | null` with a real `tier` value.** Verify by reading `src/lib/auth.ts:153` (or wherever `export async function getSession` lives) and confirming the `Session` interface has a `tier: Tier` field.

If `getSession` does not exist or returns a stub, **STOP** and refactor the API route handler into a helper before continuing. The Header rewrite below is not safe with a stub helper — every subscriber would render with `tier: "free"`.

- [ ] **Step 2: Write the failing test**

Create [tests/header-rsc.test.ts](../../../tests/header-rsc.test.ts):

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const headerSrc = readFileSync(join(root, "src/components/Header.tsx"), "utf8");
const mobileMenuSrc = readFileSync(join(root, "src/components/MobileMenu.tsx"), "utf8");

test("Header.tsx is a Server Component (no `use client` directive)", () => {
  assert.doesNotMatch(
    headerSrc,
    /^\s*["']use client["']/m,
    "Header must be a Server Component",
  );
});

test("Header.tsx reads session via @/lib/auth or next/headers, not via fetch + useEffect", () => {
  assert.match(headerSrc, /from\s+["']@\/lib\/auth["']|from\s+["']next\/headers["']/);
  assert.doesNotMatch(headerSrc, /useEffect/);
  assert.doesNotMatch(headerSrc, /fetch\(["']\/api\/auth\/session["']/);
});

test("Header.tsx does not contain a hardcoded tier='free' stub for logged-in users", () => {
  // Anti-stub guard: forbid the exact pattern from earlier drafts where the
  // helper returned `{ loggedIn: true, tier: "free" }` as a TODO placeholder.
  // The real getSession() must drive the tier value.
  assert.doesNotMatch(
    headerSrc,
    /loggedIn:\s*true\s*,\s*tier:\s*["']free["']/,
    "Header must not stub logged-in users to tier='free'",
  );
});

test("MobileMenu.tsx is the client island", () => {
  assert.match(mobileMenuSrc, /^\s*["']use client["']/m);
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
node --import tsx --test tests/header-rsc.test.ts
```

Expected: FAIL — `MobileMenu.tsx` does not exist; `Header.tsx` still has `"use client"`.

- [ ] **Step 4: Create `MobileMenu.tsx`**

Create [src/components/MobileMenu.tsx](../../../src/components/MobileMenu.tsx):

```tsx
"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

interface MobileMenuProps {
  readonly loggedIn: boolean;
  readonly tier: string;
}

export default function MobileMenu({ loggedIn, tier }: MobileMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  // Track previous open-state so focus-restore only fires on user-initiated close,
  // not on hydration mount when open is already false (round2-007).
  const wasOpen = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      // Focus the first link when menu opens (a11y).
      requestAnimationFrame(() => firstLinkRef.current?.focus());
    } else if (wasOpen.current) {
      // Restore focus to the toggle ONLY on close (not on mount).
      toggleRef.current?.focus();
    }
    wasOpen.current = open;
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={toggleRef}
        onClick={() => setOpen((prev) => !prev)}
        className="tab:hidden text-ink-600 hover:text-ink-900"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {open && (
        <nav
          id="mobile-nav"
          className="tab:hidden pb-4 space-y-2"
          aria-label="Mobile navigation"
        >
          <Link href="/" onClick={() => setOpen(false)} className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2">Leaderboard</Link>
          <Link href="/methodology" onClick={() => setOpen(false)} className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2">Methodology</Link>
          <Link href="/pricing" onClick={() => setOpen(false)} className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2">Pricing</Link>
          {loggedIn ? (
            <>
              <div className="py-2 text-xs text-ink-500 uppercase tracking-caps">Tier · {tier}</div>
              <Link href="/api/auth/logout" onClick={() => setOpen(false)} className="block text-ink-600 hover:text-ink-900 transition-colors text-sm font-medium py-2">Logout</Link>
            </>
          ) : (
            <>
              <Link href="/api/auth/whop" prefetch={false} onClick={() => setOpen(false)} className="block text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium py-2">Sign In</Link>
              <Link href="/pricing" onClick={() => setOpen(false)} className="inline-block bg-accent hover:bg-accent-dim text-ink-0 font-semibold text-sm px-4 py-2 transition-colors">Get Access</Link>
            </>
          )}
        </nav>
      )}
    </>
  );
}
```

- [ ] **Step 5: Rewrite `Header.tsx` as RSC**

Replace [src/components/Header.tsx](../../../src/components/Header.tsx) entirely with:

```tsx
import Link from "next/link";
import Image from "next/image";
import { LogIn, LogOut, Crown, Zap } from "lucide-react";
import type { ReactElement } from "react";
import { getSession } from "@/lib/auth";
import MobileMenu from "./MobileMenu";

// Header reads the session server-side via getSession() from @/lib/auth, which
// itself reads the ctr_session cookie via next/headers and decodes it with the
// real Whop verification. Do NOT inline a stub that returns tier: "free" — that
// would mis-badge every paying subscriber.

export default async function Header(): Promise<ReactElement> {
  const session = await getSession();
  const loggedIn = session !== null;
  const tier: string = session?.tier ?? "free";

  return (
    <header className="sticky top-0 z-masthead bg-ink-0/90 backdrop-blur-bar border-b border-ink-250">
      <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="CryptoTubers Ranked home">
            <Image
              src="/logo-icon.png"
              alt=""
              aria-hidden="true"
              width={468}
              height={468}
              className="h-10 w-auto group-hover:scale-[1.04] transition-transform"
              priority
            />
            <div className="hidden tab:block">
              <span className="text-ink-900 font-extrabold text-base tracking-tight leading-none">CryptoTubers</span>
              <span className="block text-accent font-bold text-[11px] tracking-[0.2em] uppercase leading-none mt-0.5">Ranked</span>
            </div>
          </Link>

          <nav className="hidden tab:flex items-center gap-8" aria-label="Primary navigation">
            <Link href="/" className="text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium">Leaderboard</Link>
            <Link href="/methodology" className="text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium">Methodology</Link>
            <Link href="/pricing" className="text-ink-700 hover:text-ink-900 transition-colors text-sm font-medium">Pricing</Link>

            {loggedIn ? (
              <div className="flex items-center gap-3">
                <TierBadge tier={tier} />
                <Link href="/api/auth/logout" className="text-ink-600 hover:text-ink-900 transition-colors text-sm flex items-center gap-1.5">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden desk:inline">Logout</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/api/auth/whop" prefetch={false} className="text-ink-700 hover:text-ink-900 transition-colors text-sm flex items-center gap-1.5">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
                <Link href="/pricing" className="bg-accent hover:bg-accent-dim text-ink-0 font-semibold text-sm px-4 py-2 transition-colors">Get Access</Link>
              </div>
            )}
          </nav>

          <MobileMenu loggedIn={loggedIn} tier={tier} />
        </div>
      </div>
    </header>
  );
}

function TierBadge({ tier }: { readonly tier: string }): ReactElement {
  if (tier === "elite") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-accent/20 text-accent border border-accent/30">
        <Crown className="w-3 h-3" /> Alpha
      </span>
    );
  }
  if (tier === "pro") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-new/20 text-new border border-new/30">
        <Zap className="w-3 h-3" /> Pro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-ink-100 text-ink-600 border border-ink-300">
      Free
    </span>
  );
}
```

If Step 1 surfaced a real `getSessionFromCookies()` helper in `@/lib/whop` (or wherever), replace the stub `getSession()` body with a call to it. Keep the try/catch around it.

- [ ] **Step 6: Run the test to verify it passes**

```bash
node --import tsx --test tests/header-rsc.test.ts
```

Expected: PASS (3 assertions).

- [ ] **Step 7: Build + dev smoke**

```bash
npm run typecheck
npm run build
npm run dev
```

Visit `/`. Header should render the tier badge synchronously without flash. Resize to mobile: menu opens; Escape closes it.

- [ ] **Step 8: Commit**

```bash
git add src/components/Header.tsx src/components/MobileMenu.tsx tests/header-rsc.test.ts
git commit -m "refactor(header): convert to Server Component with MobileMenu client island"
```

---

## Task 9: Final guardrails — green build, lint, full test suite

After all transforms, lock in the state.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: every existing test still passes; the four new test files pass:
- `tests/fonts.test.ts` (3 assertions)
- `tests/frontend-tokens.test.ts` (5 assertions)
- `tests/header-rsc.test.ts` (3 assertions)

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 4: Run production build**

```bash
npm run build
```

Expected: build succeeds. Note the bundle-size delta vs baseline — `next/font` adds the three Google fonts as self-hosted assets but should otherwise leave route bundles unchanged.

- [ ] **Step 5: Visual smoke on every public page**

```bash
npm run dev
```

Manually visit and confirm no broken layout (intentional palette shifts are fine):
- `/` (home + leaderboard)
- `/methodology`
- `/pricing` (still phosphor-green — Phase 3 rebuilds this)
- `/about` (still phosphor-green — Phase 3 rebuilds this)
- `/creator/<any>`
- `/call/<any>`
- `/feedback`

Confirm body type is now Inter Tight (sans-serif but distinctly different from system).

- [ ] **Step 6: Commit nothing (verification step) and push**

```bash
git status            # should be clean
git log --oneline chore/frontend-foundation-pass ^master | head -20
git push -u origin chore/frontend-foundation-pass
```

---

## Self-Review Notes

**Spec coverage applied to this plan:**

- ✅ Fonts loaded (P0 #1) → Task 2
- ✅ Tailwind breakpoints aligned (P1 #7) → Task 3
- ✅ Legacy `brand-*` codemod (P1 #9) → Tasks 4 + 5
- ✅ Generic Tailwind grays replaced (P1 #10) → Task 6
- ✅ Out-of-palette accent colors replaced (P1 #11) → Task 7
- ✅ Header → Server Component (P1 #8) + a11y additions (P2 #17) → Task 8

**Deferred to Phase 2 (component pass):**

- Leaderboard column-set rewrite to spec (P0 #4)
- AlphaScoreBadge ring/hairline restructure (P0 #5)
- TierGate gradient removal + editorial composition (P0 #6)
- FloatingFeedbackButton: drop `rounded-full` + `glow-gold`, make a `<Link>` (P3 #22)
- PeriodFilter: replace `rounded-lg` segmented control with mono-tabs + accent underline (P1 #12)
- Lucide icon audit (P1 #13)
- `glass-card` removal (P1 #14)
- `text-gradient-gold/purple` rename to `text-accent` (P3 #21)

**Deferred to Phase 3 (page rebuilds):**

- `/about` full rebuild against editorial spec (P0 #2)
- `/pricing` full rebuild against [phase-3-d4-pricing-v0.1.html](../../../.tmp/dev-archive/phase-3-d4-pricing-v0.1.html) (P0 #2)
- `/` editorial hero composition (P0 #3 hero, P0 #2 premise strip)
- `/methodology` matrix + oq-card primitives
- `/creator/[handle]` + `/call/[id]` 2-col profile per phase-2 spec

**Out of scope for any of these phases (separate ticket):**

- `searchParams` Promise typing for Next 15 migration (P2 #15)
- Catch-block error narrowing across SSR pages (P2 #16)
- Logo PNG → SVG conversion (P2 #18)
- Production `console.log` audit (P2 #20)

**Test design checklist:**

- ✅ Every code-changing task has a real failing test before implementation
- ✅ Tests assert on filesystem/config state, not visual output (no jsdom needed)
- ✅ Codemods include `*.tsx`, `*.ts`, `*.css` — no missed extensions
- ✅ Codemod replacements use word boundaries (`\b`) to avoid partial matches
- ✅ Each task ends with a single commit so the history is bisectable

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-frontend-foundation-pass.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**

After Phase 1 ships green, the next plans to draft are:
- `2026-XX-XX-frontend-component-pass.md` (Leaderboard, AlphaScoreBadge, TierGate, FloatingFeedbackButton, PeriodFilter — ~3-4 days)
- `2026-XX-XX-frontend-page-pass.md` (`/`, `/about`, `/pricing`, `/methodology`, `/creator`, `/call` rebuilds — ~4-6 days)
