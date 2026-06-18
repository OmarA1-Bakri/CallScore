# CallScore GTM Agent Registry
Canonical owner map for CallScore GTM, marketing, commercial, connected-app, and governance agents. Machine source: `docs/ops/callscore-gtm-agent-registry.json`.

## Current stance
- Readiness: `CONTROLLED_FULL`.
- Netlify is canonical. Stale Vercel references are not a CallScore deployment target.
- Local HH PostgreSQL plus HH Read API are canonical. Stale Neon references are not a CallScore data source.
- Owned CallScore public organic GTM is `READY_PUBLIC_OWNED` by default when safe, zero-cost, non-financial, non-secret, non-destructive, owned/managed, and inside canonical messaging policy.
- Restricted actions remain fail-closed: email/DM/outreach, newsletters, non-owned public posting, paid spend, Whop/customer/payment/provider mutation, CRM/analytics writes, DB/deploy/infra/webhook mutation, credential rotation, destructive action, secret exposure, named accusations, legal claims, investment advice, guarantees, and private-data claims.
- Canonical local env for all Hermes/GTM/Composio/Whop tooling is `/opt/crypto-tuber-ranked/.env.hermes`; see `docs/ops/callscore-canonical-env-manifest.md`.

## Gate rules
- `PUBLISH_GATE` — Required before public posts/pages/listings/methodology/ranking/correction publication.
- `SEND_GATE` — Required before email, DM, newsletter, community send, or outreach.
- `SPEND_GATE` — Required before paid ads, boosts, enrichment, APIs, LLMs, or paid SaaS activation.
- `FINANCIAL_GATE` — Required before Whop pricing/product/payment/customer changes, payouts, revenue share, or money movement.
- `PRODUCTION_GATE` — Required before DB writes, deployments, provider mutations, infra changes, or webhook changes.
- `SECRET_GATE` — Always applies: never expose secrets, env values, tokens, cookies, auth headers, DB URLs, or private keys.
- `READY_PUBLIC_OWNED` — Owned CallScore public organic posts/listing-copy/page content may execute by default after canonical messaging policy pass, owned/managed-channel confirmation, zero-cost check, destination/hash capture, and post-execution receipt.
- `PUBLIC_MESSAGING_POLICY` — Content must avoid investment advice, guarantees, named-creator accusations, defamation, harassment, doxxing, legal/compliance claims, private data, and unsupported accuracy claims.
- `POST_EXECUTION_RECEIPT` — Required after owned public execution; records channel, account/destination, payload hash, URL/UTM, provider response/post URL when available, rollback path, and monitoring plan.

## Canonical public messaging policy
- Allowed: explain/promote CallScore, link to `https://call-score.com`, describe evidence/ranking methodology at high level, invite users to try/follow/check creators, discuss transparency/accountability/credibility.
- Not allowed without explicit approval: investment recommendations, performance guarantees, named creator accusations, personal attacks, doxxing, harassment, defamatory wording, legal/compliance claims, private/non-public data, or unsupported accuracy/future-prediction claims.

## Registry

