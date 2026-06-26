# CallScore Canonical Subagent Roster

## Canonical specialist subagent layer

This file fixes the operator-facing gap: the agentic system is not only Workplane jobs and cron/status checks. The canonical automation model includes specialist subagents / workflow agents with identity, bounded authority, governance, memory/cadence expectations, and taste/quality standards.

Canonical source roots:
- `/srv/agents/repos/Claude_Code_Automations/agent_workflows/`
- `/srv/whop-auto/plugin/agent_workflows/whop_auto/agents/`
- `/opt/crypto-tuber-ranked/docs/ops/callscore-gtm-agent-registry.json` maps these subagents to channels, providers, gates, receipts, and rollback paths.
- `/opt/crypto-tuber-ranked/docs/ops/callscore-channel-head-souls.yaml` defines the bounded full-autonomy channel-head souls, authority, cadence, memory, and stop conditions.
- `/opt/crypto-tuber-ranked/docs/ops/callscore-full-autonomy-heartbeat-contract.md` defines the runtime heartbeat, watchdog, receipt, kill-switch, and promotion contract for independent channel-head operation.

## Non-negotiable agent model

Every proper autonomous subagent must define six dimensions before live operation:

1. Identity — named specialist, not a generic script.
2. Bounded authority — what it can and cannot do.
3. Governance — Workplane/GTM/Whop/Composio gates for mutations.
4. Memory — what it may persist and what it must forget.
5. Cadence + constraint — when it acts, when it stops/reports.
6. Taste — what good output looks like and what it refuses.

Cron jobs and one-shot status checks are not canonical autonomous agents. They can support agents, but they are not the agent roster.

## Bounded full-autonomy channel heads

The next autonomy target is `FULL_AUTONOMOUS_BOUNDED_OWNED_GTM`, not unrestricted autonomy. In that mode, independent channel-head agents may act without Hermes prompting only inside their soul/heartbeat contracts and the GTM registry envelope.

| Channel head | Maps to existing specialists | Live autonomy posture |
|---|---|---|
| `callscore-artofwar-strategist` | Art of War jobs, `marketing-compliance-linter` | Strategy/dossier/dry-run now; owned-public execution only after full receipt chain + policy pass. |
| `callscore-x-head` / `callscore-linkedin-head` / `callscore-reddit-head` + social specialists | `marketing-channel-growth`, `content_creator`, `marketing-compliance-linter` | Owned X/LinkedIn/Reddit profile work is decomposed under CMO/channel graphs; DMs/spend/profile/provider changes remain gated. |
| `callscore-community-drops-head` | `marketing-community-drops`, `opportunity_matrix`, `marketing-compliance-linter` | Owned Telegram/Discord can become bounded autonomous; Reddit/non-owned posting and DMs remain gated. |
| `callscore-whop-commerce-head` | `marketing-whop-marketplace`, `whop_auto` | Copy/assets/read-only health can become autonomous; pricing/product/customer/payment/provider mutation remains gated. |
| `callscore-email-partnership-drafts-head` | `marketing-channel-growth`, `outlook`, `linkedin`, BD workflows | Draft/approval packet only; live sends/outreach remain gated. |
| `callscore-opportunity-research-head` | `opportunity_matrix`, `creator-video-swipefile` | Read-only research and briefs can be autonomous; posting/outreach/spend remain gated. |
| `callscore-compliance-linter-head` | `marketing-compliance-linter` | Autonomous gatekeeper; cannot publish or weaken policy. |
| `callscore-data-pipeline-sentinel` | Workplane/freshness/pipeline jobs | Autonomous read-only truth sentinel; DB writes/restarts/backfills/promotions remain gated. |
| `callscore-youtube-discovery-head` | `discover:videos`, `creator_db` | Discovery polling can become autonomous; provider/bulk change remains gated. |
| `callscore-transcript-scraper-head` | `scrape:v2`, laptop bridge | Scrape-acquire can become autonomous; yt-dlp migration / provider change remains gated. |
| `callscore-llm-extractor-head` | `extract:llm`, Gemini/Ollama providers | Extraction can become autonomous; LLM provider/prompt change remains gated. |
| `callscore-price-matcher-head` | `match`, candle data | Price matching can become autonomous; provider/backfill change remains gated. |
| `callscore-scorer-head` | `score`, leaderboard | Scoring can become autonomous; algorithm/leaderboard schema change remains gated. |
| `callscore-consensus-head` | `consensus`, multi-model merge | Consensus can become autonomous; model weight/algorithm change remains gated. |
| `callscore-ml-verifier-head` | `ml_verifier_batch`, Gemma/Ollama | Verification can become autonomous; model swap/promotion remains gated. |
| `callscore-candle-refresher-head` | `candle_refresh`, market data | Candle refresh can become autonomous; provider/datalake change remains gated. |
| `callscore-candidate-admission-head` | `candidate_admission`, eligibility manifest | Admission can become autonomous; admission criteria change remains gated. |
| `callscore-markov-trajectory-head` | transition report, HMM engine | Trajectory prediction pre-Markov; matrix/prediction publication remains gated until backtest validated. |

