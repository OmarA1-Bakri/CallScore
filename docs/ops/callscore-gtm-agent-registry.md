# CallScore GTM Agent Registry
Canonical owner map for CallScore GTM, marketing, commercial, connected-app, and governance agents. This is documentation/control-plane only; it grants no live public/provider/spend authority.
## Current stance
- Readiness: `CONTROLLED_FULL`.
- Netlify is canonical. Stale Vercel references are not a CallScore deployment target.
- Local HH PostgreSQL plus HH Read API are canonical. Stale Neon references are not a CallScore data source.
- Public sends/posts, paid actions, provider writes, Whop/customer/payment mutations, destructive DB/infra actions, and secret exposure remain fail-closed.
## Gate rules
- `PUBLISH_GATE` — Required before public posts/pages/listings/methodology/ranking/correction publication.
- `SEND_GATE` — Required before email, DM, newsletter, community send, or outreach.
- `SPEND_GATE` — Required before paid ads, boosts, enrichment, APIs, LLMs, or paid SaaS activation.
- `FINANCIAL_GATE` — Required before Whop pricing/product/payment/customer changes, payouts, revenue share, or money movement.
- `PRODUCTION_GATE` — Required before DB writes, deployments, provider mutations, infra changes, or webhook changes.
- `SECRET_GATE` — Always applies: never expose secrets, env values, tokens, cookies, auth headers, DB URLs, or private keys.

## Registry

| Channel | Owner | Provider | Jobs | Gate | Status | Next safe action |
| --- | --- | --- | --- | --- | --- | --- |
| X / Twitter | `marketing-channel-growth` | Composio Twitter/X | artofwar_strategy_brief, artofwar_content_queue_dry_run, artofwar_campaign_plan_generate… | `PUBLISH_GATE + TRUST_GATE + DATA_POLICY_GATE + SECRET_GATE` / `fail_closed` | `gated` | Generate draft and compliance lint only. |
| LinkedIn | `marketing-channel-growth` | Composio LinkedIn | artofwar_content_queue_dry_run, artofwar_campaign_dossier, artofwar_campaign_approval_review | `PUBLISH_GATE or SEND_GATE + TRUST_GATE + SECRET_GATE` / `fail_closed` | `gated` | Use draft-only CallScore channel asset flow. |
| Gmail / email | `marketing-channel-growth` | Composio Gmail/email | artofwar_outreach_queue_prepare, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + SECRET_GATE` / `fail_closed` | `gated` | Prepare drafts and recipient assumptions only. |
| Discord | `marketing-community-drops` | Composio Discord | artofwar_audience_research_dry_run, artofwar_content_queue_dry_run, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + SECRET_GATE` / `fail_closed` | `gated` | Draft community-safe copy only. |
| Telegram | `marketing-community-drops` | Telegram/community surface | artofwar_audience_research_dry_run, artofwar_content_queue_dry_run, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + SECRET_GATE` / `fail_closed` | `gated` | Draft only. |
| Reddit | `marketing-community-drops` | Reddit/community surface | artofwar_audience_research_dry_run, artofwar_campaign_dossier, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + DATA_POLICY_GATE + SECRET_GATE` / `fail_closed` | `gated` | Research rules and draft only. |
| YouTube / SEO | `marketing-channel-growth` | Netlify public app / SEO pages | artofwar_strategy_brief, artofwar_campaign_plan_generate, artofwar_campaign_verify | `PUBLISH_GATE + TRUST_GATE + DATA_POLICY_GATE + PRODUCTION_GATE + SECRET_GATE` / `fail_closed` | `gated` | Create draft briefs only. |
| Crypto newsletters | `marketing-channel-growth` | Gmail/email or partner newsletter surface | artofwar_outreach_queue_prepare, artofwar_campaign_dossier, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + DATA_POLICY_GATE + SPEND_GATE + SECRET_GATE` / `fail_closed` | `gated` | Draft pitch packet only. |
| Creator partnerships | `marketing-channel-growth` | Gmail/email or LinkedIn | artofwar_outreach_queue_prepare, artofwar_campaign_dossier, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + RIGHT_OF_REPLY_GATE + DATA_POLICY_GATE + SECRET_GATE` / `fail_closed` | `gated` | Prepare evidence packet and draft only. |
| Whop marketplace | `marketing-whop-marketplace` | Whop marketplace | whop_activation_review, artofwar_campaign_dossier, artofwar_campaign_approval_review | `PUBLISH_GATE + FINANCIAL_GATE + PRODUCTION_GATE + SECRET_GATE` / `fail_closed` | `gated` | Generate listing assets only. |
| Whop provider / entitlement | `whop_auto` | Whop provider | whop_provider_health, whop_plan_inventory_check, whop_entitlement_sync_dry_run… | `FINANCIAL_GATE + PRODUCTION_GATE + SECRET_GATE` / `fail_closed` | `monitored` | Run read-only provider health/inventory if needed. |
| Attio CRM | `Composio Attio lane` | Composio Attio | automation_health_check, automation_activation_review | `PRODUCTION_GATE + SEND_GATE where outreach-linked + SECRET_GATE` / `fail_closed` | `monitored` | Inventory only before any CRM action. |
| PostHog analytics | `Composio PostHog lane` | Composio PostHog | automation_health_check | `PRODUCTION_GATE + SECRET_GATE` / `fail_closed` | `monitored` | Read-only analytics feedback only. |
| Hugging Face | `Composio Hugging Face lane` | Composio Hugging Face / Hugging Face plugin | automation_health_check | `SPEND_GATE + PRODUCTION_GATE + SECRET_GATE` / `monitored` | `auth_blocked` | Treat Composio Hugging Face as non-core unless lane specifically needs it. |
| Composio hub | `Composio MCP lane` | Composio MCP | automation_health_check, automation_activation_review | `SECRET_GATE + action-specific PUBLISH_GATE/SEND_GATE/SPEND_GATE/PRODUCTION_GATE` / `monitored` | `monitored` | Use read-only inventory before app-specific action. |
| Art of War campaign engine | `Art of War` | local dry-run CLI | artofwar_strategy_brief, artofwar_content_queue_dry_run, artofwar_campaign_plan_generate… | `PUBLISH_GATE/SEND_GATE/SPEND_GATE/PRODUCTION_GATE as action-specific + SECRET_GATE` / `monitored` | `monitored` | Run governed preflight/persona/dry-run/Gemma/receipt before any approval packet. |
| Workplane / Hermes governance | `Hermes / Workplane` | Hermes / HH control bridge | automation_registry_refresh, automation_dry_run, automation_health_check… | `SECRET_GATE + PRODUCTION_GATE for mutations` / `released` | `ready` | Read registry before GTM action and keep gates fail-closed. |
| Automation registry / health checks | `automation_registry_refresh` | local automation registry | automation_registry_refresh, automation_dry_run, automation_health_check… | `SECRET_GATE + action-specific approval gate` / `monitored` | `monitored` | Run report-only health/registry refresh. |

## Machine-readable source

`docs/ops/callscore-gtm-agent-registry.json` is canonical. Update JSON first, then this Markdown summary, before changing channel ownership, gates, connected apps, or live-action permissions.

## Hermes skill enforcement

The following Hermes skills have been canonicalized against this registry and Workplane gate process: `art-of-war-operations`, `callscore-autopilot`, `workplane-status`, `whop-automation`, `humanizer`, and `xurl`. Audit details: [`docs/ops/hermes-skill-canonicalization-audit.md`](./hermes-skill-canonicalization-audit.md).