| Channel | Owner | Provider | Jobs | Gate | Status | Next safe action |
| --- | --- | --- | --- | --- | --- | --- |
| X / Twitter | `marketing-channel-growth` | Composio Twitter/X | artofwar_strategy_brief, artofwar_content_queue_dry_run, artofwar_campaign_plan_generate… | `READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE; SEND_GATE for DMs/outreach; SPEND_GATE for paid actions` / `ready_public_owned` | `ready_public_owned` | Publish the safe owned X canary under default-public policy, then record execution receipt and monitor read-only metrics. |
| LinkedIn | `marketing-channel-growth` | Composio LinkedIn | artofwar_content_queue_dry_run, artofwar_campaign_dossier, artofwar_campaign_approval_review… | `READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE; SEND_GATE for DMs/outreach; SPEND_GATE for paid promotion` / `ready_public_owned` | `ready_public_owned` | Publish safe owned organic LinkedIn product/methodology post after messaging policy pass and log receipt. |
| Gmail / email | `marketing-channel-growth` | Composio Gmail/email | artofwar_outreach_queue_prepare, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + SECRET_GATE` / `fail_closed` | `gated` | Prepare drafts and recipient assumptions only. |
| Discord | `marketing-community-drops` | Composio Discord | artofwar_audience_research_dry_run, artofwar_content_queue_dry_run, artofwar_campaign_approval_review… | `READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + community rules check + POST_EXECUTION_RECEIPT + SECRET_GATE; SEND_GATE for DMs/outreach or non-owned community posting` / `ready_public_owned` | `ready_public_owned` | Publish safe owned/managed community update only in owned channel, then record receipt. |
| Telegram | `marketing-community-drops` | Telegram/community surface | artofwar_audience_research_dry_run, artofwar_content_queue_dry_run, artofwar_campaign_approval_review… | `READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + community rules check + POST_EXECUTION_RECEIPT + SECRET_GATE; SEND_GATE for DMs/outreach or non-owned community posting` / `ready_public_owned` | `ready_public_owned` | Publish safe owned/managed community update only in owned channel, then record receipt. |
| Reddit | `marketing-community-drops` | Reddit/community surface | artofwar_audience_research_dry_run, artofwar_campaign_dossier, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + DATA_POLICY_GATE + SECRET_GATE` / `fail_closed` | `gated` | Research rules and draft only. |
| YouTube / SEO | `marketing-channel-growth` | Netlify public app / SEO pages | artofwar_strategy_brief, artofwar_campaign_plan_generate, artofwar_campaign_verify… | `READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE; PRODUCTION_GATE when runtime/app deploy or provider mutation is required` / `ready_public_owned` | `ready_public_owned` | Publish safe repo-controlled owned content only after validation; no Netlify deploy for docs-only changes. |
| Crypto newsletters | `marketing-channel-growth` | Gmail/email or partner newsletter surface | artofwar_outreach_queue_prepare, artofwar_campaign_dossier, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + DATA_POLICY_GATE + SPEND_GATE + SECRET_GATE` / `fail_closed` | `gated` | Draft pitch packet only. |
| Creator partnerships | `marketing-channel-growth` | Gmail/email or LinkedIn | artofwar_outreach_queue_prepare, artofwar_campaign_dossier, artofwar_campaign_approval_review | `SEND_GATE + TRUST_GATE + RIGHT_OF_REPLY_GATE + DATA_POLICY_GATE + SECRET_GATE` / `fail_closed` | `gated` | Prepare evidence packet and draft only. |
| Whop marketplace | `marketing-whop-marketplace` | Whop marketplace | whop_activation_review, artofwar_campaign_dossier, artofwar_campaign_approval_review… | `READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE for copy/assets; FINANCIAL_GATE + PRODUCTION_GATE for pricing/product/customer/payment/entitlement/payout/provider mutation` / `ready_public_owned` | `ready_public_owned` | Publish safe marketplace copy/assets only if no financial/customer/payment/provider mutation is included. |
| Whop provider / entitlement | `whop_auto` | Whop provider | whop_provider_health, whop_plan_inventory_check, whop_entitlement_sync_dry_run… | `FINANCIAL_GATE + PRODUCTION_GATE + SECRET_GATE` / `fail_closed` | `monitored` | Run read-only provider health/inventory if needed. |
| Attio CRM | `Composio Attio lane` | Composio Attio | automation_health_check, automation_activation_review | `PRODUCTION_GATE + SEND_GATE where outreach-linked + SECRET_GATE` / `fail_closed` | `monitored` | Inventory only before any CRM action. |
| PostHog analytics | `Composio PostHog lane` | Composio PostHog | automation_health_check | `PRODUCTION_GATE + SECRET_GATE` / `fail_closed` | `monitored` | Read-only analytics feedback only. |
| Hugging Face | `Composio Hugging Face lane` | Composio Hugging Face / Hugging Face plugin | automation_health_check | `SPEND_GATE + PRODUCTION_GATE + SECRET_GATE` / `monitored` | `auth_blocked` | Treat Composio Hugging Face as non-core unless lane specifically needs it. |
| Composio hub | `Composio MCP lane` | Composio MCP | automation_health_check, automation_activation_review | `SECRET_GATE + READY_PUBLIC_OWNED for owned public organic posts; action-specific SEND_GATE/SPEND_GATE/PRODUCTION_GATE for restricted actions` / `monitored` | `monitored` | Use app-specific registry row before any Composio action; owned public organic posts may execute when READY_PUBLIC_OWNED criteria pass. |
| Art of War campaign engine | `Art of War` | local dry-run CLI | artofwar_strategy_brief, artofwar_content_queue_dry_run, artofwar_campaign_plan_generate… | `READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE for owned organic public posts; SEND_GATE/SPEND_GATE/FINANCIAL_GATE/PRODUCTION_GATE as action-specific for restricted lanes` / `monitored` | `ready_public_owned` | Run Art of War selection/persona quality pass, publish safe owned public canary if selected, then receipt and monitor. |
| Workplane / Hermes governance | `Hermes / Workplane` | Hermes / HH control bridge | automation_registry_refresh, automation_dry_run, automation_health_check… | `SECRET_GATE + PRODUCTION_GATE for mutations` / `released` | `ready` | Read registry before GTM action and keep gates fail-closed. |
| Automation registry / health checks | `automation_registry_refresh` | local automation registry | automation_registry_refresh, automation_dry_run, automation_health_check… | `SECRET_GATE + action-specific approval gate` / `monitored` | `monitored` | Run report-only health/registry refresh. |

## Machine-readable source

`docs/ops/callscore-gtm-agent-registry.json` is canonical. Update JSON first, then this Markdown summary, before changing channel ownership, gates, connected apps, or live-action permissions.

## Hermes skill enforcement

The following Hermes skills enforce default-public owned GTM plus restricted-lane gates: `art-of-war-operations`, `callscore-autopilot`, `workplane-status`, `whop-automation`, `humanizer`, and `xurl`. Audit details: [`docs/ops/hermes-skill-canonicalization-audit.md`](./hermes-skill-canonicalization-audit.md).

The canonical skill register for the HH Hermes CallScore operating profile is [`docs/ops/callscore-canonical-skill-register.md`](./callscore-canonical-skill-register.md). It records the installed CallScore skill surface, including 2026-06-15 hub additions for FastMCP, watchers, Docker ops, PostHog, Sentry, Stripe best-practices, decision packets, and concept diagrams.

The canonical future-session startup protocol is [`docs/ops/callscore-canonical-session-startup.md`](./callscore-canonical-session-startup.md). Start interactive CallScore sessions with `/callscore-standard`; load `headroom` and `/agentmemory` (`agent-memory-vault`) as standard support skills before large-output, context-compression, memory, handover, or durable-convention work.
