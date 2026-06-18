# CallScore Skill Library Gap Analysis

Date: 2026-06-15
Mode: review followed by operator-approved skill installs; no provider mutations, deployment, public actions, or secrets exposure performed.

## Evidence used

- Local Hermes skill inventory: `hermes skills list` on HH profile.
- Installed skill tree spot-checks under `/srv/agents/hermes/skills` and `/home/omar/.hermes/skills`.
- Canonical GTM registry: `/opt/crypto-tuber-ranked/docs/ops/callscore-gtm-agent-registry.json`.
- Hermes docs / hub pages:
  - `https://hermes-agent.nousresearch.com/docs/reference/skills-catalog`
  - `https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog`
  - `https://hermes-agent.nousresearch.com/docs/user-guide/features/skills`
- Hub search commands, examples:
  - `hermes skills search stripe --source skills-sh --limit 6 --json`
  - `hermes skills search posthog --source skills-sh --limit 6 --json`
  - `hermes skills search sentry --source skills-sh --limit 6 --json`
  - `hermes skills search linear --source skills-sh --limit 6 --json`
  - `hermes skills search fastmcp --source official --limit 6 --json`
  - `hermes skills search shopify --source official --limit 6 --json`

## Current strength areas

Installed library already has strong CallScore coverage in these areas:

- Core CallScore / Art of War / Whop Auto operations:
  - `callscore-autopilot`
  - `callscore-sentinel`
  - `art-of-war-operations`
  - `art-of-war-system`
  - `callscore-dashboard`
  - `whop-automation`
  - `whop-implementation-guard`
  - `workplane-status`
  - `workplane-diagnostics`
- Hermes / MCP / agent control:
  - `hermes-agent`
  - `native-mcp`
  - `mcp-server-operations`
  - `mcporter`
  - `installing-mcp-servers-in-hermes`
  - `composio-apify-mcp`
  - `headroom`
  - `honcho`
  - `kanban-orchestrator`
  - `subagent-driven-development`
  - `parent-verification-of-agent-output`
- Web/UI/product verification:
  - `dogfood`
  - `webapp-testing`
  - `dogfood-uis-with-agent-browser`
  - `wsl-chrome-devtools-mcp`
  - `adversarial-ux-test`
  - `frontend-design`
  - `popular-web-designs`
- Data / creator pipeline / MLOps:
  - `creator-analytics-pipeline`
  - `crypto-tuber-ranked-creator-pipeline`
  - `youtube-content`
  - `llm-evaluation`
  - `rag-implementation`
  - `data-pipeline`
  - many MLOps/inference/training skills.
- Productivity/integrations already present:
  - `airtable`
  - `google-workspace`
  - `linear`
  - `notion`
  - `agentmail`
  - `himalaya`
  - `xurl`
  - `xitter`
  - `last30days`

## Priority holes for CallScore

### P0 — Install / create soon

1. Stripe / payment integration skill

Why: CallScore/Whop/commercial control has financial gates, pricing/payment mutation rules, and likely future direct Stripe or Stripe-adjacent reconciliation. Local library has no dedicated Stripe operational skill.

Hub candidates found:

- `skills-sh/stripe/ai/stripe-best-practices` — 45,001 installs
- `skills-sh/stripe/ai/upgrade-stripe` — 37,358 installs
- `skills-sh/stripe/ai/stripe-projects` — 33,896 installs
- `skills-sh/anthropics/claude-plugins-official/stripe-best-practices` — 1,419 installs

Recommendation: inspect before installing; likely install `skills-sh/stripe/ai/stripe-best-practices` if content is safe and useful. Still keep Whop as canonical commerce surface unless explicitly changed.

2. PostHog analytics skill

Why: GTM registry has PostHog analytics as `monitored`, but local skill library only mentions PostHog inside CallScore/Art-of-War docs. No dedicated instrumentation/debug/query workflow exists.

Hub candidates found:

- `skills-sh/posthog/posthog-for-claude/posthog-instrumentation` — 1,215 installs
- `skills-sh/posthog/posthog/implementing-agent-modes` — 1,333 installs
- `skills-sh/posthog/skills/posthog-debugger` — 149 installs
- `skills-sh/posthog/ai-plugin/instrument-product-analytics` — 194 installs

