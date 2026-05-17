AGENTS.md — crypto-tuber-ranked
Operating rules for AI coding agents working in `OmarA1-Bakri/crypto-tuber-ranked`.
This file is for any LLM-based development agent, including Claude Code, Codex, OpenCode, Cursor agents, Aider, Devin-style agents, or custom runners. Treat it as the repository-local contract. Inspect the repository before making changes; this file is a high-signal starting point, not a substitute for reading the code.

**Scope and relationship to CLAUDE.md:** This file is the authoritative rules document. `CLAUDE.md` is retained for historical context and compatibility with Claude Code tooling, but AGENTS.md takes precedence on all rule conflicts. The repository-specific gotchas in section 3 are the canonical gotcha list; CLAUDE.md may contain a cached copy for tool-local consumption but should not diverge without updating this file.
---
Project Context
Project name: Crypto Tubers Tracked / `crypto-tuber-ranked`
Purpose: This repository is the Whop-distributed crypto YouTuber accuracy application. It discovers crypto creator videos, scrapes or imports transcripts, extracts price calls with LLMs, matches those calls against historical one-minute candle data, computes creator accuracy and alpha-style scores, and serves the ranked product through a Next.js web app with API routes, public pages, gated Whop functionality, alerts, and operational data pipelines.
Primary stack: TypeScript, Node 20, Next.js App Router, React, Tailwind CSS, Neon Postgres, Vercel, Docker for the Hermes worker runtime, Whop SDK, LLM extraction providers including Gemini/Ollama-compatible flows, Sentry monitoring, and script-driven data pipelines via `tsx` and `node --test`.
Important directories and files:
`src/app/` — Next.js App Router pages, layouts, and public application surfaces.
`src/app/api/` — serverless-style API routes, cron enqueue endpoints, alerts, Whop/auth-adjacent endpoints, and public data routes.
`src/lib/` — shared application logic: database access, scoring, pipeline queues, monitoring, ML verification, constants, and domain utilities.
`src/scripts/` — standalone operational scripts for discovery, scraping, extraction, matching, scoring, migrations, audits, Hermes worker execution, Whop bootstrap, shadow extraction, and ML evaluation.
`tests/` — Node test runner suites. Add new tests here and run them through the existing `npm test` cascade unless a narrower gate is justified first.
`migrations/` and `schema.sql` — Neon Postgres schema and ordered migrations. Treat production migrations and data rewrites as high-risk.
`docs/current-pipeline-entrypoints.md` — canonical data-refresh and shadow-extraction entrypoints. Prefer this over older script names.
`docs/frontend-design-spec.md` and `.new-FE-design/` — current Editorial Terminal frontend design source of truth.
`Dockerfile.hermes` — production worker image for the always-on Hermes pipeline worker.
`vercel.json` — Vercel cron and deployment configuration. Git deployments are disabled here; do not assume pushes auto-deploy.
`CLAUDE.md` — historical repo-specific agent rules. This `AGENTS.md` supersedes it for tool-neutral agent operation, but preserve any still-valid domain gotchas.
Primary commands:
```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm run pipeline:worker:once
npm run pipeline:worker
```
Canonical production/data-refresh pipeline:
```bash
npm run discover:videos
npm run scrape:v2
npm run extract:llm
npm run match
npm run score
npm run consensus
```
Shadow extraction review flow:
```bash
npm run shadow:extract
npm run shadow:diff
npm run shadow:promote -- --confirm-run-id <run-id> --write --allow-statuses new_calls,changed_calls
```
`manual_review` shadow rows are intentionally not promotable.
Production systems and external services:
Neon Postgres — production database for creators, videos, transcripts, extracted calls, candles, scores, pipeline runs, jobs, and job events.
Vercel — web application host and cron scheduler. `vercel.json` disables git deployment by default and defines cron enqueue routes.
Hetzner / Hermes worker — always-on Docker worker execution environment for long-running pipeline jobs that should not run inside Vercel request limits.
Whop — product distribution, products/plans/checkouts, app embedding, and membership/access gating.
`OmarA1-Bakri/Claude_Code_Automations` — companion automation control-plane repo that owns Whop/Vercel adoption, deployment, commerce launch automation, agent workflows, and Hetzner MCP runtime.
LLM providers — extraction, verification, and model bakeoff flows. Do not run large/open-ended LLM jobs without approval.
Sentry — production and worker monitoring.
Resend or email provider integrations — alerts and feedback email paths where configured.
Market/candle data providers — candle refresh and price matching inputs.
Default branch: `master`.
---
Companion Repository Contract
This repository is the application and data product. The companion repository `OmarA1-Bakri/Claude_Code_Automations` is the automation and agentic operations control-plane.
Use this boundary:
Implement product UI, API routes, database schema, scoring logic, extraction logic, pipeline jobs, and Hermes worker behavior in this repository.
Implement or modify Whop/Vercel adoption, Whop app scaffolding, audited deployment automation, MCP tools, commerce-launch automation, reusable agent workflows, and Hetzner control-plane logic in `Claude_Code_Automations`.
Do not duplicate the Whop pipeline plugin inside this repo. This repo may contain app-side Whop integration and bootstrap scripts, but the audited Whop/Vercel automation belongs in the companion repo.
If a change spans both repos, update both `AGENTS.md` files or explicitly state why only one side changed.
Never let an agent in this repo perform live Whop/Vercel provider mutations directly when the companion repo has an audited high-level tool for the task. Use the companion repo’s `whop.adopt`, `whop.deploy`, `whop.reconcile`, `whop.scaffold`, or `whop.commerceLaunch` workflow after explicit approval.
---
Hard Rules — Non-Negotiable
Violating these rules can cause lost data, bad rankings, broken paid access, corrupted history, exposed secrets, misleading reports, or production downtime.
---
1. Ask Before Destructive, Production, External, or Expensive Actions
Never run irreversible, production-impacting, externally visible, high-cost, or shared-state-changing commands without explicit user approval.
Before asking for approval, state:
The exact command or action.
Why it is needed.
What could go wrong.
Whether there is a safer alternative.
Always require confirmation before:
Git history or branch changes
`git push --force` or `git push --force-with-lease`
`git reset --hard`
`git clean -fd`
`git checkout -- .`
`git merge`, `git rebase`, or `git cherry-pick` onto `master` or any shared branch
deleting local or remote branches
amending commits that may already have been pushed
deleting, moving, or force-pushing tags
Database and pipeline risk
`DROP TABLE`, `TRUNCATE`, destructive migrations, or migration rewrites
scripts that rewrite, backfill, deduplicate, recompute, promote, or bulk-update production data
production runs of `compute-scores`, `match-prices`, `audit-recompute`, `backfill-*`, `reextract-low-confidence-videos`, `promote-creator-candidates`, `shadow:promote`, or candle guardrail repair commands
any operation against production `DATABASE_URL` where the write set is not bounded and understood
Production or shared infrastructure
Vercel deploys, promotions, cron changes, domain changes, or environment-variable changes
Neon branch deletion or database role/permission changes
Whop product, plan, checkout, webhook, app, or access changes
Hetzner worker restarts, Docker image replacement, queue purges, or systemd/service changes
cache purges affecting users
auth, billing, DNS, email sender, or secrets changes
External visibility or spend
sending emails or user/customer notifications
posting to GitHub, Slack, Telegram, social platforms, or customer-facing channels
running open-ended scrapers, crawlers, transcript downloads, LLM extraction, enrichment, or model bakeoff jobs
spending significant Gemini, Ollama Cloud, Whop, market-data, Firecrawl, SerpAPI, Resend, or similar quota
Safe by default:
read-only inspection commands
local edits inside the working tree
local tests, typechecks, lints, and builds
`git status`, `git diff`, `git log`
bounded read-only SQL queries
If unsure whether an action is destructive, shared, externally visible, or expensive, ask first.
---
2. Verify Before Reporting Complete
Do not report work as complete until it has been verified.
Minimum verification expectations:
```bash
npm run typecheck
npm test
npm run build
```
Also run `npm run lint` for changes touching UI, API routes, Next.js app files, or shared frontend components.
For targeted work, run the narrow test first, then the cascade:
Add or update a focused test that fails for the bug or behavior.
Make the focused test pass.
Run the relevant existing test file or suite.
Run `npm test` unless the user explicitly accepts a narrower verification.
Run `npm run typecheck`.
Run `npm run build` when the change can affect runtime, routes, bundling, config, imports, or environment behavior.
Report results truthfully:
If tests fail, say they failed and include the relevant output.
Do not skip failing tests to manufacture a green result.
Do not describe unverified work as done.
If you cannot run a check because dependencies, secrets, Docker, database access, or network access are unavailable, state that clearly and identify the remaining verification gap.
---
3. Repository-Specific Technical Gotchas
Slow down around these. They are known failure points.
Returns are stored as percent, not ratio. `computeReturn` in `src/lib/scoring.ts` already multiplies by 100. Do not multiply `return_30d`, `avg_return`, or similar values again for display.
`creator_stats` is not automatically cleared by every scoring path. Creators with zero matched calls may retain stale values unless the change explicitly handles clearing.
`candles.open_time` is a `bigint` millisecond value, not a timestamp. Pass raw millisecond numbers to queries; do not convert to ISO strings.
Current UI design is the Editorial Terminal direction in `docs/frontend-design-spec.md` and `.new-FE-design/`. Do not reintroduce the superseded green terminal design or generic rounded SaaS-card styling.
UI guardrail tests enforce constraints such as no decorative Lucide icon headers, no rounded chrome, and single-H1 page shape. Do not fight the tests; align with the spec.
`docs/current-pipeline-entrypoints.md` is the canonical pipeline reference. Older script names exist for compatibility and reproducibility only.
`vercel.json` has `deploymentEnabled: false`; do not assume a push deploys production.
Hermes worker jobs should be idempotent, claim-safe, heartbeat-aware, and recoverable through `pipeline_runs`, `pipeline_jobs`, and `pipeline_job_events`.
---
4. Hermes Worker and Queue Rules
The Hermes worker is the always-on execution path for long-running pipeline jobs.
Supported worker job types include:
`ml_verifier_batch`
`hermes_smoke_test`
`candle_refresh`
`match_prices_batch`
`compute_scores`
ML promotion job type from `src/lib/ml-promotion`
Worker behavior expectations:
Use `npm run pipeline:worker:once` for bounded local checks.
Use `npm run pipeline:worker` only when an always-on worker process is intended.
Use `--dry-run` and smoke jobs for worker wiring checks where possible.
Never run an unbounded production worker loop locally without approval.
Preserve stale-job reset, job claiming, heartbeat, retry/fail, and monitoring semantics.
Do not swallow provider/database errors. They must be logged to job events and monitoring.
Every new job type must have an idempotency strategy, bounded payload, retry policy, and verification story.
---
5. Data Pipeline Rules
Canonical production/data-refresh path:
```bash
npm run discover:videos
npm run scrape:v2
npm run extract:llm
npm run match
npm run score
npm run consensus
```
Rules:
Do not replace the canonical path with legacy wrappers unless deliberately testing compatibility.
Do not run expensive extraction or transcript backfills open-ended. Use bounded batches, dry runs, or staging/test databases first.
Any pipeline script that writes to Neon must clearly state the target database, expected row count, write type, and rollback/repair plan before production execution.
Prefer per-row or per-candidate error isolation over aborting whole batches when a single candidate is malformed.
LLM JSON parsing must be defensive. Avoid batch-fatal parsing assumptions where one malformed model response kills the full job.
For shadow extraction, review diffs before promotion and never promote `manual_review` rows.
---
6. Whop and Paid Access Rules
This app integrates with Whop, but audited Whop/Vercel automation lives in `Claude_Code_Automations`.
Inside this repo:
App-side Whop SDK/API use is allowed for product functionality, access checks, webhooks, bootstrap scripts, and route handling.
`npm run whop:bootstrap` is a provider-mutating script. Treat it as production-impacting unless explicitly pointed at a safe test company/product.
Never commit Whop API keys, webhook secrets, product IDs that should remain private, checkout URLs that should not be public, or generated secrets.
Do not create, publish, archive, or change Whop products/plans/checkouts from this repo when the companion automation repo has an audited workflow for the task.
For production commerce objects, prefer hidden-first creation and explicit publish gates.
---
7. Frontend and Product Surface Rules
Follow `docs/frontend-design-spec.md` as the design source of truth.
Maintain dark-first Editorial Terminal styling: dense data, restrained ochre accent, semantic colors, hairlines, serif editorial headings, mono numerics.
No generic neon crypto aesthetic, no bro-y copy, no hype language, no decorative imagery, and no emoji in the product UI.
Every score, metric, and ranking should remain explainable and source-backed.
For UI changes, run relevant page-shape and cross-cutting tests, then `npm run lint`, `npm run typecheck`, and `npm run build`.
Do not silently change pricing, tier gates, paid/free feature boundaries, or Whop access behavior.
---
8. Engineering Discipline
Simplicity first
Implement the smallest correct change. Avoid speculative abstractions, generic frameworks, broad refactors, or configuration nobody asked for.
Surgical changes
Touch only the files required by the task. Do not clean up adjacent code unless the cleanup is necessary to complete and verify the requested change.
Plan before changing code
For multi-file tasks, state a short plan with verification gates before editing. Keep a visible task list where the agent platform supports it.
Cascading tests
When adding a new test, run it at the end of the relevant existing tests so the new check does not pass in isolation while breaking the chain. A passing targeted test is not enough if the surrounding suite fails.
Honest reporting
End every implementation report with:
files changed
commands run
pass/fail result for each command
unverified risks or skipped checks
any follow-up required
---
9. Secrets and Environment
Required or common environment variables include:
`DATABASE_URL`
`GEMINI_API_KEY`
`OLLAMA_API_KEY` or `OLLAMA_TOKEN` where applicable
`RESEND_API_KEY`
Whop-related variables such as `WHOP_API_KEY`, `WHOP_COMPANY_ID`, product IDs, plan IDs, checkout URLs, and webhook secrets where applicable
Sentry/monitoring variables where configured
Rules:
Do not commit `.env*` files.
Do not print secrets into chat, logs, test snapshots, or generated docs.
Redact secrets in error output.
Before running any production-writing script, confirm which `.env`/database target is active.
---
10. Final Delivery Checklist
Before handing work back:
`git diff` reviewed.
No secrets or generated local files included.
Tests/typecheck/build run or explicitly marked unavailable.
Database and production-impacting operations avoided unless approved.
Companion repo impact considered.
`AGENTS.md` updated if the repo operating model changed.
---
11. External Tool Connections — Composio First
Composio is the source of truth for all third-party app connections. When any task requires an external service (GitHub, Gmail, Slack, Notion, Twitter/X, Linear, Google Sheets, Discord, Supabase, Stripe, YouTube, etc.), Composio is the first and primary integration path.
Rules:
Always search Composio tools first via `COMPOSIO_SEARCH_TOOLS` before writing custom API calls, raw HTTP requests, or ad-hoc scripts against an external service.
Use the Composio MCP server (`connect.composio.dev/mcp`) for all tool execution. Do not bypass it with direct SDK usage or `curl` unless the tool is genuinely unavailable.
When a needed app is not yet connected, initiate the OAuth flow via `COMPOSIO_MANAGE_CONNECTIONS` and wait for it via `COMPOSIO_WAIT_FOR_CONNECTIONS`. Do not ask the user for API keys or manual token setup.
Prefer the 7 Composio meta-tools (`COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_WAIT_FOR_CONNECTIONS`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL`) as the standard execution surface. Do not reach for native composio CLI commands or direct API calls unless the MCP meta-tools are insufficient for the task.
The Composio API key is in `COMPOSIO_API_KEY` or the project MCP config. Never print it, commit it, or echo it into logs.
---
12. Skills, Plugins, and Agents — Library as Source of Truth
The canonical skills, plugins, and agent definitions live in the shared libraries under `~/cloned_libraries/`. These are the source of truth and must not be duplicated or forked into this repo.
Rules:
`~/cloned_libraries/hermes-library/skills/` is the primary skills library. All skill loading paths in `kilo.jsonc` already point here. Do not create ad-hoc skill files in the project `.kilo/skills/` directory; add or update skills in the library instead.
`~/cloned_libraries/whop_pipeline_plugin/skills/` provides Whop pipeline automation skills (deploy, adopt, etc.). These are companion-repo tools; use them for reference but prefer the companion repo for live Whop/Vercel mutations.
When a skill is missing or needs updating, modify it in the source library, not in the project config. Project-local skill overrides are a last resort.
Agent definitions (`.kilo/agent/*.md`) and commands (`.kilo/command/*.md`) follow the same pattern: library-owned by default, project-level only for repo-specific overrides.

### Prerequisites / Setup
- **Composio MCP**: Configure `COMPOSIO_API_KEY` and connect to `https://connect.composio.dev/mcp` via the MCP server entry in `.kilo/kilo.jsonc`. The server exposes 7 meta-tools: `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_WAIT_FOR_CONNECTIONS`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL`.
- **Cloned libraries**: Ensure `~/cloned_libraries/hermes-library/skills/` and `~/cloned_libraries/whop_pipeline_plugin/skills/` exist. Alternative paths can be configured in `.kilo/kilo.jsonc` under `skills.paths`.
- **Kilo config**: `.kilo/kilo.jsonc` must point to those skill directories and include the Composio MCP entry. See `.kilo/kilo.jsonc` for the current working example.