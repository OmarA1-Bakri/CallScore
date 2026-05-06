# CryptoTubers Ranked — Frontend Design Spec

**Version:** v1.4 (fourth revision — final) · **Date:** 2026-04-27
**Source:** all 11 prototypes in `.new-FE-design/` — Phase 1 v0.2, Phase 2 v0.2, Phase 3 v0.3 (canonical), D4 (pricing v0.1), D5 (metric hover library v0.1), D6 (mobile responsive v0.1)
**Stack target:** Next.js 14.2.21 (App Router), React 18.3.1, TypeScript 5.6, Tailwind 3.4.16, lucide-react, recharts
**Audience:** the engineer who will refactor `src/` from scratch against this spec.

> This document is the single handoff. It supersedes everything in the existing `src/` UI. Where the prototypes contradict each other, **v0.3 / v0.2 latest** wins. The `tailwind.config.ts` currently in the repo (purple/gold-yellow brand) is wrong for this design — it must be replaced per §2.

> **v1.4 — final polish pass since v1.3.** Closed all 7 P1s + 3 P2s flagged by the fourth omx review. omx graded v1.3 as "ready for static UI refactor"; v1.4 closes the remaining polish items so the spec is ready for blind execution. Net changes: `<Tier>` component renamed to `<RankTierBadge>` matching the type rename; AlphaScore stale variant now falls through to inline when forced without data (no more "stale · 0h" lie); `/call/[id]` redirect snippet handles repeated query params correctly + URL-encodes the dynamic segment; methodology anchor map now resolves to actual `<h2 id>` headings (added §5 Win rate and §9 Median horizon as standalone sections, mapped `#overlap` to §12 Overlap-with-you); §12.14 gate matrix has Settings rows; §12.4.1 backend-prereqs table now covers `/signals/resolved`, thesis detail, cluster detail, settings auth middleware, push alerts (standalone), Team settings; `.mk-tb` flipped from max-width to mobile-base + min-width hide rule; Tailwind `screens` replacement now documented as breaking sm/md/lg/xl in legacy code; Dialog `inert` claim corrected (Radix `aria-hidden` + focus-trap, no `inert` attribute); §6.8 cluster detail aligned to "coming soon card" across all callsites. Two new OQs filed (OQ-31 push alerts infra, OQ-32 Team admin/member roles). See §15 Changelog.

> **v1.3 — what changed since v1.2.** Closed the 1 spec-fixable P0 + 7 P1s + 3 P2s flagged by the third omx review. Renamed creator-score `Tier` → `RankTier` to resolve the type collision with the existing repo's auth `Tier` (free/pro/elite). Fixed CreatorAvatar to validate `https` protocol (not just hostname) before passing to `next/image`. Fixed Dialog overlay logic so modal/sheet ALWAYS render their overlay (`showOverlay={false}` is now ignored for them; drawer remains opt-in). Replaced raw `z-index:` numerals in `.mast` `.modal` `.tip` `.mk-tb` with named `var(--z-*)` references; added the full z-index scale to `:root`. Propagated `window` → `win` URL-param rename to §6.7. Added `delta_30d` and `tier` to the leaderboard sort whitelist. Added the canonical metric-id → methodology-anchor map. Spec'd Settings mobile layout + auth gating + loading/error states. Added implementation snippet for the `/call/[id]` legacy permanent-redirect (preserves query string, uses `permanentRedirect()` for SEO). AlphaScore now `console.warn`s in dev when `variant="stale"` is forced without `stale` data. Reframed §10.4 "exemption list" as the design-system canon — prototype-only effects are explicitly NOT carried forward. **Plus the headline addition**: §12.4.1 *Backend prerequisites — release-blocker checklist* mapping every gated surface to its required backend work, so the engineer knows what they can ship today vs what waits for backend (Provenance archive, Signals consensus pipeline, billing provider, last-visit storage, push alerts, Compare PNG export, command palette). See §15 Changelog for full details.

> **v1.2 — what changed since v1.1.** Closed 5 new P0s flagged by the second omx review: route tree updated (added `/calls/[id]`, `/login`, `/signup`, `/settings/*`, all signals sub-routes); AlphaScore skeleton compile errors fixed (`AlphaVariant` exported, `stale!` crash guarded); Dialog primitive z-index hierarchy corrected (paired `*-overlay` tokens, no raw `z-[59]`); URL Zod parser switched to `.catch()` + `safeParse` so invalid params clamp to default instead of throwing; Low-N dual thresholds (`LOW_N_BADGE=20` / `metric.lowN.threshold=12`) made explicit. Plus: Avatar host pre-validation prevents `next/image` synchronous throw; gradient/shadow exemption list completed; OQ-5 first-mover language cleaned across 4 callsites. See §15 Changelog for full details.

> **v1.1 — what changed from v1.0.** Closed P0/P1 findings from independent codex + omx review. Net: 7 unified decisions (deps · low-N matrix · fading window · Signals nav · β handling · tier naming · token policy), all missing routes spec'd, Pricing self-contained, Modal/Drawer/Sheet contract added, server/client component map added, URL state schema added, avatar policy added, loading/error strategy added, premium gating state machine added, Methodology page content written, §16 references resolved (folded inline). Stack now formally adopts: **`@radix-ui/react-popover` · `@radix-ui/react-dialog` · `@floating-ui/react` · `zod` · `clsx`**.

---

## Table of contents