## Roster

| Subagent | Class | Canonical path | Exists | Bounded authority | Governance |
|---|---|---|---|---|---|
| `orchestrator` | Master coordinator | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/orchestrator/SKILL.md` | yes | Routes work across workflows, runs health/state checks, coordinates cross-channel intelligence; does not bypass gates. | Uses task-router, state_manager, cadence checks, registry/Workplane gates. |
| `marketing-channel-growth` | Owned public/channel growth | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/marketing-channel-growth/SKILL.md` | yes | Creates and prepares launch/content assets for X, LinkedIn, YouTube/SEO, Telegram, Discord, Reddit, newsletters, partnerships. | Registry lane + READY_PUBLIC_OWNED or SEND/SPEND/PUBLISH gates. |
| `content_creator` | Multi-platform content specialist | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/content_creator/SKILL.md` | yes | Strategy, research, draft, polish, platform-specific posts/articles/newsletter assets. | Content remains draft/owned-public safe unless registry permits live execution. |
| `marketing-compliance-linter` | Safety/compliance reviewer | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/marketing-compliance-linter/SKILL.md` | yes | Checks forbidden claims, caveats, excluded channels, missing gates. | Can approve draft review or block; cannot publish. |
| `marketing-community-drops` | Community distribution specialist | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/marketing-community-drops/SKILL.md` | yes | Telegram/Discord/Reddit/community copy and rules-aware distribution packets. | Owned channel READY_PUBLIC_OWNED or SEND_GATE for DMs/non-owned/outreach. |
| `marketing-whop-marketplace` | Whop marketplace GTM specialist | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/marketing-whop-marketplace/SKILL.md` | yes | Whop listing copy, FAQ, screenshots checklist, conversion assets. | Copy/assets can be ready-owned; pricing/payment/product/customer/provider mutations require FINANCIAL+PRODUCTION gates. |
| `creator-video-swipefile` | Creator/video research specialist | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/creator-video-swipefile/SKILL.md` | yes | Builds video hook/format/thumbnail/CTA/trust-pattern swipe files for GTM. | Pattern extraction only; no copying, no creator accusations, no outreach without gate. |
| `opportunity_matrix` | Market intelligence specialist | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/opportunity_matrix/SKILL.md` | yes | Scans Reddit/HN/GitHub/X for opportunity signals and content/BD ideas. | Read/research/report; sends/outreach require SEND_GATE. |
| `whop_auto` | Commerce automation specialist | `/srv/whop-auto/plugin/agent_workflows/whop_auto/README.md` | yes | Whop app/plugin runtime for adopt/deploy/reconcile/status/market/commerce flows and entitlement/provider checks. | Read-only/dry-run by default; provider/customer/payment writes require exact consent, manifest, diff, rollback, receipt. |
| `whop adopt-planner` | Whop planning subagent | `/srv/whop-auto/plugin/agent_workflows/whop_auto/agents/adopt-planner.md` | yes | Plans adoption/wiring flows for Whop automation. | Planner only; executor must pass Workplane/Whop consent gates. |
| `whop deploy-planner` | Whop deployment planning subagent | `/srv/whop-auto/plugin/agent_workflows/whop_auto/agents/deploy-planner.md` | yes | Plans deploy/release steps for whop_auto. | No production deploy/mutation without explicit gate and receipt. |
| `whop critic` | Whop quality/risk reviewer | `/srv/whop-auto/plugin/agent_workflows/whop_auto/agents/critic.md` | yes | Reviews whop_auto plans/outputs for gaps and risks. | Reviewer only; blocks unsafe output. |
| `linkedin` | LinkedIn inbox triage specialist | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/linkedin/SKILL.md` | yes | Manual-input LinkedIn inbox classification and reply drafting. | No send; Omar approval / SEND_GATE before outbound action. |
| `outlook` | Email triage specialist | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/outlook/SKILL.md` | yes | Outlook/Gmail inbox triage, sorting, draft reply generation. | Moves/drafts only within approved envelope; sends require approval. |
| `autoresearch` | Autonomous experiment loop | `/srv/agents/repos/Claude_Code_Automations/agent_workflows/autoresearch/SKILL.md` | yes | Long-running mutate/bench/keep-discard loops for code/prompt/outreach experiments. | Must have target file, benchmark, metric, budget/stop constraints; no live provider side effects unless gated. |
| `callscore-youtube-discovery-head` | Pipeline discovery | soul in `callscore-channel-head-souls.yaml` | yes | YouTube creator/video discovery via API; enqueue for scrape. | Discovery polling autonomous; bulk/provider change gated. |
| `callscore-transcript-scraper-head` | Pipeline scraper | soul in `callscore-channel-head-souls.yaml` | yes | yt-dlp transcript scraping, duration validation, gap detection. | Scrape acquisition autonomous; yt-dlp migration gated. |
| `callscore-llm-extractor-head` | Pipeline extractor | soul in `callscore-channel-head-souls.yaml` | yes | LLM price-call extraction from transcripts. | Extraction autonomous; provider/prompt change gated. |
| `callscore-price-matcher-head` | Pipeline matcher | soul in `callscore-channel-head-souls.yaml` | yes | Match calls vs candle data for correctness/alpha. | Matching autonomous; provider/backfill gated. |
| `callscore-scorer-head` | Pipeline scorer | soul in `callscore-channel-head-souls.yaml` | yes | Creator accuracy scoring and leaderboard inputs. | Scoring autonomous; algorithm/schema change gated. |
| `callscore-consensus-head` | Pipeline consensus | soul in `callscore-channel-head-souls.yaml` | yes | Multi-model score consensus and quality merge. | Consensus autonomous; weight/retirement change gated. |
| `callscore-ml-verifier-head` | Pipeline verifier | soul in `callscore-channel-head-souls.yaml` | yes | Gemma/Ollama verification batches. | Verification autonomous; model swap/promotion gated. |
| `callscore-candle-refresher-head` | Pipeline refresher | soul in `callscore-channel-head-souls.yaml` | yes | Market data freshness guardian and gap detection. | Refresh autonomous; provider/datalake change gated. |
| `callscore-candidate-admission-head` | Pipeline admission | soul in `callscore-channel-head-souls.yaml` | yes | Creator candidate eligibility and pipeline admission. | Admission autonomous; criteria/rule change gated. |
| `callscore-markov-trajectory-head` | Pipeline Markov | soul in `callscore-channel-head-souls.yaml` | pre-implementation | Creator trajectory prediction via HMM from transition snapshots. | Trajectory publication gated until backtest validated; matrix parameter change gated. |

