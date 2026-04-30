# Front-End Build Agent — Mission Brief

> **Paste this entire document into the coding agent's first turn.** It is self-contained: an engineer who has not been part of the spec authoring should be able to execute from this brief alone.

---

## 1. Mission

Refactor `src/` of the **CryptoTubers Ranked** repo (Next.js 14 App Router app) to match the canonical front-end design spec at:

```
docs/frontend-design-spec.md   (v1.4, ~3201 lines)
```

The current `src/` UI is being replaced wholesale. The spec supersedes everything in it. You are building the new front-end from primitives up.

**Repo root:** `C:\Users\albak\xdev\crypto-tuber-ranked` (Windows; Git Bash or WSL bash both fine).
**Branch base:** `master`. Do NOT push to master directly. All work lands via PRs from feature branches.

---

## 2. Stack & dependencies

**Existing (do not change):**
- Next.js 14.2.21 (App Router)
- React 18.3.1
- TypeScript 5.6
- Tailwind 3.4.16
- `lucide-react` 0.460
- `recharts` 2.15
- `@neondatabase/serverless`, `date-fns`, `@google/genai`

**To add as Step 1 of Phase 0** (do this first, in a single commit):
```
@radix-ui/react-popover
@radix-ui/react-dialog
@floating-ui/react
zod
clsx
nuqs                  (optional — for URL state; can be hand-rolled per §12.11)
```

`package-lock.json` lives at repo root. Use `npm install` (project uses npm).

---

## 3. Read before doing anything

In order:

1. **`docs/frontend-design-spec.md`** — full read-through. Pay special attention to:
   - §1 North Star — the editorial-terminal aesthetic
   - §2 Design Tokens — the CSS vars + Tailwind config (full replacement, NOT extension)
   - §5 Component Library — primitives → composites → templates
   - §6 Screen Specs — every route
   - §11.6 Modal/Drawer/Sheet primitive contract — build this BEFORE any drawer/modal/sheet code
   - §12.4.1 **Backend prerequisites** — release-blocker checklist (this controls what you can ship as data-wired vs static-with-seed today)
   - §12.9 Migration plan — the canonical phase order
   - §12.10 Server/client component map — mark only required clients with `"use client"`
   - §12.11 URL state schema — Zod schemas with `.catch()` chains so invalid params don't throw
   - §12.13 Loading/error strategy — `loading.tsx` + `error.tsx` per route
   - §12.14 Premium gating state machine + matrix
   - §15 Changelog — context on why decisions were made

2. **`package.json`** + **`tailwind.config.ts`** + **`tsconfig.json`** + **`next.config.js`** — current configs.

3. **`src/`** — skim. You will replace most of it. **Do not delete anything yet** — keep the legacy code in place while you migrate route-by-route, then delete unused files at the end of each phase.

4. **`.new-FE-design/`** — 11 HTML prototype files. The spec already synthesized these; you should rarely need to open them, but cross-reference if a CSS detail in the spec is unclear.

---

## 4. Backend prerequisites — surfaces blocked from full data wiring

This is the non-negotiable list. **You can build the chrome for every surface today** (with seed data); some surfaces cannot be wired to real backend data until backend work lands. See `docs/frontend-design-spec.md` §12.4.1 for the full table.

The blocked items, summarized:

| Surface | Blocked until | OQ |
|---|---|---|
| `<Provenance>` full-scale (drawer use, archive link) | Backend ships archive snapshot table `(call_id, archive_url, sha256, captured_at)` + capture pipeline | OQ-16 |
| All `/signals/*` routes (live <6h Pro, lifecycle states) | `detect-consensus.ts` migrates from current 7d/heuristic to spec lifecycle: 14d window, ≥3 tier-B+, ≥60% directional, N≥6, 48h fading, invalidation logic; API returns per-thesis `state` enum | OQ-17 |
| `/signals/by-creator-cluster` | Cluster cohesion algorithm + per-creator cluster ID | OQ-23 |
| `/signals/by-creator-cluster/[id]` (cluster detail) | Same as above — v1 ships placeholder card | OQ-23 |
| `<CallDrawer>` β-α math + `/calls/[id]` β-α | β regression pipeline (CMC Top-10 30d rolling) + per-call β | OQ-2, OQ-18 |
| `/calls/[id]` Pro provenance | Same as Provenance above + Pro-tier source-locking enforcement | OQ-16, OQ-25 |
| `/dashboard` cockpit cell 1 ("what changed since last visit") | `users.last_dashboard_visit_at` column + write-on-page-load | OQ-27 |
| Settings auth middleware | Single-source middleware pattern applying §12.14 gate-matrix logic server-side | OQ-25 |
| `/settings/billing` (real billing) | Stripe vs Whop provider decision + webhooks + Customer Portal | OQ-24 |
| `/settings/team` (real Team UI) | SSO + audit log + seat invites + admin/member role check | OQ-32 |
| Push alerts (Pro/Team) | Web Push (VAPID + service worker + subscription store) + per-rule trigger evaluator | OQ-31 |
| Compare PNG export | Server OG route OR client `html-to-image` (engineering decision) | OQ-21 |
| Command palette (`⌘K`) | `cmdk` lib integration + searchable index | OQ-22 |

