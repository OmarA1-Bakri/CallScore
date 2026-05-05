# Full Backtest Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-class backtesting lab where Alpha users can choose any creators, simulate a combined portfolio, switch weighting modes, and compare results against BTC/ETH benchmarks.

**Architecture:** Keep the existing per-creator backtest intact and add a portfolio-level engine in `src/lib/portfolio-backtest.ts`. The lab page and API both call that engine; configuration is shareable via URL query params rather than a new persistence table.

**Tech Stack:** Next.js App Router, React server components, Neon SQL via existing `query()`, Node test runner with `tsx`, Tailwind design tokens.

---

## File Structure

- Create `src/lib/portfolio-backtest.ts`: portfolio simulation engine, live DB dependency loader, weighting logic, benchmark series.
- Create `tests/portfolio-backtest.test.ts`: TDD coverage for creator selection, equal creator weights, equal call weights, alpha-score weights, rank-tier weights, benchmark fallbacks, and validation.
- Create `src/app/api/backtest/route.ts`: Alpha-gated portfolio API accepting `creators`, `start`, `end`, `capital`, `strategy`, `weighting`, and `benchmark`.
- Create `src/app/backtest/page.tsx`: full lab UI with creator picker, weighting controls, benchmark controls, summary metrics, chart-like series, creator contribution table, and call ledger.
- Modify `src/components/Header.tsx` and `src/components/MobileMenu.tsx`: add `Backtest Lab` nav link for logged-in Alpha users.

## Task 1: Portfolio Engine Tests

**Files:**
- Create: `tests/portfolio-backtest.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- equal-call allocation splits capital across every eligible call
- equal-creator allocation gives each selected creator an equal sleeve, then splits across that creator's calls
- alpha-score weighting gives higher-scored creators larger sleeves
- rank-tier weighting follows displayed ranking bands: rank 1-5 strongest, 6-12 medium, rest low, with Low N haircut
- selected creators with no scored calls stay visible with zero contribution
- invalid inputs throw `BacktestValidationError`

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
npm exec -- tsx --test tests/portfolio-backtest.test.ts
```

Expected: fails because `src/lib/portfolio-backtest.ts` does not exist.

## Task 2: Portfolio Engine Implementation

**Files:**
- Create: `src/lib/portfolio-backtest.ts`

- [ ] **Step 1: Implement engine**

Add:
- `PortfolioWeightingMode = "equal_call" | "equal_creator" | "alpha_score" | "rank_tier"`
- `PortfolioBenchmark = "btc" | "eth" | "btc_eth_50"`
- `runPortfolioBacktest(input, options)`
- dependency interface mirroring `BacktestDeps`
- live loaders for creators, calls, BTC/ETH candle prices

- [ ] **Step 2: Run tests to verify GREEN**

Run:

```powershell
npm exec -- tsx --test tests/portfolio-backtest.test.ts
```

Expected: all portfolio tests pass.

## Task 3: API Route

**Files:**
- Create: `src/app/api/backtest/route.ts`

- [ ] **Step 1: Add Alpha-gated API**

Parse:
- `creators=1,2,3`
- `start=YYYY-MM-DD`
- `end=YYYY-MM-DD`
- `capital=1000`
- `strategy=equal_weight|direction_only`
- `weighting=equal_call|equal_creator|alpha_score|rank_tier`
- `benchmark=btc|eth|btc_eth_50`

- [ ] **Step 2: Return validation errors cleanly**

Map `BacktestValidationError` to 400, `requireSessionAccess("alpha")` responses directly, and internal failures to generic 500.

## Task 4: Full Lab UI

**Files:**
- Create: `src/app/backtest/page.tsx`

- [ ] **Step 1: Add server-rendered lab**

Use URL params to select creators and run the engine. Load creator options from `creators` joined to `creator_stats` for display.

- [ ] **Step 2: Add controls and outputs**

Render:
- creator checkbox grid
- date/capital controls
- strategy, weighting, benchmark selects
- summary metrics
- portfolio vs benchmark series
- creator contribution table
- ledger of included calls
- Alpha upgrade state

## Task 5: Navigation and Verification

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/components/MobileMenu.tsx`

- [ ] **Step 1: Add `Backtest Lab` link for Alpha sessions**

Place it with other logged-in premium links.

- [ ] **Step 2: Verify**

Run:

```powershell
npm exec -- tsx --test tests/portfolio-backtest.test.ts tests/backtest.test.ts tests/header-rsc.test.ts
npm run typecheck
npm run build
```

Then start the dev server and inspect `/backtest` with Browser Use at desktop and mobile widths.
