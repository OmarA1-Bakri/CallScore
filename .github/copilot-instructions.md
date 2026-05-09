# Copilot instructions

## Build, test, and lint

- Install dependencies with `npm ci`.
- Start local dev with `npm run dev`.
- Run lint with `npm run lint`.
- Run type checks with `npm run typecheck`.
- Run the full test suite with `npm test`.
- Run the focused cross-cutting UI/auth/settings regression subset with `npm run test:settings`.
- Run a single test file with `node --import tsx --test tests/auth.test.ts`.
- Run a single named test with `node --import tsx --test --test-name-pattern "session" tests/auth.test.ts`.
- Build production output with `npm run build`.
- CI uses `npm ci && npm run lint && npm run typecheck && npm test && npm run build`.

## High-level architecture

- This is a single Next.js 14 App Router app. UI routes live under `src/app`, route handlers live under `src/app/api`, shared business logic lives under `src/lib`, and standalone data/pipeline scripts live under `src/scripts`.
- Neon Postgres is the source of truth. `schema.sql` and `migrations/` define the tables; `src/lib/db.ts` resolves the database URL from the supported env vars and exposes the shared `query()` helper used by pages, APIs, and scripts.
- The public product surfaces are backed directly by live database rows, not mock data. The homepage leaderboard (`src/app/page.tsx`), creator pages, and call pages read from `creators`, `calls`, `creator_stats`, and related tables. `src/lib/public-serializer.ts` is the canonical place for turning raw call rows into public score, horizon, extraction-validity, and live-pricing payloads.
- API routes generally reuse the same `src/lib` helpers as the pages. For public JSON endpoints, route handlers validate/coerce DB rows through `src/lib/api-schemas.ts` before returning them.
- Auth and paid access are handled in-process. `src/lib/auth.ts` uses an HMAC-signed `ctr_session` cookie for sessions, and `src/lib/whop.ts` normalizes tiers and checks Whop access. Premium gating is applied in routes/components; some alpha APIs also accept `ctr_alpha_*` API keys via `src/lib/premium.ts`.
- For Whop API, SDK, OAuth, checkout, app view, webhook, product, plan, membership, or MCP work, use the repo-local `whop-docs` skill first (`.github/skills/whop-docs`, mirrored under `.agents/skills/whop-docs` for local agent discovery) and verify against live Whop documentation before editing or changing live resources.
- The data-refresh pipeline is script-driven. The canonical production path is `discover:videos -> scrape:v2 -> extract:openrouter -> match -> score -> consensus` as documented in `docs/current-pipeline-entrypoints.md`. Older script names remain as compatibility wrappers and should not be treated as the primary implementation path.
- Operational automation is intentionally off Vercel. The always-on Hermes/Hetzner agent is the critical execution channel for CallScore on Whop: the migrated data pipeline, long-running ML loop, and worker-style jobs run there continuously instead of inside request/cron lifetimes.
- Vercel mainly serves the Next.js app and the enqueue/status endpoints. Neon stores durable run/job/event state, and Hermes/Hetzner workers claim jobs with `FOR UPDATE SKIP LOCKED` (`src/lib/pipeline.ts`, `docs/hermes-pipeline.md`).
- Alerts and watchlists are a separate Neon-backed subsystem. `src/lib/alerts.ts` manages `watchlists`, `alerts_queue`, unsubscribe state, and skip-locked claiming for delivery jobs.

## Key conventions

- Follow `docs/frontend-design-spec.md` for UI work. The visual direction is the locked editorial-terminal design, and the guardrail tests in `tests/pages-cross-cutting.test.ts`, `tests/components-no-rounded.test.ts`, `tests/components-no-lucide-decoration.test.ts`, and `tests/frontend-tokens.test.ts` enforce it.
- Rebuilt pages/components must avoid rounded dashboard chrome and decorative iconography. The tests ban `rounded-lg/xl/2xl/3xl/full`, `glass-card*`, and all `lucide-react` icons except `Menu`, `X`, `ArrowLeft`, `ArrowUpRight`, `ExternalLink`, `Lock`, and `Crown`.
- The root layout already owns `<main>`, header, footer, and the floating feedback button. Rebuilt pages should not add another `<main>`, and each rebuilt page should have exactly one `<h1>` unless `SettingsShell` owns it.
- Tailwind tokens are part of the contract. Use the `ink`, `accent`, `pos`, `neg`, `warn`, `stale`, `lock`, `new`, and `lown` palette from `tailwind.config.ts` / `src/app/globals.css`. Do not reintroduce generic `gray-*`, `text-white`, legacy `brand-*` aliases, out-of-palette Tailwind colors, or the older phosphor/B Terminal color literals.
- The custom breakpoint contract is `tab: 481px` and `desk: 1025px`. Legacy `sm/md/lg/xl` still exist only for phased migration; prefer `tab` and `desk` for current UI work.
- Fonts are intentionally local CSS-variable hooks. `src/app/fonts.ts` and `src/app/globals.css` define the font variables; do not switch the app back to `next/font/google`.
- Keep public research surfaces public. `src/lib/creator-tier.ts#getCreatorTier()` intentionally returns `"free"` so the leaderboard, creator pages, call history, and methodology stay visible; premium gating is used for recent-period leaderboard access, exports, alerts, API keys, and future delivery workflows rather than hiding the public evidence trail.
- Data semantics matter:
  - Returns are stored as percentages already; `computeReturn()` already multiplies by 100.
  - `candles.open_time` is a bigint millisecond value, not an ISO timestamp.
  - `creator_stats` is updated in place and is not automatically cleared before recomputes.
- This repo uses Node's built-in test runner with `tsx`, not Jest or Vitest. Keep helper files that should not run as tests outside the `*.test.ts` glob pattern.
- If Codacy MCP is available, also follow `.github/instructions/codacy.instructions.md`, which requires running Codacy analysis on edited files after changes.