**Operational rule:** every blocked surface ships as **static chrome with seed data** in v1. Each PR that lands a blocked-surface chrome MUST flag **"wired with seed data — backend gated on OQ-XX"** in the description.

For each blocked surface, the agent should:
1. Build the surface's chrome (layout, components, copy) using a seed-data fixture in `src/lib/fixtures/<surface>.ts`.
2. Wire the route to read from the fixture, NOT from the real API.
3. Open a follow-up tracking issue (or note in the PR description) with `OQ-<n>` reference so when the backend lands, swapping the data source is a single commit.

When the user / a backend agent reports an OQ resolved, swap the fixture import for the real API call and verify.

---

## 5. Implementation strategy — git worktrees, subagents, hard gates, iterative loops

### 5.1 Git worktrees — one per epic (parallel work)

Phases that can run in parallel get their own worktree. Phases that depend on prior work happen sequentially in the main worktree.

**Set up worktrees** at the start of work:

```bash
# from repo root
git worktree add ../crypto-tuber-ranked-foundation phase/0-foundation
git worktree add ../crypto-tuber-ranked-shell      phase/1-shell
git worktree add ../crypto-tuber-ranked-primitives phase/2-primitives
git worktree add ../crypto-tuber-ranked-composites phase/3-composites
git worktree add ../crypto-tuber-ranked-leaderboard phase/4a-leaderboard
git worktree add ../crypto-tuber-ranked-profile    phase/4b-profile
git worktree add ../crypto-tuber-ranked-calls      phase/4c-calls
git worktree add ../crypto-tuber-ranked-signals    phase/4d-signals
git worktree add ../crypto-tuber-ranked-compare    phase/4e-compare
git worktree add ../crypto-tuber-ranked-dashboard  phase/4f-dashboard
git worktree add ../crypto-tuber-ranked-pricing    phase/4g-pricing
git worktree add ../crypto-tuber-ranked-methodology phase/4h-methodology
git worktree add ../crypto-tuber-ranked-auth-settings phase/4i-auth-settings
git worktree add ../crypto-tuber-ranked-mobile     phase/5-mobile
```

Each branch starts from `master`. After Phase 0 + Phase 1 land in `master`, all later worktrees rebase onto the updated `master` before starting (`git fetch origin && git rebase origin/master`).

**Commit cadence per worktree:** small, focused commits. Conventional Commit format (`feat:`, `fix:`, `refactor:`, `chore:`, etc.).

**PR per worktree:** one PR per epic, base `master`, title `[Phase N.x] <epic name>`. Include the hard-gate checklist (§5.3) in the PR description.

### 5.2 Subagents — parallelize within a phase

Phase 2 (primitives) and Phase 3 (composites) have many components that can be built in parallel. Spawn subagents for parallel work:

**Phase 2 subagent fan-out (example):**
- Subagent A: `<AlphaScore>` (§5.1.1)
- Subagent B: `<ConfidenceBar>` + `<LowNBadge>` (§5.1.2)
- Subagent C: `<Provenance>` (§5.1.3)
- Subagent D: `<SignalFreshness>` (§5.1.4)
- Subagent E: `<PremiumPreviewLock>` (§5.1.5)
- Subagent F: `<Badge>` + `<RankTierBadge>` + `<DirChip>` + `<Originator>` + `<Rank>` (§5.1.6–§5.1.10) — group of small primitives
- Subagent G: Form controls — `<Search>`, `<FilterChip>`, `<TimeframeSelector>`, `<DensityToggle>`, `<Button>` (§5.1.11)
- Subagent H: `<Token>` (§2.7 + §5.1)