Recommendation: inspect `posthog-instrumentation`; if useful, install or convert into a local `posthog-callscore-analytics` skill that enforces read-only-by-default and PRODUCTION_GATE for write/instrumentation changes.

3. Sentry / error-monitoring skill

Why: CallScore needs production observability beyond status checks. Local library has no dedicated Sentry operational skill.

Hub candidates found:

- `skills-sh/getsentry/sentry-for-ai/sentry-workflow` — 2,389 installs
- `skills-sh/getsentry/sentry-for-ai/sentry-sdk-setup` — 2,026 installs
- `skills-sh/getsentry/sentry-for-ai/sentry-node-sdk` — 1,911 installs
- `skills-sh/getsentry/skills/security-review` — 7,901 installs

Recommendation: inspect `sentry-workflow` and `sentry-node-sdk`. Install only if it does not encourage unaudited provider writes. Otherwise create a local fail-closed Sentry skill.

4. FastMCP skill

Why: CallScore needs durable internal MCP wrappers for HH Read API, Workplane status, Whop dry-run/read-only checks, and registry resources. Local library has `native-mcp`/`mcporter`, but no skill for building MCP servers.

Official hub candidate:

- `official/mcp/fastmcp` — official optional; build/test/inspect/install/deploy MCP servers in Python.

Recommendation: install this. It directly fills the “wrap internal APIs cleanly” gap.

Install command if approved:

```bash
hermes skills install official/mcp/fastmcp
```

### P1 — Useful but not urgent

5. Watchers skill

Why: CallScore currently has sentinels and cron, but a generic watermark-based watcher skill would help monitor RSS/JSON/GitHub/blog/news signals cleanly.

Official optional candidate:

- `official/devops/watchers` — poll RSS, JSON APIs, GitHub with watermark-based deduplication.

Recommendation: install if we want a reusable monitoring framework beyond bespoke cron scripts.

6. Docker-management skill

Why: HH runs multiple services and future containers. Local skills include s6 and deployment skills, but generic Docker ops coverage is thinner.

Official optional candidate:

- `official/devops/docker-management` — Docker containers/images/volumes/networks/Compose/debugging/cleanup.

Recommendation: useful for operations hygiene; install if container work increases.

7. One-three-one-rule decision skill

Why: Omar often wants fast trade-off decisions. This would help make approval packets and architecture choices concise.

Official optional candidate:

- `official/communication/one-three-one-rule`.

Recommendation: optional; useful for operator-facing recommendations.

8. Concept-diagrams / hyperframes

Why: CallScore now produces operator diagrams and marketing artifacts. Installed creative skills are strong, but these optional skills could improve diagram/video output.

Official optional candidates:

- `official/creative/concept-diagrams`
- `official/creative/hyperframes`

Recommendation: optional. `concept-diagrams` is most relevant to architecture/control-plane artifacts.

9. Linear skill from skills.sh/openai

Why: Local `productivity/linear` exists. Skills hub also has `skills-sh/openai/skills/linear` with 2,836 installs and `linear-cli` with 5,275 installs.

Recommendation: do not install immediately. Existing local Linear skill is enough unless it proves inadequate.

### P2 — Do not prioritize now

10. Shopify skill

Official optional candidate:

- `official/productivity/shopify`.

Why not now: CallScore canonical commerce is Whop, not Shopify. Useful only if commerce surface expands.

11. SendGrid / Mailchimp / newsletter tools

Hub search did not return strong Hermes candidates in the quick pass. Existing Gmail/google-workspace/agentmail coverage plus registry SEND_GATE is enough for now.

12. Reddit/Discord/Telegram dedicated platform skills

Existing registry + `marketing-community-drops` + Composio/Telegram path covers the immediate need. Dedicated installs are less important than gate/receipt discipline.

## Capability matrix against current GTM lanes