## Registry-backed channel ownership

| Channel | Primary owner subagent | Supporting subagents | Provider | Status | Gate |
|---|---|---|---|---|---|
| X / Twitter | `marketing-channel-growth` | `content_creator`, `marketing-compliance-linter`, `artofwar_campaign_dossier`, `Composio Twitter/X` | Composio Twitter/X | `ready_public_owned` | READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE; SEND_GATE for DMs/outreach; SPEND_GATE for paid actions |
| LinkedIn | `marketing-channel-growth` | `content_creator`, `marketing-compliance-linter`, `Composio LinkedIn` | Composio LinkedIn | `ready_public_owned` | READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE; SEND_GATE for DMs/outreach; SPEND_GATE for paid promotion |
| Gmail / email | `marketing-channel-growth` | `marketing-compliance-linter`, `Composio Gmail/email` | Composio Gmail/email | `gated` | SEND_GATE + TRUST_GATE + SECRET_GATE |
| Discord | `marketing-community-drops` | `marketing-compliance-linter`, `Composio Discord` | Composio Discord | `ready_public_owned` | READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + community rules check + POST_EXECUTION_RECEIPT + SECRET_GATE; SEND_GATE for DMs/outreach or non-owned community posting |
| Telegram | `marketing-community-drops` | `marketing-compliance-linter`, `artofwar_campaign_dossier` | Telegram/community surface | `ready_public_owned` | READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + community rules check + POST_EXECUTION_RECEIPT + SECRET_GATE; SEND_GATE for DMs/outreach or non-owned community posting |
| Reddit | `marketing-community-drops` | `opportunity_matrix`, `marketing-compliance-linter` | Reddit/community surface | `gated` | SEND_GATE + TRUST_GATE + DATA_POLICY_GATE + SECRET_GATE |
| YouTube / SEO | `marketing-channel-growth` | `creator-video-swipefile`, `marketing-compliance-linter`, `CallScore evidence pipeline` | Netlify public app / SEO pages | `ready_public_owned` | READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE; PRODUCTION_GATE when runtime/app deploy or provider mutation is required |
| Crypto newsletters | `marketing-channel-growth` | `content_creator`, `marketing-compliance-linter`, `Composio Gmail/email` | Gmail/email or partner newsletter surface | `gated` | SEND_GATE + TRUST_GATE + DATA_POLICY_GATE + SPEND_GATE + SECRET_GATE |
| Creator partnerships | `marketing-channel-growth` | `creator-video-swipefile`, `marketing-compliance-linter`, `Composio Gmail/email`, `Composio LinkedIn` | Gmail/email or LinkedIn | `gated` | SEND_GATE + TRUST_GATE + RIGHT_OF_REPLY_GATE + DATA_POLICY_GATE + SECRET_GATE |
| Whop marketplace | `marketing-whop-marketplace` | `marketing-compliance-linter`, `whop_auto`, `artofwar_campaign_dossier` | Whop marketplace | `ready_public_owned` | READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE for copy/assets; FINANCIAL_GATE + PRODUCTION_GATE for pricing/product/customer/payment/entitlement/payout/provider mutation |
| Whop provider / entitlement | `whop_auto` | `whop_provider_health`, `whop_plan_inventory_check`, `whop_entitlement_sync_dry_run`, `whop_webhook_replay_safe`, `whop_customer_status_check`, `whop_activation_review` | Whop provider | `monitored` | FINANCIAL_GATE + PRODUCTION_GATE + SECRET_GATE |
| Attio CRM | `Composio Attio lane` | `automation_health_check`, `marketing-compliance-linter` | Composio Attio | `monitored` | PRODUCTION_GATE + SEND_GATE where outreach-linked + SECRET_GATE |
| PostHog analytics | `Composio PostHog lane` | `marketing-channel-growth`, `automation_health_check` | Composio PostHog | `monitored` | PRODUCTION_GATE + SECRET_GATE |
| Hugging Face | `Composio Hugging Face lane` | `Gemma/Qwen local model path`, `automation_health_check` | Composio Hugging Face / Hugging Face plugin | `auth_blocked` | SPEND_GATE + PRODUCTION_GATE + SECRET_GATE |
| Composio hub | `Composio MCP lane` | `automation_health_check`, `Workplane / Hermes governance` | Composio MCP | `monitored` | SECRET_GATE + READY_PUBLIC_OWNED for owned public organic posts; action-specific SEND_GATE/SPEND_GATE/PRODUCTION_GATE for restricted actions |
| Art of War campaign engine | `Art of War` | `artofwar_strategy_brief`, `artofwar_campaign_preflight`, `artofwar_campaign_verify`, `artofwar_campaign_persona_test`, `artofwar_campaign_gemma_eval`, `artofwar_campaign_dossier`, `artofwar_campaign_receipt` | local dry-run CLI | `ready_public_owned` | READY_PUBLIC_OWNED + PUBLIC_MESSAGING_POLICY + POST_EXECUTION_RECEIPT + SECRET_GATE for owned organic public posts; SEND_GATE/SPEND_GATE/FINANCIAL_GATE/PRODUCTION_GATE as action-specific for restricted lanes |
| Workplane / Hermes governance | `Hermes / Workplane` | `HH control bridge`, `agentmemory`, `callscore-memory` | Hermes / HH control bridge | `ready` | SECRET_GATE + PRODUCTION_GATE for mutations |
| Automation registry / health checks | `automation_registry_refresh` | `automation_dry_run`, `automation_health_check`, `automation_activation_review`, `Claude_Code_Automations workplane` | local automation registry | `monitored` | SECRET_GATE + action-specific approval gate |
| YouTube video discovery | `callscore-youtube-discovery-head` | `callscore-transcript-scraper-head`, `callscore-candidate-admission-head` | YouTube Data API / composio | `monitored` | DB_WRITE check for enqueue; SPEND_GATE for paid API enrichment |
| Transcript acquisition | `callscore-transcript-scraper-head` | `callscore-youtube-discovery-head`, laptop bridge | yt-dlp / laptop bridge | `monitored` | PRODUCTION_GATE for provider mutation; SECRET_GATE for cookie rotation |
| LLM call extraction | `callscore-llm-extractor-head` | `callscore-transcript-scraper-head`, `callscore-consensus-head` | Gemini / Ollama / LLM provider | `monitored` | SPEND_GATE for LLM provider usage; PRODUCTION_GATE for prompt change |
| Price matching | `callscore-price-matcher-head` | `callscore-llm-extractor-head`, `callscore-candle-refresher-head` | Candle data provider | `monitored` | PRODUCTION_GATE for provider/backfill change; SECRET_GATE for data source credentials |
| Creator scoring | `callscore-scorer-head` | `callscore-price-matcher-head`, `callscore-consensus-head` | Scoring engine / local computation | `monitored` | PRODUCTION_GATE for algorithm change; FINANCIAL_GATE if scoring affects monetisation |
| Multi-model consensus | `callscore-consensus-head` | `callscore-scorer-head`, `callscore-ml-verifier-head` | Consensus engine | `monitored` | PRODUCTION_GATE for weight/algorithm change; PRODUCTION_GATE for model retirement |
| ML verification | `callscore-ml-verifier-head` | `callscore-consensus-head`, `callscore-gemma-transcript-head` | Gemma / Ollama local | `monitored` | PRODUCTION_GATE for model swap; PRODUCTION_GATE for shadow promotion |
| Candle data refresh | `callscore-candle-refresher-head` | `callscore-price-matcher-head` | Candle data provider | `monitored` | SPEND_GATE for paid data source; PRODUCTION_GATE for historical backfill |
| Creator admission | `callscore-candidate-admission-head` | `callscore-youtube-discovery-head`, creator eligibility manifest | Admission engine | `monitored` | PRODUCTION_GATE for admission criteria change; DATA_POLICY_GATE for exclusion rule changes |
| Markov trajectory | `callscore-markov-trajectory-head` | `callscore-consensus-head`, `callscore-scorer-head`, transition report | Transition HMM engine | `pre_markov` | PRODUCTION_GATE for prediction publication; DATA_POLICY_GATE for transition matrix changes |

## Correction note

Any future system map for CallScore / Hermes / Art of War / Whop Auto must show this subagent layer explicitly between Workplane/Hermes governance and channel/provider execution. Omitting it makes the automation look like jobs and gates only, which is false.