Each subagent gets:
1. A specific spec section reference (e.g. "build §5.1.1 AlphaScore exactly").
2. Read-only access to `docs/frontend-design-spec.md` + the spec sections for primitives it depends on (§2 tokens, §3 typography).
3. Instructions to commit incrementally to its assigned branch with `feat(primitives): add <Component>`.
4. The hard-gate checklist below — must run all gates before declaring the component done.

**When you need a sub-task done in the same worktree** (e.g. "now add unit tests for AlphaScore"), spawn a subagent rather than doing it inline — keeps the main agent's context focused on integration.

**Subagent return contract:** every subagent reports back with: (a) what it built, (b) gate-check results (typecheck/lint/test/build), (c) any OQs or surprises hit. The orchestrating agent verifies, integrates, and moves on.

### 5.3 Hard gates — must pass before phase is "done"

These are non-negotiable. Every phase ends with all gates green. If a gate fails, fix the gate before opening the PR.

**Per-component gates (Phase 2 + Phase 3):**
1. ✅ TypeScript typecheck: `npx tsc --noEmit` exits 0.
2. ✅ ESLint: `npm run lint` exits 0.
3. ✅ Component compiles into a Storybook-style scratch route or visual test page (you can build `src/app/_dev/components/page.tsx` for this — gitignored or temp branch).
4. ✅ Component matches the spec's described visual states (default, hover, focus, disabled, etc. — at least open it in a browser and verify).
5. ✅ A11y: keyboard-nav works (Tab, Enter, Esc); screen reader reads sensibly.

**Per-route gates (Phase 4):**
1. ✅ All four per-component gates above for any route-specific composites.
2. ✅ Route loads in the browser without console errors (`npm run dev`, navigate to the route).
3. ✅ All `loading.tsx` + `error.tsx` files render correctly (test by throwing a deliberate error in the page component once to verify error.tsx kicks in, then revert).
4. ✅ URL state round-trips: change a filter, the URL updates; reload the page, the filter is preserved.
5. ✅ Mobile breakpoint check at 375px and 768px (Chrome DevTools responsive mode).
6. ✅ axe-core report shows no critical/serious violations: `npx @axe-core/cli http://localhost:3000/<route>` (install dev-only).

**Phase exit gates:**
1. ✅ All component/route gates pass for everything in the phase.
2. ✅ `npm run build` succeeds (production build).
3. ✅ Existing tests still pass: `npm run test`.
4. ✅ PR description includes:
   - Phase summary (what was built)
   - List of OQ-blocked items shipped as seed-data fixtures
   - Hard-gate checklist (with all boxes ticked)
   - Manual smoke-test notes (what you actually clicked through)
   - Migration impact (any legacy `src/` files deleted)

### 5.4 Iterative loops — the per-task development cycle

For each component, route, or sub-task, follow this loop:

```
WRITE → TYPECHECK → LINT → BUILD → MANUAL SMOKE → FIX → COMMIT
                                             ↑          |
                                             |  (loop)  |
                                             └──────────┘
```

**Concretely:**
1. Read the spec section.
2. Write the code (component or route).
3. Run `npx tsc --noEmit`. Fix errors.
4. Run `npm run lint`. Fix errors.
5. Run `npm run build` (or `npm run dev` for routes). Fix any build errors.
6. Open the route or scratch page in a browser. Click through. Verify visual state matches spec.
7. If issues found → fix → loop back to step 3.
8. **Hard limit**: 3 loop iterations max on a single component without progress. If you're on iteration 4 with the same error, **escalate**: write a brief `## STUCK` note in the PR draft describing what you tried, and pause for human input. Do not silently keep looping.
9. Once all gates pass for the component, commit with a focused conventional-commit message.

### 5.5 When you hit an OQ

If during implementation you discover a question the spec doesn't answer that isn't in the §13 OQ list, **stop and add it**. Open the spec, append a new OQ row, commit it as `docs(spec): add OQ-<n> — <summary>`. Then proceed with a sensible default and call it out in the PR.

Do NOT silently invent product behavior.

---

## 6. Phase plan (with worktree mapping)

### Phase 0 — Foundation (worktree: `phase/0-foundation`, sequential, ~30 min)

This MUST land in `master` before anything else.