1. [North Star & Aesthetic Direction](#1-north-star--aesthetic-direction)
2. [Design Tokens](#2-design-tokens)
3. [Typography](#3-typography)
4. [Information Architecture](#4-information-architecture)
5. [Component Library](#5-component-library)
6. [Screen Specs](#6-screen-specs)
7. [Pricing (D4)](#7-pricing-d4)
8. [Metric Hover Library (D5)](#8-metric-hover-library-d5)
9. [Mobile Responsive (D6)](#9-mobile-responsive-d6)
10. [Motion & Micro-interactions](#10-motion--micro-interactions)
11. [Accessibility](#11-accessibility)
12. [Implementation Guidance](#12-implementation-guidance)
13. [Open Questions](#13-open-questions)
14. [Appendix](#14-appendix)
15. [Changelog](#15-changelog)

---

## 1. North Star & Aesthetic Direction

### Product in one sentence
> A clear lens on which crypto voices actually move your money — credibility ranking + live consensus signals + side-by-side compare, all backed by linkable evidence.

### What this product is
- **Leaderboard** of YouTubers/creators ranked by α (log-return excess vs. benchmark) on resolved directional calls.
- **Signals** of forming/active theses across creators (not a second leaderboard — units are *theses*, not creators).
- **Calls Explorer** — full evidentiary ledger; one row = one scored call with provenance.
- **Compare** — head-to-head with synthesis-led commentary; 2-way free, 4-way Pro.
- **Dashboard** — "what changed since last visit," cockpit-led for returning users.
- **Pricing** — Free / Pro ($29/mo) / Team ($79/seat) with in-context upgrade modals.

### Tone (the locked direction)
**Editorial-terminal.** A serif headline voice (Source Serif 4 italic for emphasis) wrapped around dense, mono-typed data (JetBrains Mono with `tabular-nums`). Body in Inter Tight. The aesthetic is closer to the *Financial Times terminal* than to a SaaS dashboard. Surfaces are deep neutral black (`#0A0A0B` → `#1A1B1E` ramp), one ochre accent (`#C9A24B`), and four restrained semantic colors (pos olive, neg rose, warn rust, new steel-blue). No gradients except subtle radial vignettes; no shadows except modal/popover lift; no decorative imagery. **Hairlines (1px) carry layout.** Every datum points to a source.

### What it is NOT
- Not bro-y. No neon. No hype copy. No emoji.
- Not "AI-slop dashboard": no Inter-everything, no purple/blue gradients, no rounded-2xl cards-with-shadows pattern, no generic Lucide-icon-headers.
- Not opinionated about prices — it scores, it doesn't recommend.

### The one memorable thing
Every score, badge, and chip carries a **provenance square** — a 6–8px filled accent square that means "this is verified and one click from raw source." That square is the visual signature of the product.

### Design lock conflict (resolved)
A 2026-04-19 memory note locked a "B Terminal" direction (phosphor green + terminal red, gold retired). The newer prototypes (2026-04-23 → 04-25) are pre-B-Terminal: ochre-gold accent + olive/rose/rust/steel-blue semantics. **This spec follows the prototypes** because they are newer and were explicitly cited by the product owner as canonical. If product wants to revisit the B Terminal palette, every mention of `--accent` (#C9A24B) and the four semantic state colors becomes a single token swap; see §13 Open Question OQ-0.

---

## 2. Design Tokens

The token system is **dark-first** (light theme is deferred to a later phase per Phase 1 §05). Every semantic token references a `--ink-*` step, not a hex literal — a future light theme inverts the ramp without component rewrites.

### 2.1 CSS custom properties (canonical source of truth)

```css
:root {
  /* Surface ramp — dark first */
  --ink-000: #0A0A0B;  /* page background */
  --ink-050: #0E0F10;  /* card background */
  --ink-100: #141517;  /* elevated card / chip background */
  --ink-150: #1A1B1E;  /* drawer / modal surface */
  --ink-200: #22242A;  /* hairline default */
  --ink-250: #2B2D33;  /* hairline strong */
  --ink-300: #3A3D44;  /* hairline emphasized / muted border */
  --ink-400: #5B5F68;  /* tertiary text (LG scope only on ink-150) */
  --ink-500: #7A7F89;  /* secondary text — fails AA on ink-150 (use 600) */
  --ink-600: #9CA0A9;  /* body secondary, neutral values */
  --ink-700: #C2C5CC;  /* default body */
  --ink-800: #E1E3E7;  /* body emphasis */
  --ink-900: #F4F5F7;  /* headline */

  /* Accent — single ochre, editorial highlight only */
  --accent:     #C9A24B;
  --accent-dim: #8E7235;
  --accent-low: #3A2F17;

  /* Semantic state — four hues, never collapsed into accent */
  --pos:     #6FA56A;  /* positive α / long / win */
  --pos-dim: #3E5D3B;
  --neg:     #D47A70;  /* negative α / short / loss / invalidated  (raised from #C66C62 in P1 v0.2 for AA on ink-150) */
  --neg-dim: #6A3631;
  --warn:    #D97757;  /* dispute / horizon-drift / threshold breach (rust — H 22°, NOT collapsible into accent) */

  /* Specialty */
  --stale: #8A7A5E;    /* aged data — scoped to ink-000/050/100, NEVER ink-150 */
  --lock:  #8C8FA0;    /* premium-lock chrome */
  --new:   #7FA6C9;    /* new / forming / pending — steel-blue */
  --lown:  #A78C6B;    /* low-N / sparse-data flag */

  /* Typography stacks */
  --font-serif: "Source Serif 4", Georgia, serif;
  --font-sans:  "Inter Tight", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono:  "JetBrains Mono", ui-monospace, monospace;

  /* Layout */
  --row: 36px;                                   /* default table row height */
  --hair:        1px solid var(--ink-200);       /* default hairline */
  --hair-strong: 1px solid var(--ink-250);       /* section breaks */
  --hair-soft:   1px solid var(--ink-150);       /* inner dividers (e.g. table rows) */

  /* Z-index — single source for both raw CSS (use `z-index: var(--z-modal)`) and
     Tailwind utilities (use `z-modal`). Mirrors §2.4 + §2.6. */
  --z-page: 0;
  --z-content: 1;
  --z-sticky: 10;
  --z-masthead: 50;
  --z-drawer-overlay: 59;
  --z-drawer: 60;
  --z-sheet-overlay: 64;
  --z-sheet: 65;
  --z-popover-overlay: 69;
  --z-popover: 70;
  --z-tooltip-overlay: 74;
  --z-tooltip: 75;
  --z-modal-overlay: 99;
  --z-modal: 100;
  --z-toast: 110;
}
```

### 2.2 Body baseline

```css
html, body {
  background: var(--ink-000);
  color: var(--ink-700);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "tnum", "ss01"; /* tabular numerals always-on */
}

/* Ambient backdrop — sets editorial terminal tone */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 0%,   rgba(201,162,75,0.025) 0%, transparent 40%),
    radial-gradient(circle at 80% 100%, rgba(127,166,201,0.012) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}
::selection { background: var(--accent); color: var(--ink-000); }
```

### 2.3 WCAG AA contrast scoping rules

| Token | Surfaces it MAY appear on as text |
|-------|-----------------------------------|
| `--ink-400` | ink-000 / ink-050 / ink-100 only — **never on ink-150** (drawer). LG-only (≥18px regular or ≥14px bold). |
| `--ink-500` | ink-000 / ink-050 / ink-100 / ink-150 (LG on 150). For drawer body, promote to `--ink-600`. |
| `--ink-600+` | All four surfaces, AA at all sizes. |
| `--stale` | ink-000 / ink-050 / ink-100 only. On ink-150 use `--ink-500` text + stale dot. |
| All other state tokens (`--pos`, `--neg`, `--warn`, `--accent`, `--new`, `--lock`, `--lown`) | All four surfaces, AA. |

### 2.4 Tailwind config — full replacement

The current `tailwind.config.ts` brand palette (purple `#8b5cf6`, gold `#F7B731`, green `#26de81`, red `#fc5c65`, etc.) is **incompatible** with this design system and must be replaced wholesale:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // Replace default screens with our 3-rail system. Mobile-first, min-width only.
    // NOTE: this REPLACES (not extends) Tailwind's default sm/md/lg/xl/2xl breakpoints.
    // Any existing src/ code using `sm:` / `md:` / `lg:` / `xl:` / `2xl:` utilities will
    // stop working — that's expected because this is a scratch refactor (§12.9 step 1).
    // If you need to keep legacy utilities working during gradual migration, switch
    // `screens:` to `extend.screens:` and add the new tokens there instead.
    screens: {
      tab:  "768px",
      desk: "1280px",
    },
    extend: {
      colors: {
        ink: {
          0:   "#0A0A0B",
          50:  "#0E0F10",
          100: "#141517",
          150: "#1A1B1E",
          200: "#22242A",
          250: "#2B2D33",
          300: "#3A3D44",
          400: "#5B5F68",
          500: "#7A7F89",
          600: "#9CA0A9",
          700: "#C2C5CC",
          800: "#E1E3E7",
          900: "#F4F5F7",
        },
        accent: {
          DEFAULT: "#C9A24B",
          dim:     "#8E7235",
          low:     "#3A2F17",
        },
        pos:    { DEFAULT: "#6FA56A", dim: "#3E5D3B" },
        neg:    { DEFAULT: "#D47A70", dim: "#6A3631" },
        warn:   "#D97757",
        stale:  "#8A7A5E",
        lock:   "#8C8FA0",
        new:    "#7FA6C9",
        lown:   "#A78C6B",
      },
      // Reference the CSS variables wired by next/font (see §3.1) — stacks live in CSS.
      // This means utilities like `font-serif` resolve to var(--font-serif), not literals.
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans:  ["var(--font-sans)",  "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono:  ["var(--font-mono)",  "ui-monospace", "monospace"],
      },
      // Custom spacing rungs for surface paddings used in the spec.
      spacing: {
        "30": "120px",  // legacy `pb-30` shorthand for the 120px page bottom-padding
      },
      // Z-index scale per §10.3. Each dialog-class surface has paired overlay/content tokens
      // so the overlay ALWAYS sits directly below its content (and above all prior chrome).
      zIndex: {
        page:    "0",
        content: "1",
        sticky:  "10",
        masthead:        "50",
        "drawer-overlay":  "59",
        drawer:            "60",
        "sheet-overlay":   "64",
        sheet:             "65",
        "popover-overlay": "69",
        popover:           "70",
        "tooltip-overlay": "74",
        tooltip:           "75",
        "modal-overlay":   "99",
        modal:            "100",
        toast:            "110",
      },
      fontSize: {
        // Editorial display
        "h1":    ["44px", { lineHeight: "1.08", letterSpacing: "-0.02em", fontWeight: "400" }],
        "h2":    ["28px", { lineHeight: "1.20", letterSpacing: "-0.01em", fontWeight: "400" }],
        "h3":    ["24px", { lineHeight: "1.20", letterSpacing: "-0.015em", fontWeight: "400" }],
        "metric-hero": ["36px", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "500" }],
        "metric-card": ["32px", { lineHeight: "1", letterSpacing: "-0.02em", fontWeight: "500" }],
        // Body
        "body":  ["13px", { lineHeight: "1.5" }],
        "body-lg": ["15px", { lineHeight: "1.55" }],
        "lede":  ["16px", { lineHeight: "1.55" }],
        // Mono
        "mono-xs":  ["9px",  { letterSpacing: "0.1em" }],
        "mono-sm":  ["10px", { letterSpacing: "0.08em" }],
        "mono":     ["11px", { letterSpacing: "0.06em" }],
        "mono-lg":  ["12px", { letterSpacing: "0.04em" }],
        "mono-xl":  ["13px", { letterSpacing: "0.04em" }],
      },
      letterSpacing: {
        "kicker": "0.1em",
        "caps":   "0.08em",
        "tight":  "-0.015em",
      },
      borderColor: {
        hair:        "#22242A",
        "hair-strong": "#2B2D33",
        "hair-soft":   "#1A1B1E",
      },
      boxShadow: {
        modal:   "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,162,75,0.15)",
        popover: "0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,162,75,0.12)",
        tooltip: "0 8px 32px rgba(0,0,0,0.5)",
      },
      backdropBlur: {
        nav: "12px",
        bar: "6px",
      },
      animation: {
        "fresh-ring": "fresh-ring 2.4s ease-out infinite",
        "shimmer":    "shimmer 1.4s linear infinite",
      },
      keyframes: {
        "fresh-ring": {
          "0%":   { transform: "scale(0.6)", opacity: "0.6" },
          "100%": { transform: "scale(1.4)", opacity: "0" },
        },
        "shimmer": {
          "0%":   { backgroundPosition: "100% 0" },
          "100%": { backgroundPosition: "-100% 0" },
        },
      },
      maxWidth: {
        page: "1360px",
      },
    },
  },
  plugins: [],
};

export default config;
```

### 2.5 Spacing & layout primitives

| Token | Value | Use |
|-------|-------|-----|
| Page max-width | 1360px | All `<main>` containers |
| Page horizontal padding | 32px @desk · 24px @tab · 14px @phone | Outer gutter |
| Page top padding | 56px @desk · 48px @tab · 24px @phone | Below masthead |
| Section spacing | 96–120px between major sections (desktop) | `margin-bottom` on sections |
| Card padding | 20px 22px (dashboard cards), 14–18px (signal rows), 16px (modals/sheets) | |
| Hairline gap | 1px (use `gap: 1px; background: --ink-200`) | Common technique to render dividers between grid cells |
| Default row | 36px (var `--row`) | Table/list rows |
| Hit target | ≥44px on touch surfaces | All clickable mobile chrome |

### 2.6 Z-index scale

Mirrors `theme.zIndex` from §2.4 above. Use the Tailwind `z-{name}` utility, never raw numbers (no `z-[59]` literals — they bypass the scale and break later refactors).

```
page             0    page background, ambient gradient
content          1    main content
sticky           10   sticky chrome inside content (table head, compare bar)
masthead         50   global sticky masthead
drawer-overlay   59   dim backdrop for drawer (optional — drawer can render without it)
drawer           60   right-rail drawer (Score Explanation, Call detail)
sheet-overlay    64   dim backdrop for mobile bottom sheet
sheet            65   mobile bottom sheet (drawer/popover substitute)
popover-overlay  69   click-catcher for popover dismissal (transparent)
popover          70   metric popover, hovercard, command palette
tooltip-overlay  74   (rare — tooltip dismissal layer if needed)
tooltip          75   short chrome tooltip (.tip)
modal-overlay    99   dim backdrop for modal — always rendered, always above prior chrome
modal           100   upgrade modal content
toast           110   toast/alert notifications (when added)
```

**Hierarchy rules:**
- Each dialog-class surface (drawer / sheet / popover / modal) has a paired `*-overlay` token sitting **immediately below** its content. Overlay → content layering is consistent.
- Modal MUST always be above all other surface chrome including drawer. Modal overlay (z=99) sits above every non-toast layer.
- Tooltips render above masthead and drawer (z=75 > z=60).
- Sheet shares the same logical layer as drawer because they are mutually exclusive (sheet only renders on phone where drawer is replaced — see §11.6).
- Toast is the highest interactive layer (z=110).

### 2.7 Plan / gate / metric tokens (renderable placeholders)

These render in the UI as `.tok` chips (dashed `--new` border, mono 10px, curly braces auto-prepended via `::before`/`::after`). They MUST stay tokenized in copy until product confirms the value — never hard-coded.

| Token | Default value | Used in |
|-------|---------------|---------|
| `plan.pro.name` | "Pro" | hero · tier card · all upgrade modals · FAQ |
| `plan.pro.price.monthly` | $29 | tier card · modals · pricing hero |
| `plan.pro.price.annual` | $290 | tier annual-note · save badge |
| `plan.pro.trial` | 7 days | hero · trial pill · modals |
| `gate.watched.free` | 10 creators | Watch list · grid |
| `gate.watched.pro` | unlimited | Pro list · grid |
| `gate.saved.free` | 3 views | Watch list · grid · modal B |
| `gate.saved.pro` | unlimited | Pro list · grid |
| `gate.compare.free` | 2-way | Watch list · grid · modal C |
| `gate.compare.pro` | 4-way | Pro list · grid · modal C |
| `gate.signals.live.window` | <6h | Pro list · grid · modal A |
| `gate.signals.free.window` | >24h | Watch list |
| `gate.alerts.pro` | push · unlimited | Pro list · grid Push row |
| `gate.beta.column` | β-α visible | Pro list · grid |
| `metric.lowN.threshold` | 12 | score attenuated + popover low-n caveat fires below this. (Distinct from `LOW_N_BADGE = 20` which controls badge rendering only — see §5.1.2.) |
| `metric.dormancy.v_min` | 0.3 | velocity dormancy flag |
| `metric.fm.lead_threshold` | 2h | minimum lead time for the FM-rate metric (broader signal counted in α weighting). Distinct from the originator glyph's 6h threshold — see §6.13 Methodology §7. |
| `bp.phone` | 0–767 | breakpoint |
| `bp.tab` | 768–1279 | breakpoint |
| `bp.desk` | 1280+ | breakpoint |

```css
.tok {
  display: inline-flex; align-items: center; padding: 0 5px;
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.02em;
  color: var(--new); border: 1px dashed var(--new);
  background: rgba(127,166,201,0.06); border-radius: 2px; vertical-align: 1px;
}
.tok::before { content: "{"; color: var(--new); opacity: 0.6; padding-right: 1px; }
.tok::after  { content: "}"; color: var(--new); opacity: 0.6; padding-left: 1px;  }
```

---

## 3. Typography

### 3.1 Stacks
- **Display / editorial — Source Serif 4** (`<em>` italic carries the editorial accent).
- **Body / UI — Inter Tight** (300/400/500/600/700).
- **Numbers / kickers / chips / metadata — JetBrains Mono** (always with `tabular-nums`).

`@import` from Google Fonts via Next.js `<link rel="preconnect">` in the root layout, with weights:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;1,8..60,400&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet">
```

Via `next/font/google` in `src/app/layout.tsx` (preferred — avoids FOUT and `<link>` waterfall):

```tsx
// src/app/layout.tsx
import { Source_Serif_4, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400","500"], style: ["normal","italic"], variable: "--font-serif", display: "swap" });
const sans  = Inter_Tight({   subsets: ["latin"], weight: ["300","400","500","600","700"],          variable: "--font-sans",  display: "swap" });
const mono  = JetBrains_Mono({ subsets: ["latin"], weight: ["300","400","500","600"],                variable: "--font-mono",  display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans bg-ink-0 text-ink-700">{children}</body>
    </html>
  );
}
```

The three `variable` declarations register `--font-serif`, `--font-sans`, `--font-mono` on `<html>`. Tailwind's `fontFamily.serif/sans/mono` (§2.4) then references these CSS variables, so `font-serif` / `font-sans` / `font-mono` utilities resolve to the loaded `next/font` faces with their fallback chains.

### 3.2 Type scale (canonical desktop)

| Role | Family | Size / line / tracking | Notes |
|------|--------|------------------------|-------|
| Hero H1 | Serif 400 | 44/1.08 / -0.015em | One per surface; `<em>` italic-accent carries weight |
| Section H2 | Serif 400 | 28/1.20 / -0.01em | Section heads, drawer titles |
| Card / drawer H3 | Serif 400 | 24/1.20 / -0.015em | Synthesis band, section subheads |
| Profile metric (hero) | Serif 500 | 36/1.0 / -0.02em (italic where editorial) | Once per profile above-fold |
| Profile metric card | Serif 500 | 32/1.0 / -0.02em | 5-up grid on profile |
| Cockpit `.peg` | Serif 500 | 26/1.0 / -0.01em | Dashboard hero cells |
| Tier name in card | Serif 400 | 22/1.25 / -0.01em | Pricing tier name |
| Body lede | Serif italic 400 | 16/1.55 | Pricing hero sub |
| Body large | Inter 400 | 15/1.55 | Hero subhead |
| Body | Inter 400 | 13/1.5 | Default |
| Body small | Inter 400 | 12/1.5 | Card sub-text |
| Mono caption | Mono 400 | 11/1.4 / 0.06em / UPPERCASE | Chip values, qualifiers |
| Mono kicker | Mono 500 | 10/1.4 / 0.1em / UPPERCASE | Section kickers |
| Mono micro | Mono 400 | 9/1.4 / 0.1em / UPPERCASE | Cite chips, tier letters |

### 3.3 Editorial conventions

- Headlines use **one italic-accent phrase** per sentence. `<em class="text-accent italic">forming theses</em>`. Don't italicize multiple phrases in a single headline.
- Numbers (any context) use `font-variant-numeric: tabular-nums`. Always.
- Greek letters (α, β, Δ, ±, ≥) stay as typography, not icons.
- Curly quotes around thesis pull-quotes use `::before/::after` accent characters (see `.sig2 .bd .th` snippet in §5).
- Never abbreviate Alpha to bare "α" in primary use — the unit caption reads `"alpha · 90d"`.

---

## 4. Information Architecture

### 4.1 Sitemap & routes

```
/                                # Leaderboard (canonical home)
/creator/[handle]                # Creator profile (e.g. /creator/CryptoInsights)
/calls                           # Calls explorer + drawer
/signals                         # Signals home → /signals/active
/signals/active                  # Tab — forming/active theses
/signals/resolved                # Tab — historical resolved theses
/signals/by-asset                # Tab — clustered by asset
/signals/by-creator-cluster      # Tab — clustered by creator cluster
/signals/mine                    # Tab — signed-in only · subset to watchlist
/signals/[asset]-[direction]     # Thesis detail (e.g. /signals/sol-long)
/compare?c=@A,@B&w=30d&a=SOL     # Compare (deep-linkable, screenshot-friendly)
/dashboard                       # Signed-in only — empty/populated states
/pricing                         # Pricing & upgrade
/methodology                     # Score Explanation full-page (drawer-source-of-truth)
/login | /signup                 # Auth (not specified in prototypes; use existing flow)
```

### 4.2 §4 Surface job map (5-second test)

Each surface declares the primary job it leads with — anything above-fold MUST serve this job.

| Surface | §4 Primary job | §6 above-fold hierarchy slots |
|---------|---------------|-------------------------------|
| **Leaderboard** `/` | Identify best- and worst-performing creators at a glance | (1) what the product does · (2) who is winning/losing · (4) what is happening now |
| **Creator profile** `/creator/[handle]` | Understand why a creator ranks where they do; secondarily inspect calls | (3) why they rank · (5) what I can inspect deeper · (7) what I should do next |
| **Calls explorer** `/calls` | Inspect the evidence behind one scored call | (5) inspect · (2) winners/losers row-scoped · (4) open calls |
| **Signals** `/signals` | Detect fresh consensus signals across the universe | (4) what is happening now · (2) winners via contributing creators · (6) what I unlock if I pay |
| **Dashboard** `/dashboard` | Decide whether to follow / fade / ignore — change since last visit | (4) what's new on watchlist · (7) alert inbox · (2) my movers |
| **Pricing/upgrade** `/pricing` + inline | Convert — feel value of paying without friction | (6) what I unlock · (5) the locked preview · (7) one-click upgrade |
| **Compare** `/compare` | Side-by-side synthesis — name the difference, don't show it | synthesis-band first · evidence below |

### 4.3 Top navigation (canonical)

```
CryptoTubers Ranked     |   Leaderboard · Signals · Calls · Compare · Dashboard   |   ⌘K  ·  Sign in / @user
[serif italic accent]                  [mono 11px caps · accent active border]              [mono kbd hint] · [accent CTA or signed-in text]
```

Active link: `border-bottom: 1px solid var(--accent); color: var(--ink-900)`. Inactive: `color: var(--ink-500)`.

Sub-nav patterns (per surface):
- Signals: tabs `Active · 14`, `Resolved · 86`, `By asset`, `By creator cluster`, `Mine` + filter button row.
- Profile: tabs (timeframe + breakdown) sync; window default 90d.
- Compare: state tab `2-way · free` | `4-way · Pro`.

### 4.4 Drawer vs full page decision

| Pattern | Use when |
|---------|----------|
| **Drawer** (540px right rail, sticky-top header) | Score explanation, call detail, thesis quick-look, when context (list, profile) MUST stay visible. Closes on `Esc` or click outside; focus returns to origin. |
| **Full page** | Compare, Pricing, Methodology, Profile detail. When the user committed to a deep-dive. |
| **Bottom sheet** (mobile-only) | Mobile substitution for drawer + popover. Max 70vh. |
| **Modal** | Upgrade flows ONLY (anchored to user intent, never interstitial). |
| **Tooltip** (D5 popover, 360px) | Metric definitions on hover/focus. Ephemeral. |

### 4.5 Auth states

| State | Surfaces visible | Notes |
|-------|------------------|-------|
| Signed-out | Leaderboard, Signals (>24h delay), Profile, Calls (limited), Pricing | `.signin` accent button in masthead |
| Signed-in (free) | + Dashboard, watchlist (≤10), saved views (≤3), email alerts | `signed in · @user` in masthead |
| Signed-in (Pro) | + Live Signals (<6h), 4-way Compare, push alerts, β-α column, unlimited watch/views | Pro chrome in dashboard footer |
| Signed-in (Team) | + shared watchlists, weekly memo, retraction digest, SSO, CSV/API | Team admin chrome (out of scope this phase) |

---

## 5. Component Library

Components are organized: **Primitives** → **Composites** → **Templates**. Every primitive is canonical; every composite uses primitives.

### 5.1 Primitives

#### 5.1.1 `<AlphaScore>` — the canonical product metric
**Anatomy:** figure (serif tabular-num) + unit caption (mono `"alpha · <window>"`) + 2px peer-rail bar beneath (fill = absolute score; tick = peer-tier median). Entire chip is the click target → opens Score Explanation drawer.

**Variants:**
- `Hero` — 36px serif, once per profile above-fold.
- `Inline` — 15px mono + 32px bar; used in every leaderboard row, compare row, calls list.
- `Low-confidence` — opacity .6 + dotted underline `--lown` (never hidden).
- `Stale` — opacity .7, stale-color text, faded bar.

**Data contract (unified — the React skeleton below conforms exactly):**

```ts
// src/lib/types.ts — exported for component consumers

export type AlphaWindow = '7d' | '30d' | '90d' | 'YTD' | 'All';
export type AlphaVariant = 'hero' | 'inline' | 'low-conf' | 'stale';
export type RankTier = 'S' | 'A' | 'B' | 'C' | 'F';   // creator score tier (NOT subscription tier)
export type Confidence = 'solid' | 'low' | 'v-low';

export interface AlphaScoreProps {
  score: number;             // signed log-return α, raw value (e.g. 8.42, -1.86)
  window: AlphaWindow;
  N: number;                 // tier-weighted sample size
  peerMedian: number;        // peer-tier median in score-space (NOT 0–100 percentile)
  peerScale: { min: number; max: number };  // axis bounds for the bar (e.g. {min:-10, max:+15})
  tier: RankTier;            // S/A/B/C/F creator rank tier
  confidence: Confidence;    // derived from N: ≥20 solid · 12–19 low · <12 v-low
  stale?: { ageHours: number };  // present implies the data is older than the freshness ladder allows
  variant?: AlphaVariant;    // optional override; otherwise derived: stale wins, then low-conf, then inline
  onOpenDrawer?: () => void; // opens Score Explanation drawer
}
```

**Naming note (avoids type collision).** The repo's existing `Tier = 'free' | 'pro' | 'elite'` is the **subscription tier** used by auth/billing code. The creator score tier is a different domain concept (S/A/B/C/F bucket from rank score), so we use **`RankTier`** for it. Both types coexist; never reuse `Tier` for the score concept.

All 4 type aliases (`AlphaWindow`, `AlphaVariant`, `RankTier`, `Confidence`) are `export`ed so the component, its tests, and adjacent composites import them by name.

The `peerMedian` is in the same units as `score` (signed α), not a 0–100 percentile. The bar's fill width is computed from `score` mapped to `peerScale` (clamped 0–100%); the peer tick is similarly mapped. This is the ONE source of truth — variant choice doesn't change the contract.

**CSS (verbatim from prototype):**
```css
.alpha { display:inline-flex; align-items:baseline; gap:10px; font-family:var(--font-serif); color:var(--ink-900); position:relative; }
.alpha-num { font-size:36px; font-weight:500; line-height:1; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.alpha-unit { font-family:var(--font-mono); font-size:10px; color:var(--ink-500); text-transform:uppercase; letter-spacing:.12em; padding-top:4px; }
.alpha-bar { position:absolute; left:0; bottom:-8px; height:2px; width:100%; background:var(--ink-200); }
.alpha-bar::before { content:""; position:absolute; left:0; top:0; bottom:0; background:var(--accent); width:var(--alpha-fill,85%); }
.alpha-bar .tick.peer { left:62%; background:var(--ink-500); position:absolute; top:-3px; width:1px; height:8px; }

.alpha-inline { display:inline-flex; align-items:baseline; gap:6px; }
.alpha-inline .n { font-family:var(--font-mono); font-size:15px; color:var(--ink-900); font-weight:500; font-variant-numeric:tabular-nums; }
.alpha-inline .bar { display:inline-block; height:2px; width:32px; background:var(--ink-300); position:relative; vertical-align:middle; margin-left:4px; }
.alpha-inline .bar::before { content:""; position:absolute; left:0; top:0; bottom:0; background:var(--accent); width:var(--fill,70%); }
.alpha-inline.low .n { opacity:.6; border-bottom:1px dotted var(--lown); }
```

**React skeleton (full — all 4 variants):**
```tsx
"use client";
import { clsx } from "clsx";
import type { AlphaScoreProps, AlphaVariant } from "@/lib/types";

// Sign-aware formatting: +8.4 / 0.0 / -1.9. One decimal place across all variants.
function fmtScore(n: number): string {
  if (n === 0) return "0.0";
  return (n > 0 ? "+" : "") + n.toFixed(1);
}

// Map a score-space value to a 0–100 percent within peerScale, clamped.
function mapToPct(value: number, scale: { min: number; max: number }): number {
  const range = scale.max - scale.min;
  if (range <= 0) return 50;
  return Math.max(0, Math.min(100, ((value - scale.min) / range) * 100));
}

export function AlphaScore({
  score, window, N, peerMedian, peerScale,
  tier, confidence, stale, variant, onOpenDrawer,
}: AlphaScoreProps) {
  // Variant resolution: explicit `variant` wins. Otherwise: stale > low-conf > inline.
  // Hero is never auto-derived — callers opt in (used once per profile above-fold).
  const isStale = !!stale;
  const v: AlphaVariant =
    variant ??
    (isStale ? "stale" : confidence !== "solid" ? "low-conf" : "inline");

  // Dev-only assertion — catches "variant=stale without stale data" early in dev,
  // tree-shaken from production via the NODE_ENV check.
  if (process.env.NODE_ENV !== "production" && variant === "stale" && !stale) {
    console.warn("[AlphaScore] variant=\"stale\" passed without `stale` prop — falling back to inline. Pass stale={{ageHours: N}} or omit variant.");
  }

  const fillPct = mapToPct(score, peerScale);
  const peerPct = mapToPct(peerMedian, peerScale);
  const label = `Alpha score ${fmtScore(score)} on ${window} window, sample size ${N}, tier ${tier}. Open score explanation.`;

  // Hero — once per profile above-fold.
  if (v === "hero") {
    return (
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label={label}
        className="font-serif text-ink-900 inline-flex items-baseline gap-2.5 relative focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
      >
        <span className="text-[36px] font-medium leading-none tracking-[-0.02em] tabular-nums">{fmtScore(score)}</span>
        <span className="font-mono text-[10px] text-ink-500 uppercase tracking-[0.12em] pt-1">alpha · {window}</span>
        <span className="absolute left-0 -bottom-2 h-0.5 w-full bg-ink-200">
          <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${fillPct}%` }} />
          <span className="absolute -top-1 w-px h-2 bg-ink-500" style={{ left: `${peerPct}%` }} />
        </span>
      </button>
    );
  }

  // Stale — timestamp-led, faded bar, refresh affordance.
  // If a caller forces variant="stale" without `stale` data, we DON'T fabricate a "stale · 0h"
  // label (lying to the user). Fall through to the inline variant; dev gets a console.warn.
  if (v === "stale" && stale) {
    return (
      <button type="button" onClick={onOpenDrawer} aria-label={label}
        className="inline-flex items-baseline gap-1.5 opacity-70">
        <span className="font-mono text-[15px] text-stale font-medium tabular-nums">{fmtScore(score)}</span>
        <span className="font-mono text-[9px] text-stale uppercase tracking-[0.06em]">stale · {stale.ageHours}h</span>
        <span className="inline-block h-0.5 w-8 bg-ink-300 ml-1 relative align-middle">
          <span className="absolute inset-y-0 left-0 bg-stale opacity-50" style={{ width: `${fillPct}%` }} />
        </span>
      </button>
    );
  }

  // Low-confidence — score attenuated with dotted lown underline. Never hidden.
  if (v === "low-conf") {
    return (
      <button type="button" onClick={onOpenDrawer} aria-label={label}
        className="inline-flex items-baseline gap-1.5">
        <span className="font-mono text-[15px] text-ink-900 font-medium tabular-nums opacity-60 border-b border-dotted border-lown">{fmtScore(score)}</span>
        <span className="font-mono text-[10px] text-lown uppercase tracking-[0.06em]">low N · {N}</span>
      </button>
    );
  }

  // Inline (default) — every leaderboard row, calls list, compare row.
  return (
    <button type="button" onClick={onOpenDrawer} aria-label={label}
      className="inline-flex items-baseline gap-1.5 group">
      <span className={clsx(
        "font-mono text-[15px] font-medium tabular-nums",
        score > 0 ? "text-pos" : score < 0 ? "text-neg" : "text-ink-900"
      )}>{fmtScore(score)}</span>
      <span className="inline-block h-0.5 w-8 bg-ink-300 relative align-middle">
        <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${fillPct}%` }} />
        <span className="absolute -top-1 w-px h-2 bg-ink-500" style={{ left: `${peerPct}%` }} />
      </span>
    </button>
  );
}
```

Notes for the implementer:
- `clsx` is added in §12.4 deps. If you prefer hand-roll, swap for `[a, b].filter(Boolean).join(" ")`.
- The button is the click target for the drawer (keyboard `w` shortcut on profile is wired separately at the page level).
- Sign color (`text-pos`/`text-neg`) on inline only — hero uses neutral `--ink-900` for editorial restraint per §1.

**A11y:** entire chip is a focusable button. Aria-label reads "Alpha score N, window W". Keyboard `w` (profile context) opens drawer.

#### 5.1.2 `<ConfidenceBar>` & `<LowNBadge>`
**Anatomy:** `.conf` chip (dot + label) + `.conf-bar` (5-segment bar, 4×10px segments, 2px gap). Co-located with score.

**Thresholds — TWO real numbers, two different jobs.** Don't conflate them.

| Constant | Value | What it controls |
|---|---|---|
| **`LOW_N_BADGE`** | 20 | The threshold below which the "low N" badge **renders next to the score**. Visual flag only — the score is still ranked at full weight. |
| **`metric.lowN.threshold`** | 12 | The threshold below which the score is **visually attenuated** (opacity .6 + dotted `--lown` underline) and the `low-n` caveat fires inside the metric popover. This is the token that gets exposed in the design tokens (§2.7) and read by `MetricSpec.caveat`. |

**Resulting state matrix:**

| N range | Badge | Score rendering | Ranked? |
|---|---|---|---|
| `N ≥ 20` | none | solid (5/5 segments lit accent) | yes, full weight |
| `12 ≤ N < 20` | "Low N · {N}" badge | full color + opacity | yes, full weight |
| `3 ≤ N < 12` | "Low N · {N}" badge | attenuated (opacity .6 + dotted `--lown` underline) + popover caveat | yes, but treat as low-confidence |
| `N < 3` | "Unscoreable" badge | em-dash with tooltip "Insufficient sample" | **no** — profile visible, no rank |

**Why two thresholds.** `LOW_N_BADGE` is a *visibility* flag (warn the user); `metric.lowN.threshold` is a *quality* flag (de-emphasize the number). A creator with 17 calls is "low N" but the score is solid enough to read at face value; a creator with 8 calls needs the score visually quieted. Different jobs, different numbers.

**Copy:** `"Low N · 8"` declarative — never "Limited data available." Tooltip: `"95% CI ±8.2 · N=8 · 90d window."`

```css
.conf { display:inline-flex; align-items:center; gap:6px; padding:2px 6px; border:1px solid var(--lown); background:rgba(167,140,107,.08); color:var(--lown); font-family:var(--font-mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; border-radius:2px; }
.conf.solid { color:var(--ink-900); border-color:var(--ink-300); background:var(--ink-100); }
.conf .dot { width:5px; height:5px; border-radius:50%; background:currentColor; }

.conf-bar { display:inline-grid; grid-template-columns:repeat(5,4px); gap:2px; vertical-align:middle; }
.conf-bar span { height:10px; background:var(--ink-300); }
.conf-bar span.on { background:var(--accent); }
.conf-bar.low span.on { background:var(--lown); }
.conf-bar.v-low span.on { background:var(--lown); opacity:.5; }
```

#### 5.1.3 `<Provenance>` — first-class trust primitive
Every score, rank, call, and signal carries one. Three scales: `Full`, `Inline`, `Cell`.

**Anatomy:**
- Full: `[8px filled accent square][source name][timestamp][archive link]`, 2px accent left-border.
- Inline: 6px filled accent square + "Source: <link>" + tier annotation.
- Cell: 6px square + platform code + clip timestamp; hover reveals full.

**Missing source:** square outlined (not filled) + `<span class="bg warn">Unverified</span>`. Never silently omitted.

**Data contract:**
```ts
interface ProvenanceProps {
  source: { platform: 'YT' | 'X' | 'SS' | 'Pod'; handle: string; url: string; clipTs?: string };
  capturedAt: string;       // ISO datetime
  archiveUrl?: string;
  sha?: string;
  verified: boolean;
  scale?: 'full' | 'inline' | 'cell';
}
```

```css
.prov { display:inline-flex; align-items:center; gap:8px; padding:4px 8px; border-left:2px solid var(--accent); background:var(--ink-100); font-family:var(--font-mono); font-size:10px; color:var(--ink-600); letter-spacing:.04em; }
.prov .sym { width:8px; height:8px; border:1px solid var(--accent); position:relative; flex-shrink:0; }
.prov .sym::after { content:""; position:absolute; left:1px; top:1px; right:1px; bottom:1px; background:var(--accent); }
.prov .src { color:var(--ink-800); font-weight:500; }
.prov .arch { color:var(--accent); text-decoration:underline dotted; cursor:pointer; }

.prov-inline::before { content:""; width:6px; height:6px; border:1px solid var(--accent); background:var(--accent); display:inline-block; position:relative; top:1px; margin-right:3px; }
td.cell-prov::before { content:""; width:6px; height:6px; border:1px solid var(--accent); background:var(--accent); display:inline-block; margin-right:5px; vertical-align:-1px; }
```

#### 5.1.4 `<SignalFreshness>`
Age-first, magnitude-second. §9 freshness-vs-noise resolution: quiet when stable; ringed when <24h.

**Three states:**
- `Hot` (<24h): `--accent` pulse + concentric ring animation `fresh-ring 2.4s ease-out infinite`. **Only one signal can be "hot" visually** at a time — others de-escalate oldest-first.
- `Fresh` (24–72h): static dot in `--new`, no animation.
- `Stale` (>72h): `--stale` color, label prefixed "stale".

**Copy rules:**
- Relative + absolute, ALWAYS paired: `"4h ago · 2026-04-24 10:12 UTC"`.
- Verbs only: detected · forming · consensus · fading · invalidated. Never "strong/weak" (that's confidence).

```css
.fresh { display:inline-flex; align-items:center; gap:8px; font-family:var(--font-mono); font-size:10px; color:var(--ink-600); }
.fresh .pulse { width:7px; height:7px; border-radius:50%; background:var(--new); position:relative; }
.fresh.hot .pulse { background:var(--accent); }
.fresh.hot .pulse::after { content:""; position:absolute; inset:-4px; border:1px solid var(--accent); border-radius:50%; opacity:.4; animation:fresh-ring 2.4s ease-out infinite; }
@keyframes fresh-ring { 0%{transform:scale(.6); opacity:.6} 100%{transform:scale(1.4); opacity:0} }
.fresh.stale .pulse { background:var(--stale); }
.fresh.stale .age { color:var(--stale); }
```

#### 5.1.5 `<PremiumPreviewLock>` — preview-with-lock, never a wall
Real data renders behind 4–6px blur (never a solid placeholder — user MUST see something real is there). Lock chip at top of veil so it's visible without scroll. Copy is intent-anchored.

**Anatomy:**
- `.preview-lock` container with `.blurred` (real data) + `.veil` (gradient overlay flexbox) bottom-aligned with: lock chip → headline → paragraph → button row.

**Six conversion moments — each is a callsite that uses this primitive with intent-anchored copy. There is NO separate §16 in this doc; the moments are listed once here and referenced by name from the relevant screen specs:**
1. **`history-tail`** — Profile recent-calls list tail blurred past 30-day mark (free history limit).
2. **`alerts-push`** — Profile right-rail Alerts: push types disabled in toggles; "Follow" stays free.
3. **`compare-3rd-column`** — Leaderboard 3rd row checkbox on free → lock chip on Compare bar; Compare 3rd column on free shows the locked column with synthesis preview.
4. **`export`** — Calls Explorer Export button + advanced filter chips visible-but-disabled.
5. **`signals-live`** — Signals page rows newer than `gate.signals.free.window` are blurred with ring affordance + Pro CTA.
6. **`dashboard-curated`** — Dashboard "Saved views" 4th slot locked with dashed `--new` border; curated-list modules previewed with blur.

```css
.preview-lock { position:relative; border:var(--hair); background:var(--ink-100); padding:16px; overflow:hidden; }
.preview-lock .blurred { filter:blur(4px); opacity:.5; pointer-events:none; user-select:none; }
.preview-lock .veil { position:absolute; inset:0; background:linear-gradient(180deg, transparent 0%, rgba(14,15,16,.85) 60%, var(--ink-050) 100%); display:flex; flex-direction:column; justify-content:flex-end; padding:20px; gap:8px; }

.lock { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border:1px solid var(--ink-300); background:var(--ink-100); color:var(--lock); font-family:var(--font-mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; border-radius:2px; }
.lock.cta { border-color:var(--accent-dim); background:rgba(201,162,75,.08); color:var(--accent); }
```

#### 5.1.6 `<Badge>` (`.bg`) — atomic state chip
Inline-flex, mono 10px caps, gap 4px, padding 2px 6px, hairline border, radius 2px. Variants: `lown`, `lock`, `stale`, `new`, `pos`, `neg`, `warn`, `acc`. Includes optional `.dot` (5×5 currentColor circle).

```css
.bg { display:inline-flex; align-items:center; gap:4px; padding:2px 6px; font-family:var(--font-mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; border:1px solid var(--ink-250); border-radius:2px; color:var(--ink-800); background:var(--ink-100); }
.bg .dot { width:5px; height:5px; border-radius:50%; background:currentColor; }
.bg.lown  { color:var(--lown);  border-color:var(--lown);  background:rgba(167,140,107,.08); }
.bg.lock  { color:var(--lock);  border-color:var(--ink-300); }
.bg.stale { color:var(--stale); border-color:var(--stale); background:rgba(138,122,94,.08); }
.bg.new   { color:var(--new);   border-color:var(--new);   background:rgba(127,166,201,.08); }
.bg.pos   { color:var(--pos);   border-color:var(--pos-dim); background:rgba(111,165,106,.08); }
.bg.neg   { color:var(--neg);   border-color:var(--neg-dim); background:rgba(212,122,112,.08); }
.bg.warn  { color:var(--warn);  border-color:var(--warn);  background:rgba(217,119,87,.08); }
.bg.acc   { color:var(--accent); border-color:var(--accent-dim); background:rgba(201,162,75,.08); }
```

#### 5.1.7 `<RankTierBadge>` — creator score tier chip (S/A/B/C/F)
9px mono caps, padding 1px 5px, 1px border, 2px radius. Tier S = accent; A = ink-800/ink-100; B = ink-600; C = ink-500; F = neg. **Tier cuts (assumed):** S ≥ 80, A 65–79, B 50–64, C 30–49, F < 30 — must be re-anchored after 90 days of real data.

**Naming.** Component file is `components/primitives/RankTierBadge.tsx`. The CSS class stays `.tier` for backward-compat with prototype CSS (no class collision risk — there's no other `.tier` in the system). The prop type is `RankTier` (§5.1.1) — never `Tier` (which is the auth subscription tier).

#### 5.1.8 `<DirChip>` — bullish/bearish on signals
`.dir-chip.b` long (--pos), `.dir-chip.r` short (--neg). Same atomic anatomy as Badge.

#### 5.1.9 `<Originator>` — first-mover glyph
±6h before consensus = originator. Three forms: `.orig` pill, `.orig.mini` 14×14 circle (used in voices stack), `.orig-on-av` corner-badge on avatar.

```css
.orig { display:inline-flex; align-items:center; gap:3px; font-family:var(--font-mono); font-size:9px; color:var(--accent); letter-spacing:.06em; text-transform:uppercase; padding:1px 4px; border:1px solid var(--accent-dim); background:rgba(201,162,75,.1); border-radius:2px; }
.orig .gl { display:inline-block; width:7px; height:7px; position:relative; }
.orig .gl::before { content:""; position:absolute; inset:0; background:var(--accent); clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%); }
.orig-on-av { position:absolute; top:-3px; right:-3px; width:10px; height:10px; background:var(--accent); border-radius:50%; border:1.5px solid var(--ink-050); display:flex; align-items:center; justify-content:center; }
.orig-on-av::after { content:""; width:4px; height:4px; background:var(--ink-000); clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%); }
```

> **By design, two thresholds.** The Originator glyph fires at **±6h+** before consensus (high-confidence "they called it first" badge). The FM-rate metric counts **±2h+** leads (broader signal used in α weighting). Every originator is an FM; not every FM is an originator. See §6.13 Methodology §7.

#### 5.1.10 `<Rank>` (`.rk`) — rank primitive with CI annotation
Resolves CF-B tension (drawer says rank ±1 within CI, label says "Top performer"). Decision: tier-named labels + CI micro-annotation.

```css
.rk { display:inline-flex; align-items:baseline; gap:6px; font-family:var(--font-serif); line-height:1; }
.rk .n { font-size:20px; color:var(--ink-900); font-weight:500; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
.rk .ci { font-family:var(--font-mono); font-size:9px; color:var(--ink-500); letter-spacing:.04em; text-transform:uppercase; padding-left:6px; border-left:1px solid var(--ink-300); margin-left:2px; }
.rk.sm .n { font-size:14px; }
.rk.xs .n { font-size:11px; font-family:var(--font-mono); }
.tierlbl { font-family:var(--font-mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); }
.tierlbl b { color:var(--ink-900); font-weight:500; }
```

Renders as: `Tier S · 01 ±1 within CI`.

#### 5.1.11 Form controls

```css
/* Search bar */
.search { display:flex; align-items:center; gap:8px; padding:5px 10px; background:var(--ink-100); border:var(--hair); min-width:240px; font-family:var(--font-mono); font-size:11px; color:var(--ink-500); }
.search .kbd { font-family:var(--font-mono); font-size:9px; padding:1px 4px; border:1px solid var(--ink-300); border-radius:2px; color:var(--ink-600); }

/* Filter chip */
.fchip { display:inline-flex; align-items:center; gap:5px; padding:4px 8px; border:var(--hair); background:var(--ink-100); color:var(--ink-700); text-transform:uppercase; letter-spacing:.06em; font-size:10px; font-family:var(--font-mono); }
.fchip b { color:var(--ink-900); font-weight:500; }
.fchip.active { border-color:var(--accent-dim); background:rgba(201,162,75,.08); color:var(--accent); }

/* Timeframe segmented control */
.timeframe { display:flex; background:var(--ink-100); border:var(--hair); }
.timeframe button { padding:5px 10px; font-family:var(--font-mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-500); border-right:var(--hair); }
.timeframe button.on { color:var(--ink-000); background:var(--accent); }

/* Density toggle (Compact / Comfortable / Relaxed; default Comfortable) */
.density button.on { color:var(--ink-900); background:var(--ink-150); }

/* Buttons */
.btn { font-family:var(--font-mono); font-size:10px; letter-spacing:.08em; text-transform:uppercase; padding:7px 12px; border:1px solid var(--ink-250); background:transparent; color:var(--ink-700); }
.btn:hover { border-color:var(--ink-400); color:var(--ink-900); background:var(--ink-100); }
.btn.p { border-color:var(--accent); background:rgba(201,162,75,.1); color:var(--accent); }
.btn.p:hover { background:var(--accent); color:var(--ink-000); }

/* Keyboard hint */
.kbd { font-family:var(--font-mono); font-size:10px; padding:1px 5px; border:1px solid var(--ink-300); border-radius:2px; color:var(--ink-700); background:var(--ink-100); }
```

### 5.2 Composites

#### 5.2.1 `<EvidenceStrip>` (`.estrip2`) — grouped 8-pip trust strip
8 pips in 4 groups (SRC / N / CN / TM × 2 each) with category labels and right-side `.txt` summary.

**Variants:** 8/8 full · 6/8 warm · 3/8 low · 1/8 invalid (red border).

```css
.estrip2 { display:inline-flex; align-items:center; gap:0; font-family:var(--font-mono); font-size:9px; letter-spacing:.04em; color:var(--ink-500); padding:4px 8px; background:var(--ink-100); border:1px solid var(--ink-250); border-radius:2px; line-height:1; }
.estrip2 .lbl { color:var(--accent); padding-right:6px; text-transform:uppercase; letter-spacing:.06em; font-weight:500; font-size:9px; }
.estrip2 .grp { display:inline-flex; align-items:center; gap:2px; padding-right:6px; margin-right:6px; border-right:1px solid var(--ink-300); position:relative; }
.estrip2 .grp:last-of-type { border-right:none; margin-right:0; padding-right:0; }
.estrip2 .grp .gi { font-size:8px; color:var(--ink-500); letter-spacing:.1em; padding-right:3px; opacity:.7; }
.estrip2 .pip { display:inline-block; width:3px; height:8px; background:var(--ink-300); }
.estrip2 .pip.on { background:var(--accent); }
.estrip2 .pip.on.pass { background:var(--pos); }
.estrip2 .txt { padding-left:8px; border-left:1px solid var(--ink-300); margin-left:4px; color:var(--ink-700); }
.estrip2 .txt b { color:var(--ink-900); font-weight:500; }
.estrip2 .txt .miss { color:var(--warn); }
```

> Pip-miss rule: Any pip not lit MUST be named in the pip-miss-note (`color: var(--warn)`). Never silently dropped.

#### 5.2.2 `<LeaderboardTable>`
Columns: `[checkbox][rank][creator][alpha][30d Δ][win %][N][trend][tier][provenance][last call]`. Row height `var(--row)` (36px). Headers sticky-top `var(--ink-050)` background.

**Sub-cells:**
- `.rank` mono 11px tabular, 48px wide. `.rank-1` gets accent + serif italic 14px treatment.
- `.rank .mvr` movement label (`+2`/`−1`/`new`); 9px, `--pos` default, `--neg` for `.dn`.
- `.creator` 22×22 avatar circle + handle (12px ink-900) + platform/followers (10px ink-500). Verified label = serif italic accent 9px caps.
- `.delta.pos` / `.delta.neg` / `.delta.neutral`.
- `.trend` 70×20 SVG polyline (1.2 stroke); accent-tier fill = `#6FA56A` pos / `#9CA0A9` neutral / `#D47A70` neg.
- `.last` 10px ink-500; `--new` color when fresh (e.g. "14m ago").
- `.chk-box` 14×14; `.on` adds accent fill + check mark via `::after rotate(45deg)`.

**Row interactions:**
- Hover: `background: var(--ink-050); cursor: pointer; transition: background 80ms`.
- Selected: `background: rgba(201,162,75,.04); box-shadow: inset 2px 0 0 var(--accent)`.
- Active sort header: `background: var(--ink-050); color: accent` + `↓` arrow appended via `::after`.

```css
.lb-table { width:100%; border-collapse:separate; border-spacing:0; font-family:var(--font-mono); font-size:12px; }
.lb-table thead th { position:sticky; top:0; background:var(--ink-050); text-align:left; font-weight:400; font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-500); padding:10px 12px; border-bottom:var(--hair-strong); white-space:nowrap; user-select:none; cursor:pointer; }
/* Row hairlines live on the cells, not on tr — `border-collapse: separate` ignores tr borders.
   Apply `border-bottom: var(--hair-soft)` to every td in the row instead. */
.lb-table tbody tr { height:var(--row); transition:background 80ms; }
.lb-table tbody td { border-bottom:var(--hair-soft); padding:8px 12px; }
.lb-table tbody tr:hover { background:var(--ink-050); cursor:pointer; }
.lb-table tbody tr.selected { background:rgba(201,162,75,.04); box-shadow:inset 2px 0 0 var(--accent); }
tr.rank-1 td.rank { color:var(--accent); font-weight:500; font-family:var(--font-serif); font-size:14px; font-style:italic; }
```

#### 5.2.3 `<SkeletonRow>` — loading state
Mirrors final layout grid (no reflow on arrival). Shimmer animation `shimmer 1.4s linear infinite`.

```css
.sk { height:var(--row); padding:8px 12px; display:grid; grid-template-columns:48px 220px 1fr 80px 80px 50px 80px 80px 68px; gap:12px; align-items:center; border-bottom:var(--hair-soft); }
.sk span { height:10px; background:linear-gradient(90deg, var(--ink-200), var(--ink-150), var(--ink-200)); background-size:200% 100%; animation:shimmer 1.4s infinite linear; }
.sk span.sm { height:8px; }
@keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
```

#### 5.2.4 `<ConsensusSnapshotRail>` — Leaderboard right rail
`.csignal` cards: asset+direction chip+age, confidence row (% accent + "X creators"), 18px avatar stack (-4px overlap), sparkline. Live indicator: `--pos` dot pulse with `box-shadow: 0 0 0 2px rgba(111,165,106,.2)`.

#### 5.2.5 `<CompareBar>` — sticky bottom action bar
Position: absolute / left:0 / right:320px (matches rail width) / bottom:0. Backdrop blur 6px. Grid `auto 1fr auto`: count chip + selected creator chips + Clear/Open buttons. Free max 2; Paid max 4. 3rd selection on free triggers the `compare-3rd-column` lock CTA (§5.1.5).

```css
.cmp-bar { position:absolute; left:0; right:320px; bottom:0; padding:12px 20px; border-top:var(--hair-strong); background:rgba(14,15,16,.96); backdrop-filter:blur(6px); display:grid; grid-template-columns:auto 1fr auto; gap:16px; align-items:center; font-family:var(--font-mono); font-size:11px; }
.cmp-bar .chips .cp { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border:1px solid var(--accent-dim); background:rgba(201,162,75,.08); color:var(--ink-900); font-size:10px; border-radius:2px; }
```

#### 5.2.6 `<MetricCard>` — Profile 5-up grid
Key (mono caps with `?` help), value (32px serif italic 500), peer-relative bar (3px with `--fill` and `--peer` ticks), sub-row (mono 10px with explain link / confidence chip).

**5 metrics on profile:** Alpha · 90d, Win rate, Self-correction, Avg α / call, Best call.

```css
.prof-metrics { display:grid; grid-template-columns:repeat(5,1fr); gap:1px; background:var(--ink-200); border-bottom:var(--hair-strong); }
.metric { background:var(--ink-000); padding:20px 24px; display:flex; flex-direction:column; gap:6px; }
.metric .mk { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-500); display:flex; justify-content:space-between; align-items:center; }
.metric .mv { font-family:var(--font-serif); font-size:32px; line-height:1; letter-spacing:-.02em; color:var(--ink-900); font-weight:500; font-variant-numeric:tabular-nums; }
.metric .mv.low-conf { opacity:.6; border-bottom:1px dotted var(--lown); padding-bottom:2px; display:inline-block; }
.metric .mbar { height:3px; background:var(--ink-200); position:relative; margin-top:4px; }
.metric .mbar::before { content:""; position:absolute; left:0; top:0; bottom:0; background:var(--accent); width:var(--fill,60%); }
.metric .mbar .peer { position:absolute; top:-2px; width:1px; height:7px; background:var(--ink-500); left:var(--peer,50%); }
```

#### 5.2.7 `<BestCallCard>` (v0.2 disambiguated)
**Rule:** Accent is editorial highlight only; figure obeys P/L semantic (`--pos` for positive, `--neg` for negative). v0.1 had ambiguous accent-on-figure — banned.

```css
.best-card.new .bk-editorial { display:inline-flex; align-items:center; gap:5px; padding:2px 6px; font-family:var(--font-mono); font-size:9px; color:var(--accent); border:1px solid var(--accent-dim); background:rgba(201,162,75,.08); letter-spacing:.08em; text-transform:uppercase; font-weight:500; }
.best-card.new .bk-editorial::before { content:""; width:6px; height:6px; background:var(--accent); display:inline-block; }
```

#### 5.2.8 `<SelfCorrectionViz>` (v0.2)
640×300 SVG. Grid 64×60. Zero "published / retracted" line at y=150. Issued-call dots: 3.5r `--pos` opacity .85 above line; `--neg` below for invalidations. Retraction diamond: 10×10 rotated 45°, accent stroke + 20% accent fill, connected to invalidated call by dashed accent line; lag annotation in mono accent. Running-avg lag: 1.5px accent polyline opacity .7.

#### 5.2.9 `<ScoreExplanationDrawer>` (`.sed`) — primary trust surface
540px right rail, opens from every Alpha Score. Six sections:
1. **Header** — crumb + title `.sdt "Alpha Score · 84.6"` + body line ("Tier S · rank 01 · 90-day window · model CTR-α v2.1 · last recomputed / next").
2. **Factor breakdown** — 5 rows (Avg α / call, Win rate, Self-correction, Horizon discipline, Recency decay) with name | bar (with mid-line, `.fill` accent or `.fill.n` neg) | value | weight. Footer: `Σ = …`.
3. **Confidence interval** — bar with peer-tick + ci-range + ci-pt (95% CI, Newey-West HAC), 0–100. ci-meta 3-up: Point / 95% CI / Std. error.
4. **Sample & low-N interpretation** — current N + threshold table.
5. **Constituent calls** — top-6 α contributors + "See all 147 calls →".
6. **Methodology & dispute** — model-card + buttons (Report dispute / Open full score page / Close).

```css
.factor { display:grid; grid-template-columns:130px 1fr 56px 40px; gap:12px; align-items:center; padding:7px 0; border-bottom:var(--hair-soft); }
.factor .fw { height:6px; background:var(--ink-100); position:relative; }
.factor .fw .fill { position:absolute; top:0; bottom:0; left:50%; background:var(--accent); }
.factor .fw .fill.n { background:var(--neg); right:50%; left:auto; }
.factor .fw .mid { position:absolute; top:-2px; bottom:-2px; left:50%; width:1px; background:var(--ink-400); }

.ci-bar { height:36px; background:var(--ink-100); position:relative; border:var(--hair); }
.ci-bar .ci-range { position:absolute; top:8px; bottom:8px; background:rgba(201,162,75,.22); border-left:1px solid var(--accent-dim); border-right:1px solid var(--accent-dim); }
.ci-bar .ci-pt { position:absolute; top:0; bottom:0; width:2px; background:var(--accent); }
.ci-bar .ci-pt::after { content:attr(data-v); position:absolute; top:-14px; left:-8px; font-family:var(--font-mono); font-size:9px; color:var(--accent); font-weight:500; white-space:nowrap; }

.lown-panel { background:rgba(167,140,107,.08); border-left:2px solid var(--lown); padding:14px 16px; font-family:var(--font-mono); font-size:11px; color:var(--ink-700); line-height:1.6; }
```

#### 5.2.10 `<CallDrawer>` — Calls explorer detail
540px right rail. Sticky header. Sections: crumb + title + tag chips → `.dr-section h5` (mono caps) → `.dr-grid` 2-col k/v → `.dr-prov` (--ink-100 bg + 2px accent left border) → `.dr-logic` formula box (β stated explicitly: e.g. `β = 1.18 (SOL/BTC · 180d rolling · measured 04-14)` — never silent normalization) → `.dr-price` 140px price-trace SVG → `.dr-actions` (Deeplink, Report dispute, Open full call page).

**Keyboard:** `↑/↓` row nav (drawer updates live), `⌘↵` open full page, `⌘d` deeplink, `!` report dispute, `Esc` close (focus returns to list).

#### 5.2.11 `<Cockpit>` — Dashboard hero (4 cells)
4-column grid. Top-border `2px solid var(--accent)`. Each cell `.cck`: numbered kicker (.lbl with .n circle) → H4 serif → `.peg` large serif number → `.sub` mono detail → `.go` CTA (mono dotted accent border).

**Cell semantics:**
1. **What changed** (movement) — `peg.pos` "+3 · new · consensus", body names which watched creators.
2. **What matters** (movement, larger) — "+4.82 α · 18h" with N+CI sub.
3. **What's trustworthy** (evidence) — `.estrip2` 7/8 + `.pip-miss-note` with warn color.
4. **Where to go** (router) — short content + `.route-trace` (e.g. `Leaderboard → @CryptoInsights · 3 steps · 47s`).

**Cockpit rule footer (mono, key/value):** "Cells 1 & 2 from movement; cell 3 from evidence; cell 4 routes. When nothing changed, cell 1 reads 'quiet since your last visit' — never fabricated urgency."

```css
.cockpit { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:1px; background:var(--ink-200); border-top:2px solid var(--accent); border-bottom:var(--hair-strong); }
.cck { background:var(--ink-050); padding:22px 22px 18px; display:flex; flex-direction:column; gap:12px; min-height:180px; position:relative; }
.cck .lbl { font-family:var(--font-mono); font-size:10px; color:var(--accent); letter-spacing:.1em; text-transform:uppercase; font-weight:500; display:flex; align-items:center; gap:6px; }
.cck .lbl .n { display:inline-block; width:14px; height:14px; border:1px solid var(--accent); color:var(--accent); text-align:center; line-height:13px; font-size:9px; border-radius:50%; }
.cck h4 { font-family:var(--font-serif); font-size:16px; color:var(--ink-900); font-weight:500; line-height:1.25; }
.cck .peg { font-family:var(--font-serif); font-size:26px; color:var(--ink-900); font-weight:500; letter-spacing:-.01em; line-height:1; font-variant-numeric:tabular-nums; }
.cck .peg.pos { color:var(--pos); }
.cck .go { font-family:var(--font-mono); font-size:10px; color:var(--accent); letter-spacing:.06em; text-transform:uppercase; border-bottom:1px dotted var(--accent-dim); align-self:flex-start; margin-top:auto; }

.pip-miss-note { display:inline-flex; align-items:center; gap:4px; font-family:var(--font-mono); font-size:9px; color:var(--warn); padding:2px 6px; background:rgba(217,119,87,.08); border:1px solid rgba(217,119,87,.3); border-radius:2px; }
.pip-miss-note::before { content:"!"; width:10px; height:10px; border-radius:50%; background:var(--warn); color:var(--ink-000); font-weight:500; text-align:center; line-height:10px; font-size:8px; }

.route-trace { display:inline-flex; align-items:center; gap:4px; font-family:var(--font-mono); font-size:9px; color:var(--ink-500); }
.route-trace .step b { color:var(--accent); font-weight:500; }
```

**Cockpit cell 4 routing logic:**
- (a) if cells 1 & 2 both surface a watched creator → Compare on that creator.
- (b) if cell 2's mover has conflicting theses across watched creators → conflicting asset's drill.
- (c) else → Signals home.
- "Nothing changed" → routes to Saved views.

#### 5.2.12 `<SynthesisBand>` — Compare hero
Synthesis kicker → editorial H3 (one or two italic-accent phrases) → 3 difference cells (`.diffs`): "Who wins where", "Who wins when", "Where they disagree".

**Canon rule:** Synthesis band is the HERO. Side-by-side columns are EVIDENCE BELOW, not above. Every Compare view ends with at least one **reconciler block** for any asset-level disagreement — silent side-by-side disagreements are a spec failure.

```css
.synth { padding:24px 28px; border-bottom:var(--hair-strong); background:linear-gradient(180deg, rgba(201,162,75,.04), transparent 70%); }
.synth h3 { font-family:var(--font-serif); font-size:24px; color:var(--ink-900); font-weight:400; letter-spacing:-.015em; line-height:1.2; max-width:48ch; }
.synth h3 em { font-style:italic; color:var(--accent); }
.synth .diffs { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--ink-200); border:var(--hair-strong); }
.synth .diff { background:var(--ink-050); padding:16px 18px; display:flex; flex-direction:column; gap:8px; }
.synth .diff .dl { font-family:var(--font-mono); font-size:10px; color:var(--ink-500); letter-spacing:.06em; text-transform:uppercase; }
.synth .diff .dv { font-family:var(--font-serif); font-size:15px; color:var(--ink-900); font-weight:500; line-height:1.35; }
.synth .diff .dv .w { color:var(--pos); }
.synth .diff .dv .l { color:var(--neg); }
```

#### 5.2.13 `<SignalRow>` (`.sig2`) — skim-first canonical
3-column grid `280px 1fr 160px`. Left = 4-beat skim (asset+dir, freshness, score+CI, evidence strip). Middle = thesis pull-quote + voices stack with originator pill. Right = market state (price, α since formation, target, horizon, N).

**Skim rule:** Row reads in ~800ms at cover-density. Clicking any of the four skim beats opens thesis detail scrolled to that section.

```css
.sig2 { padding:18px 22px; border-bottom:var(--hair-soft); display:grid; grid-template-columns:280px 1fr 160px; gap:20px; cursor:pointer; transition:background 100ms; }
.sig2:hover { background:var(--ink-050); }
.sig2 .h0 .t0 { font-family:var(--font-serif); font-size:26px; color:var(--ink-900); font-weight:500; letter-spacing:-.015em; line-height:1; display:flex; align-items:center; gap:8px; }
.sig2 .h0 .fresh .dot { width:6px; height:6px; border-radius:50%; background:var(--pos); box-shadow:0 0 0 2px rgba(111,165,106,.25); }
.sig2 .h0 .fresh .dot.warm { background:var(--accent); box-shadow:0 0 0 2px rgba(201,162,75,.2); }
.sig2 .h0 .fresh .dot.cool { background:var(--stale); box-shadow:none; }
.sig2 .h0 .sc .bar { width:100px; height:5px; background:var(--ink-200); position:relative; }
.sig2 .h0 .sc .bar .fill { position:absolute; inset:0 auto 0 0; background:var(--pos); }
.sig2 .h0 .sc .bar .fill.r { background:var(--neg); }
.sig2 .bd .th { font-family:var(--font-serif); font-size:15px; color:var(--ink-800); line-height:1.45; max-width:52ch; font-style:italic; }
.sig2 .bd .th::before { content:"\201C"; color:var(--accent); font-size:22px; line-height:0; padding-right:3px; vertical-align:-5px; }
.sig2 .bd .th::after  { content:"\201D"; color:var(--accent); font-size:22px; line-height:0; padding-left:1px;  vertical-align:-5px; }
.sig2 .sd { border-left:var(--hair-soft); padding-left:16px; display:flex; flex-direction:column; gap:7px; font-family:var(--font-mono); font-size:10px; color:var(--ink-500); }
```

#### 5.2.14 `<EmptyState>`, `<ErrorState>`, `<MiniEmpty>`

**`.empty`** — full-surface empty (e.g. Leaderboard no-results):
- Layout: kicker → `<h4>` 20px serif "No results matching X" → body (says what to relax) → action row.
- "Suggests filter relaxation, not a dead end." Projected counts are real: "Drop tier → A (shows 4)", "Widen → 30d (shows 11)".

**`.err`** — error panel with state preservation:
- 2px `--neg` left border + 4% neg bg.
- Filters + scroll + selection retained on retry.
- Error ID is click-to-copy (`.copy` mono accent dotted-underline).
- Actions: Retry / Report / Continue.

**`.mini-empty`** — per-card empty for Dashboard cards. **Grammar:** *<verb phrase naming what this card does>* · *<why empty + what Pro changes>* · *<one quickstart CTA + two starter seeds>*. **No illustrations, no ghost skeletons, no faux-metric placeholders.**

```css
.empty { padding:48px 40px; max-width:520px; margin:0 auto; display:flex; flex-direction:column; gap:14px; }
.empty .ek { font-family:var(--font-mono); font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--ink-500); }
.empty h4 { font-family:var(--font-serif); font-size:20px; color:var(--ink-900); font-weight:400; line-height:1.3; }

.err { padding:48px 40px; max-width:520px; margin:0 auto; border-left:2px solid var(--neg); background:rgba(212,122,112,.04); display:flex; flex-direction:column; gap:14px; }
.err .ek { color:var(--neg); }
.copy { font-family:var(--font-mono); font-size:10px; color:var(--accent); cursor:pointer; border-bottom:1px dotted var(--accent-dim); user-select:all; }

.mini-empty { padding:26px 20px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; min-height:180px; justify-content:center; }
.mini-empty .mk { width:32px; height:32px; border:1px solid var(--ink-300); display:flex; align-items:center; justify-content:center; color:var(--ink-500); position:relative; }
.mini-empty .mk::after { content:""; position:absolute; inset:-5px; border:1px dashed var(--ink-250); border-radius:50%; }
.mini-empty h5 { font-family:var(--font-serif); font-size:14px; color:var(--ink-900); font-weight:500; max-width:24ch; }
.mini-empty .qstart { font-size:9px; color:var(--accent); letter-spacing:.06em; text-transform:uppercase; padding:3px 7px; border:1px solid var(--accent-dim); background:rgba(201,162,75,.08); border-radius:2px; }
.mini-empty .qstart:hover { background:var(--accent); color:var(--ink-000); }
```

#### 5.2.15 `<Tooltip>` (`.tip`) — small chrome tooltip
Different from D5 metric popover. For column-header hints, kbd shortcut hints, etc.

```css
.tip { position:absolute; background:var(--ink-150); border:var(--hair-strong); padding:10px 12px; font-family:var(--font-mono); font-size:10px; color:var(--ink-700); line-height:1.55; max-width:240px; box-shadow:0 8px 32px rgba(0,0,0,.5); z-index:var(--z-tooltip); pointer-events:none; }
.tip::after { content:""; position:absolute; width:8px; height:8px; background:var(--ink-150); border-right:var(--hair-strong); border-bottom:var(--hair-strong); transform:rotate(45deg); left:20px; bottom:-5px; }
```

### 5.3 Templates

#### 5.3.1 `<Masthead>` (page chrome — sticky)
```css
.mast { position:sticky; top:0; z-index:var(--z-masthead); background:rgba(10,10,11,.88); backdrop-filter:blur(12px); border-bottom:var(--hair-strong); }
.mast-in { max-width:1360px; margin:0 auto; padding:10px 32px; display:grid; grid-template-columns:auto 1fr auto; gap:32px; align-items:center; }

.app-top { display:grid; grid-template-columns:auto 1fr auto; gap:32px; align-items:center; padding:14px 28px; border-bottom:var(--hair-strong); }
.app-nav { display:flex; gap:24px; font-family:var(--font-mono); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
.app-nav a { color:var(--ink-500); padding:4px 0; border-bottom:1px solid transparent; }
.app-nav a.on { color:var(--ink-900); border-bottom-color:var(--accent); }
```

#### 5.3.2 `<PageShell>`
```
<Masthead> [sticky, blur(12px), hair-strong border-bottom]
<main className="max-w-page mx-auto px-8 pt-14 pb-30 relative z-10">
  <Hero> [grid 1fr 320px, gap 56, hair-strong border-bottom, mb 14]
  <PageContent>
</main>
```

#### 5.3.3 `<Drawer>`
540px right rail. Sticky-top header. Scrollable body. Closes on `Esc` or click outside; focus returns to origin. Mobile substitution → bottom-sheet (max 70vh).

#### 5.3.4 `<UpgradeModal>`
Width per intent (480 / 560 / 640). Anchored to user intent (the teaser they just clicked). Shared anatomy: kicker → title (serif italic-accent) → sub → evidence-of-value block (`.eov`) → plan-snap (the filter you're on) → plan-inline note → CTAs (primary trial + ghost see-all-plans + footnote). See §7 for the three canonical modals.

```css
.modal { position:absolute; background:var(--ink-000); border:1px solid var(--accent-dim); box-shadow:0 24px 64px rgba(0,0,0,.6), 0 0 0 1px rgba(201,162,75,.15); z-index:var(--z-modal); }
.modal .close { position:absolute; top:14px; right:16px; font-family:var(--font-mono); font-size:14px; color:var(--ink-500); }
.modal .m-kick { font-family:var(--font-mono); font-size:10px; color:var(--accent); letter-spacing:.1em; text-transform:uppercase; }
.modal .m-title { font-family:var(--font-serif); font-size:22px; color:var(--ink-900); font-weight:500; letter-spacing:-.01em; line-height:1.25; }
.m-cta button { padding:11px 18px; font-family:var(--font-mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; border:1px solid var(--ink-300); font-weight:500; }
.m-cta button.primary { background:var(--accent); color:var(--ink-000); border-color:var(--accent); }
.m-cta button.primary:hover { background:#D4AD55; }
```

#### 5.3.5 `<Annotation>` (`.ann`)
Dev-time / spec annotation chrome — used in design comps but **not in production UI**. Strip from production build. (Documented for design-review parity only.)

### 5.4 Icon registry

All 16×16, 1.4px stroke, `currentColor`, square miter linejoin. **No emoji anywhere.**

| Icon | Purpose |
|------|---------|
| `lock` | Premium chrome |
| `bell` | Alerts |
| `plus` | Follow |
| `compare` | Side-by-side |
| `search` | Search |
| `arrow-right` / `up` / `down` | Direction / nav |
| `trend-up` | Improving (style only — not P/L) |
| `caret` | Disclosure |
| `x` | Close / remove |
| `warn` | Warning |
| `link` | Deeplink / share |
| `flag` | Dispute |
| `dir-long` (▲) / `dir-short` (▼) | Bullish/bearish chips |
| `retract-diamond` (◆) | Retraction event |
| `consensus` | Thesis lifecycle |
| `lock-pro` | Paywall |
| `originator` | First-mover ±6h |

Use `lucide-react` where icons map; for product-specific glyphs (originator, retract-diamond, consensus) ship hand-drawn SVG components.

Greek letters (α, β, Δ, ±, ≥) and `§` stay as typography.

---

## 6. Screen Specs

### 6.1 Leaderboard `/`

**§4 job:** Identify best- and worst-performing creators at a glance.

**Layout grid:** `1fr 320px` (table | rail). Page max-width 1360.

**Above-fold composition:**
1. `<Masthead>`.
2. **Thesis block** (`.lb-thesis`) — H1 serif italic *"Who's actually worth listening to."* + sub-line + side panel (`Live · 147 creators · 12,842 calls scored · N ≥ 10` + last resolve timestamp).
3. **Controls row** — Timeframe (7d/30d/90d/YTD/All, default 90d) + Filters (Category, Sample N≥, Tier, Multi-asset locked) + Search + Density toggle.
4. **Body grid** — `<LeaderboardTable>` left + `<ConsensusSnapshotRail>` right (Bullish + Bearish lists).
5. **`<CompareBar>`** sticky bottom — appears at ≥2 row selections.

**States:** Default · Loading skeleton · Compare → `compare-3rd-column` gate (§5.1.5) · Empty filter · No-results inline.

**Tensions resolved (§9):**
- *Density vs readability*: user-selectable density (3 levels), default Comfortable.
- *Editorial sharpness vs bias*: severity from rank position + §14 self-decoding, NOT color drama. Bottom rows are not red-washed.

**Default sort:** α (90d), descending. Header click sorts; shift-click multi-column.

**Keyboard:** `↑↓` row nav · `↵` open profile · `Space` toggle row select · `c` open comparison · `1`–`5` jump timeframe · `d` cycle density · `/` focus search · `⌘K` global palette.

**Skeleton React:**
```tsx
// src/app/page.tsx
export default function Leaderboard() {
  return (
    <main className="max-w-page mx-auto px-8 pt-14 pb-30">
      <ThesisBlock
        h1="Who's actually worth listening to."
        sub="Calls scored against the chain · N≥10 · ranked by α (log-return excess vs benchmark)."
        live={{ creators: 147, calls: 12842, lastResolveAt: '...' }}
      />
      <ControlsRow timeframe="90d" defaultDensity="comfortable" />
      <div className="grid grid-cols-[1fr_320px] gap-0 border border-hair-strong">
        <LeaderboardTable />
        <ConsensusSnapshotRail />
      </div>
      <CompareBar /> {/* renders only when >=2 selected */}
    </main>
  );
}
```

### 6.2 Creator profile `/creator/[handle]`

**§4 job:** Understand why a creator ranks where they do.

**Layout grid:** `1fr 360px` (`.prof-body` main | rail).

**Above-fold composition (within 120px of header):**
1. `<Masthead>`.
2. `.prof-head` — 84×84 avatar (2px accent border, +26×26 rank badge `::after`) + id (32px serif italic `<em>` for "verified") + meta (platform/followers/since/window) + actions (Follow free / Configure alerts paid CTA / Compare).
3. `.prof-why` — full-width editorial sentence "Why they rank here" (grid `120px 1fr auto`: kicker → body 16px serif max-80ch → link with arrow icon).
4. `.prof-metrics` — 5-up grid: Alpha · 90d · Win rate · Self-correction · Avg α / call · Best call.

**Below-fold:**
- Main: Performance vs benchmark chart (`.perf-chart`, 200px tall, `--ink-050` bg) + Recent calls table + Breakdown tabs (asset/category/horizon/direction).
- Rail: Alerts toggles + Evidence trail (last 7d).

**States:** Default · Sparse (avatar border `--lown`, tag becomes lown) · Low-conf (N<12, score attenuated) · History tail locked (`history-tail` moment — 30d cutoff for free).

**Drawer / page decisions:**
- Score Explanation = drawer (preserves profile context).
- Call detail = drawer.
- Compare = full page.
- Source click = external + archive in drawer.

**Timeframe sync:** chart + breakdown + calls all share one timeframe selector. Self-correction window is fixed at 90d (base-rate comparability).

**Keyboard:** `f` follow · `a` alerts · `c` compare · `w` open Score Explanation drawer · `[` `]` cycle timeframe · `Esc` close.

### 6.3 Calls Explorer `/calls`

**§4 job:** Inspect the evidence behind one scored call.

**Layout grid:** `.calls-screen` is `1fr 540px` — list | drawer; min-height 640.

**Above-fold:**
1. `<Masthead>`.
2. Controls — search + filter chips (Asset, Direction, State [Open + Resolved], Horizon, Advanced [locked]) + result count + Export (locked).
3. `.calls-big` table — columns: Asset · Creator · Dir · Called · Horizon · α · State · Src.
4. `<CallDrawer>` on right when row active.

**State columns substitute by filter:**
- Open → Horizon-end · Days-left · Interim α (default sort horizon-end ↑).
- Resolved → Resolved-at · Final α · Result.
- All → merged with state badge column.

**States:** Default + drawer · Open-only · Error · partial-load (e.g. "312 of 1284, state preserved").

**Keyboard:** `↑↓` row nav (drawer updates LIVE) · `⌘↵` open full call page · `⌘d` deeplink · `!` report dispute · `Esc` close (focus returns to list).

### 6.4 Signals `/signals`

**§4 job:** Detect fresh consensus signals across the creator universe. Unit is a **thesis** (asset + direction + ±5% target + 48h window), NOT a creator or single call.

**Layout grid:**
- Outer: `max-width: 1360; padding: 56 32 120`.
- App nav: `padding: 14 28; border-bottom: hair-strong`.
- Page header: `grid-template-columns: 1fr auto; padding: 24 28`.
- Signal row: `.sig2 { grid-template-columns: 280px 1fr 160px; gap: 20px; padding: 18 22 }`.

**§6 above-fold (canonical v0.3):**
1. `<Masthead>` — `Signals` active.
2. Page header — kicker "Signals", H2 serif: *"Theses **forming across creators** — ranked by conviction, disclosed by evidence."* + window/tier-gating sub.
3. Sub-tabs (canonical 5-tab nav): `Active · 14`, `Resolved · 86`, `By asset`, `By creator cluster`, `Mine`.
4. `.sig2` row (skim-first) repeated for active theses.
5. Pro teaser row (`.sig2` with locked styling, blurred fields, dashed `--new` border-left).

**Window meta:** `window · last 14d · free tier shows consensus >{gate.signals.free.window} · live {gate.signals.live.window} is Pro`.

**Live indicator (top-right):** live dot + "refreshing every 15 min · last **2m 14s ago**".

**States covered (9-state grid, rendered as sub-screens for QA):**
| # | State | Trigger | Visual |
|---|-------|---------|--------|
| 01 | Active | consensus ≥3 tier-B+ creators ≥60% directional, N≥6 | full skim row |
| 02 | Forming | <consensus threshold | dot warm, wide CI suffix |
| 03 | Consensus crossed | threshold met within 24h | hot pulse ring |
| 04 | Fading | velocity −, no new adds in rolling 48h | dot cool, label "fading" |
| 05 | Invalidated | stop hit OR 2× horizon elapsed without 50% target | rolls to Resolved within 30m |
| 06 | Resolved · target | target hit | `.bg.pos`, ✓ |
| 07 | Resolved · expired | drifted | `.bg.warn` ~ |
| 08 | Low-N · disclaimed | N<6 | `.bg.lown`, "Shown but excluded from aggregate" |
| 09 | Empty / loading | no theses in window | "no theses · widen window CTA · no ghost skeletons" |

**Sub-routes:**
- `/signals/resolved` — `.restbl` table; columns: Asset · dir | Thesis | Voices | N | α | CI | First → resolved | Outcome.
- `/signals/[asset]-[direction]` — Thesis detail. `.sd-hero` 1fr 320px. Left = breadcrumb + H1 + thesis pull-quote. Right = `.panel` Thesis state with consensus chip + aggregate-α big peg + rows (CI, creators, tier-weighted N, originator with tier S chip, avg target).
- Thesis detail body: `<PerfChart>` (260px height SVG, aggregate α + individual creators @0.35 opacity + BTC bench dashed + CI band fill) → contributing calls table → 4 sidebar cards (Thesis lifecycle, Invalidation, Related theses, Alerts · Pro).

### 6.5 Compare `/compare?c=@A,@B&w=30d&a=SOL`

**§4 job:** Two creators on the same axes — synthesis-led. **The URL is deep-linkable, screenshot-friendly** (growth loop).

**§6 hierarchy (v0.3 canonical):**
1. `<Masthead>` — `Compare` active.
2. **`<SynthesisBand>`** (HERO) — kicker + editorial H3 + 3 difference cells.
3. Side-by-side 2-column evidence grid (avatar + tierlbl + .rk.sm + `.estrip2` 8/8 + 3-metric grid α/Win rate/First-mover).
4. ETH-disagreement drill — `.estrip2` evidence header + 2-column thesis quotes + reconciler block.
5. Footer canon rule.

**Layout:**
- `.cmp-hero { padding: 28; grid-template-columns: 1fr auto; gap: 28; border-bottom: hair-strong }`.
- `.cmp-heads.two { grid-template-columns: 160px 1fr 1fr }`.
- `.cmp-heads.four { grid-template-columns: 160px 1fr 1fr 1fr 1fr }` (4-way Pro).

**Variants:**
- `2-way · free` (default) — 2 columns + locked `.cmp-headcell.add` placeholder for upgrade.
- `4-way · Pro` — 4 columns; β-α row visible (Pro-gated).

**Reconciler block (R4 refinement):** Required for any asset-level disagreement. Names BOTH sides' **denominators** explicitly. Same asset + same denominator + opposite direction = real contradiction. Same asset + different denominators = surfaced as reconciler, not conflict. Example: *"CI: ETH/USD long vs MM: ETH/BTC short — **not contradictory**. CI's thesis is ETH outperforms USD in absolute terms; MM's is ETH underperforms BTC in relative terms. Both can resolve profitable if BTC rallies harder than ETH and both rally in USD."*

**Source trails (`.cmp-trail`):** 2-col grid of `.clip` rows — timestamp (accent) + body italic quote + hash pill (dotted accent border). Real entries (example):
- `Apr 03 14:22 · entry $170 target · hash 7a2c · ledger`.

**Keyboard:** Tab swaps 2-way / 4-way. URL params bind to filters; "[Share]" copies URL; "[PNG export]" downloads screenshot.

### 6.6 Dashboard `/dashboard`

**§4 job:** Decide whether to follow / fade / ignore — *change since last visit*.

**§6 hierarchy (v0.3 canonical):**
1. `<Masthead>` — `Dashboard` active.
2. **`<Cockpit>` band (HERO)** — 4 cells (see §5.2.11). Replaces v0.1 greet line entirely.
3. Cockpit rule footer (mono, key/value).
4. 3-column populated grid (1.2fr · 1fr · 1fr): Watched creators · Alerts inbox · Saved views.
5. Movers strip (full-width row 2; `repeat(4, 1fr); gap: 14px`).
6. Footer canon rule.

**Empty / new-user state (`.dbe`):**
- Padding 64 / 48; min-height 480; flex column gap 16; centered.
- 60×60 ringed-icon placeholder (dashed outer ring).
- H2 serif: *"Your dashboard fills in **after you watch your first creator**."*
- Body paragraph + CTA row (`.btn.p "Browse leaderboard · pick from top 50"` + `.btn "Import watchlist from CSV"`).
- 3 starter cards (`.starter-rail`): "Tier S only" · "Macro voices" · "SOL + alts".
- Hint footer: `free tier · {gate.watched.free} watched · {gate.saved.free} saved views · email alerts only · Pro unlocks unlimited + push`.

**Per-card mini-empty grammar (C4):**
- Alerts: *"No alerts yet — you'll see signals that matter for your watchlist here."* · "Notify on new call / consensus / resolution. Push alerts are `{gate.alerts.pro}`." · `"Set alert rules"` `"Sample feed"`.
- Saved views: *"Save a filter combination to come back to."* · seeds: `"Tier S · L2 only"` `"My watchlist · α > +3"` `"Retracted last 30d"`.
- Watched assets: *"Follow assets, not just creators."* · seeds: `"Majors · BTC · ETH · SOL"` `"DeFi basket"` `"My portfolio"`.

### 6.7 Signals — by asset `/signals/by-asset`

**§4 job:** Cluster active and recent theses by underlying asset. Answers "what are creators saying about SOL right now?".

**Layout:** masthead → sub-tabs (Active · Resolved · By asset · By creator cluster · Mine) with `By asset` active → asset-grouped panel grid.

**Composition:**
- Filter row: window (default 14d), tier (default ≥B), `min creators` (default 3+).
- Asset group cards (`grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1px; background: --ink-200`). Each card:
  - Header: asset symbol (serif 18px) + spot price (mono 11px ink-500) + 30d Δ chip.
  - Two columns: bullish theses count + bearish theses count, with miniature `<DirChip>` rollup.
  - Top 3 active theses for the asset, condensed `.sig2-mini` rows: thesis line + voices count + α since formation.
  - Footer link: "All N theses on {asset} →" → `/signals/by-asset/[symbol]`.
- Empty group state: "No active theses on this asset in the window — widen window or check `/signals/resolved`."

**States:** Default · Loading (skeleton cards mirroring grid) · Empty (one global empty state if no assets meet threshold).

**URL params:** `win`, `tier`, `n_min`, `q` (asset search). Schema: extends `SignalsParams` from §12.11 with `q?: string` for asset search. All parsed via `parseParams(SignalsByAssetParams, searchParams)`.

### 6.8 Signals — by creator cluster `/signals/by-creator-cluster`

**§4 job:** Detect when a coherent group of creators is converging on a thesis. A "cluster" is a set of creators with overlapping watchlists and historical co-publication patterns; cluster IDs are derived server-side.

**Layout:** masthead → sub-tabs with `By creator cluster` active → cluster panel list.

**Composition:**
- Filter row: window, cluster size min (default 3+ creators), tier composition floor.
- Cluster row (`grid-template-columns: 220px 1fr 200px; gap: 24px`):
  - Left: cluster name (serif italic) + stacked avatars (max 6 shown + "+N more") + tier breakdown chip ("S:2 · A:3 · B:1").
  - Middle: top thesis from the cluster (.sig2-mini).
  - Right: cluster cohesion score (0–100, mono large) + "agreement rate 72%" sub.
- Click row → cluster detail page at `/signals/by-creator-cluster/[id]`. **In v1, this route renders a "coming soon" placeholder card** (matches §12.1 file layout + §12.4.1 backend prereq row). Cluster detail content + cohesion algorithm ship post-v1 (OQ-23).

**State this phase:** Render with seed-data clusters. Cohesion calculation logic deferred to backend; UI carries the chrome.

### 6.9 Signals — Mine `/signals/mine`

**§4 job:** "What are creators *I watch* saying right now?" Subset of `/signals/active` filtered to `creator_id IN watchlist`.

**Auth:** signed-in only. Anonymous users see the empty state with sign-in CTA. Free + Pro both supported.

**Layout:** identical to `/signals/active` but filtered.

**Composition:**
- Page header H2: *"From the {N} creators **you watch**."*
- Same `.sig2` rows as Active.
- If watchlist empty: render the Dashboard "Your dashboard fills in after you watch your first creator" empty state with link back to Leaderboard.

**Diff vs Active:** the live-window gate (`gate.signals.live.window` Pro) still applies. A free user with watched creators sees their watched creators' theses with the same >24h delay.

### 6.10 Call detail `/calls/[id]` (full call page)

**§4 job:** Standalone permalink for one scored call — embeddable, shareable, citable. The drawer (§5.2.10) is the in-list view; this is the deep-link target.

**Auth:** public for non-locked sources; locked sources require Pro. URL is publicly shareable; if locked, page renders preview-with-lock.

**Layout:** `1fr 320px` body (main | rail).

**Composition (mirrors drawer sections, expanded):**
1. **Header band** — breadcrumb (Calls · {asset} · {creator handle}) + title (serif `<creator> · <asset> <direction>` with α em accent) + tag chips (state · tier · horizon).
2. **At-a-glance** — 4-up cell row: Called / Resolved / α contribution / Source.
3. **Provenance block** — full `<Provenance scale="full">` + archive link + sha + capture timestamp. The visual signature.
4. **Thesis quote** — italic serif pull-quote with curly-quote pseudo-elements; "Read in context →" link to source.
5. **Resolution logic** — formula block (mono, ink-100 bg, 2px accent left border):
   ```
   r_asset = ln(P_resolved / P_entered)  =  ln(164.20 / 142.80) = +13.96%
   r_bench = ln(B_resolved / B_entered)  =  ln(66820 / 62140)   = +7.26%
   α       = r_asset − r_bench           =  +6.70%
   ```
   β is shown explicitly only on the Pro β-α view; the standard view uses clean log-return spread per CF-A.
6. **Price trace** — recharts area chart (140px) of asset price between call and resolution, with bench overlay dashed and call/resolution markers.
7. **Constituent context** — sibling-call row: how this contributed to the creator's α window. Link to creator profile.
8. **Discussion / dispute** — Report dispute button + linked dispute history if any.

**Right rail:**
- Related calls (same creator, same asset).
- Related theses (active theses this call contributed to).

**Keyboard:** `⌘d` copy permalink · `!` dispute · `Esc` close + back to /calls.

**Locked variant:** if call source requires Pro and viewer is free, sections 4 (thesis quote) and 5 (resolution logic) render in preview-with-lock with `signals-live`-style copy.

### 6.11 Auth `/login` and `/signup`

Single-column centered layout, max-width 380px, vertical centered (use `min-h-[80vh] grid place-items-center`).

**Composition:**
- Wordmark serif italic at top (32px).
- H1 serif: *"Sign in."* / *"Make an account."*
- Body mono ink-500: "We don't sell your reading, your watchlist, or your alerts. We score creators, that's it."
- Form: email + password (or magic link if backend supports). Submit primary `.btn.p`.
- OAuth row (if backend supports): "Continue with Google · X" buttons styled as `.btn` ghost.
- Footer mono link row: forgot password · privacy · terms.
- Marketing pull on `/signup`: 3-line list of what Free includes (`{gate.watched.free}` watched creators · `{gate.saved.free}` saved views · resolved Signals).

**Errors:** inline below form field; never modal. Surface backend error message in mono 11px `--neg`.

**Auth state coupling:** spec uses Free/Pro/Team labels; existing DB tier vocabulary is `free | pro | elite`. **Mapping (canonical):** `Free ↔ free`, `Pro ↔ pro`, `Team ↔ elite`. The DB stays as-is; only display labels change. See §13 OQ for migration tracking.

### 6.12 Settings `/settings`

Tabbed sub-routes:
- `/settings/account` — profile, email, password.
- `/settings/billing` — current plan, payment method, billing history, cancel/upgrade.
- `/settings/alerts` — alert thresholds, channels (in-app, email, push for Pro).
- `/settings/notifications` — frequency caps, quiet hours.
- `/settings/team` — Team tier only: seats, invites, audit log, SSO config.

**Layout:**
- **Desktop / tablet:** sidebar (160px) + main (1fr). Sidebar sticky. Active tab gets accent left-border.
- **Phone:** sidebar collapses to a horizontal scrolling tab strip at top of main (mono uppercase 10px, accent underline on active, `overflow-x: auto`). No bottom nav interference — settings live in their own page chrome.

**Active tab styling:** sidebar item gets `border-left: 2px solid var(--accent)` + `color: var(--ink-900)` + `background: var(--ink-050)`. Inactive: `border-left: 2px solid transparent` + `color: var(--ink-500)`. Hover: `color: var(--ink-800)`.

**Auth gating (server-side, every settings route):**
- Anon → server returns 302 redirect to `/login?next=/settings/<tab>`.
- Free / Pro → can see Account, Billing, Alerts, Notifications. `/settings/team` returns 403 + renders the locked-preview shell with the Team tier value prop.
- Team (`tier=elite`) → all tabs accessible. `/settings/team` is fully-featured.
- Trial users see same tabs as Pro; the trial-expiry banner (below) is the only diff.

**Cancel flow:** "Cancel subscription" button on `/settings/billing` → confirmation modal (`<Dialog variant="modal">`). Modal copy: "You keep `{plan.pro.name}` through end of period (2026-MM-DD), then drop to Watch. No prorated refunds." Cancel button is `--neg` ghost; "Keep my plan" is `.btn.p` primary.

**Trial expiry banner:** if `subscription_status=trialing`, top of `/settings/billing` shows "Trial ends in N days. Add a payment method to continue, or you'll drop to Watch." Banner uses `--accent` left-border on `--ink-050` bg.

**Loading states:** each tab uses route-level `loading.tsx` that renders form skeletons (mono labels + ink-100 input bars). Billing tab additionally streams payment-history below a Suspense boundary.

**Error states:** each tab uses route-level `error.tsx` (per §12.13). Billing-specific errors (Stripe API failure, etc.) render inline above the form with mono error-id + retry, never replacing the whole page — preserves filters and unsaved input state.

**Out of v1 scope (tracked in OQ-24):** the actual Stripe (or Whop) integration plumbing — server actions, webhooks, payment-method UI primitives. The settings shell is implementable now; data wiring waits for the billing decision.

### 6.13 Methodology `/methodology`

Full page — single source of truth that every metric popover Source link and every Score Explanation drawer links to. Replaces the deferred D7 deliverable.

**Layout:** `260px 1fr` — left TOC sticky, right content max-width 72ch.

**Sections (TOC) — every entry corresponds to an `<h2 id="…">` on the rendered page so popover Source links resolve. Anchor IDs in `code` font.**

1. **The Alpha Score (α)** — `#alpha` — definition, the log-return spread formula, why we don't use β at the score level (CF-A decision), tier-weighting table, decay half-life token, why 90d window.
2. **Confidence Interval** — `#confidence-interval` — bootstrap procedure (1000 iterations, percentile method), how to read the band, when CI is "wide" (the explicit width threshold), why we never collapse to ±.
3. **Tier-weighted N** — `#tier-weighted-n` — formula `N_eff = Σ w(tier_i)`, the tier weight table (`metric.tier.weights` token), the two thresholds: badge renders below `LOW_N_BADGE = 20`, score attenuates below `metric.lowN.threshold = 12`, profile unrankable below `N < 3`. See §5.1.2 for the full state matrix.
4. **β-α (Pro column)** — `#beta-alpha` — separate, optional, derived after α. Regression window, benchmark choice (current default: CMC Top-10 index, 30d rolling), regime-change caveat. **Important:** β-α is a *display* layer on resolved tables, not an input to ranking.
5. **Win rate** — `#win-rate` — `WR = #{rᵢ > 0} / N`. Directional hit rate, ungated by magnitude. Always paired with α (high WR + low α = small wins, big losses).
6. **Resolution logic** — `#resolution-logic` — when a call is "resolved": stop hit, target hit, or 2× horizon elapsed without 50% of target reached. Worked example (the SOL +6.70% case from CF-A).
7. **Retractions** — `#retractions` — what counts as a retraction (`adverse signal trigger` rules — currently price >1σ against, contradicting Tier-S post, or resolved against). Retraction-rate metric uses these.
8. **First-mover** — `#first-mover` — the ±6h lead threshold (originator glyph) and the ±2h FM-rate threshold are different by design. **Originator glyph fires only at ±6h or more before consensus** (high-confidence first-mover badge). **FM-rate metric counts ±2h+ leads** (broader signal, used in α weighting). The two coexist: every originator is an FM, not every FM is an originator.
9. **Median horizon** — `#horizon` — the median time-to-resolution per creator. Style context (scalper / swing / position), not a quality signal. Match horizon to your own holding period.
10. **Thesis & consensus** — `#thesis-consensus` — the asset+direction+(±5%)+48h-window unit. Consensus threshold (≥3 tier-B+ creators · ≥60% directional · N≥6). Fading rule (rolling 48h no new adds). Invalidation (stop hit OR 2× horizon).
11. **Velocity & dormancy** — `#velocity` — V = calls/week formula. Dormancy fires when V < `metric.dormancy.v_min` for 14d.
12. **Overlap-with-you (OL)** — `#overlap` — privacy disclaimer first ("computed server-side, not retained"). Requires connected portfolio. Hidden if no portfolio — never a placeholder %.
13. **Provenance** — `#provenance` — what we capture (source platform, URL, clip timestamp, archive snapshot, sha) and how we render it. The "every datum points to a source" rule, with exemptions called out (RankTier/Badge/DirChip are *modifiers*, not data — they don't carry provenance themselves; the underlying score they qualify does).
14. **Disputes & corrections** — `#disputes` — how to file a dispute, our turnaround, what we publish on resolution.
15. **Glossary** — `#glossary` — α, β, β-α, CI, N, FM, RR, V, OL, horizon, tier, consensus, originator, retraction, dormancy, freshness.

**Page chrome:** standard masthead + main. No drawer here. Deep-linkable section anchors (e.g. `/methodology#alpha`).

**Anchor links from popover Source rows.** Each metric popover's Source row links to its corresponding section anchor. The **registry-key → anchor-id map** is canonical (every anchor below MUST have a matching `<h2 id="…">` rendered on the page):

| Registry key (`src/lib/metrics.ts`) | Methodology anchor | Methodology TOC section |
|---|---|---|
| `alpha` | `#alpha` | §1 |
| `beta-alpha` | `#beta-alpha` | §4 |
| `ci` | `#confidence-interval` | §2 |
| `n` | `#tier-weighted-n` | §3 |
| `wr` | `#win-rate` | §5 |
| `rr` | `#retractions` | §7 |
| `fm` | `#first-mover` | §8 |
| `h` | `#horizon` | §9 |
| `v` | `#velocity` | §11 |
| `ol` | `#overlap` | §12 |

The `MetricSpec.source.methodologyHref` field for each entry MUST use one of these anchors. Example: the α popover's Source row href is `/methodology#alpha`. The methodology page MUST render `<h2 id="alpha">…</h2>` etc. so the anchors resolve. **Mismatch is a spec violation** — wire a unit test that asserts every metric registry entry's `methodologyHref` resolves to a heading rendered on the methodology page (`getElementById` non-null).

---

## 7. Pricing (D4)

### 7.1 Page composition (top → bottom)

```
<canonical> tab strip
<pricing-hero> 2-col grid (1fr 400px)
<tiers> 3-col card row
<cmp-grid> full feature matrix
<faq> 2-col Q/A grid
```

Outer container: `max-width: 1360; padding: 48 32 120`. Hero inner padding `56 48 36`.

### 7.2 Hero

**Left column (`.ph-l`):**
- Kicker (mono, 11px, accent, uppercase, .12em): `Pricing · transparent · cancel anytime`.
- H1 (Source Serif 4, 44 / 1.08 / -0.02em, weight 400, max-width 18ch): **A clear lens on _which crypto voices_ actually move your money.**
- Sub (Source Serif 4 italic, 16 / 1.55, ink-700, max-width 52ch): **Free shows the evidence after the fact. Pro shows it while there's still a trade to take. Team adds shared watchlists and weekly memos for desks. `{plan.pro.trial}` trial on Pro — no card required.**
- Billing toggle (`.bill`): segmented control (Monthly | **Annual** active) + green save badge `save ~17%`.

**Right column (`.ph-r`):** mono 11px ink-500, left hairline, padding-left 28 — "What you pay for":
- **Speed.** See theses while they're forming — the `{gate.signals.live.window}` window free tier doesn't see.
- **Density.** Compare up to `{gate.compare.pro}` creators side-by-side with synthesis; free is `{gate.compare.free}`.
- **Alerts.** Push notifications for watched creators, thesis crossings, retractions. Free is in-app only.
- **Evidence.** β-α column and full provenance trails on resolved calls.

### 7.3 Tiers (3-column equal grid, hairline-separated)

Recommended tier (`.tier.rec`):
- 5% accent gradient backdrop (`linear-gradient(180deg, rgba(201,162,75,.05), transparent 30%)`).
- "recommended" pill across top (mono 9px, accent bg, ink-000 text, .1em tracking).
- Pushes top padding to 56px.

#### Free — "Watch"
- **Audience:** "Read the leaderboard, skim resolved calls, follow creators."
- **Price:** `$0 / forever`
- **CTA:** ghost button — "Continue free"
- **Included:** Full leaderboard & creator profiles · Resolved Signals `>{gate.signals.free.window}` old · Watched creators `{gate.watched.free}` · Saved views `{gate.saved.free}` · Compare `{gate.compare.free}` · In-app alerts (no push) · α + win rate + first-mover % on profile.
- **Not included (empty pips):** Forming Signals `{gate.signals.live.window}` · β-α column · Push alerts.

#### Pro — `{plan.pro.name} · Individual` (RECOMMENDED)
- **Audience:** "See theses as they form · compare more creators · act before consensus."
- **Price:** `{plan.pro.price.monthly} / mo · billed annually`
- **Annual note:** "annual · `{plan.pro.price.annual}`/yr · save ~17%" (save value in `--pos`).
- **Trial pill:** "`{plan.pro.trial}` trial · no card" (accent border).
- **CTA (primary):** "Start `{plan.pro.trial}` trial" — accent bg, ink-000 text.
- **Features (heading: "Everything in Watch, plus"):** **Forming Signals** `{gate.signals.live.window}` (`.hl` accent text) · Watched creators `{gate.watched.pro}` · Saved views `{gate.saved.pro}` · Compare `{gate.compare.pro}` with synthesis · Push alerts `{gate.alerts.pro}` · **β-α column** `{gate.beta.column}` · Originator glyph on watchlist · Full provenance on resolved calls · Custom alert rules.

#### Team
- **Audience:** "Shared watchlists, weekly memos, seats. For desks & research pods."
- **Price:** `$79 / seat / mo`
- **Annual note:** "min 3 seats · annual only · volume from 10+".
- **CTA:** standard — "Talk to us".
- **Features (heading: "Everything in Pro, plus"):** Shared watchlists & saved views · Weekly consensus memo (auto) · Retraction digest · SSO · audit log · CSV / API export · Slack + email delivery · Dedicated onboarding.

### 7.4 Comparison grid

4-col grid (`1fr 1fr 1fr 1fr`). Category bands span full width with ink-050 bg + accent kicker. Cells get hairline left borders. Recommended column gets a 3% accent backdrop. `.yes` cells prepend `●` in `--pos`; `.no` cells prepend `—` in `--ink-400`.

**Header row:** *Feature* · *Watch (Free)* · *Pro · Individual* (rec column, recommended-banner) · *Team*.

**Category band: Capacity**

| Feature | Watch | Pro (rec) | Team |
|---|---|---|---|
| Watched creators | `{gate.watched.free}` | `{gate.watched.pro}` | Unlimited · shared |
| Saved views | `{gate.saved.free}` | `{gate.saved.pro}` | Unlimited · shared |
| Compare width | `{gate.compare.free}` | `{gate.compare.pro}` + synthesis | `{gate.compare.pro}` + synthesis |

**Category band: Signals**

| Feature | Watch | Pro (rec) | Team |
|---|---|---|---|
| Forming theses | — `>{gate.signals.free.window}` only | ● Live · `{gate.signals.live.window}` | ● Live · `{gate.signals.live.window}` |
| Originator glyph (±6h pre-consensus) | ● Everywhere | ● + on your watchlist | ● + on shared watchlist |
| Thesis filtering (asset, tier, cluster) | ● | ● | ● |
| Saved-thesis automations | — | — | ● |

**Category band: Alerts**

| Feature | Watch | Pro (rec) | Team |
|---|---|---|---|
| In-app | ● | ● | ● |
| Push (mobile + web) | — | ● `{gate.alerts.pro}` | ● Push + email + Slack |
| Custom alert rules | — | ● | ● shared |
| Quiet hours / frequency caps | ● | ● | ● |

**Category band: Evidence**

| Feature | Watch | Pro (rec) | Team |
|---|---|---|---|
| α + win rate + first-mover % on profile | ● | ● | ● |
| β-α column on resolved tables | — | ● `{gate.beta.column}` | ● + export |
| Full provenance trail | Summary only | ● Full trail | ● Full trail |
| CSV / JSON download per call | — | — | ● |

**Category band: Team**

| Feature | Watch | Pro (rec) | Team |
|---|---|---|---|
| Seats & SSO | — | — | ● SSO · audit · 3+ seats |
| Shared watchlists & saved views | — | — | ● |
| Weekly consensus memo (auto) | — | — | ● |
| Retraction digest | — | — | ● |
| CSV / API export | — | — | ● |
| Slack + email delivery | — | — | ● |
| Dedicated onboarding | — | — | ● |

**Implementation:** render via a typed table data structure in `src/lib/pricing.ts` exporting `PRICING_GRID: Category[]`. Each `Category` has `{ label: string; rows: Row[] }` and each `Row` has `{ label: string; watch: Cell; pro: Cell; team: Cell }` where `Cell = { kind: 'yes' | 'no' | 'value'; text?: string; tokenIds?: string[] }`. The `tokenIds` array drives `<Token>` chip insertion in cells that show plan tokens.

### 7.5 FAQ (verbatim)

H3: **Questions _before you pay us_.**

| Q | A |
|---|---|
| Is the `{plan.pro.trial}` trial actually free? | Yes — no card required. `{plan.pro.name}` for `{plan.pro.trial}`. End: pick a plan or fall back to Watch. No auto-charge. |
| What if I cancel mid-month? | You keep `{plan.pro.name}` through end of period, drop to Watch. No prorated refunds, no surprises — cancel from settings. |
| Do you give financial advice? | **No.** We score creators on their published directional calls. _You_ decide what to do. Nothing on CTR is a recommendation. |
| How is the _score_ calculated? | Log-return α on resolved calls · tier-weighted · windowed to last 90d with freshness decay. Full methodology in **Score Explanation** — nothing hidden. |
| Can I _pay in crypto_? | Not at launch. Card + Apple/Google Pay only. Stablecoin payments on Team are on the roadmap. |
| What's in Team that's not in Pro? | Shared watchlists/saved views, SSO + audit log, CSV/API export, auto weekly memo + retraction digest. For 3–10 seat desks. |

### 7.6 Three in-context upgrade modals

**Rule:** Each modal triggers from a teaser the user just clicked, and proves value from THAT teaser. NEVER interstitial. Carry-forward: synthesis stays the hero, originator stays first-class, every plan value stays a `.tok`.

**Modal A — Signals live feed** (480px, kicker "Unlock live signals"):
- Title: *See theses forming* — not after the fact.
- Sub: "The row you just clicked is real. **@CryptoInsights** + **@MacroMaxi** called _TIA long_ 4h ago. Consensus is crossing now."
- EOV block (mono key/value): thesis · TIA long → forming · 68% · first-mover @CryptoInsights -4h · α since first call +2.60 · free-tier unlock in ~20h.
- Plan note: **Pro** · `{plan.pro.price.monthly}`/mo · annual `{plan.pro.price.annual}`/yr · _`{plan.pro.trial}` trial · no card_.
- CTAs: primary "Start `{plan.pro.trial}` trial" + ghost "See all plans".

**Modal B — Saved views 4th slot** (560px, kicker "Save this view"):
- Title: The view you just built wants a _home_.
- Plan-snap (2-col): left "The filter you're on" → "Tier S only / + Watched creators / + L1s · last 14d"; right "What this view would surface now" (5% accent bg) → "**11 active theses** / 2 **orig** in the mix / avg α +4.3".
- EOV: 3 saved view examples + free cap `{gate.saved.free}` · pro cap `{gate.saved.pro}`.
- CTAs: "Save view + start trial" + "Replace an existing view" + "or · compare plans".

**Modal C — Compare +column** (640px, kicker "Wider comparison"):
- Title: Add a _third voice_ — synthesis gets sharper.
- Side-by-side cells (`grid-template-columns: 1fr 1fr 44px 1fr`): existing 2 creators + plus separator (large italic accent +) + locked 3rd cell (dashed `--new` border, 4% steel-blue bg) showing real candidate creator data.
- Synthesis preview: regenerated headline showing how the 3rd voice changes the synthesis.
- EOV: columns current `{gate.compare.free}` → pro `{gate.compare.pro}` + synthesis regenerates per column + disagreement drill now shows tie-breaking column.
- CTAs: "Add column + start trial" + "See all plans" + "synthesis auto-regenerates".

---

## 8. Metric Hover Library (D5)

Canonical 360px popover applied to 10 metrics with identical anatomy. **6 slots** (5 fixed + 1 optional): Header → What → How → Good (calibrated scale) → Source → Caveat (optional, fires only when the instance is fragile).

### 8.1 Tooltip anatomy (verbatim CSS)

```css
.pop { background:var(--ink-000); border:1px solid var(--accent-dim); box-shadow:0 16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(201,162,75,.12); width:360px; font-family:var(--font-sans); font-size:12px; }
.pop::before { content:""; position:absolute; top:-6px; left:32px; width:10px; height:10px; background:var(--ink-000); border-top:1px solid var(--accent-dim); border-left:1px solid var(--accent-dim); transform:rotate(45deg); }

.pop-trigger { font-family:var(--font-mono); font-size:11px; color:var(--ink-800); border-bottom:1px dotted var(--accent-dim); cursor:help; padding:0 1px; letter-spacing:.02em; }

.pop .ph { padding:14px 16px 10px; border-bottom:var(--hair); }
.pop .body { padding:14px 16px; display:flex; flex-direction:column; gap:13px; }
.pop .blk { display:grid; grid-template-columns:56px 1fr; gap:10px; align-items:baseline; }
.pop .blk.how .v { font-family:var(--font-mono); font-size:10.5px; }
.pop .src { padding:10px 16px; border-top:var(--hair); background:var(--ink-050); font-family:var(--font-mono); font-size:9.5px; color:var(--ink-500); }
.pop .cav { padding:8px 16px; border-top:var(--hair); background:rgba(217,119,87,.06); color:var(--warn); display:flex; align-items:center; gap:8px; font-size:11px; line-height:1.4; }
.pop .cav::before { content:"!"; flex-shrink:0; width:14px; height:14px; border:1px solid var(--warn); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:10px; font-weight:500; line-height:1; }

.scale-bar { height:6px; background:linear-gradient(90deg, var(--neg) 0%, var(--stale) 40%, var(--pos) 70%, var(--accent) 100%); border-radius:2px; position:relative; }
.scale-mark { position:absolute; top:-2px; width:2px; height:10px; background:var(--ink-900); box-shadow:0 0 0 1.5px var(--ink-000); }
```

**Slot rules:**
- **Header:** kicker (mono 9px accent uppercase) describing the metric's role + name row with Greek symbol (mono 14px accent), italic name (Source Serif italic, 17px, accent), right-aligned `.av` qualifier (e.g. `+8.42 · @CryptoInsights · 90d`).
- **What:** plain-English definition. One sentence. Never a formula.
- **How:** the formula. The ONLY slot where math lives. `<code>` chips: ink-100 bg, accent text, 10px.
- **Good:** calibrated scale bar with marker pinned at `left: %` for the user's current value. Below: 3 mono labels (low / **typical bold** / elite).
- **Source:** ink-050 bg, hairline-top, mono 9.5px. N + methodology link.
- **Caveat:** ONLY when the instance is fragile (`N < 12`, `CI width > 4.0`, `last call > 14d`). Multi-caveat priority: low-N → wide CI → stale, separated by `·`, max 2 lines. 3rd+ collapses to "+ see methodology".

### 8.2 Behavior

| Aspect | Desktop | Mobile |
|--------|---------|--------|
| **Trigger** | Hover (180ms delay) or `Tab` + focus | Tap (anchors above tap point, tap-away to dismiss) |
| **Dismiss** | Mouse-out + 120ms grace; `Esc`; route change | Tap outside, scroll, swipe-down on the sheet handle, route change |
| **Position** | Anchored, 8px offset, arrow toward trigger; flips on viewport edges; **never covers the number** | Bottom sheet (replaces popover) |
| **Persistence** | Ephemeral (not pinned). `ℹ︎` button opens full methodology drawer | Same |
| **A11y** | Trigger has `aria-haspopup="dialog"` and `aria-controls` → popover. Popover is `role="dialog"` (set by Radix Popover) with `aria-labelledby` on the metric name. Focus is trapped while open; returns to trigger on Esc. SR reads slots in order. **Note:** the visual primitive is colloquially called a "tooltip" but the a11y primitive is Popover (dialog semantics) — required because the popover contains interactive content (ℹ︎ button, Source link). See §8.4. | Sheet uses `aria-modal="true"` (Radix Dialog). |

**Long-press is explicitly REJECTED** — user-hostile. Tap wins on touch.

### 8.3 Catalog (10 metrics)

| # | Symbol · Name | Role | Qualifier | Good scale | Caveat fires when |
|---|---|---|---|---|---|
| 01 | α · Alpha | leaderboard rank driver | avg · 90d | monotonic · -5 / **+3** / +5 | wide CI when N<30 on single asset |
| 02 | β-α · Beta-adjusted alpha | risk-adjusted (Pro) | avg · 90d | monotonic · -3 / **+1.5** / +3 | regime change unstable; treat as directional 90d |
| 03 | CI · Confidence interval | how sure are we | bootstrap · 1000× | NON-MONOTONIC · ±0.8 / ±2.0 / ±4.0 (lower better) | always shaded band, never collapsed to ± |
| 04 | N · Tier-weighted N | sample adequacy | 90d window | monotonic · <12 / **30** / 80+ | below 12 → α gray italic + "low-N" tag |
| 05 | WR · Win rate | hit rate (supporting) | %, 90d | monotonic · 45% / **58%** / 70% | high WR + low α = small wins, big losses |
| 06 | RR · Retraction rate | intellectual honesty | %, 90d | NON-MONOTONIC U · 0% / **8–15%** / >25% | _no caveat_ |
| 07 | FM · First-mover rate | originator | %, 90d | monotonic · <10% / **30%** / 50%+ | FM without α = loud but wrong |
| 08 | H · Median horizon | trading style context | days | CONTEXT-ONLY · `<3d / 3-10d / >10d` | _no caveat_ |
| 09 | V · Velocity | publishing cadence | calls/week | NON-MONOTONIC U · context-only · `1-4/wk healthy` | dormancy fires V<0.3 for 14d |
| 10 | OL · Overlap-with-you | personal alignment | %, 30d | CONTEXT-ONLY · "high ≠ better" | requires portfolio connection; hidden if none |

**Application matrix** (which surface uses which metric, ● primary / ○ secondary / — absent):

| Metric | Leaderboard | Profile | Signals | Compare | Dashboard |
|---|---|---|---|---|---|
| α | ● | ● | ○ | ● | ○ |
| β-α | ○ | ● | — | ● | — |
| CI | ○ | ● | — | ○ | — |
| N | ● | ● | ○ | ● | — |
| WR | ○ | ● | — | ○ | — |
| RR | — | ● | ○ | ● | ○ |
| FM | ○ | ● | ● | ● | ○ |
| H | ○ | ● | — | ● | — |
| V | ○ | ● | — | ○ | ● |
| OL | ○ | ○ | ● | — | ● |

### 8.4 React skeleton

**Why Popover, not Tooltip.** D5 puts an interactive `ℹ︎` button + dotted Source link inside the popover. Interactive controls inside `role="tooltip"` are an a11y violation: tooltips are non-interactive descriptive helpers. We use Radix Popover (`role="dialog"` semantics with focus management) on desktop, and a Sheet on mobile (§9.5). The "Tooltip" naming in the prototype is preserved as the visual primitive name; the technical primitive is Popover.

```tsx
// src/components/composites/MetricPopover.tsx
"use client";
import * as Popover from "@radix-ui/react-popover";
import { cloneElement, isValidElement, type ReactElement } from "react";

// Caveat triggers per the catalog in §8.3 — wider than {low-n, wide-ci, stale}:
export type CaveatTrigger =
  | "low-n"             // N below metric.lowN.threshold
  | "wide-ci"           // CI half-width above CI flag (#03)
  | "stale"             // last call > 14d
  | "regime-change"     // β unstable post-shock (#02)
  | "high-wr-low-alpha" // WR>typical but α<typical (#05)
  | "fm-without-alpha"  // FM>typical but α<typical (#07)
  | "dormancy"          // V < metric.dormancy.v_min for 14d (#09)
  | "no-portfolio";     // OL hidden if no portfolio connected (#10)

export interface MetricSpec {
  symbol: string;       // "α", "β-α", "CI", …
  name: string;         // "Alpha", "Beta-adjusted alpha", …
  role: string;         // "Metric · leaderboard rank driver"
  qualifier: string;    // "avg · 90d" or context-bound value
  what: string;         // one-sentence plain English; never a formula
  how: { formula: string; gloss: string };
  good: {
    scale: "monotonic" | "non-monotonic-u" | "context";
    markerPct: number;  // 0–100, where the user's value sits
    low: string;
    typical: string;
    elite: string;
  };
  source: { name: string; nValue?: number; methodologyHref: string };
  caveat?: { triggers: CaveatTrigger[]; copy: string };
}

interface MetricPopoverProps {
  // Trigger MUST be a single React element that forwards `ref` and accepts `aria-*` props.
  // Fragments, text nodes, or arrays will throw — Radix `asChild` requires one element.
  trigger: ReactElement;
  spec: MetricSpec;
}

export function MetricPopover({ trigger, spec }: MetricPopoverProps) {
  if (!isValidElement(trigger)) {
    throw new Error("MetricPopover.trigger must be a single React element (Radix asChild).");
  }
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}              // ensures it never covers the number it explains
          avoidCollisions                     // flips to opposite side near viewport edges
          className="pop z-popover"           // see §10.3 z-index scale
          aria-label={`${spec.name} — methodology popover`}
        >
          <PopHeader spec={spec} />
          <PopBody spec={spec} />
          <PopSource spec={spec} />
          {spec.caveat && <PopCaveat spec={spec} />}
          {/* No Popover.Arrow — the .pop CSS draws the ::before arrow already (§5.2.15 / §8.1). */}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

Catalog source — `src/lib/metrics.ts` exports a `Record<string, MetricSpec>` keyed by metric id (`alpha`, `beta-alpha`, `ci`, `n`, `wr`, `rr`, `fm`, `h`, `v`, `ol`). Every popover instance pulls its spec from this single registry.

**Mobile substitution.** `useMediaQuery("(max-width: 767px)")` switches the trigger to open `<MetricBottomSheet>` (Radix Dialog under the hood — see §11.6) instead of the popover. The 4 slots stay; the Good slot's scale-bar collapses to inline text per §9.3.

**Trigger pattern.** Wrap any pop-trigger element in `<MetricPopover>`; don't use it as a wrapper around bare text:

```tsx
// GOOD — single element, accepts ref + aria props
<MetricPopover spec={metrics.alpha} trigger={
  <button type="button" className="pop-trigger">α 8.42</button>
} />

// BAD — text node will throw; Radix asChild requires an element
<MetricPopover spec={metrics.alpha} trigger={"α 8.42"} />
```

**Optional fallback.** If you want to avoid Radix entirely, hand-roll with `@floating-ui/react` (`useFloating` + `useDismiss` + `useRole({role:"dialog"})` + `useInteractions`). The component contract above stays identical — only the import changes.

---

## 9. Mobile Responsive (D6)

### 9.1 Breakpoints — three rails, mobile-first, min-width only

| Rail | Token | Min-width | Targets | Layout intent |
|------|-------|-----------|---------|---------------|
| **phone** | `bp.phone` | 0–767 | iPhone SE 375, iPhone 15 393, small/mid Android | Single column. Bottom-nav. Tables → cards. 4-way Compare → 2-way + pager. Popovers → bottom sheets. No sticky sidebars. **Skim-first: one decision per screen.** |
| **tablet** | `bp.tab` | 768–1279 | iPad portrait/landscape, small laptops | Two columns, collapsible rail. Tables ≤4 cols (drop-priority). Compare 2-way default, 3-way max. Popovers inline. Cockpit 2×2. |
| **desktop** | `bp.desk` | 1280+ | Laptops, monitors | **Canonical experience.** Full density. 4-way Compare. 1×4 cockpit. Hover popovers. Sticky rails. |

**Conventions:**
- Mobile-first CSS, **min-width queries only**. Base = phone. Additive `@media (min-width: 768px)` adds tablet. Additive `@media (min-width: 1280px)` adds desktop. NO `max-width` queries.
- Between 1280–1440: desktop layout at natural width, max-width 1360px container.
- Above 1440: container caps at 1360 centered. Whitespace grows; content doesn't. **No "ultrawide" variants.**

### 9.2 Mobile type scale (resolves Phase 1 deferral)

| Element | Phone | Tablet |
|---------|-------|--------|
| Body min | 12.5px | 13px |
| Serif headline | 18px | 22px |
| Card title (serif) | 14px | 16px |
| Row name (serif) | 13px | 14px |
| α/headline number (cockpit) | serif italic 18px accent | serif italic 22px |
| Metric pair value (Compare) | serif italic 17px | serif italic 18px |
| Bottom-sheet title | serif 15px | n/a |
| Mono detail/qualifier | 9–10px | 10–11px |
| Nav-bar tab labels | 8.5–10px | 10–11px |
| Hit target min | 44px | 44px |

### 9.3 Compression ruleset (14 primitives)

| # | Primitive | Phone @375 | Tablet @768 |
|---|-----------|------------|-------------|
| 01 | α value + CI band | keep (CI shrinks to pill, never collapses) | keep |
| 02 | Tier badge | keep | keep |
| 03 | Originator glyph | keep | keep |
| 04 | Evidence strip (8 pips) | **2 glyphs default** (SRC + N); other 2 reveal on tap | 4 glyphs |
| 05 | Metric hover popover | **→ bottom sheet** (max 70vh) | tap-popover (280–320px) |
| 06 | Decision cockpit | **→ vertical 4-card stack** (each cell ≥240px) | 2×2 grid |
| 07 | Leaderboard table | **→ card list** | 4-col table (drop-priority: OL → V → H → β-α first to go) |
| 08 | Compare 2/4-way | 4-way → 2-way + pager-dot+tap (NO swipe — see §9.7) | 3-way max |
| 09 | Signals skim list | 3-line cards (headline · evidence · synthesis fragment) | near-desktop |
| 10 | Assumptions panel | → pull-up drawer | sidebar-docked |
| 11 | Methodology drawer | full-page drawer | full-page drawer |
| 12 | Pricing 3-col | stack vertically; modals → full-screen | 2-col |
| 13 | Top masthead | wordmark + hamburger | wordmark + 4-item nav + avatar |
| 14 | Sticky left filter rail | **drop** — single bottom-sheet "Filter" action | collapsible chip-row at top |

### 9.4 Mobile nav

- **Phone:** wordmark + hamburger (top-left); bottom tab bar (5 tabs): `Board · Signals · Cmp · Dash · Me`. Active = `--accent`. Tab cells ~44px effective.
- **Tablet:** wordmark + horizontal text-link primary nav (4 items) + avatar.
- **Desktop:** full breadcrumb + masthead.

> Open: OQ-8 — bottom-nav vs hamburger composition. Currently 5 tabs.

### 9.5 Mobile-first CSS (verbatim)

```css
/* Mobile-first base — phone defaults (matches §2.5 phone gutter 14px, top 24px). */
main { max-width:1360px; margin:0 auto; padding:24px 14px 96px; }

/* Tablet — wider gutters, more top space. */
@media (min-width: 768px) {
  main { padding:48px 24px 120px; }
}

/* Desktop — canonical experience. */
@media (min-width: 1280px) {
  main { padding:56px 32px 120px; }
}

/* Cockpit cell (phone default — vertical stack, never 2x2 on phone per §9.3 reasoning). */
.cockpit-cell { border:var(--hair); background:var(--ink-050); padding:12px; margin-bottom:8px; }

/* Tablet — 2x2 cockpit. */
@media (min-width: 768px) {
  .cockpit-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--ink-200); border:var(--hair); }
  .cockpit-cell { margin-bottom:0; padding:14px; }
}

/* Desktop — 1x4 cockpit. */
@media (min-width: 1280px) {
  .cockpit-grid { grid-template-columns:repeat(4,1fr); }
}

/* Top masthead — phone */
.mk-nav { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:var(--hair); }
.mk-ham { width:24px; height:24px; display:flex; flex-direction:column; justify-content:center; gap:3px; }
.mk-ham span { height:1px; background:var(--ink-700); display:block; }

/* Bottom tab-bar — PHONE-ONLY surface, expressed mobile-first per §9.1.
   Phone is the base; tablet+ explicitly hides it via min-width query. */
.mk-tb { position:fixed; bottom:0; left:0; right:0; display:grid; grid-template-columns:repeat(5,1fr); border-top:var(--hair-strong); background:var(--ink-050); z-index:var(--z-masthead); }
.mk-tb div { text-align:center; padding:10px 4px; font-family:var(--font-mono); font-size:8.5px; color:var(--ink-500); letter-spacing:.06em; text-transform:uppercase; }
.mk-tb div.on { color:var(--accent); }
.mk-tb .ic { display:block; width:14px; height:14px; margin:0 auto 4px; border:1px solid currentColor; border-radius:2px; }
/* Reserve space at bottom of main on phone so content doesn't sit under the bar. */
main { padding-bottom: calc(96px + 56px); }

/* Tablet+ hides the bar and reverts the bottom padding. */
@media (min-width: 768px) {
  .mk-tb { display:none; }
  main { padding-bottom: 120px; }  /* tablet/desktop default per §2.5 */
}

/* Bottom sheet (phone metric popover replacement) */
.mk-sheet { position:fixed; bottom:0; left:0; right:0; background:var(--ink-100); border-top:1px solid var(--ink-300); padding:16px 14px 20px; box-shadow:0 -20px 40px -20px rgba(0,0,0,.6); max-height:70vh; overflow-y:auto; }
.mk-sheet-handle { width:40px; height:3px; background:var(--ink-400); border-radius:2px; margin:0 auto 12px; }

/* Phone leaderboard row (card pattern) */
.mk-row { display:grid; grid-template-columns:1fr auto; gap:8px; padding:10px 14px; border-bottom:var(--hair-soft); align-items:center; font-size:12px; }
.mk-row .v { font-family:var(--font-serif); font-size:15px; color:var(--accent); font-weight:500; font-style:italic; text-align:right; }
.mk-row .v small { display:block; font-family:var(--font-mono); font-size:9px; color:var(--ink-500); font-style:normal; }

/* Selected metric tile (phone, when sheet is open) */
.metric-tile-selected { border:1px solid var(--accent); background:rgba(201,162,75,.06); box-shadow:0 0 0 3px rgba(201,162,75,.08); }
```

### 9.6 Hidden vs substituted

**Substituted on phone:** popover → bottom sheet · table → card list · 4-way → 2-way + pager · cockpit 1×4 → vertical stack · masthead → wordmark + hamburger · pricing 3-col → vertical · upgrade modal → full-screen.

**Dropped on phone:** sticky left filter rail · breadcrumb · cockpit 2×2 (semantic cells need ≥240px; cell 4 route-trace truncates) · evidence strip glyphs 3+4 (tap to reveal).

**Kept across all viewports:** α value + CI band · tier badge · originator glyph · methodology drawer · synthesis-first discipline (Compare).

### 9.7 Touch interactions

- Hover never required on phone.
- Tap row in mobile leaderboard → profile drawer.
- Tap on metric tile → opens bottom sheet (with selected-state outline).
- Swipe-down to dismiss sheet.
- **Long-press is BANNED** — user-hostile.
- **Compare pager (resolved):** pager dots + tap to advance. **Swipe is explicitly NOT used** — conflicts with iOS browser back-swipe. The dot row sits below the synthesis band; tapping a dot advances the visible pair.

---

## 10. Motion & Micro-interactions

### 10.1 Catalog

| Token | Value | Use |
|-------|-------|-----|
| Hover bg transition | `transition: background 80ms` (linear) | Table rows, signal rows, alerts rows, dashboard cards |
| Skeleton shimmer | `animation: shimmer 1.4s infinite linear` (gradient sweep, 200% bg-size) | Loading rows |
| Hot-freshness ring | `animation: fresh-ring 2.4s ease-out infinite` | Single hot signal — others de-escalate |
| Backdrop blur (masthead) | `backdrop-filter: blur(12px)` + 88% bg opacity | Sticky header |
| Backdrop blur (compare bar) | `backdrop-filter: blur(6px)` + 96% bg opacity | Sticky compare bar |
| Preview-lock blur | `filter: blur(4px)` (4–6px range) | Locked-preview real data |
| Modal/popover lift | `box-shadow: 0 24px 64px rgba(0,0,0,.6)` (modal) / `0 16px 48px rgba(0,0,0,.6)` (popover) | The ONLY shadows in the system |

**No spring physics. No bounce.** All easing is `ease-out` (fresh-ring) or implicit linear. State changes (hover, selected, sort, filter) are immediate or 80ms. **One concurrent "hot" signal max** — multiple signals de-escalate oldest-first.

### 10.2 Page-load orchestration

Single discipline: layout doesn't reflow on data arrival. `<SkeletonRow>` mirrors final grid, header is rendered server-side (Next App Router default), data fetched in `<Suspense>`.

### 10.3 Z-index scale (canonical)

See §2.6 for the full table. Always use `z-{name}` Tailwind utilities, never raw numbers.

### 10.4 Gradient & shadow exemptions (honest)

§1 says "no gradients except subtle radial vignettes" and "no shadows except modal/popover lift." Both are aspirational rules that have explicit exemptions baked into prototypes. The honest list:

**Gradients allowed (full list):**
- Ambient body backdrop — radial gradients on `body::before` (§2.2). Decorative atmosphere.
- `<SkeletonRow>` shimmer — linear gradient sweep (`shimmer` keyframes). Required for the loading affordance.
- `<PremiumPreviewLock>` veil — linear `transparent → 85% ink-000 → ink-050` (§5.1.5). Required to surface the lock chrome over blurred real data.
- Pricing tier `.tier.rec` — linear `5% accent → transparent` (§7.3). Editorial highlight on the recommended tier.
- Compare `<SynthesisBand>` — linear `4% accent → transparent` (§5.2.12). Same editorial highlight pattern.
- Metric popover Good-scale `.scale-bar` — linear neg/stale/pos/accent gradient (§8.1). Required to communicate the calibrated scale visually.
- Premium teaser `.teaser .veil` (§5.2 / §6 locked-preview) — linear `transparent → 82% ink-000 → ink-050`. Same locked-preview pattern.

**Shadows allowed (full list):**
- Modal content lift (`shadow-modal`: `0 24px 64px rgba(0,0,0,.6), 0 0 0 1px rgba(201,162,75,.15)`).
- Popover content lift (`shadow-popover`: `0 16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(201,162,75,.12)`).
- Tooltip content lift (`shadow-tooltip`: `0 8px 32px rgba(0,0,0,.5)`).
- Mobile bottom-sheet lift (negative-Y: `0 -20px 40px -20px rgba(0,0,0,.6)`).
- Selected leaderboard row inset (`box-shadow: inset 2px 0 0 var(--accent)` — §5.2.2). Acts as a left-edge accent rail, not a drop shadow.
- Live-dot ring pulse (`box-shadow: 0 0 0 2px rgba(111,165,106,.25)` and accent variants — §5.2.13 / §5.1.4). Telegraphs liveness via colored halo, not lift.
- Selected metric tile on phone (`box-shadow: 0 0 0 3px rgba(201,162,75,.08)` — §9.5). Same halo pattern.
- AlphaScore peer-rail mark on hero (`box-shadow: 0 0 0 1.5px var(--ink-000)` ring around the marker — §8.1 `.scale-mark`). Inset ring, not drop shadow.

**This is the design-system canon.** Anything not on the lists above is forbidden in v1 of the FE — even if it appears in the prototype HTML files. Specifically:
- The prototypes contain a few decorative shadows and gradients (e.g. `box-shadow` on hovercards, drop-shadows on certain pinned chrome) that are **NOT carried forward**. They were experimental flourishes; the spec ratifies the restraint pass over the prototype.
- Future additions to either list require a spec amendment (new §10.4 entry) and a stated semantic justification ("communicates X state"), not just visual taste.

**Insets and colored halos are explicitly distinguished from drop shadows** — they're allowed because they communicate state, not depth. A 2px accent left-border on a selected row, a 2px halo around a live dot — these are state, not lift.

### 10.5 Provenance rule (honest)

§1 says "every score, badge, and chip carries a provenance square." That overstates it. The accurate version:

> **Every *datum* carries a provenance link** (Alpha Score, Call row, Thesis, Resolution outcome). Visual chips that *qualify* a datum — Tier, Badge, DirChip, Originator, Lock, Stale, Confidence-bar — do NOT carry their own provenance because they are derived from the datum they decorate. The underlying datum's provenance is one click away.

In code: `<Provenance>` lives on rows that hold raw data; modifier chips don't take a `provenance` prop.

---

## 11. Accessibility

### 11.1 Contrast — covered

All token-on-surface combinations pass WCAG AA per §2.3 scoping table.

### 11.2 Keyboard map (canonical)

| Scope | Key | Action |
|-------|-----|--------|
| Global | `/` | Focus search |
| Global | `⌘K` / `Ctrl+K` | Open command palette |
| Global | `Esc` | Close drawer/modal/sheet, return focus |
| Leaderboard | `↑↓` | Row nav |
| Leaderboard | `↵` | Open profile |
| Leaderboard | `Space` | Toggle row select |
| Leaderboard | `c` | Open Compare with selected |
| Leaderboard | `1`–`5` | Jump timeframe (7d/30d/90d/YTD/All) |
| Leaderboard | `[` `]` | Cycle timeframe |
| Leaderboard | `d` | Cycle density |
| Profile | `f` | Follow |
| Profile | `a` | Configure alerts (paid CTA on free) |
| Profile | `c` | Compare with this creator |
| Profile | `w` | Open Score Explanation drawer ("why") |
| Calls | `↑↓` | Row nav (drawer updates LIVE) |
| Calls | `⌘↵` | Open full call page |
| Calls | `⌘d` | Copy deeplink |
| Calls | `!` | Report dispute |

### 11.3 ARIA & semantics

- Every chip with information = focusable + `aria-label`. Metric-popover triggers additionally use `aria-haspopup="dialog"` + `aria-controls` (per §8.2). Plain (non-interactive) tooltip triggers use `aria-describedby` pointing at the `role="tooltip"` element.
- Score Explanation drawer = `role="dialog"`, `aria-labelledby`, focus trap, restore focus on close.
- Tooltip = `role="tooltip"` (Radix handles this).
- Bottom sheet = `aria-modal="true"`.
- Tables use proper `<thead>`, `<tbody>`, `scope="col"`, `aria-sort` on sorted column.
- Loading states use `aria-busy="true"` on the parent.
- Color is NEVER the only signal: every state token also has shape (dot, border, icon) and copy.

### 11.4 Screen reader linearization

Metric popovers read in slot order: "α, 8.42 — Alpha, leaderboard rank driver. Log-return excess... Source: Resolved calls ledger, N 214."

### 11.5 Reduced motion

Scope to design-system selectors so we don't fight third-party widgets (e.g. recharts internal animations are useful for axis transitions).

```css
@media (prefers-reduced-motion: reduce) {
  /* Design-system motion only. */
  .fresh.hot .pulse::after,
  .sk span,
  .sig2,
  .lb-table tbody tr,
  .csignal,
  .alrow,
  .btn,
  .toc a,
  .modal,
  .pop,
  .mk-sheet {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
  /* Keep recharts and other third-party widgets at default behavior. */
}
```

### 11.6 Modal / Drawer / Sheet shared primitive contract

All three are dialog-class surfaces. Differ only in placement, scale, and dismissal affordances. Implement on top of `@radix-ui/react-dialog` (deps in §12.4) — Radix handles focus-trap, scroll-lock, `aria-modal`, `aria-labelledby`, and outside-click for free.

| Aspect | Drawer (desk) | Bottom Sheet (phone) | Modal (upgrade flow only) |
|---|---|---|---|
| Trigger context | preserves list/profile context behind it | replaces drawer on phone | anchored to user intent (the teaser they clicked); never interstitial |
| Width / height | 540px right rail | full-width, max-height 70vh | 480 / 560 / 640 (per intent — see §7.6) |
| Anchor | `right: 0` | `bottom: 0` | viewport-centered, top: 60–80px |
| Overlay | optional dim backdrop (40% opacity ink-000) | mandatory dim backdrop | mandatory dim backdrop |
| Focus trap | yes (Radix) | yes (Radix) | yes (Radix) |
| Scroll lock | yes — apply `overflow: hidden` to `<body>` while open | yes | yes |
| Inert background (a11y) | Radix `aria-hidden` on portal siblings + focus-trap (no `inert` attribute applied) | same | same |
| Esc dismisses | yes | yes | yes |
| Outside-click dismisses | yes | yes (tap-away) | only if no destructive change in progress |
| Animation | none (instant; per §1 "no spring physics") | optional CSS slide-up 120ms ease-out | none |
| Focus restore on close | yes — back to origin element | yes | yes |
| ARIA | `role="dialog"` `aria-modal="true"` `aria-labelledby` (Radix sets these) | same | same |
| Z-index (§10.3) | `drawer` (60) | `sheet` (65) | `modal` (100) |
| Reduced motion | static immediately on open/close | static immediately on open/close | static |
| Nested dialogs | not allowed — opening a second dialog closes the first | not allowed | not allowed |

**Shared React skeleton (`src/components/templates/Dialog.tsx`):**

```tsx
"use client";
import * as RDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

type Variant = "drawer" | "sheet" | "modal";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: Variant;
  title: string;            // for aria-labelledby (visible or sr-only)
  titleVisible?: boolean;
  description?: string;     // optional — sets aria-describedby; pass undefined to opt out
  showOverlay?: boolean;    // drawer defaults to false (page stays visible behind); sheet/modal force true
  showClose?: boolean;      // renders top-right "×" close affordance (default true; modals inside flows may set false)
  width?: number;           // modal only — 480 | 560 | 640
  children: ReactNode;      // composed content; callers add their own DrawerHeader / DrawerBody etc.
}

export function Dialog({
  open, onOpenChange, variant, title,
  titleVisible = true, description,
  showOverlay, showClose = true,
  width, children,
}: DialogProps) {
  // Variant-specific defaults & class wiring (z-index from §2.6 named scale, never raw numbers).
  // Drawer can OPT IN to an overlay (default off — list/profile stays visible behind).
  // Sheet and Modal ALWAYS render an overlay — `showOverlay={false}` is ignored for them.
  const overlayOn = variant === "drawer" ? (showOverlay ?? false) : true;
  const overlayClass = {
    drawer: "z-drawer-overlay",
    sheet:  "z-sheet-overlay",
    modal:  "z-modal-overlay",
  }[variant];
  const contentClass = {
    drawer: "fixed top-0 right-0 h-full w-[540px] bg-ink-150 z-drawer shadow-modal",
    sheet:  "fixed bottom-0 inset-x-0 max-h-[70vh] overflow-y-auto bg-ink-100 border-t border-ink-300 z-sheet",
    modal:  "fixed top-[60px] left-1/2 -translate-x-1/2 bg-ink-0 border border-accent-dim z-modal shadow-modal",
  }[variant];
  const widthStyle = variant === "modal" && width ? { width: `${width}px` } : undefined;

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        {overlayOn && (
          <RDialog.Overlay className={`fixed inset-0 bg-ink-0/40 ${overlayClass}`} />
        )}
        <RDialog.Content className={contentClass} style={widthStyle}>
          <RDialog.Title className={titleVisible ? "font-serif text-ink-900" : "sr-only"}>{title}</RDialog.Title>
          {description ? (
            <RDialog.Description className="sr-only">{description}</RDialog.Description>
          ) : null}
          {showClose && (
            <RDialog.Close asChild>
              <button
                type="button"
                aria-label="Close dialog"
                className="absolute top-3.5 right-4 font-mono text-mono-lg text-ink-500 hover:text-ink-800"
              >×</button>
            </RDialog.Close>
          )}
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
```

**Background `inert`.** Radix Dialog adds `aria-hidden` to siblings of its portal content automatically — that handles screen-reader inertness. For pointer/keyboard inertness on the rest of the page, Radix relies on focus-trap; if you also want the visual page to be visibly disabled, the modal overlay does that job (drawer omits the overlay by default so the underlying list/profile stays *visually* readable behind the drawer, which is the whole point — see §4.4).

**Close affordance.** The Dialog primitive renders a top-right `×` close button by default. Composers can suppress with `showClose={false}` and provide their own (e.g. ScoreExplanationDrawer puts close inside its sticky header alongside the breadcrumb).

**Overlay rule (per variant):**
- **Drawer:** no overlay by default (`showOverlay={false}` implicit) — the user still sees the leaderboard behind the Score Explanation, etc.
- **Sheet:** overlay always rendered (mobile context — full-attention surface).
- **Modal:** overlay always rendered — required to communicate "this blocks until acted upon."

The drawer / sheet / modal callers compose their content (`<DrawerHeader>`, `<DrawerBody>`, etc.) but share this Dialog primitive for focus-trap, overlay, scroll-lock, and ARIA. **Do not hand-roll these affordances.**

---

## 12. Implementation Guidance

### 12.1 File layout (Next.js 14 App Router)

```
src/
  app/
    layout.tsx                    # Root layout: fonts, body class, masthead
    globals.css                   # CSS vars (§2.1), body baseline (§2.2)
    page.tsx                      # Leaderboard
    creator/[handle]/
      page.tsx                    # Creator profile
    calls/
      page.tsx                    # Calls explorer (table + drawer)
      [id]/
        page.tsx                  # §6.10 full call page
    call/                         # legacy singular route — redirect-only
      [id]/
        page.tsx                  # → preserves query string + hash; permanentRedirect to /calls/[id]
    signals/
      layout.tsx                  # Sub-tabs (5-tab nav)
      page.tsx                    # → redirect to /signals/active
      active/page.tsx
      resolved/page.tsx
      by-asset/
        page.tsx                  # §6.7
        [symbol]/page.tsx         # asset detail (subset of active filtered to asset)
      by-creator-cluster/
        page.tsx                  # §6.8
        [id]/page.tsx             # cluster detail (out of v1.1 scope; renders a "coming soon" card)
      mine/page.tsx               # §6.9 (signed-in only)
      [thesis]/page.tsx           # thesis detail (e.g. /signals/sol-long)
    compare/page.tsx              # Reads ?c=&w=&a= from searchParams
    dashboard/page.tsx
    pricing/page.tsx
    methodology/page.tsx          # §6.13 full content with anchor IDs
    login/page.tsx                # §6.11
    signup/page.tsx               # §6.11
    settings/                     # §6.12
      layout.tsx                  # Sidebar nav (Account · Billing · Alerts · Notifications · Team)
      page.tsx                    # → redirect to /settings/account
      account/page.tsx
      billing/page.tsx
      alerts/page.tsx
      notifications/page.tsx
      team/page.tsx               # Team tier only — gated server-side
  components/
    primitives/
      AlphaScore.tsx
      ConfidenceBar.tsx
      Provenance.tsx
      SignalFreshness.tsx
      PremiumPreviewLock.tsx
      Badge.tsx
      RankTierBadge.tsx           # creator score tier chip — see §5.1.7 (NOT subscription Tier)
      DirChip.tsx
      Originator.tsx
      Rank.tsx
      Token.tsx                   # `.tok` placeholder chip
    composites/
      EvidenceStrip.tsx
      LeaderboardTable.tsx
      SkeletonRow.tsx
      ConsensusSnapshotRail.tsx
      CompareBar.tsx
      MetricCard.tsx
      BestCallCard.tsx
      SelfCorrectionViz.tsx
      ScoreExplanationDrawer.tsx
      CallDrawer.tsx
      Cockpit.tsx
      SynthesisBand.tsx
      SignalRow.tsx
      EmptyState.tsx
      ErrorState.tsx
      MiniEmpty.tsx
      Tooltip.tsx
      MetricPopover.tsx           # D5 360px popover
      MetricBottomSheet.tsx       # mobile substitute
    templates/
      Masthead.tsx
      PageShell.tsx
      Drawer.tsx
      UpgradeModal.tsx
      MobileNav.tsx
    icons/
      OriginatorGlyph.tsx
      RetractionDiamond.tsx
      ConsensusIcon.tsx
      LockProIcon.tsx
      DirLong.tsx
      DirShort.tsx
      # other icons via lucide-react
  hooks/
    useTimeframe.ts               # URL + localStorage state persistence
    useDensity.ts
    useWatchlist.ts
    useMediaQuery.ts              # bp.phone / bp.tab / bp.desk helpers
  lib/
    tokens.ts                     # plan/gate token registry (§2.7)
    metrics.ts                    # MetricSpec catalog (§8.3) — single source for all 10 popovers
    types.ts                      # shared TS types
    routes.ts                     # Compare URL builder, Signals tab routes
    a11y.ts                       # focus-trap helpers, aria-describedby plumbing
```

**Legacy `/call/[id]` redirect implementation.** The repo already has a singular `/call/[id]` route. Don't delete it — preserve external links by serving a permanent redirect:

```tsx
// src/app/call/[id]/page.tsx
import { permanentRedirect } from "next/navigation";

interface Props {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export default function LegacyCallRedirect({ params, searchParams }: Props) {
  // Preserve the FULL query string — including repeated keys like ?tag=a&tag=b.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") {
      qs.append(k, v);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") qs.append(k, item);
      }
    }
    // undefined values are dropped (Next gives undefined for missing keys).
  }

  // Encode the dynamic segment defensively — IDs are usually safe, but a hand-typed
  // URL could include characters that need percent-encoding.
  const id = encodeURIComponent(params.id);
  const target = `/calls/${id}${qs.toString() ? `?${qs.toString()}` : ""}`;

  // Hash fragments never round-trip to the server — browsers re-attach #anchor on
  // the redirected URL automatically, so we don't (and can't) preserve hashes here.
  permanentRedirect(target);  // 308 — search engines update; browsers cache.
}
```

Use `permanentRedirect()` (308) not `redirect()` (307) because the route move is final. Search-engine link-juice transfers; browsers cache the redirect.

### 12.2 Naming conventions

- Components in PascalCase, files match: `AlphaScore.tsx` exports `AlphaScore`.
- Props interfaces named `<Component>Props`, exported from same file.
- No default exports for components. Use named exports.
- Hooks prefixed `use`.
- Token registry exposed as a typed const, not strings.

### 12.3 State persistence (sort/filter)

- **Free tier:** filters → URL search params + `localStorage` (last session). Use Next.js `useSearchParams()` / `router.replace()` for URL; sync to `localStorage` on change.
- **Paid tier:** named "saved views" stored server-side, cross-device sync. UI for managing in `/dashboard`.
- Header click → sort desc; click again → asc; shift-click → multi-column.

### 12.4 Dependencies and data wiring

**New dependencies adopted in v1.1** (add to `package.json` `dependencies`):

| Package | Purpose | Why |
|---|---|---|
| `@radix-ui/react-popover` | MetricPopover (§8.4) | Interactive popover with proper ARIA + focus management. The D5 popover has interactive content (ℹ︎ button, dotted Source link), so Tooltip is wrong primitive — Popover is right. |
| `@radix-ui/react-dialog` | Drawer / Sheet / Modal (§11.6) | Focus-trap, scroll-lock, `aria-modal`, outside-click. Don't hand-roll these. |
| `@floating-ui/react` | Optional fallback for MetricPopover | If we want zero Radix footprint. Spec assumes Radix; this is documented escape hatch. |
| `zod` | Schema validation at API + URL boundaries | Required by global TS rules; canonical home for the URL-state schemas in §12.11 and the API-layer types. |
| `clsx` | Conditional class composition | Used in AlphaScore (§5.1.1) and elsewhere. Tiny, dependency-free, idiomatic. |
| `nuqs` (optional) | Typed `useQueryState` for App Router | Cleaner URL-state DX than hand-rolled `useSearchParams`. If skipped, hand-roll using the §12.11 schemas. |

**Data wiring (current backend → spec):**

The repo already has a pipeline (`scrape → extract → match → score → consensus`). The schema fields surfacing in the UI:

| UI field | Likely DB source |
|----------|------------------|
| Creator handle, tier, channel meta | `creators` / `tracked-creators.ts` (already exists) |
| α (90d) | `creator_stats` (output of `compute-scores.ts`) |
| Win rate, retraction rate, first-mover | `creator_stats` extensions (may need fields) |
| Calls table rows | `calls` (extracted by `extract-calls-openrouter.ts`) |
| Provenance (source/url/clipTs/sha/archive) | `calls.source_url`, `calls.clip_timestamp`, archive table TBD (see OQ-16) |
| Consensus theses | `consensus` (output of `detect-consensus.ts`) — **note pipeline currently uses 7d window; spec uses 14d Signals window. See OQ-17 for migration.** |
| Signal lifecycle (forming/active/fading/invalidated/resolved) | derived from `consensus` + price trace |
| return_30d (display only) | `creator_stats.return_30d` — **already stored as percent** — do NOT multiply ×100 again |
| Subscription tier (UI label) | `creators.tier` (`free`/`pro`/`elite`) → display labels Free/Pro/Team per §6.11. The auth-domain `Tier` type stays as-is in `src/lib/types.ts`. |
| Creator rank tier (S/A/B/C/F) | derived from `creator_stats.alpha_score` via tier cuts (OQ-7). UI type is `RankTier` in `@/lib/types` (§5.1.1) — distinct from subscription `Tier`. |

Build a typed `src/lib/api.ts` layer with Zod schemas (using the `zod` dep above) that the App Router routes call. Server components render skeletons; data flows via Suspense per §12.13.

### 12.4.1 Backend prerequisites — release-blocker checklist

Some surfaces require backend work that this spec cannot unilaterally complete. The rule is: **build the surface as static chrome (with seed data) now; flip the data wiring on once the backend prerequisite lands.** "Don't ship until green" applies to the *production data path*, not the *UI build*. PRs that land surface chrome before backend is ready MUST flag "wired with seed data" in the description.

| Surface | Backend prerequisite | Tracked OQ | What "blocks" means |
|---|---|---|---|
| `<Provenance>` primitive (full scale, drawer use) | Archive snapshot table + capture pipeline. Schema: `(call_id, archive_url, sha256, captured_at)`. Backend captures archive at scrape time (or via a daily backfill job for existing rows). | OQ-16 | UI can render Cell + Inline scales today using `source_url` + `clip_timestamp`. Full-scale drawer rendering with archive link waits. |
| `/signals/active` (live <6h, Pro) | `detect-consensus.ts` migrated to spec lifecycle: 14d window, ≥3 tier-B+ creators, ≥60% directional, N≥6, 48h fading rule, invalidation logic. Currently: 7d window with different thresholds. API must return per-thesis `state ∈ {forming, active, fading, invalidated, resolved}`. | OQ-17 | UI can render the page chrome and a static seed list now. Live data wiring waits for the pipeline migration. |
| `/signals/resolved` | Same as Active + `GET /api/signals/resolved` returning historical resolved theses with outcome (`✓ target`/`✗ drifted`/`✗ invalidated`/`~ mixed`) and final α. | OQ-17 | Page chrome + table chrome ships today with seed data; live ledger wiring waits. |
| `/signals/by-asset` | Same as Active + `GET /api/signals/by-asset` aggregating active theses by underlying asset. | OQ-17 | Same. |
| `/signals/by-creator-cluster` | Cluster cohesion algorithm + cluster ID assignment per creator. Currently no clustering exists. | OQ-23 | Surface ships with seed-data clusters first; live cohesion math is a v2 deliverable. |
| `/signals/by-creator-cluster/[id]` (cluster detail) | Cluster detail view requires the algorithm above. | OQ-23 | Renders a "coming soon" placeholder card in v1 (matches §6.8 scope note). |
| `/signals/mine` | Watchlist storage (`watched_creators` table) + `GET /api/signals/active?creator_id IN watchlist`. | OQ-17 (consensus pipeline) | Verify the join query is performant before launch. Page is gated behind sign-in. |
| `/signals/[thesis]` (thesis detail) | Same as Active + per-thesis aggregate-α timeseries + contributing calls list with provenance + sidebar lifecycle/invalidation cards. | OQ-17 + OQ-16 | Page can build a static reference layout from §6.4 today; data wiring waits for thesis API. |
| `<CallDrawer>` β-α math | β regression pipeline (CMC Top-10 30d rolling) + per-call β captured at resolution time. | OQ-2, OQ-18 | Standard α drawer ships today; β-α column is Pro-gated and waits for the regression pipeline. |
| `/calls/[id]` Pro provenance | Same as `<Provenance>` row above + Pro-tier source-locking enforcement at the API. | OQ-16 + OQ-25 | Free-tier summary view ships first; full Pro view waits. |
| `/dashboard` cockpit cell 1 ("what changed since last visit") | Server-recorded `users.last_dashboard_visit_at` column + write-on-page-load. | OQ-27 | Cockpit ships with cell 1 displaying "first visit" empty-state until column lands. |
| Settings auth middleware | Route-handler middleware applied to every `/settings/*` route that runs the §12.14 gate-matrix logic server-side (302 anon, 403 underprivileged tabs). Single canonical implementation, not per-route reinvention. | OQ-25 | Settings tabs render their UI today; the middleware MUST land before any settings route returns real data. |
| `/settings/billing` (Stripe / Whop integration) | Provider decision (Stripe vs Whop continuation) + webhooks + Customer Portal. | OQ-24 | Settings shell ships now (per §6.12). Live billing wiring waits for the provider decision. |
| `/settings/team` (Team tier) | SSO + audit log + seat invites + admin-vs-member role check. | OQ-32 | Surface gated behind 403 for Free/Pro until Team tier ships. Locked-preview shell renders for non-Team viewers. |
| Push alerts (Pro/Team) | Web Push subscription endpoint + service worker registration + per-user push subscription store + per-rule trigger evaluator. **Standalone capability** — distinct from the in-app alerts inbox. | OQ-31 | In-app alerts ship now. Push subscription UI in `/settings/alerts` ships disabled with "coming soon" until the evaluator + service worker land. |
| Compare PNG export | Server OG route OR client `html-to-image` (engineering decision). | OQ-21 | "[PNG export]" CTA can render disabled with a "coming soon" tooltip until the approach is chosen. |
| Command palette (`⌘K`) | `cmdk` lib integration + searchable index across creators/calls/theses/settings. | OQ-22 | Out of v1 scope. Reserve the keyboard shortcut; render no-op until the palette ships. |

**Rule for the engineer:** every surface in this checklist is buildable as static chrome today. Data wiring begins only after the backend prerequisite lands. Flag the gated state of a surface with a clear "wired with seed data" note in the PR until the backend ships.

### 12.5 Tailwind class composition strategy

- Prefer Tailwind utility classes at the call site; reach for the verbatim CSS in this doc only when the visual effect needs CSS variables/custom properties (gradient stops with token refs, inline `style={{ width: 'var(--alpha-fill)' }}`, etc.).
- Token-driven utilities like `bg-ink-50`, `text-accent`, `border-hair`, `font-mono` are the bread-and-butter.
- Use `clsx` or `cva` for variant composition (e.g. AlphaScore variants).
- Avoid `@apply` — keep CSS variables for runtime token values, Tailwind utilities for static styling. Example:

```tsx
<span
  className="font-mono text-[10px] text-ink-500 uppercase tracking-[0.12em]"
  style={{ '--alpha-fill': `${fillPct}%` } as React.CSSProperties}
>...</span>
```

### 12.6 Charts (recharts)

Already a dep. Use it for:
- Profile performance vs benchmark chart.
- Thesis detail aggregate-α chart.
- Compare cumulative-α overlay.

Theme:
- α main line: `stroke="#C9A24B" strokeWidth={1.8}` with smooth bezier.
- Bench: `stroke="#5B5F68" strokeDasharray="3 3"`.
- CI band: `<Area fill="#C9A24B" fillOpacity={0.08}>`.
- Individual creator faints: `stroke="#6FA56A" opacity={0.35}`.
- Retraction diamond: custom `<Scatter shape>` with `path d="M0 -7 L 6 0 L 0 7 L -6 0 Z"`.
- Grid: `stroke="#1A1B1E"` (`--ink-150`).

### 12.7 Performance & Next.js best practices

- All marketing/static surfaces (`/pricing`, `/methodology`, anonymous Leaderboard top-50) → `export const revalidate = 60` for ISR.
- `/dashboard`, `/signals/mine` → `export const dynamic = 'force-dynamic'` (auth-gated).
- Tables paginate server-side; the table component receives `searchParams` and renders only the slice.
- Use `next/font/google` (see §3.1) — avoids FOUT and `<link>` waterfall.
- Provenance archive links open in `target="_blank" rel="noopener"`.
- Background ambient gradients (`body::before`) are static, no JS.
- Live indicators use polling `setInterval` (15-min cadence on Signals); WebSocket is a v2 enhancement.
- All buttons/links that perform navigation use `next/link`.

### 12.8 Testing

- Unit tests for primitives: AlphaScore, ConfidenceBar, Provenance, MetricPopover, Cockpit cell logic.
- Integration: Leaderboard sort/filter persistence; Compare URL roundtrip; Drawer keyboard nav.
- E2E (Playwright per global rules): Leaderboard happy path; profile open; calls drawer keyboard nav; pricing modal A/B/C; mobile breakpoint snapshots at @375 / @768 / @1440.
- A11y: axe-core in CI; manual `Esc`/focus-restore on drawer/modal/sheet.

### 12.9 Migration plan from current `src/`

The current frontend uses a different palette and brand-mark. Migrate in this order:

1. Add the new deps (§12.4 deps list): `@radix-ui/react-popover`, `@radix-ui/react-dialog`, `@floating-ui/react`, `zod`, `clsx`. Optional: `nuqs` (URL state — see §12.11).
2. Replace `tailwind.config.ts` with §2.4 verbatim. Replace `src/app/globals.css` (or equivalent) with §2.1 + §2.2. **Build will be visually broken intentionally.**
3. Add fonts via `next/font/google` in root layout (§3.1).
4. Build `<Masthead>` and `<PageShell>` to anchor every route. Add `<Dialog>` primitive (§11.6) before any drawer/modal/sheet code.
5. Build all primitives (§5.1) and composites (§5.2) bottom-up — primitives first.
6. Migrate routes one at a time: Leaderboard → Profile → Calls → Signals (active/resolved/by-asset/by-creator-cluster/mine) → Calls/[id] → Dashboard → Compare → Pricing → Methodology → Auth → Settings.
7. Add `<MetricPopover>` to every metric site once primitives are in place.
8. Add mobile substitutions (§9) last — desktop-canonical first.
9. Delete unused legacy components.

### 12.10 Server / Client component map

Next 14 App Router defaults to Server Components. Mark only what *must* be a Client Component with `"use client"`. Rule: a component is Client iff it uses `useState`, `useEffect`, refs, browser APIs, or event handlers that fire only in the browser.

**Server (default — no directive):**
- All `page.tsx` route files. Data fetching lives here via `async` server components + `<Suspense>`.
- All `layout.tsx` files.
- `<PageShell>`, `<Masthead>` (the static parts — see split below).
- Static composition wrappers: `<LeaderboardTable>` shell, `<MetricCard>` shell when reading server data.
- All `<Provenance>` rendering (computed from server data, no interaction).
- All `<RankTierBadge>`, `<Badge>`, `<DirChip>`, `<Originator>` chips (no interaction).

**Client (`"use client"` directive):**
- `<AlphaScore>` — opens drawer on click.
- `<MetricPopover>`, `<MetricBottomSheet>` — uses Radix Popover/Dialog state.
- `<Dialog>` shared primitive (§11.6).
- `<ScoreExplanationDrawer>`, `<CallDrawer>` — open/close state, keyboard nav, focus restore.
- `<UpgradeModal>` (and modals A/B/C in §7.6).
- `<CompareBar>` — manages selected creators, sticky position, listens to selection changes.
- `<TimeframeSelector>`, `<DensityToggle>`, `<FilterChip>`, `<Search>` — all interactive controls.
- `<CommandPalette>` (§12.11 OQ).
- `<MastheadUserMenu>` — auth menu, conditional render based on session.
- `<Cockpit>` cockpit cells if they need client-side "since last visit" comparison; pure read can be Server.
- Sort header on tables — clicks rewrite URL (`router.replace`), so Client.
- Any component using `useSearchParams`, `useRouter`, `usePathname` from `next/navigation`.
- All charts (`recharts` is client-only).
- `<MobileNav>` bottom tab bar — depends on viewport via `useMediaQuery`.

**Split components (Server shell + Client island):**

For composites like `<LeaderboardTable>` that mostly render server data but need an interactive sort header and selection state, split:

```
LeaderboardTable.tsx        // server — renders table chrome + rows from server data
  ↳ LeaderboardSortHeader   // client — listens to clicks, rewrites URL
  ↳ LeaderboardRowSelect    // client — checkbox state, integrates with <CompareBar>
```

This keeps the heavy data path on the server and the interactive bits as small client islands. Don't blanket-mark a whole table tree as client.

**Data fetching pattern (server):**

```tsx
// src/app/page.tsx — Leaderboard route
import { getLeaderboard } from "@/lib/api";

export default async function LeaderboardPage({ searchParams }: { searchParams: { tf?: string; tier?: string } }) {
  const tf = parseTimeframe(searchParams.tf); // Zod-validated
  const tier = parseTier(searchParams.tier);
  const data = await getLeaderboard({ tf, tier });
  return <LeaderboardTable initial={data} />; // server shell + client islands inside
}
```

### 12.11 URL state schema

**Library:** `nuqs` (recommended — typed `useQueryState` for App Router) OR hand-roll with `useSearchParams` + `router.replace`. The contract below is the same either way.

**Schemas (one per route, declared in `src/lib/url-state.ts`):**

```ts
import { z } from "zod";

// Shared atom schemas with `.catch()` so an INVALID value falls back to default
// instead of throwing. `.default()` only fires on missing/undefined keys; `.catch()`
// fires on parse failure. Use both: missing → default, invalid → catch.
const tf = z.enum(["7d","30d","90d","YTD","All"]).default("90d").catch("90d");
const density = z.enum(["compact","comfortable","relaxed"]).default("comfortable").catch("comfortable");

// Comma-separated handle list, max N entries, normalized lowercase, dedup, no '@' prefix.
function handlesList(max: number) {
  return z.string().default("").catch("").transform((s) => {
    const parts = s.split(",")
      .map((h) => h.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    return Array.from(new Set(parts)).slice(0, max);
  });
}

// Sort token like "alpha:desc,wr:asc". Validated against a known column whitelist;
// unknown columns silently dropped. Direction defaults to desc.
// Whitelist mirrors leaderboard sortable columns (§5.2.2 / §6.1) — sparkline `trend`
// and chip-only `provenance` are intentionally NOT sortable.
const SORT_COLS = [
  "alpha",      // α score (default sort)
  "delta_30d",  // 30d Δ column
  "wr",         // win rate
  "n",          // sample size
  "tier",       // S/A/B/C/F bucket
  "last_call",  // recency of most recent call
  "retraction", // profile-level — exposed via Compare
  "first_mover",// profile-level — exposed via Compare
  "horizon",    // profile-level — exposed via Compare
] as const;
type SortCol = typeof SORT_COLS[number];
const sortField = z.string().default("alpha:desc").catch("alpha:desc").transform((s) => {
  const parsed = s.split(",").map((tok) => {
    const [col, dir] = tok.split(":");
    if (!SORT_COLS.includes(col as SortCol)) return null;
    return { col: col as SortCol, dir: dir === "asc" ? "asc" : "desc" as "asc" | "desc" };
  }).filter((x): x is { col: SortCol; dir: "asc" | "desc" } => x !== null);
  return parsed.length ? parsed : [{ col: "alpha" as const, dir: "desc" as const }];
});

export const LeaderboardParams = z.object({
  tf,
  tier:    z.enum(["S","A","B","C","F","All"]).default("All").catch("All"),  // F included
  cat:     z.string().default("All").catch("All"),
  n_min:   z.coerce.number().int().min(0).max(1000).default(10).catch(10),    // bounded
  density,
  sort:    sortField,
  sel:     handlesList(4),                                                    // compare selection — max 4
});

export const ProfileParams = z.object({ tf });

export const CallsParams = z.object({
  asset:   z.string().default("All").catch("All"),
  dir:     z.enum(["long","short","All"]).default("All").catch("All"),
  state:   z.enum(["open","resolved","all"]).default("all").catch("all"),
  horizon: z.enum(["<7d","7-30d",">30d","All"]).default("All").catch("All"),
  sel:     z.string().optional(),  // active call id for drawer
});

export const SignalsParams = z.object({
  win:    z.enum(["7d","14d","30d","90d"]).default("14d").catch("14d"),  // renamed from `window` to avoid global shadow
  asset:  z.string().default("All").catch("All"),
  state:  z.enum(["active","resolved","all"]).default("active").catch("active"),
  n_min:  z.coerce.number().int().min(0).max(1000).default(3).catch(3),
});

export const CompareParams = z.object({
  c: handlesList(4),                                                       // canonical max-4 enforcement
  w: z.enum(["7d","30d","90d","1y"]).default("30d").catch("30d"),
  a: z.string().optional(),                                                // asset filter, e.g. "SOL"
});

// Single helper that NEVER throws — every route uses this.
export function parseParams<T extends z.ZodTypeAny>(schema: T, raw: Record<string, string | string[] | undefined>): z.infer<T> {
  // Coerce string[] → first value (Next searchParams shape).
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  // safeParse never throws; missing keys hit `.default()`; invalid values hit `.catch()`.
  const result = schema.safeParse(flat);
  if (result.success) return result.data;
  // Should be unreachable given the `.catch()` chain on every field, but guards against
  // future schema regressions.
  return schema.parse({}) as z.infer<T>;
}
```

**Why `.catch()` not just `.default()`** — `.default()` only fires for `undefined` (missing key). It will throw for present-but-invalid values like `?tf=foo`. `.catch()` fires for parse failures, so `?tf=foo` gracefully clamps to `"90d"`. Together: missing → `default`, invalid → `catch`. **Every field uses both.**

**Param naming.** `SignalsParams.win` is named `win` (not `window`) because `window` shadows the global object in client components and creates ESLint hazards. URL: `/signals/active?win=14d&asset=SOL`.

**Conflict resolution rules:**
- **URL wins.** localStorage caches "last session" preferences (`density`, `tf` defaults, watchlist) but never overrides an explicit URL param.
- **Invalid params clamp to default** via `.catch()` (see helper above). No throw; no toast.
- **Cross-route persistence.** Density and tf preferences carry across routes via localStorage (write on change). Filter state (tier, asset, etc.) is route-scoped.
- **Sharing.** Compare URLs are screenshot-friendly per design; share button copies `window.location.href` as-is.

**`router.replace` (not `push`)** for filter/sort changes — keeps history clean. Use `push` only when the user navigates to a different *page* (clicking a row, opening a drawer, etc.).

### 12.12 Avatar & image policy

**Component:** wrap `next/image` in a `<CreatorAvatar>` primitive that handles fallback.

```tsx
"use client";
import Image from "next/image";
import { useState } from "react";
import { clsx } from "clsx";

interface CreatorAvatarProps {
  handle: string;        // for fallback initials + alt
  displayName?: string;  // preferred over handle for initials when present (e.g. "Crypto Insights" → "CI")
  src?: string;          // remote image URL; if undefined, missing host, or onError fires, fallback renders
  size: 22 | 36 | 48 | 84;
  priority?: boolean;    // true on profile hero only
  ringTier?: RankTier | null;  // see §5.1.1 — RankTier (creator score tier), NOT subscription Tier
}

// next/image throws SYNCHRONOUSLY on render if the URL host is not in next.config.images.remotePatterns.
// Pre-validating the host avoids that crash and falls back to initials cleanly.
const ALLOWED_AVATAR_HOSTS = new Set([
  "yt3.googleusercontent.com",
  "yt3.ggpht.com",
  "i.ytimg.com",          // YouTube channel avatar legacy
  "pbs.twimg.com",
  "substackcdn.com",
  "cdn.bsky.app",
  "i1.sndcdn.com",
]);

function isAllowedSrc(src: string): boolean {
  try {
    const url = new URL(src);
    // Both protocol AND hostname must match what next.config.js declares.
    // remotePatterns entries use protocol: "https" — http URLs fail there too.
    return url.protocol === "https:" && ALLOWED_AVATAR_HOSTS.has(url.hostname);
  } catch {
    return false;  // invalid URL → fallback
  }
}

function deriveInitials(displayName: string | undefined, handle: string): string {
  // Prefer display name with multi-word handling: "Crypto Insights" → "CI".
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return handle.replace(/^@/, "").slice(0, 2).toUpperCase();
}

import type { RankTier } from "@/lib/types";

export function CreatorAvatar({ handle, displayName, src, size, priority = false, ringTier = null }: CreatorAvatarProps) {
  const [errored, setErrored] = useState(false);
  const initials = deriveInitials(displayName, handle);
  const ringClass = ringTier === 'S' ? 'ring-2 ring-accent' : ringTier ? 'ring-1 ring-ink-300' : '';
  const useImage = src && isAllowedSrc(src) && !errored;

  if (!useImage) {
    return (
      <span
        role="img"
        aria-label={`${handle} avatar`}
        className={clsx(
          "inline-flex items-center justify-center rounded-full bg-ink-250 text-ink-800 font-serif font-medium select-none",
          ringClass
        )}
        style={{ width: size, height: size, fontSize: size * 0.35 }}
      >
        {initials}
      </span>
    );
  }

  return (
    <Image
      src={src!}
      alt={`${handle} avatar`}
      width={size}
      height={size}
      priority={priority}
      onError={() => setErrored(true)}
      className={clsx("rounded-full object-cover", ringClass)}
    />
  );
}
```

**Three-layer fallback:** (1) host not in allowlist → initials; (2) invalid URL → initials; (3) image load error → initials. The first check prevents Next from throwing synchronously on render. Update the `ALLOWED_AVATAR_HOSTS` set and `next.config.js` `images.remotePatterns` together — they MUST stay in sync.

**`next.config.js` allowlist** (add to `images.remotePatterns`):

```js
module.exports = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "yt3.googleusercontent.com" },     // YouTube channel avatars (current)
      { protocol: "https", hostname: "yt3.ggpht.com" },                  // YouTube legacy
      { protocol: "https", hostname: "i.ytimg.com" },                    // YouTube thumbnails / legacy avatars
      { protocol: "https", hostname: "pbs.twimg.com" },                  // X / Twitter
      { protocol: "https", hostname: "substackcdn.com" },                // Substack avatars
      { protocol: "https", hostname: "cdn.bsky.app" },                   // Bluesky
      { protocol: "https", hostname: "i1.sndcdn.com" },                  // SoundCloud / Pod
    ],
  },
};
```

**Loading discipline:** `priority` only on the profile hero avatar (above-fold, LCP element). All other avatars `loading="lazy"` (next/image default).

### 12.13 Loading & error strategy

**Per-route `loading.tsx`** (App Router auto-renders this during data fetch):

```tsx
// src/app/loading.tsx (Leaderboard)
import { SkeletonRow } from "@/components/composites/SkeletonRow";

export default function LeaderboardLoading() {
  return (
    <main className="max-w-page mx-auto px-3.5 pt-6 pb-30 tab:px-6 tab:pt-12 desk:px-8 desk:pt-14">
      <div className="border border-hair-strong">
        {Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)}
      </div>
    </main>
  );
}
```

Each route owns its own `loading.tsx` that mirrors the final layout grid (no reflow on data arrival — see §10.2). Profile loading uses `<MetricCard>` skeletons; Calls uses table skeleton; Compare uses synthesis-band skeleton.

**Per-route `error.tsx`:**

```tsx
// src/app/error.tsx
"use client";
import { useEffect } from "react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="max-w-[520px] mx-auto p-12">
      <div className="border-l-2 border-neg pl-6 py-4">
        <p className="font-mono text-mono-sm text-neg uppercase tracking-caps">Error</p>
        <h2 className="font-serif text-h2 text-ink-900 mt-2">Something broke loading this surface.</h2>
        <p className="mt-4 text-body text-ink-700">Filters preserved. Try again.</p>
        {error.digest && <p className="mt-2 font-mono text-mono-sm text-ink-500">id: <span className="copy" onClick={() => navigator.clipboard.writeText(error.digest!)}>{error.digest}</span></p>}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={reset} className="btn p">Retry</button>
          <a href="/" className="btn">Continue</a>
        </div>
      </div>
    </main>
  );
}
```

**Component-level `<Suspense>` boundaries** for sub-tree loading (e.g. drawer body separately from drawer chrome). Use streaming on `/calls` paginated tables: stream the next page-of-rows under a Suspense boundary so the rest of the table stays interactive.

**Partial-load rule (Calls "312 of 1284, state-preserved"):** when the API returns a partial page on retry, render the rows we have + a banner above the table noting the partial state. Filters + scroll position survive.

### 12.14 Premium gating state machine

**Tier states** (canonical UI labels → DB tier mapping — see §6.11):

| UI label | DB `tier` value | Description |
|---|---|---|
| Anon | (no row) | Not signed in |
| Free | `free` | Signed in, no subscription |
| Trial | `pro` (subscription_status=trialing) | Pro features active for `{plan.pro.trial}` |
| Pro | `pro` (subscription_status=active) | Paid Pro |
| Team | `elite` | Paid Team (DB column unchanged for migration safety) |

**Server-side authorization is canonical.** UI gates are visual-only — every gated API route MUST verify the user's tier server-side and either return free-tier data or a 403 for hard gates. **Direct URL access to a gated feature returns the free-tier shape**, and the UI then renders the locked-preview view. Never trust the client.

**Gate matrix:**

| Capability | Anon | Free | Trial | Pro | Team |
|---|---|---|---|---|---|
| Leaderboard read | ● | ● | ● | ● | ● |
| Profile read | ● | ● | ● | ● | ● |
| Profile recent calls (full history) | summary | 30d | full | full | full |
| Calls explorer read | ● | ● | ● | ● | ● |
| Calls export | — | — | — | — | ● |
| Signals — resolved (>24h) | ● | ● | ● | ● | ● |
| Signals — live (<6h forming) | locked-preview | locked-preview | ● | ● | ● |
| Compare 2-way | ● | ● | ● | ● | ● |
| Compare 4-way | locked | locked | ● | ● | ● |
| β-α column on resolved tables | locked | locked | ● | ● | ● |
| Watchlist (count) | sign-in CTA | `{gate.watched.free}` | `{gate.watched.pro}` | `{gate.watched.pro}` | unlimited shared |
| Saved views | sign-in CTA | `{gate.saved.free}` | `{gate.saved.pro}` | `{gate.saved.pro}` | unlimited shared |
| Push alerts | — | — | ● | ● | ● Slack+email |
| Custom alert rules | — | — | ● | ● | ● shared |
| Methodology | ● | ● | ● | ● | ● |
| Pricing | ● | ● | ● | ● | ● |
| Dashboard | sign-in CTA | ● | ● | ● | ● |
| Login / Signup | ● | redirect to Dashboard | redirect to Dashboard | redirect to Dashboard | redirect to Dashboard |
| Settings (any tab) | 302 → /login?next= | — | — | — | — |
| /settings/account | — | ● | ● | ● | ● |
| /settings/billing | — | ● (Free shows upgrade-prompt state) | ● + trial banner | ● | ● (admin only on Team) |
| /settings/alerts | — | ● in-app only | ● + push | ● + push | ● + Slack/email/push |
| /settings/notifications | — | ● | ● | ● | ● |
| /settings/team | — | locked-preview shell | locked-preview shell | locked-preview shell | ● admin / 403 non-admin |

**Transitions:**
- Anon → Free: signup completes, redirect to Dashboard with empty state.
- Free → Trial: clicks "Start `{plan.pro.trial}` trial" in any modal A/B/C → Stripe checkout (no card required) → server sets `subscription_status=trialing` → redirect back to origin surface with trial banner.
- Trial → Pro: payment captured at trial end → `subscription_status=active`.
- Trial → Free: trial expires without payment → tier flips back to `free`. Show banner on next visit.
- Pro → Free: cancellation → keeps Pro through period end → flips at period end. UI shows "Your Pro plan ends on {date}".
- Free → Team: Talk-to-us flow (out of automated pipeline this phase).

**Trial expiry banner** on `/settings/billing`: top of page, accent left-border on ink-050 bg, "Trial ends in N days. Add a payment method to continue." Renders only during `subscription_status=trialing`.

**Direct URL access to gated content (example):** Anon hits `/dashboard` → server detects no session → returns 200 with empty-state Dashboard + `<Masthead>` showing sign-in. Pro hits `/signals/active` → live theses render. Free hits same URL → live theses (≤24h) returned as locked-preview shapes; UI overlays `signals-live` veil.

---

## 13. Open Questions

| ID | Topic | Decision needed by | Recommendation |
|----|-------|--------------------|----------------|
| **OQ-0** | **B Terminal palette swap** — memory note says "phosphor green + terminal red, gold retired" (locked 2026-04-19) but newer prototypes use ochre + olive/rose. | Product / brand owner | Confirm prototypes are canonical (this spec assumes so). If B Terminal is intended, swap `--accent` and the four state tokens in §2.1 — components don't change. |
| OQ-1 | α tier-weighting + 90d decay half-life | Data science | Confirm tier weights `S:1.0 A:0.7 B:0.4 C:0.2`, decay half-life (45d implicit), whether decay applies to α only or N too. Hold as `metric.tier.weights` token. |
| OQ-2 | β regression window + benchmark | Data science | Confirm benchmark (CMC Top-10 vs BTC-only vs custom basket) and regression window (currently 30d rolling). |
| OQ-3 | Tier-weight coefficients | Data science | Should become `metric.tier.weights` token. |
| OQ-4 | RR "adverse signal" trigger | Product | Define: price >1σ against, contradicting Tier-S post, or resolved against. |
| OQ-5 | **First-mover lead threshold** ✅ RESOLVED v1.1 | Product | **Resolved:** originator glyph fires at **±6h** (high-confidence first-mover). FM-rate metric counts **±2h+** leads. Both coexist by design (every originator is an FM, not vice versa). Documented in §6.13 Methodology §7. |
| OQ-6 | "Good" scale anchors per metric | Product / data science | Either derive from live percentile distributions (p50/p90) or tokenize as `metric.<id>.scale.*`. |
| OQ-7 | Tier cuts (S ≥ 80, A 65–79, B 50–64, C 30–49, F < 30) | Product / data science | Re-anchor after 90 days of real data. |
| OQ-8 | Mobile bottom-nav vs hamburger | Design / product | Currently 5 bottom tabs. Does "Me" live in tabbar or hamburger? If hamburger, drop to 4 tabs. |
| OQ-9 | Compare pair-swipe gesture (mobile) ✅ RESOLVED v1.1 | Product | **Resolved:** pager dot + tap. Swipe explicitly NOT used (iOS back-swipe conflict). |
| OQ-10 | Methodology drawer (D7) ✅ RESOLVED v1.1 | Design | **Resolved:** §6.13 Methodology page content written. All metric popover Source links resolve to `/methodology#<metric-id>` anchors. |
| OQ-11 | Auth UX (login / signup pages) ✅ RESOLVED v1.1 | Design | **Resolved:** §6.11 Login / Signup spec'd minimally for v1.1 launch (single-column 380px, email/password + optional OAuth, marketing pull on signup). May commission D8 design pass for polish. |
| OQ-12 | Light theme | Design | Phase 1 §05 deferred. Token architecture supports inversion; needs ramp + state-color light-surface audit. |
| OQ-13 | Default leaderboard filters (category=All · timeframe=90d · tier=All · N≥10) | Product | Confirm before launch copy + first-visit telemetry. |
| OQ-14 | Sample-size floors ✅ RESOLVED v1.1, clarified v1.2 | Product / DS | **Resolved dual-threshold matrix** (see §5.1.2): badge renders `N < 20` (`LOW_N_BADGE`), score attenuated + popover caveat `N < 12` (`metric.lowN.threshold`), profile-not-rankable `N < 3`. Two distinct thresholds with different jobs. Confirm against actual call distributions before launch. |
| OQ-15 | "New / recently updated" TTL | Product | 24h (Phase 1 ASSUMED) or 72h (Phase 2 ASSUMED). Resolve: prototypes drift; pick 24h or 72h consistently. |
| OQ-16 | Provenance archive table schema | Backend | Spec assumes `archiveUrl` and `sha` exist on every call. Backend currently captures `source_url` + `clip_timestamp`; archive snapshot table is TBD. Define the schema + capture pipeline before Provenance primitive ships. |
| OQ-17 | Signals consensus pipeline migration | Data science / backend | Spec uses 14d Signals window + ≥3 tier-B+ + ≥60% directional + N≥6 + 48h fading. Existing `detect-consensus.ts` uses 7d window with different thresholds. Either bring pipeline to spec or reduce spec to existing pipeline behavior. |
| OQ-18 | β-α regression details ✅ Partially resolved | Data science | β handling resolved at α-formula level (CF-A: drop β from α). β-α stays as derived Pro display column on resolved tables. Still open: regression window (default 30d), benchmark (default CMC Top-10) — confirm. |
| OQ-19 | Tier name reconciliation ✅ RESOLVED v1.1 | Engineering | **Resolved:** UI labels Free/Pro/Team map to DB tier values `free`/`pro`/`elite`. DB stays as-is; only display labels change. See §6.11 + §12.14 mapping table. |
| OQ-20 | New TTL for "fresh" indicator on rows ✅ RESOLVED v1.1 | Product | **Resolved:** 24h hot (ringed pulse), 24–72h fresh (static dot), >72h stale. Single source — §5.1.4 SignalFreshness primitive. Phase 1's earlier 72h was for the "new" indicator on `--new` color border; that's a separate concern resolved as 72h matching freshness-ladder tier 2. |
| OQ-21 | Compare PNG export approach | Engineering | "[PNG export]" CTA is in §6.5. Implementation TBD: client-side `html-to-image` or server-side rendered PNG via Vercel OG image route. Recommend server-side OG route — produces consistent fonts and shareable URL. |
| OQ-22 | Command palette implementation | Engineering / design | `⌘K` listed in keyboard map but no spec. Recommend `cmdk` library; surfaces: creators, calls, theses, settings, methodology sections. Out of scope for v1.1 unless explicitly green-lit. |
| OQ-23 | Cluster cohesion algorithm | Data science | `/signals/by-creator-cluster` (§6.8) renders cluster IDs derived server-side. Algorithm (e.g. graph clustering on co-publication, watchlist overlap, tag-overlap) needs definition before this surface ships beyond seed-data. |
| OQ-24 | Trial flow with Stripe | Engineering | "No card required" trial — exact Stripe integration approach (Setup Intent vs Trial-without-card via subscription_status) needs decision before billing UI ships. |
| OQ-25 | Server-side gating enforcement | Engineering | §12.14 declares server-side authorization is canonical. Need a middleware/route-handler pattern doc that every gated route imports — not a per-route reinvention. |
| OQ-26 | Streaming + partial-load on /calls | Engineering | §12.13 declares partial-load preserves filters/scroll. Implementation needs Suspense boundaries + a "load more" pagination strategy. Choose: cursor pagination (server) or page-number (simpler). Recommend cursor. |
| OQ-27 | Dashboard "last visit" recording | Engineering | Cockpit cell 1 ("what changed since last visit") needs a server-recorded last-visit timestamp per user. Pick mechanism: cookie, server session, or `users.last_dashboard_visit_at`. Recommend the column. |
| OQ-28 | Token-chip rendering rule for production | Product / engineering | `<Token>` chips render `{plan.pro.price.monthly}` placeholders. Production rule: chips render the literal value (e.g. "$29") with `<span title>` showing the token name on hover, OR are replaced wholesale at build time. Pick one. |
| OQ-29 | Reduced-motion full audit | A11y | §11.5 scopes reduced-motion to design-system selectors. Audit recharts and any third-party widget for motion that should also be muted. |
| OQ-30 | Avatar fallback initials policy ✅ RESOLVED v1.2 | Design | **Resolved:** prefer `displayName` (multi-word → first letter of first two words: "Crypto Insights" → "CI"), fall back to handle's first 2 chars uppercased. Implemented in `<CreatorAvatar>` `deriveInitials()`. |
| OQ-31 | Push alerts infrastructure | Engineering | Web Push (VAPID keys, service worker registration, push-subscription store) + per-rule trigger evaluator. Standalone capability — independent of in-app alerts inbox. Tracked in §12.4.1 as a release blocker. |
| OQ-32 | Team tier admin/member role distinction | Product / engineering | `/settings/team` admin-only actions (seat invites, SSO config, audit log) vs member-visible read-only fields. Schema + role check pattern needed. Tracked in §12.4.1. |

---

## 14. Appendix

### 14.1 Source map

| Section | Source file(s) |
|---------|---------------|
| Tokens, IA, surfaces, contrast audit, assumptions | `phase-1-ia-tokens-v0.2.html` |
| Components (primitives + composites), 3 priority screens, 6 hygiene closures | `phase-2-components-screens-v0.2.html` |
| 6 canonical screens (Signals/Resolved/Thesis/Dashboard/Compare/CFs), 8 v0.2 closures, 4 v0.2 upgrades | `phase-3-screens-v0.3.html` (CANONICAL) |
| Pricing page, 14 plan tokens, 3 in-context upgrade modals | `phase-3-d4-pricing-v0.1.html` |
| 360px metric popover anatomy, 10-metric catalog, 3 metric tokens | `phase-3-d5-metric-hover-library-v0.1 (1).html` |
| Mobile breakpoints, 14-primitive compression ruleset, mobile type scale, 3 BP tokens | `phase-3-d6-mobile-responsive-v0.1.html` |
| Historical (superseded) | `phase-1-ia-tokens.html`, `phase-2-components-screens.html`, `phase-3-screens-v0.1.html`, `phase-3-screens-v0.2.html`, `phase-3-d5-metric-hover-library-v0.1.html` |

Where prototypes contradict each other (e.g. v0.1 vs v0.3 of Phase 3, or `--neg` color across P1 v0.1 vs v0.2), the **newer / "canonical"-marked file wins**.

### 14.2 Version diff notes

| Token / Decision | Earlier value | Canonical value | Why |
|------------------|---------------|-----------------|-----|
| `--neg` | `#C66C62` (P1 v0.1) | `#D47A70` (P1 v0.2) | Raised luma to pass AA on `--ink-150` |
| `--warn` | `#D4A24B` (P1 v0.1) | `#D97757` (P1 v0.2) | Was indistinguishable from `--accent` (1.04:1) at 10px; rust hue shifts by 22° |
| Best-call card | accent on figure (v0.1) | `--pos`/`--neg` on figure + accent editorial pill (P2 v0.2) | Accent reserved for editorial, not P/L direction |
| Phase 3 screens | v0.1 / v0.2 | v0.3 (`§v03 C-SIG`, `C-DASH`, `C-CMP`) | Layered design self-audit at line 3784 declares v0.3 authoritative |
| Originator glyph lead | (not yet defined) | ±6h before consensus (v0.3) | Coexists with FM-rate's 2h threshold — different jobs, see §6.13 Methodology §7 |
| "New" TTL | 24h (P1 v0.2) | 72h (P2 §13 freshness ladder) | Inconsistent across phases; see OQ-15 |
| `--ink-500` on drawer (`--ink-150`) | allowed (P1 v0.1) | promote to `--ink-600` for body (P2 v0.2 contrast audit) | AA pass requirement |
| `--stale` scope | unrestricted | `--ink-000`/`050`/`100` only (P2 v0.2) | AA scoping — enforce in token system |

### 14.3 Real data examples (for engineer wiring)

**Tier S creators (seed):** @CryptoInsights, @MacroMaxi, @AlphaDigger.
**Tier A:** @OnChainMike, @ProtocolPilgrim.
**Tier B:** @ChainScout, @DegenCapital, @LunaKing, @NodeNotes, @PythPilot, @FundFlow, @RetailRita, @MemecoinMatt, @PumpPilot, @WhaleBeacon.

**Sample compare row (canonical):**
- @CryptoInsights · Tier S · #01 ±1 · 312 calls resolved · α 30d +12.4 (N 28, CI [+9.1, +15.4]) · win 68.2% · first-mover 42% · retraction 14% (lag 3.2d) · median horizon 22d.
- @MacroMaxi · Tier S · #02 ±1 · 418 calls resolved · α 30d +9.8 (N 34, CI [+7.2, +12.1]) · win 61.4% · first-mover 28% · retraction 6% (lag 6.8d) · median horizon 18d.

**Active thesis catalog:**
- SOL long · consensus 82% · 11 creators · CI [74,88] · target $178 · 30d · α since formation +4.82.
- ETH/BTC short · consensus 71% · 8 creators · CI [62,79] · target 0.044 · 30d.
- TIA long · forming 51% · 4 creators · CI [38,64] · target $9.10 · 21d.

**β-math worked example (CF-A):**
SOL · Pₑ $142.80 · Pᵣ $164.20 · ln(164.20/142.80) = +13.96%.
BTC · Pᵦ,ₑ $62,140 · Pᵦ,ᵣ $66,820 · ln(66,820/62,140) = +7.26%.
α = +13.96% − +7.26% = **+6.70%**.

### 14.4 Resolution scoring rules (assumptions panel — confirm in OQ block)

- Thesis aggregation unit: asset + direction + ±5% target + 48h window.
- Consensus threshold: ≥3 tier-B+ creators · ≥60% directional agreement · N≥6.
- Fading window: no new calls in rolling 48h → fading.
- Invalidation trigger: stop level stated in thesis, hit on spot; if not stated, invalidation = 2× horizon elapsed without 50% target met.
- Live signals delay (free): consensus visible >24h after formation.
- α default: log-return spread · asset − benchmark.
- Originator glyph: fires at ±6h+ before consensus. Distinct from FM-rate metric's ±2h threshold (broader counter). Both intentional — see §6.13 Methodology §7.
- Watched creator cap (free): 10 · 3 saved views · email alerts only.
- Compare slots: 2-way free · 4-way Pro.
- Alerts inbox retention: 90d · unread flagged · threshold tunable.

### 14.5 The 10 commandments (operator's quick reference)

1. **Provenance is the visual signature.** Every datum points to a source.
2. **Accent is editorial only.** Never use `--accent` for P/L direction. Wins are `--pos`. Losses are `--neg`.
3. **Numbers are tabular.** Always.
4. **Severity ≠ hide.** Low N, stale, sparse — show, caveat, never bury.
5. **Hairlines carry layout.** 1px ink-200/250/150. No heavy borders.
6. **One italic-accent phrase per headline.** Editorial restraint.
7. **Synthesis-first on Compare.** The headline you came for, not a side-by-side.
8. **Cockpit is for change since last visit, not greeting.**
9. **Locked previews show real data behind blur, never a placeholder.**
10. **Drawer preserves context. Modal anchors to user intent. Tooltip is ephemeral. Bottom sheet is the mobile drawer + popover.**

---

## 15. Changelog

### v1.4 — 2026-04-27 (post-fourth-review final polish)

Fourth independent omx pass graded v1.3 as **"ready for static UI refactor"** with 7 P1 polish items + 3 P2 nice-to-haves remaining. v1.4 closes all of them, leaving the spec ready for blind implementation execution. No new P0s emerged in any of the four review passes after v1.0 — the doc has been hardening monotonically.

**Sections fixed:**
- **§5.1.7 — `<Tier>` → `<RankTierBadge>`:** component file renamed `Tier.tsx` → `RankTierBadge.tsx`. CSS class `.tier` retained (no collision risk; matches prototype). The prop type is `RankTier` (not subscription `Tier`). Resolves the naming ambiguity that survived the v1.3 type rename.
- **§5.1.1 AlphaScore stale fallback:** stale variant render is now gated on `stale &&` — if a caller forces `variant="stale"` without `stale` data, the component falls through to inline (with a dev console.warn already in place). No more `stale · 0h` lie in production.
- **§12.1 `/call/[id]` redirect snippet:** array-valued query params now use `qs.append(k, item)` for every value (was: collapsed to `v[0]`, dropping repeats). Dynamic segment now uses `encodeURIComponent(params.id)` for safety. Hash-fragment behavior documented (browser-side only; can't be preserved server-side).
- **§6.13 Methodology — anchor reconciliation:** added §5 Win rate and §9 Median horizon as standalone TOC sections (`#win-rate`, `#horizon`); remapped `#overlap` to §12 Overlap-with-you. Every metric registry key in §8.3 now has a matching `<h2 id="…">` heading on the rendered methodology page. Added unit-test mandate: every `MetricSpec.source.methodologyHref` must resolve via `getElementById`.
- **§12.14 Premium gating matrix — Settings rows:** added per-tab gating rows (Login/Signup, /settings/account, /settings/billing, /settings/alerts, /settings/notifications, /settings/team) with Anon/Free/Trial/Pro/Team columns. Mirrors the §6.12 server-side gating logic.
- **§12.4.1 Backend prereqs — completion:** added `/signals/resolved`, `/signals/[thesis]`, cluster detail (`/signals/by-creator-cluster/[id]`), Settings auth middleware, Push alerts (standalone), `/settings/team` rows. Resolved the "ships seed first vs blocked until green" tone inconsistency by stating the rule explicitly: *build chrome with seed data now; flip data wiring on once backend lands; PRs flag "wired with seed data" until then.*
- **§9.5 mobile CSS — `.mk-tb` rule flipped:** was `@media (max-width: 767px)` (violated §9.1 "min-width queries only"). Now mobile-base + `@media (min-width: 768px) { display: none }`. Honors the rule.
- **§2.4 Tailwind `screens` migration note:** explicit comment that replacing default `screens` removes `sm`/`md`/`lg`/`xl`/`2xl` utilities — known impact for the scratch refactor; documented escape hatch (`extend.screens` for incremental migration).
- **§11.6 Dialog `inert` claim:** contract-row corrected. Radix `aria-hidden` on portal siblings + focus-trap is the actual mechanism — `inert` attribute is NOT applied. The skeleton matches the corrected contract.
- **§6.8 cluster detail consistency:** all three callsites (§6.8, §12.1, §12.4.1) now agree the route renders a "coming soon" placeholder card in v1 (was: §6.8 said "404s," §12.1/§12.4.1 said placeholder).

**OQ block updates:**
- **OQ-30 (avatar fallback initials)** — marked ✅ RESOLVED v1.2 (was already implemented; OQ row updated to reflect status).
- **OQ-31 added** — Push alerts infrastructure (Web Push, service worker, evaluator). Tracks the standalone capability separate from the in-app alerts inbox.
- **OQ-32 added** — Team tier admin/member role distinction. Tracks `/settings/team` admin-only actions and the schema/role-check pattern.

---

### v1.3 — 2026-04-27 (post-third-review revision)

Third independent omx pass confirmed v1.2 closed most of the prior P0s, but caught 1 spec-fixable P0 (`Tier` type collision), 7 P1s, and 3 P2s. Plus highlighted that two of the v1.2 "P0s" (Signals backend, Provenance archive) were actually backend-dependencies. v1.3 closes everything spec-fixable and reframes the backend dependencies as an explicit release-blocker checklist.

**Sections fixed:**
- **§5.1.1 / §12.10 / §12.4 — `Tier` → `RankTier` rename:** the score-tier type is renamed throughout to avoid collision with the existing repo's auth `Tier` type. Added explicit naming note. CreatorAvatar `ringTier` typed as `RankTier | null`.
- **§12.12 CreatorAvatar — protocol validation:** `isAllowedSrc()` now also checks `url.protocol === "https:"` before allowlist match. Prevents `next/image` synchronous throw for `http://` URLs even with allowlisted hostnames.
- **§11.6 Dialog overlay logic:** rewrote `overlayOn` so `variant === "drawer"` honors `showOverlay`, but `sheet`/`modal` always render the overlay (`showOverlay={false}` ignored for them). Was: `showOverlay ?? (variant !== "drawer")` — let modal opt out, wrong.
- **§2.1 + §5 / §9 raw `z-index` cleanup:** added `--z-*` CSS custom properties to `:root` mirroring the Tailwind named scale. Replaced raw `z-index:50/100/2/50` in `.mast` / `.modal` (template) / `.tip` / `.mk-tb` with `var(--z-masthead)` / `var(--z-modal)` / `var(--z-tooltip)` / `var(--z-masthead)`. Single source for both raw CSS and Tailwind utilities.
- **§6.7 URL-param rename:** `window` → `win`. Now consistent with §12.11 SignalsParams.
- **§12.11 sort whitelist:** added `delta_30d` and `tier` to `SORT_COLS`. Tagged each entry with which surface uses it. Documented that `trend` (sparkline) and `provenance` (chip-only) are intentionally non-sortable.
- **§6.13 Methodology anchor map:** explicit table mapping every metric registry key (`alpha`, `beta-alpha`, `ci`, `n`, `wr`, `rr`, `fm`, `h`, `v`, `ol`) to its methodology page anchor ID. The `MetricSpec.source.methodologyHref` field MUST use one of these.
- **§6.12 Settings expanded:** mobile layout (sidebar collapses to horizontal scrolling tab strip), active-tab styling, server-side auth gating per-tab (anon→302, Free/Pro→Account/Billing/Alerts/Notifications, Team→all), loading.tsx form skeletons, error.tsx with inline-above-form retry, billing-streaming Suspense boundary. Out-of-scope tracked via OQ-24.
- **§12.1 + new §12.x — `/call/[id]` redirect snippet:** full implementation showing query-string preservation and `permanentRedirect()` (308) so SEO link-juice transfers and browsers cache.
- **§5.1.1 AlphaScore dev assertion:** `console.warn` in dev when `variant="stale"` is forced without `stale` prop. Production keeps the `?? 0` safe fallback (tree-shaken by `process.env.NODE_ENV` check).
- **§10.4 Gradient/shadow rule reframed:** "design-system canon" framing replaces "exemption list." Explicit statement that prototype-only effects (decorative shadows, alternate gradients) are NOT carried forward — even if they appear in `.new-FE-design/`. New additions require spec amendment + semantic justification.

**Section added:**
- **§12.4.1 Backend prerequisites — release-blocker checklist.** New table mapping every gated surface (Provenance, all Signals routes, β-α, /calls/[id] Pro provenance, Dashboard cockpit cell 1, /settings/billing, /settings/team, push alerts, Compare PNG export, command palette) to its required backend prerequisite + tracked OQ + what "blocks" actually means. **Engineer-facing rule:** every gated surface ships as static chrome today; data wiring begins after backend prereqs land. PRs flag "wired with seed data" until backend ships.

**Aware of, intentionally NOT closed in v1.3 (now explicit backend-blocker items):**
- OQ-16 Provenance archive table — backend.
- OQ-17 Signals consensus pipeline migration — backend.
- OQ-18 β regression specifics — data science.
- OQ-21 Compare PNG export approach — engineering scope decision.
- OQ-22 Command palette implementation — out of v1 scope.
- OQ-23 Cluster cohesion algorithm — data science.
- OQ-24 Stripe / Whop billing integration — billing provider decision.
- OQ-25 Server-side gating middleware pattern — engineering pattern doc.
- OQ-27 `users.last_dashboard_visit_at` column — backend.

---

### v1.2 — 2026-04-27 (post-second-review revision)

Independent re-validation by omx flagged 7 new P0s after v1.1. This revision closes 5 of them (the other 2 — Compare PNG export approach, command-palette implementation — remain tracked as OQ-21 and OQ-22 because both require product/engineering scope decisions, not spec clarification).

**Sections fixed:**
- **§12.1 Route tree:** added `/calls/[id]`, `/call/[id]` redirect (legacy singular preserved), `/signals/by-asset/[symbol]`, `/signals/by-creator-cluster/[id]`, `/login`, `/signup`, `/settings/{account,billing,alerts,notifications,team}`. The tree now matches every route specified in §6.
- **§5.1.1 AlphaScore:** export all 4 type aliases (`AlphaWindow`, `AlphaVariant`, `Tier`, `Confidence`) from `@/lib/types`. Import statement in skeleton fixed. `stale!.ageHours` crash replaced with `stale?.ageHours ?? 0` default. Variant resolution comment clarified (hero never auto-derived; stale > low-conf > inline).
- **§2.4 + §2.6 + §11.6 Z-index:** introduced paired `*-overlay` tokens (`drawer-overlay: 59`, `sheet-overlay: 64`, `popover-overlay: 69`, `tooltip-overlay: 74`, `modal-overlay: 99`). Each overlay sits immediately below its content. Raw `z-[59]` replaced with `z-modal-overlay` (or appropriate token) throughout. Dialog skeleton overlay class is now variant-driven.
- **§11.6 Dialog primitive:** overlay made conditional (drawer defaults to no-overlay so list stays visible behind; sheet/modal force overlay). Added `description` prop for `aria-describedby`. Added `showClose` slot rendering top-right `×` close button (default true; composers can suppress). Background `inert` behavior documented (Radix handles via `aria-hidden` on portal siblings + focus-trap; modal overlay communicates visual block).
- **§12.11 URL state schema:** rewritten with `.catch()` chained on every field so invalid values silently clamp to default (was: `.default()` only fires for missing keys; threw on invalid values). Added `parseParams<T>()` helper that uses `safeParse` and never throws. Tightened schemas: `LeaderboardParams.tier` now includes `F`; `n_min` bounded to `[0, 1000]`; `sort` validated against a column whitelist with direction normalization; compare `c` and leaderboard `sel` use shared `handlesList(max)` schema enforcing max-4, lowercase, dedup, `@`-strip. Renamed `SignalsParams.window` → `SignalsParams.win` to avoid global shadow.
- **§5.1.2 Low-N:** dual-threshold framing made explicit. `LOW_N_BADGE = 20` (visibility flag, score still ranked) and `metric.lowN.threshold = 12` (quality flag, score attenuated + popover caveat) are TWO real numbers with different jobs. State matrix table added.
- **§12.12 CreatorAvatar:** added `ALLOWED_AVATAR_HOSTS` host pre-validation so `next/image` doesn't throw synchronously when the URL host isn't in `next.config.images.remotePatterns`. Three-layer fallback: invalid URL → bad host → image error → initials. Added `displayName` prop for better initials derivation (`"Crypto Insights" → "CI"` over `"@cryptoinsights" → "CR"`). Added `i.ytimg.com` to host allowlist.
- **§10.4 Gradient & shadow exemptions:** list completed. Added: `.scale-bar` linear gradient (D5 metric popover), `.teaser .veil` linear gradient (locked preview), selected-row inset accent rail, live-dot ring pulse `box-shadow`, selected-metric-tile halo, AlphaScore peer-rail mark inset ring. Distinguished insets and colored halos from drop shadows (insets/halos communicate state; only the modal/popover/tooltip/sheet drop shadows communicate depth/lift).
- **OQ-5 cleanup:** removed "conflicts with…" and "pick one" language from §2.7 token registry, §5.1.9 originator note, §14.2 version-diff table, §14.4 resolution rules. Replaced with "two thresholds by design" framing pointing at §6.13 Methodology §7.

**Aware of, intentionally NOT closed in v1.2:**
- OQ-21 Compare PNG export approach — needs an engineering scope decision (server OG route vs client html-to-image), beyond spec clarification.
- OQ-22 Command palette implementation — recommend `cmdk` library; out of v1.x scope unless explicitly green-lit.
- OQ-10 Methodology page copy — §6.13 has full structure with anchor IDs; the *prose* of each section (the actual paragraphs of explanation) is a content task, not a spec defect. Will be drafted by whoever owns content.
- OQ-16 Provenance archive table schema — backend decision.
- OQ-17 Signals consensus pipeline migration — backend decision.

---

### v1.1 — 2026-04-26 (post-review revision)

Independent review by codex + omx flagged 40+ issues (3 P0 each, ~30 P1, ~10 P2). This revision closes them.

**Decisions locked (one source of truth — no contradictions):**
- **Deps adopted:** `@radix-ui/react-popover`, `@radix-ui/react-dialog`, `@floating-ui/react` (fallback), `zod`, `clsx`. `nuqs` optional.
- **Low-N matrix:** badge fires `N < 20`, score attenuated `N < 12` (`metric.lowN.threshold`), profile-not-rankable `N < 3`.
- **Fading window:** rolling 48h (matches `detect-consensus.ts` + §14.4).
- **Signals nav:** `Active · Resolved · By asset · By creator cluster · Mine` (5 tabs).
- **β handling:** dropped from α formula (CF-A); β-α stays as a Pro-gated *display* column on resolved tables only.
- **Tier naming:** UI labels Free / Pro / Team map to DB tier values `free` / `pro` / `elite`. DB stays as-is.
- **Token policy:** plan/gate tokens (`{plan.*}`, `{gate.*}`) render as `<Token>` chips in design; metric internals (`metric.tier.weights`, decay constants) NEVER render as `<Token>` chips.

**Sections added:**
- §6.7 — `/signals/by-asset`
- §6.8 — `/signals/by-creator-cluster`
- §6.9 — `/signals/mine`
- §6.10 — `/calls/[id]` full call page
- §6.11 — `/login` and `/signup`
- §6.12 — `/settings` (account, billing, alerts, notifications, team)
- §6.13 — `/methodology` full content (no D7 punt; replaces former skeletal §6.7)
- §7.4 — Full pricing comparison grid (5 categories, all rows verbatim)
- §10.3 — Z-index scale link
- §10.4 — Gradient & shadow exemption block (honest)
- §10.5 — Provenance rule (honest — modifier chips don't carry provenance)
- §11.6 — Modal / Drawer / Sheet shared primitive contract
- §12.10 — Server/client component map
- §12.11 — URL state schema
- §12.12 — Avatar & image policy + `next.config.images` allowlist
- §12.13 — Loading/error strategy (`loading.tsx`, `error.tsx`, partial-load rule)
- §12.14 — Premium gating state machine (5 tiers × full gate matrix + transitions)

**Sections fixed:**
- Header: bumped to v1.1 with changelog hook.
- §2.4 Tailwind config: added `screens` (`tab` `desk`, mobile-first base), `spacing.30`, custom `zIndex` scale, font stacks now reference CSS vars (`var(--font-serif)` etc).
- §2.6 Z-index: full scale documented.
- §3.1 next/font: full root layout snippet showing `serif.variable + sans.variable + mono.variable` applied to `<html>`.
- §5.1.1 AlphaScore: unified prop contract (one `AlphaScoreProps`), full skeleton with all 4 variants (hero, inline, low-conf, stale), sign formatting, clamping, peer-median in score-space.
- §5.2.2 LeaderboardTable: fixed `border-collapse: separate` issue — borders moved from `tr` to `td`.
- §5.1.5 PremiumPreviewLock: §16 conversion moments folded inline as named moments (`history-tail`, `alerts-push`, `compare-3rd-column`, `export`, `signals-live`, `dashboard-curated`).
- §6.1, §6.2, §6.3: replaced `(§16.x)` cross-refs with named moments.
- §6.4 Signals: state #04 fading rule now says "rolling 48h" (was 72h) — matches §14.4.
- §8 Metric Popover: switched to Radix Popover (was Tooltip), fixed `asChild` typing requirement, dropped double-arrow, added `collisionPadding`, expanded `CaveatTrigger` union to 8 triggers (was 3), bumped slot count from "5" to "6 (5+1 optional)", `.cav::before` flex fix.
- §9.5 Mobile-first CSS: phone padding now `24px 14px 96px` (was `48px 32px 120px` — desktop padding declared as phone default), bottom tab `.mk-tb` wrapped in `@media (max-width: 767px)` with `display: none` at tablet+.
- §9 swipe references → pager-dot+tap (Compare).
- §11.5 Reduced motion: scoped to design-system selectors (was global `*` selector that broke third-party widgets).
- §12.4 Dependencies: formal deps table with rationale.
- §12.9 Migration plan: deps install added as Step 1.

**§13 OQ block:**
- 5 OQs marked ✅ RESOLVED v1.1 (OQ-5 first-mover, OQ-9 swipe-vs-pager, OQ-10 methodology, OQ-11 auth, OQ-14 low-N matrix; OQ-19 tier naming; OQ-20 freshness TTL).
- 12 new OQs added (OQ-16 through OQ-30) — provenance archive schema, signals pipeline migration, β-α regression details, Compare PNG export, command-palette implementation, cluster cohesion algorithm, Stripe trial flow, server-side gating middleware, streaming/pagination on /calls, last-visit recording, token-chip production rule, reduced-motion audit, avatar fallback policy.

**Deleted:**
- All `(§16.*)` references — §16 doesn't exist; conversion moments folded inline.

**Aware of, intentionally NOT closed (deferred to product/DS):**
- OQ-0 B Terminal palette swap (single-decision flip if product wants to revert).
- OQ-1 / OQ-3 / OQ-7 / OQ-12 / OQ-13 / OQ-15 / OQ-22 — product/data-science decisions outside this revision's scope.

---

*End of spec. Engineer: start with §2 (tokens), §5 (primitives), §12.10 (server/client map), then §12.11 (URL state), then §11.6 (Dialog primitive). Build the Dialog primitive BEFORE any drawer/modal/sheet code.*
