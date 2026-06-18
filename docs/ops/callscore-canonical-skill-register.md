# CallScore Canonical Skill Register

Date: 2026-06-15
Status: canonical ops documentation
Scope: Hermes `default` profile on HH for CallScore / Hermes / Art of War / Whop Auto.

This register records the skills available for the CallScore platform and the install decisions from the 2026-06-15 skill-library review. It is documentation only; gates in the GTM registry and Workplane still decide live action authority.

## Standard future-session load

Use `/callscore-standard` at the start of interactive CallScore sessions. Bundle path: `/srv/agents/hermes/skill-bundles/callscore-standard.yaml`.

The bundle loads: `callscore-autopilot`, `workplane-status`, `task-router`, `headroom`, `agent-memory-vault`, `github-operations`, and `committing-user-work-safely`.

Use `/agentmemory` when the operator asks for `/agentmemory`; this alias bundle loads `agent-memory-vault`.

Canonical startup protocol: [`docs/ops/callscore-canonical-session-startup.md`](./callscore-canonical-session-startup.md).

## Hard operating rules

- Composio remains the canonical third-party app access layer when a connector exists.
- Netlify remains canonical hosting; Vercel is stale/non-production.
- Local HH PostgreSQL + HH Read API remain canonical data source.
- Whop/payment/customer/provider/DB/deploy/infra writes remain fail-closed unless gate + receipt + rollback exist.
- Newly installed hub/community skills are procedural helpers, not permission grants.
- `headroom` is standard for large output/context pressure, but never compress secrets or rely on compressed summaries for exact claims.
- `agent-memory-vault` is standard for durable memory/handover/convention capture, but never stores secrets, raw credentials, DB URLs, private keys, cookies, or customer/payment data.
- Never print secrets, tokens, cookies, env values, auth headers, DB URLs, private keys, or credential-bearing remotes.

## Skills installed from hub for immediate CallScore use

| Skill | Source ID | Trust/source | Priority | Installed path | Immediate CallScore use | Description |
|---|---|---|---|---|---|---|
| `fastmcp` | `official/mcp/fastmcp` | official | P0 | `/srv/agents/hermes/skills/mcp/fastmcp/SKILL.md` | Build internal MCP wrappers for HH Read API, Workplane status, registry resources, Whop read-only/dry-run surfaces. | Build, test, inspect, install, and deploy MCP servers with FastMCP in Python. Use when creating a new MCP server, wrapping an API or database as MCP tools, exposing resources or prompts, or preparing a FastMCP server for Claude Code, Cursor, or HTTP deployment |
| `watchers` | `official/devops/watchers` | official | P1 | `/srv/agents/hermes/skills/devops/watchers/SKILL.md` | Watermark-based RSS/JSON/GitHub monitoring for CallScore/Art-of-War signals. | Poll RSS, JSON APIs, and GitHub with watermark dedup. |
| `docker-management` | `official/devops/docker-management` | official | P1 | `/srv/agents/hermes/skills/devops/docker-management/SKILL.md` | Docker/Compose container lifecycle and debugging for HH services when container ops are in scope. | Manage Docker containers, images, volumes, networks, and Compose stacks — lifecycle ops, debugging, cleanup, and Dockerfile optimization. |
| `one-three-one-rule` | `official/communication/one-three-one-rule` | official | P1 | `/srv/agents/hermes/skills/communication/one-three-one-rule/SKILL.md` | Operator-facing tradeoff decisions and approval packets. | Structured decision-making framework for technical proposals and trade-off analysis. When the user faces a choice between multiple approaches (architecture decisions, tool selection, refactoring strategies, migration paths), this skill produces a 1-3-1 format: |
| `concept-diagrams` | `official/creative/concept-diagrams` | official | P1 | `/srv/agents/hermes/skills/creative/concept-diagrams/SKILL.md` | Clean standalone SVG/HTML concept diagrams for future canonical architecture docs. | Generate flat, minimal light/dark-aware SVG diagrams as standalone HTML files, using a unified educational visual language with 9 semantic color ramps, sentence-case typography, and automatic dark mode. Best suited for educational and non-software visuals — ph |
| `posthog-instrumentation` | `skills-sh/posthog/posthog-for-claude/posthog-instrumentation` | skills.sh community | P0 | `/srv/agents/hermes/skills/posthog-instrumentation/SKILL.md` | PostHog analytics instrumentation/feature-flag workflow; CallScore writes remain PRODUCTION_GATE. | Automatically add PostHog analytics instrumentation to code. Triggers when user asks to add tracking, instrument events, add analytics, or implement feature flags in their codebase. |
| `sentry-workflow` | `skills-sh/getsentry/sentry-for-ai/sentry-workflow` | skills.sh community | P0 | `/srv/agents/hermes/skills/sentry-workflow/SKILL.md` | Sentry production issue triage and code-review routing; live provider actions remain gated. | Fix production issues and review code with Sentry context. Use when asked to fix Sentry errors, debug issues, triage exceptions, review PR comments from Sentry, or resolve bugs. |
| `stripe-best-practices` | `skills-sh/stripe/ai/stripe-best-practices` | skills.sh community | P0 | `/srv/agents/hermes/skills/stripe-best-practices/SKILL.md` | Stripe/payment best-practice reference for financial-adjacent decisions; Whop remains canonical commerce unless changed. | Guides Stripe integration decisions — API selection (Checkout Sessions vs PaymentIntents), Connect platform setup (Accounts v2, controller properties), billing/subscriptions, Treasury financial accounts, integration surfaces (Checkout, Payment Element), migrat |

