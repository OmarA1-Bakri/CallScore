     1|AGENTS.md — CallScore
     2|Operating rules for AI coding agents working in `OmarA1-Bakri/CallScore`.
     3|This file is for any LLM-based development agent, including Claude Code, Codex, OpenCode, Cursor agents, Aider, Devin-style agents, or custom runners. Treat it as the repository-local contract. Inspect the repository before making changes; this file is a high-signal starting point, not a substitute for reading the code.
     4|
     5|**Scope and relationship to CLAUDE.md:** This file is the authoritative rules document. `CLAUDE.md` is retained for historical context and compatibility with Claude Code tooling, but AGENTS.md takes precedence on all rule conflicts. The repository-specific gotchas in section 3 are the canonical gotcha list; CLAUDE.md may contain a cached copy for tool-local consumption but should not diverge without updating this file.
     6|---
     7|Project Context
     8|Project name: Crypto Tubers Tracked / `CallScore`
     9|Purpose: This repository is the Whop-distributed crypto YouTuber accuracy application. It discovers crypto creator videos, scrapes or imports transcripts, extracts price calls with LLMs, matches those calls against historical one-minute candle data, computes creator accuracy and alpha-style scores, and serves the ranked product through a Next.js web app with API routes, public pages, gated Whop functionality, alerts, and operational data pipelines.
    10|Primary stack: TypeScript, Node 20, Next.js App Router, React, Tailwind CSS, HH VM PostgreSQL/pgsql primary storage with Neon backup/legacy compatibility, Netlify hosting/scheduling, Docker for the Hermes worker runtime, Whop SDK, LLM extraction providers including Gemini/Ollama-compatible flows, Sentry monitoring, and script-driven data pipelines via `tsx` and `node --test`.
    11|Important directories and files:
    12|`src/app/` — Next.js App Router pages, layouts, and public application surfaces.
    13|`src/app/api/` — serverless-style API routes, cron enqueue endpoints, alerts, Whop/auth-adjacent endpoints, and public data routes.
    14|`src/lib/` — shared application logic: database access, scoring, pipeline queues, monitoring, ML verification, constants, and domain utilities.
    15|`src/scripts/` — standalone operational scripts for discovery, scraping, extraction, matching, scoring, migrations, audits, Hermes worker execution, Whop bootstrap, shadow extraction, and ML evaluation.
    16|`tests/` — Node test runner suites. Add new tests here and run them through the existing `npm test` cascade unless a narrower gate is justified first.
    17|`migrations/` and `schema.sql` — PostgreSQL schema and ordered migrations. Production pgsql is primary; Neon is backup/legacy compatibility. Treat production migrations and data rewrites as high-risk.
    18|`docs/current-pipeline-entrypoints.md` — canonical data-refresh and shadow-extraction entrypoints. Prefer this over older script names.
    19|`docs/frontend-design-spec.md` and `.new-FE-design/` — current Editorial Terminal frontend design source of truth.
    20|`Dockerfile.hermes` — production worker image for the always-on Hermes pipeline worker.
    21|`netlify.toml` — canonical Netlify build/scheduled-function configuration. `vercel.json` is deprecated compatibility config; do not treat Vercel as production deployment evidence.
    22|`CLAUDE.md` — historical repo-specific agent rules. This `AGENTS.md` supersedes it for tool-neutral agent operation, but preserve any still-valid domain gotchas.
    23|Primary commands:
    24|```bash
    25|npm ci
    26|npm run dev
    27|npm test
    28|npm run typecheck
    29|npm run lint
    30|npm run build
    31|npm run pipeline:worker:once
    32|npm run pipeline:worker
    33|```
    34|Canonical production/data-refresh pipeline:
    35|```bash
    36|npm run discover:videos
    37|npm run scrape:v2
    38|npm run extract:llm
    39|npm run match
    40|npm run score
    41|npm run consensus
    42|```
    43|Shadow extraction review flow:
    44|```bash
    45|npm run shadow:extract
    46|npm run shadow:diff
    47|npm run shadow:promote -- --confirm-run-id <run-id> --write --allow-statuses new_calls,changed_calls
    48|```
    49|`manual_review` shadow rows are intentionally not promotable.
    50|Production systems and external services:
    51|HH VM PostgreSQL/pgsql — primary production database for creators, videos, transcripts, extracted calls, candles, scores, pipeline runs, jobs, and job events. Neon is backup/legacy compatibility only.
    52|Netlify — canonical web application host and scheduler. Vercel is deprecated and must not be treated as production deployment evidence.
    53|Hetzner / Hermes worker — always-on Docker worker execution environment for long-running pipeline jobs that should not run inside Vercel request limits.
    54|Whop — product distribution, products/plans/checkouts, app embedding, and membership/access gating.
    55|`OmarA1-Bakri/Claude_Code_Automations` — companion automation control-plane repo that owns Whop/Netlify deployment automation, legacy Vercel compatibility surfaces, commerce launch automation, agent workflows, and Hetzner MCP runtime.
    56|LLM providers — extraction, verification, and model bakeoff flows. Do not run large/open-ended LLM jobs without approval.
    57|Sentry — production and worker monitoring.
    58|Resend or email provider integrations — alerts and feedback email paths where configured.
    59|Market/candle data providers — candle refresh and price matching inputs.
    60|Default branch: `master`.
    61|---
    62|Companion Repository Contract
    63|This repository is the application and data product. The companion repository `OmarA1-Bakri/Claude_Code_Automations` is the automation and agentic operations control-plane.
    64|Use this boundary:
    65|Implement product UI, API routes, database schema, scoring logic, extraction logic, pipeline jobs, and Hermes worker behavior in this repository.
    66|Implement or modify Whop/Netlify deployment automation, legacy Vercel compatibility surfaces, Whop app scaffolding, audited deployment automation, MCP tools, commerce-launch automation, reusable agent workflows, and Hetzner control-plane logic in `Claude_Code_Automations`.
    67|Do not duplicate the Whop pipeline plugin inside this repo. This repo may contain app-side Whop integration and bootstrap scripts, but audited Whop/Netlify deployment automation and legacy Vercel compatibility surfaces belong in the companion repo.
    68|If a change spans both repos, update both `AGENTS.md` files or explicitly state why only one side changed.
    69|Never let an agent in this repo perform live Whop/Netlify provider mutations directly when the companion repo has an audited high-level tool for the task. Use the companion repo’s audited workflow after explicit approval; treat Vercel as deprecated unless explicitly approved for compatibility investigation.
    70|---
    71|Hard Rules — Non-Negotiable
    72|Violating these rules can cause lost data, bad rankings, broken paid access, corrupted history, exposed secrets, misleading reports, or production downtime.
    73|---
    74|1. Ask Before Destructive, Production, External, or Expensive Actions
    75|Never run irreversible, production-impacting, externally visible, high-cost, or shared-state-changing commands without explicit user approval.
    76|Before asking for approval, state:
    77|The exact command or action.
    78|Why it is needed.
    79|What could go wrong.
    80|Whether there is a safer alternative.
    81|Always require confirmation before:
    82|Git history or branch changes
    83|`git push --force` or `git push --force-with-lease`
    84|`git reset --hard`
    85|`git clean -fd`
    86|`git checkout -- .`
    87|`git merge`, `git rebase`, or `git cherry-pick` onto `master` or any shared branch
    88|deleting local or remote branches
    89|amending commits that may already have been pushed
    90|deleting, moving, or force-pushing tags
    91|Database and pipeline risk
    92|`DROP TABLE`, `TRUNCATE`, destructive migrations, or migration rewrites
    93|scripts that rewrite, backfill, deduplicate, recompute, promote, or bulk-update production data
    94|production runs of `compute-scores`, `match-prices`, `audit-recompute`, `backfill-*`, `reextract-low-confidence-videos`, `promote-creator-candidates`, `shadow:promote`, or candle guardrail repair commands
    95|any operation against production `DATABASE_URL` where the write set is not bounded and understood
    96|Production or shared infrastructure
    97|Netlify deploys, promotions, cron changes, domain changes, or environment-variable changes
    98|pgsql database role/permission changes or Neon branch deletion/backup mutation
    99|Whop product, plan, checkout, webhook, app, or access changes
   100|Hetzner worker restarts, Docker image replacement, queue purges, or systemd/service changes
   101|cache purges affecting users
   102|auth, billing, DNS, email sender, or secrets changes
   103|External visibility or spend
   104|sending emails or user/customer notifications
   105|posting to GitHub, Slack, Telegram, social platforms, or customer-facing channels
   106|running open-ended scrapers, crawlers, transcript downloads, LLM extraction, enrichment, or model bakeoff jobs
   107|spending significant Gemini, Ollama Cloud, Whop, market-data, Firecrawl, SerpAPI, Resend, or similar quota
   108|Safe by default:
   109|read-only inspection commands
   110|local edits inside the working tree
   111|local tests, typechecks, lints, and builds
   112|`git status`, `git diff`, `git log`
   113|bounded read-only SQL queries
   114|If unsure whether an action is destructive, shared, externally visible, or expensive, ask first.
   115|---
   116|2. Verify Before Reporting Complete
   117|Do not report work as complete until it has been verified.
   118|Minimum verification expectations:
   119|```bash
   120|npm run typecheck
   121|npm test
   122|npm run build
   123|```
   124|Also run `npm run lint` for changes touching UI, API routes, Next.js app files, or shared frontend components.
   125|For targeted work, run the narrow test first, then the cascade:
   126|Add or update a focused test that fails for the bug or behavior.
   127|Make the focused test pass.
   128|Run the relevant existing test file or suite.
   129|Run `npm test` unless the user explicitly accepts a narrower verification.
   130|Run `npm run typecheck`.
   131|Run `npm run build` when the change can affect runtime, routes, bundling, config, imports, or environment behavior.
   132|Report results truthfully:
   133|If tests fail, say they failed and include the relevant output.
   134|Do not skip failing tests to manufacture a green result.
   135|Do not describe unverified work as done.
   136|If you cannot run a check because dependencies, secrets, Docker, database access, or network access are unavailable, state that clearly and identify the remaining verification gap.
   137|---
   138|3. Repository-Specific Technical Gotchas
   139|Slow down around these. They are known failure points.
   140|Returns are stored as percent, not ratio. `computeReturn` in `src/lib/scoring.ts` already multiplies by 100. Do not multiply `return_30d`, `avg_return`, or similar values again for display.
   141|`creator_stats` is not automatically cleared by every scoring path. Creators with zero matched calls may retain stale values unless the change explicitly handles clearing.
   142|`candles.open_time` is a `bigint` millisecond value, not a timestamp. Pass raw millisecond numbers to queries; do not convert to ISO strings.
   143|Current UI design is the Editorial Terminal direction in `docs/frontend-design-spec.md` and `.new-FE-design/`. Do not reintroduce the superseded green terminal design or generic rounded SaaS-card styling.
   144|UI guardrail tests enforce constraints such as no decorative Lucide icon headers, no rounded chrome, and single-H1 page shape. Do not fight the tests; align with the spec.
   145|`docs/current-pipeline-entrypoints.md` is the canonical pipeline reference. Older script names exist for compatibility and reproducibility only.
   146|Netlify is canonical; Vercel is deprecated and must not be treated as production deployment evidence. Do not assume a push deploys production.
   147|Hermes worker jobs should be idempotent, claim-safe, heartbeat-aware, and recoverable through `pipeline_runs`, `pipeline_jobs`, and `pipeline_job_events`.
   148|---
   149|4. Hermes Worker and Queue Rules
   150|The Hermes worker is the always-on execution path for long-running pipeline jobs.
   151|Supported worker job types include:
   152|`ml_verifier_batch`
   153|`hermes_smoke_test`
   154|`candle_refresh`
   155|`match_prices_batch`
   156|`compute_scores`
   157|ML promotion job type from `src/lib/ml-promotion`
   158|Worker behavior expectations:
   159|Use `npm run pipeline:worker:once` for bounded local checks.
   160|Use `npm run pipeline:worker` only when an always-on worker process is intended.
   161|Use `--dry-run` and smoke jobs for worker wiring checks where possible.
   162|Never run an unbounded production worker loop locally without approval.
   163|Preserve stale-job reset, job claiming, heartbeat, retry/fail, and monitoring semantics.
   164|Do not swallow provider/database errors. They must be logged to job events and monitoring.
   165|Every new job type must have an idempotency strategy, bounded payload, retry policy, and verification story.
   166|---
   167|5. Data Pipeline Rules
   168|Canonical production/data-refresh path:
   169|```bash
   170|npm run discover:videos
   171|npm run scrape:v2
   172|npm run extract:llm
   173|npm run match
   174|npm run score
   175|npm run consensus
   176|```
   177|Rules:
   178|Do not replace the canonical path with legacy wrappers unless deliberately testing compatibility.
   179|Do not run expensive extraction or transcript backfills open-ended. Use bounded batches, dry runs, or staging/test databases first.
   180|Any pipeline script that writes to pgsql or Neon backup/legacy data must clearly state the target database, expected row count, write type, and rollback/repair plan before production execution.
   181|Prefer per-row or per-candidate error isolation over aborting whole batches when a single candidate is malformed.
   182|LLM JSON parsing must be defensive. Avoid batch-fatal parsing assumptions where one malformed model response kills the full job.
   183|For shadow extraction, review diffs before promotion and never promote `manual_review` rows.
   184|---
   185|6. Whop and Paid Access Rules
   186|This app integrates with Whop, but audited Whop/Netlify deployment automation and legacy Vercel compatibility surfaces live in `Claude_Code_Automations`.
   187|Inside this repo:
   188|App-side Whop SDK/API use is allowed for product functionality, access checks, webhooks, bootstrap scripts, and route handling.
   189|`npm run whop:bootstrap` is a provider-mutating script. Treat it as production-impacting unless explicitly pointed at a safe test company/product.
   190|Never commit Whop API keys, webhook secrets, product IDs that should remain private, checkout URLs that should not be public, or generated secrets.
   191|Do not create, publish, archive, or change Whop products/plans/checkouts from this repo when the companion automation repo has an audited workflow for the task.
   192|For production commerce objects, prefer hidden-first creation and explicit publish gates.
   193|---
   194|7. Frontend and Product Surface Rules
   195|Follow `docs/frontend-design-spec.md` as the design source of truth.
   196|Maintain dark-first Editorial Terminal styling: dense data, restrained ochre accent, semantic colors, hairlines, serif editorial headings, mono numerics.
   197|No generic neon crypto aesthetic, no bro-y copy, no hype language, no decorative imagery, and no emoji in the product UI.
   198|Every score, metric, and ranking should remain explainable and source-backed.
   199|For UI changes, run relevant page-shape and cross-cutting tests, then `npm run lint`, `npm run typecheck`, and `npm run build`.
   200|Do not silently change pricing, tier gates, paid/free feature boundaries, or Whop access behavior.
   201|---
   202|8. Engineering Discipline
   203|Simplicity first
   204|Implement the smallest correct change. Avoid speculative abstractions, generic frameworks, broad refactors, or configuration nobody asked for.
   205|Surgical changes
   206|Touch only the files required by the task. Do not clean up adjacent code unless the cleanup is necessary to complete and verify the requested change.
   207|Plan before changing code
   208|For multi-file tasks, state a short plan with verification gates before editing. Keep a visible task list where the agent platform supports it.
   209|Cascading tests
   210|When adding a new test, run it at the end of the relevant existing tests so the new check does not pass in isolation while breaking the chain. A passing targeted test is not enough if the surrounding suite fails.
   211|Honest reporting
   212|End every implementation report with:
   213|files changed
   214|commands run
   215|pass/fail result for each command
   216|unverified risks or skipped checks
   217|any follow-up required
   218|---
   219|9. Secrets and Environment
   220|Required or common environment variables include:
   221|`DATABASE_URL`
   222|`GEMINI_API_KEY`
   223|`OLLAMA_API_KEY` or `OLLAMA_TOKEN` where applicable
   224|`RESEND_API_KEY`
   225|Whop-related variables such as `WHOP_API_KEY`, `WHOP_COMPANY_ID`, product IDs, plan IDs, checkout URLs, and webhook secrets where applicable
   226|Sentry/monitoring variables where configured
   227|Rules:
   228|Do not commit `.env*` files.
   229|Do not print secrets into chat, logs, test snapshots, or generated docs.
   230|Redact secrets in error output.
   231|Before running any production-writing script, confirm which `.env`/database target is active.
   232|---
   233|10. Final Delivery Checklist
   234|Before handing work back:
   235|`git diff` reviewed.
   236|No secrets or generated local files included.
   237|Tests/typecheck/build run or explicitly marked unavailable.
   238|Database and production-impacting operations avoided unless approved.
   239|Companion repo impact considered.
   240|`AGENTS.md` updated if the repo operating model changed.
   241|---
   242|11. External Tool Connections — Composio First
   243|Composio is the source of truth for all third-party app connections. When any task requires an external service (GitHub, Gmail, Slack, Notion, Twitter/X, Linear, Google Sheets, Discord, Supabase, Stripe, YouTube, etc.), Composio is the first and primary integration path.
   244|Rules:
   245|Always search Composio tools first via `COMPOSIO_SEARCH_TOOLS` before writing custom API calls, raw HTTP requests, or ad-hoc scripts against an external service.
   246|Use the Composio MCP server (`connect.composio.dev/mcp`) for all tool execution. Do not bypass it with direct SDK usage or `curl` unless the tool is genuinely unavailable.
   247|When a needed app is not yet connected, initiate the OAuth flow via `COMPOSIO_MANAGE_CONNECTIONS` and wait for it via `COMPOSIO_WAIT_FOR_CONNECTIONS`. Do not ask the user for API keys or manual token setup.
   248|Prefer the 7 Composio meta-tools (`COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_WAIT_FOR_CONNECTIONS`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL`) as the standard execution surface. Do not reach for native composio CLI commands or direct API calls unless the MCP meta-tools are insufficient for the task.
   249|The Composio API key is in `COMPOSIO_API_KEY` or the project MCP config. Never print it, commit it, or echo it into logs.
   250|---
   251|12. Skills, Plugins, and Agents — Library as Source of Truth
   252|The canonical skills, plugins, and agent definitions live in the shared libraries under `~/cloned_libraries/`. These are the source of truth and must not be duplicated or forked into this repo.
   253|Rules:
   254|`~/cloned_libraries/hermes-library/skills/` is the primary skills library. All skill loading paths in `kilo.jsonc` already point here. Do not create ad-hoc skill files in the project `.kilo/skills/` directory; add or update skills in the library instead.
   255|`~/cloned_libraries/whop_pipeline_plugin/skills/` provides Whop pipeline automation skills (deploy, adopt, etc.). These are companion-repo tools; use them for reference but prefer the companion repo for live Whop/Netlify mutations and legacy Vercel compatibility investigations only when explicitly approved.
   256|When a skill is missing or needs updating, modify it in the source library, not in the project config. Project-local skill overrides are a last resort.
   257|Agent definitions (`.kilo/agent/*.md`) and commands (`.kilo/command/*.md`) follow the same pattern: library-owned by default, project-level only for repo-specific overrides.
   258|
   259|### Prerequisites / Setup
   260|- **Composio MCP**: Configure `COMPOSIO_API_KEY` and connect to `https://connect.composio.dev/mcp` via the MCP server entry in `.kilo/kilo.jsonc`. The server exposes 7 meta-tools: `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_WAIT_FOR_CONNECTIONS`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL`.
   261|- **Cloned libraries**: Ensure `~/cloned_libraries/hermes-library/skills/` and `~/cloned_libraries/whop_pipeline_plugin/skills/` exist. Alternative paths can be configured in `.kilo/kilo.jsonc` under `skills.paths`.
   262|- **Kilo config**: `.kilo/kilo.jsonc` must point to those skill directories and include the Composio MCP entry. See `.kilo/kilo.jsonc` for the current working example.