1. Add new deps (§4 above) via `npm install`. Commit.
2. Replace `tailwind.config.ts` per spec §2.4 verbatim. Commit.
3. Replace `src/app/globals.css` (or equivalent) with §2.1 (CSS vars, including all `--z-*` tokens) + §2.2 (body baseline + ambient gradient). Commit.
4. Add fonts via `next/font/google` in `src/app/layout.tsx` per §3.1. Commit.
5. Update `next.config.js` `images.remotePatterns` per §12.12. Commit.
6. Run gates (typecheck, lint, build). The current legacy UI WILL break visually — that's expected. Fix any TS/lint errors that block the build.
7. Open PR. Merge to `master`. Other worktrees rebase onto this.

**Gate:** build green; `master` has new deps + tokens + fonts; legacy UI may look broken but app boots.

### Phase 1 — Shell + Dialog primitive (worktree: `phase/1-shell`, sequential)

After Phase 0 in `master`. Build the things every other phase depends on.

1. **`<Dialog>` primitive** — §11.6. Radix Dialog wrapper with variants (drawer / sheet / modal). All overlay/focus/scroll-lock/close-button logic lives here. Other phases consume this; do NOT hand-roll dialog logic anywhere else.
2. **`<Masthead>`** — §5.3.1. Sticky top nav, blur backdrop.
3. **`<PageShell>`** — §5.3.2. Outer layout used by every route.
4. **`<MobileNav>`** — §9 bottom tab bar (phone-only).

**Gate:** all four templates render at all 3 breakpoints; keyboard nav works; PR merged to `master`. All Phase 4 worktrees consume these via imports.

### Phase 2 — Primitives (worktree: `phase/2-primitives`, parallel via subagents)

After Phase 1 in `master`. Spawn subagents per §5.2 fan-out. Each primitive ships as one focused commit; phase ends with one PR containing all primitives.

Build everything in §5.1: `<AlphaScore>`, `<ConfidenceBar>` + `<LowNBadge>`, `<Provenance>`, `<SignalFreshness>`, `<PremiumPreviewLock>`, `<Badge>`, `<RankTierBadge>`, `<DirChip>`, `<Originator>`, `<Rank>`, `<Token>`, all form controls.

Build `src/lib/types.ts` with the canonical type exports (§5.1.1: `AlphaWindow`, `AlphaVariant`, `RankTier`, `Confidence`; plus `MetricSpec` etc.).

Build `src/lib/url-state.ts` with the Zod schemas + `parseParams` helper (§12.11).

Build `src/components/icons/` with the product-specific glyphs (§5.4 — Originator, RetractionDiamond, ConsensusIcon, LockProIcon, DirLong, DirShort).

Build a scratch component-gallery page at `src/app/_dev/components/page.tsx` (gitignored or behind a feature flag) for visual smoke testing.

**Gate:** every primitive renders in the gallery at all states; passes per-component gates. PR merged to `master`.

### Phase 3 — Composites (worktree: `phase/3-composites`, parallel via subagents)

After Phase 2 in `master`. Build §5.2 composites:

`<EvidenceStrip>`, `<LeaderboardTable>`, `<SkeletonRow>`, `<ConsensusSnapshotRail>`, `<CompareBar>`, `<MetricCard>`, `<BestCallCard>`, `<SelfCorrectionViz>`, `<ScoreExplanationDrawer>`, `<CallDrawer>`, `<Cockpit>`, `<SynthesisBand>`, `<SignalRow>`, `<EmptyState>`, `<ErrorState>`, `<MiniEmpty>`, `<Tooltip>`, `<MetricPopover>`, `<MetricBottomSheet>`, `<CreatorAvatar>`.

Build `src/lib/metrics.ts` with the 10-metric registry per §8.3 (typed `Record<MetricId, MetricSpec>`). Every popover instance reads from this single source.

**Gate:** every composite renders in the gallery; PR merged to `master`.

### Phase 4 — Routes (worktrees in parallel)

Each route gets its own worktree (see §5.1). Routes are independent, so all 9 worktrees can run in parallel.

For each route:
1. Build the page as a Server Component (per §12.10) reading from a seed-data fixture in `src/lib/fixtures/<route>.ts`.
2. Add `loading.tsx` + `error.tsx` per §12.13.
3. Wire URL state via `parseParams` from `src/lib/url-state.ts`.
4. Mark client islands (sort header, drawer trigger, etc.) with `"use client"`.
5. For surfaces in §4 backend-blocked list, the seed data is the v1 ship; flag in PR.
6. Run per-route gates.