## Existing high-signal CallScore skill surface

| Skill | CallScore use |
|---|---|
| `callscore-autopilot` | CallScore CONTROLLED_FULL resume, GTM registry, safe owned GTM, gates, receipts. |
| `callscore-sentinel` | Leaderboard sentinel and production monitoring. |
| `art-of-war-operations` | Art of War live marketing automation operations. |
| `art-of-war-system` | Art of War autonomous marketing system devops/control-plane. |
| `whop-automation` | Whop commercial infrastructure API/workflows. |
| `whop-implementation-guard` | Whop mutation guard and implementation safety gates. |
| `workplane-status` | Workplane runtime/readiness status. |
| `workplane-diagnostics` | Interpret Workplane/runtime/wrapper/log diagnostics. |
| `callscore-dashboard` | CallScore Art of War dashboard. |
| `netlify-operations` | Canonical Netlify operations for CallScore hosting. |
| `native-mcp` | Hermes MCP client setup and server wiring. |
| `mcp-server-operations` | MCP discovery/install/config/auth operations. |
| `mcporter` | Ad-hoc MCP server inspection/calls. |
| `composio-apify-mcp` | Composio Apify MCP safety patterns. |
| `headroom` | Context compression / retrieval / proxy operations. |
| `hermes-agent` | Hermes Agent setup/config/extensions/troubleshooting. |
| `honcho` | Honcho memory setup and use. |
| `kanban-orchestrator` | Multi-agent decomposition/orchestration. |
| `subagent-driven-development` | Independent implementation workstreams. |
| `parent-verification-of-agent-output` | Verify worker output in parent session. |
| `dogfood` | Systematic exploratory QA for web apps. |
| `webapp-testing` | Local web app testing toolkit. |
| `dogfood-uis-with-agent-browser` | Browser-proof UI dogfood testing. |
| `wsl-chrome-devtools-mcp` | Chrome DevTools MCP/Lighthouse from WSL. |
| `frontend-design` | Distinctive production-grade frontend interfaces. |
| `popular-web-designs` | Real design-system references for UI artifacts. |
| `creator-analytics-pipeline` | Crypto-tuber-ranked data pipeline ops. |
| `crypto-tuber-ranked-creator-pipeline` | Discovery/transcript/scoring pipeline workflow. |
| `youtube-content` | YouTube transcript/content processing. |
| `google-workspace` | Gmail/Calendar/Drive/Docs/Sheets. |
| `airtable` | Airtable REST API operations. |
| `notion` | Notion API/ntn CLI. |
| `linear` | Linear issue/project operations. |
| `xurl` | X/Twitter via xurl CLI. |
| `xitter` | X/Twitter via x-cli. |
| `last30days` | Recent social/web discourse research. |
| `agentmail` | Agent-owned email inbox. |