| GTM lane | Current installed coverage | Gap |
|---|---|---|
| X / Twitter | `xurl`, `xitter`, `marketing-channel-growth`, Composio docs | Provider-credit/auth runtime issues, not skill gap |
| LinkedIn | `marketing-channel-growth`, registry, content skills | No dedicated Composio LinkedIn runbook skill; can be local patch later |
| Gmail/email/newsletters | `google-workspace`, `agentmail`, `himalaya` | No SendGrid/Mailchimp; not urgent |
| Discord/Telegram/Reddit | `marketing-community-drops`, gateway/Composio coverage | Reddit/community rule checker could be improved locally |
| YouTube/SEO | `youtube-content`, `crypto-tuber-ranked-creator-pipeline`, Netlify | Good |
| Whop marketplace/provider | `whop-automation`, `whop-implementation-guard`, `marketing-whop-marketplace` | Good; keep fail-closed |
| Attio CRM | registry lane only + Composio generic | Dedicated Attio skill could be useful later |
| PostHog analytics | registry lane only + generic Composio | P0 gap |
| Hugging Face | many HF/MLOps skills | Auth blocked, not skill gap |
| Art of War engine | strong local skills | Good |
| Workplane/Hermes governance | strong local skills | Good |
| Automation health checks | sentinels/cron/workplane | Watchers optional would improve reuse |

## Inspect pass notes

I inspected the top candidates with `hermes skills inspect` without installing them. Results:

- `official/mcp/fastmcp`: clean official preview; directly relevant for wrapping HH Read API / Workplane / registry resources as MCP.
- `official/devops/watchers`: clean official preview; useful for watermark-based RSS/JSON/GitHub monitoring.
- `official/devops/docker-management`: clean official preview; useful for container ops but less urgent than FastMCP/watchers.
- `official/communication/one-three-one-rule`: clean official preview; useful for operator decisions and approval packets.
- `official/creative/concept-diagrams`: clean official preview; useful for future diagrams, but existing architecture/frontend skills already cover current need.
- `skills-sh/posthog/posthog-for-claude/posthog-instrumentation`: preview works; useful but would need CallScore gate patch before production instrumentation.
- `skills-sh/getsentry/sentry-for-ai/sentry-workflow`: preview works; useful as a router for production issue triage.
- `skills-sh/stripe/ai/stripe-best-practices`: metadata is highly relevant, but `hermes skills inspect` hit a Rich markup rendering bug caused by unescaped `[/mcp]` text in the preview. Treat as inspectable-with-caution; do not install until the raw skill content is reviewed or the preview bug is worked around.

## Recommended next safe actions

1. Inspect but do not install these first:

```bash
hermes skills inspect official/mcp/fastmcp
hermes skills inspect skills-sh/stripe/ai/stripe-best-practices
hermes skills inspect skills-sh/posthog/posthog-for-claude/posthog-instrumentation
hermes skills inspect skills-sh/getsentry/sentry-for-ai/sentry-workflow
hermes skills inspect official/devops/watchers
```

2. If inspection passes, install in this order:

```bash
hermes skills install official/mcp/fastmcp
hermes skills install skills-sh/posthog/posthog-for-claude/posthog-instrumentation
hermes skills install skills-sh/getsentry/sentry-for-ai/sentry-workflow
hermes skills install skills-sh/stripe/ai/stripe-best-practices
hermes skills install official/devops/watchers
```

3. After install, run:

```bash
hermes skills list --source hub
hermes skills audit
```

4. Patch any newly installed skill before use if it violates CallScore rules:

- Composio-first for third-party app access when available.
- No public send/post/spend/provider write without gate + receipt + rollback.
- Whop/payment/customer/provider mutations remain FINANCIAL_GATE + PRODUCTION_GATE + SECRET_GATE.
- No secrets/tokens/cookies/env values in outputs.

## No-action guardrail

Initial analysis did not install anything. After Omar explicitly requested installation, the immediately useful identified skills were installed with `hermes skills install --yes` and recorded in `docs/ops/callscore-canonical-skill-register.md`. Installing hub/community skills changes the active skill surface; newly installed third-party skills must still obey CallScore registry gates before any public/provider/financial/data/deploy action.