Routes:
- **4a Leaderboard** `/` — §6.1
- **4b Creator profile** `/creator/[handle]` — §6.2
- **4c Calls explorer** `/calls` + `/calls/[id]` + `/call/[id]` redirect — §6.3 + §6.10
- **4d Signals** `/signals/active` + `/signals/resolved` + `/signals/by-asset` + `/signals/by-creator-cluster` + `/signals/mine` + `/signals/[thesis]` — §6.4 + §6.7 + §6.8 + §6.9
- **4e Compare** `/compare` — §6.5
- **4f Dashboard** `/dashboard` — §6.6
- **4g Pricing** `/pricing` — §7
- **4h Methodology** `/methodology` — §6.13 (must include all anchors from §6.13 anchor map; wire unit test that asserts every metric registry `methodologyHref` resolves)
- **4i Auth + Settings** `/login` + `/signup` + `/settings/*` — §6.11 + §6.12

After each route lands, integrate `<MetricPopover>` at every metric site on that route.

**Gate per route:** all per-route gates pass; PR merged to `master`.

### Phase 5 — Mobile substitutions (worktree: `phase/5-mobile`)

After all routes are wired with desktop-canonical layout. Apply §9 mobile substitutions:
- Leaderboard table → card list at phone.
- Compare 4-way → 2-way + pager-dot+tap.
- Cockpit 1×4 → vertical 4-card stack.
- MetricPopover → `<MetricBottomSheet>`.
- Assumptions panel → pull-up drawer.

Test at 375px, 393px, 768px, 1280px, 1440px.

**Gate:** all routes render correctly across all breakpoints; phone has no horizontal scroll; PR merged.

### Phase 6 — Cleanup

1. Delete legacy `src/` files no longer referenced.
2. Remove the `_dev/components/` scratch gallery (or keep behind a `?devtools` query if useful).
3. Update README with brief "how to run" + reference to the spec.
4. Run full test suite. Run full build. Run axe across all routes.

**Gate:** clean repo, all gates green, PR merged. Spec implementation complete.

---

## 7. Things you must NOT do

- **Do NOT modify `docs/frontend-design-spec.md`** to make implementation easier. If the spec is wrong, file an OQ in §13 and pause. The spec is canonical.
- **Do NOT use `any` in TypeScript.** `unknown` + narrowing is fine.
- **Do NOT add dependencies beyond §4** without filing an OQ first.
- **Do NOT skip hard gates.** A gate failure means stop, fix, re-check.
- **Do NOT hand-roll Dialog/Drawer/Sheet/Modal logic.** Use the `<Dialog>` primitive from Phase 1.
- **Do NOT hand-roll URL parsing.** Use `parseParams` + Zod schemas from `src/lib/url-state.ts`.
- **Do NOT skip the `"use client"` discipline.** Default Server; mark Client only when necessary (§12.10).
- **Do NOT use raw `z-index` numerals.** Use `var(--z-*)` (CSS) or `z-{name}` (Tailwind).
- **Do NOT push to `master` directly.** All work via PRs from feature branches.
- **Do NOT bypass the design tokens.** No hex literals in component CSS — always reference `--ink-*`, `--accent`, etc.
- **Do NOT silently invent product behavior.** Add an OQ.

---

## 8. Reporting

At the end of each phase, post a brief status:

```
## Phase N.x — <name> — STATUS

### Shipped
- ...

### Seed-data fixtures (backend-blocked)
- /signals/active — fixture: src/lib/fixtures/signals-active.ts — gated on OQ-17
- ...

### OQs added during this phase
- (none, or list)

### Gates
- typecheck: ✅
- lint: ✅
- build: ✅
- routes load: ✅
- a11y axe: ✅ (0 critical, 0 serious)
- mobile breakpoints: ✅

### Manual smoke
- Click-through notes...

### PR
- <link>
```

---

## 9. Final acceptance

The refactor is complete when:

1. Every route in §4.1 sitemap renders against either real backend or a seed-data fixture.
2. Every backend-blocked surface (§4 above) is flagged in its PR description with the OQ reference.
3. All hard gates pass for every phase.
4. Mobile, tablet, desktop all render correctly per §9.
5. Visual diff against `.new-FE-design/phase-3-screens-v0.3.html` (the canonical screens prototype) shows the implementation is the v0.3 spec, not the v0.1 or v0.2 prototype variants.
6. README updated.
7. Final omx review (or peer review) passes.

After acceptance, the next pass is wiring the backend-blocked surfaces as their respective OQs are resolved — a separate work stream.

---

**Begin with Phase 0. Acknowledge the spec read, confirm the worktree setup is in place, then start the dep install commit.**