## Recommended routing by task class

| Task class | Primary skills | Supporting skills | Gate posture |
|---|---|---|---|
| Internal MCP/API wrappers | `fastmcp`, `native-mcp`, `mcporter` | `mcp-server-operations`, `hermes-agent` | Config/server mutations require PRODUCTION_GATE/SECRET_GATE; read-only design is safe. |
| Monitoring/watchers | `watchers`, `callscore-sentinel`, `workplane-status` | `headroom`, `webhook-subscriptions` | Read-only polling safe; notification sends follow delivery/channel gate. |
| Production error triage | `sentry-workflow`, `systematic-debugging`, `requesting-code-review` | `github-operations`, `dogfood` | Provider writes or issue mutations gated; read-only triage safe. |
| Product analytics | `posthog-instrumentation`, `callscore-autopilot` | `webapp-testing`, `dogfood` | Instrumentation/provider writes require PRODUCTION_GATE + SECRET_GATE. |
| Financial/payment design | `stripe-best-practices`, `whop-automation`, `whop-implementation-guard` | `marketing-whop-marketplace` | FINANCIAL_GATE + PRODUCTION_GATE + SECRET_GATE for any mutation. |
| Container/HH ops | `docker-management`, `hermes-s6-container-supervision`, `workplane-diagnostics` | `durable-agent-state` | Service/container mutations require operator approval unless explicitly safe/read-only. |
| Operator decisions | `one-three-one-rule`, `strategic-collaboration`, `task-router` | `writing-plans` | Documentation safe; final execution follows lane gate. |
| Visual canonical docs | `concept-diagrams`, `frontend-design`, `architecture-diagram` | `popular-web-designs`, `excalidraw` | Docs/artifacts safe; deploy/public publish gated. |

## Installation verification

The following were verified present as local skill directories after `hermes skills install --yes`:

- `fastmcp` — `/srv/agents/hermes/skills/mcp/fastmcp/SKILL.md`
- `watchers` — `/srv/agents/hermes/skills/devops/watchers/SKILL.md`
- `docker-management` — `/srv/agents/hermes/skills/devops/docker-management/SKILL.md`
- `one-three-one-rule` — `/srv/agents/hermes/skills/communication/one-three-one-rule/SKILL.md`
- `concept-diagrams` — `/srv/agents/hermes/skills/creative/concept-diagrams/SKILL.md`
- `posthog-instrumentation` — `/srv/agents/hermes/skills/posthog-instrumentation/SKILL.md`
- `sentry-workflow` — `/srv/agents/hermes/skills/sentry-workflow/SKILL.md`
- `stripe-best-practices` — `/srv/agents/hermes/skills/stripe-best-practices/SKILL.md`

Smoke note: `hermes chat --toolsets skills` returned `OK:<skill>` for each newly installed skill. Several one-shot Hermes CLI invocations exited with an abort/core-dump after emitting OK; the skills themselves are installed and loadable, but the CLI abort should be treated as a Hermes runtime bug if it repeats outside smoke tests.

## Follow-up maintenance

1. On the next fresh Hermes session, confirm the system prompt available-skills list includes the newly installed skills.
2. Before first production use of any hub/community skill, patch or wrap it with CallScore gate language if it suggests provider writes, public sends, paid operations, or credential handling.
3. Keep `/opt/crypto-tuber-ranked/docs/ops/2026-06-15-callscore-skill-gap-analysis.md` as the evidence trail for why these skills were selected.
4. If a new skill changes provider access assumptions, update `docs/ops/callscore-gtm-agent-registry.json` only with evidence and re-run registry tests.
