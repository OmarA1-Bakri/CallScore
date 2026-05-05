# Settings Product Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the underdeveloped Pro/Alpha surfaces into credible, canonical product UI: alerts/watchlists, API access, webhooks, feedback, Backtest Lab, pricing parity, and settings IA.

**Architecture:** Keep the existing Next.js App Router surfaces and server component pattern. Use existing data-layer functions where they already exist, add only small helper queries where the UI needs names/status/logs, and keep visual styling inside the canonical editorial-terminal system from `docs/frontend-design-spec.md`.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind, existing Neon query helper, Recharts for Backtest Lab charts.

---

### Task 1: Canonical Feedback Page

**Files:**
- Modify: `src/app/feedback/page.tsx`
- Modify: `tests/pages-cross-cutting.test.ts`

- [ ] Replace the generic centered SaaS feedback page with an editorial-terminal evidence intake.
- [ ] Remove lucide decoration from the page.
- [ ] Add category, issue type, URL/context, optional screenshot/source URL, contact, and evidence text fields.
- [ ] Keep `/api/feedback` POST compatibility by serializing new fields into the existing `message` body.
- [ ] Add feedback to rebuilt page guardrails.

### Task 2: Settings Management Shell

**Files:**
- Modify: `src/components/SettingsShell.tsx`

- [ ] Expand settings IA from isolated tabs into a management shell with status summary.
- [ ] Preserve Alerts/API/Webhooks routing.
- [ ] Add account, billing, and notifications rows as visible IA, marked planned where no backend route exists.
- [ ] Keep mobile horizontal tab behavior and desktop sidebar behavior.

### Task 3: Alerts / Watchlist UI

**Files:**
- Modify: `src/lib/alerts.ts`
- Modify: `src/app/settings/alerts/page.tsx`
- Modify: `src/app/api/alerts/watch/route.ts`

- [ ] Add a watchlist query that joins creators so the UI shows names, handles, rank, alpha, and call count.
- [ ] Allow form-encoded add/remove actions as well as JSON API calls.
- [ ] Add creator-id add form, current watchlist management, alert preferences preview, and queue status.

### Task 4: API Access UX

**Files:**
- Modify: `src/app/settings/api/page.tsx`
- Modify: `src/app/api/api-keys/route.ts`

- [ ] Replace raw JSON form create response with a redirect carrying one-time secret fields in the URL.
- [ ] Add first-key reveal panel, copyable text field, endpoint docs, examples, scopes, rate limits, and key activity table.
- [ ] Preserve JSON create/revoke behavior for programmatic callers.

### Task 5: Webhooks UX

**Files:**
- Modify: `src/lib/webhooks.ts`
- Modify: `src/app/settings/webhooks/page.tsx`
- Modify: `src/app/api/webhooks/route.ts`

- [ ] Return the signing secret once on create, through redirect params for browser form submissions.
- [ ] Add latest delivery rows and last-delivered status.
- [ ] Add test webhook action that records a test delivery through the existing delivery pipeline.
- [ ] Show event schema, retry contract, failure state, and event table.

### Task 6: Backtest Lab Polish

**Files:**
- Modify: `src/app/backtest/page.tsx`

- [ ] Add creator search/filter, preset links, saved-scenario style query links, clearer strategy/weighting explanations, benchmark controls, and share/export links.
- [ ] Keep existing portfolio execution and chart components intact.

### Task 7: Pricing Parity

**Files:**
- Modify: `src/app/pricing/page.tsx`

- [ ] Mark partially shipped surfaces honestly.
- [ ] Link shipped management surfaces from feature rows where possible.
- [ ] Keep paid-tier promise language aligned with the actual UI state.

### Task 8: Verification

**Commands:**
- `npm run typecheck`
- `node --import tsx --test tests/pages-cross-cutting.test.ts tests/components-no-rounded.test.ts tests/components-no-lucide-decoration.test.ts tests/api-routes.test.ts tests/alerts.test.ts`
- `npm run build`

- [ ] Run focused tests after edits.
- [ ] Run typecheck and build.
- [ ] Use a verifier agent for an independent workflow review.
