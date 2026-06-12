# Workplane Readiness and Root Hygiene Audit

Date: 2026-06-12
Branch: `agentic-workplane-activation-readiness`

## Scope

This audit covers CallScore root hygiene, Hermes/workplane readiness, laptop transcript runner readiness, Whop-auto, Art of War, and claude-code-automations activation gates.

## Root hygiene grading

| Path | Grade | Rationale | Action |
| --- | --- | --- | --- |
| `src/lib/workplane-jobs.ts` | KEEP | Canonical workplane job registry and runner dispatch surface. | Extend only; no duplicate registry. |
| `src/lib/workplane-status.ts` | KEEP | Canonical JSON readiness/status model. | Extend only. |
| `src/scripts/workplane-status.ts` | KEEP | Canonical machine-readable workplane status command. | Extend only. |
| `scripts/windows/run-transcript-collector.ps1` | KEEP | Canonical laptop transcript collector. | Extended for workplane claim/status. |
| `docs/ops/laptop-transcript-collector.md` | KEEP | Canonical operator/laptop collector runbook. | Extended. |
| `docs/plans/` | KEEP | Canonical plan history and active certification log. | Update plan only. |
| `.tmp/` | KEEP | Ignored runtime/eval artifact area for workplane jobs. | Do not commit. |
| `.next/` | KEEP | Ignored Next.js build output. | Do not commit. |
| `.netlify/` | KEEP | Ignored Netlify local state. | Do not commit. |
| `node_modules/` | KEEP | Dependency install directory. | Do not commit. |
| `.new-FE-design/` | KEEP_BUT_CONSOLIDATE | Tracked design reference artifact; overlaps active frontend docs/assets. | Consolidate later, not this activation task. |
| `callscore-g10-approval-packet/` | KEEP_BUT_CONSOLIDATE | Historical approval packet; useful audit evidence but bulky. | Archive/consolidate later. |
| `Dockerfile.hermes.backup.20260608T035330Z` | REVIEW_LATER | Pre-existing untracked runtime backup. | Do not delete without operator approval. |
| `docker-compose.yml.backup.20260608T040349Z` | REVIEW_LATER | Pre-existing untracked runtime backup. | Do not delete without operator approval. |
| `docker-compose.yml.backup.20260608T041836Z` | REVIEW_LATER | Pre-existing untracked runtime backup. | Do not delete without operator approval. |
| `src/lib/db.ts.backup.20260608T035154Z` | REVIEW_LATER | Pre-existing untracked runtime backup. | Do not delete without operator approval. |

No tracked files were graded `REMOVE_NOW` in this pass. No untracked runtime backups were deleted.

Tech debt delta: **NEUTRAL / REDUCED**. The existing job registry/status/collector surfaces were extended instead of creating duplicate runners or registries.

## Workplane domains

`npm run workplane:status` now reports these domains with `READY | PARTIAL | BLOCKED | NOT_CONNECTED | NEEDS_APPROVAL`:

- `root_hygiene`
- `callscore_pipeline`
- `transcript_collector`
- `gemma_shadow_extraction`
- `ml_improvement_loop`
- `whop_auto`
- `art_of_war`
- `claude_code_automations`
- `hermes_worker`
- `provider_integrations`
- `activation_gates`

Every domain includes evidence, blockers, safe next action, risky actions blocked, approvals, commands, jobs, dry-run/canary flags, and `production_mutation_allowed=false` unless separately certified and approved.

## Laptop runner readiness

Status: **INSTALL_READY / PARTIAL**

Canonical runner: `scripts/windows/run-transcript-collector.ps1`

Added workplane mode:

```powershell
.\scripts\windows\run-transcript-collector.ps1 -Workplane -Limit 5 -Browser firefox -HhHost omar@100.107.162.80 -HhPort 2222 -HhIdentityFile $env:USERPROFILE\.ssh\callscore_hh_ed25519 -Write
```

Behavior:

- claims `transcript_collect_laptop` jobs from HH with `npm run workplane:laptop-job -- claim`;
- keeps cookies laptop-local;
- fetches transcript-only captions;
- ingests transcript/failure results through HH;
- publishes state to `.tmp/laptop-collector/latest-state.json` on HH;
- completes/fails the claimed workplane job;
- enforces no-overlap lock, 5 default limit, 25 only with explicit large-batch gate, randomized 45-90 second gaps, 12-24h cooldown, 429/bot stop, recent terminal failure skip.

## Whop-auto readiness

Status: **PARTIAL**

Discovered:

- `/srv/whop-auto`
- `/srv/whop-auto/plugin/agent_workflows/whop_auto`
- CallScore Whop certification doc: `docs/ops/whop-auto-certification.md`

Job surfaces:

- `whop_provider_health`
- `whop_plan_inventory_check`
- `whop_entitlement_sync_dry_run`
- `whop_webhook_replay_safe`
- `whop_customer_status_check`
- `whop_activation_review`

Safety gates:

- provider health and inventory are read-only;
- entitlement sync and webhook replay are dry-run/fixture-only;
- pricing, payments, plans, products, webhooks, customer entitlements require explicit approval.

## Art of War readiness

Status: **PARTIAL**

Discovered:

- `/srv/agents/repos/Claude_Code_Automations`
- `/srv/agents/repos/Claude_Code_Automations/scripts/art_of_war.py`
- `/srv/agents/repos/Claude_Code_Automations/art-of-war`

Job surfaces:

- `artofwar_strategy_brief`
- `artofwar_content_queue_dry_run`
- `artofwar_campaign_plan_generate`
- `artofwar_audience_research_dry_run`
- `artofwar_outreach_queue_prepare`
- `artofwar_publish_approval_review`
- `artofwar_spend_approval_review`

Safety gates:

- strategy/content/campaign/audience dry-runs allowed;
- publishing, emails, DMs, outreach sends, ad spend, aggressive scraping require approval.

## Claude-code-automations readiness

Status: **PARTIAL**

Discovered:

- `/srv/agents/repos/Claude_Code_Automations`
- `/srv/agents/repos/Claude_Code_Automations/workplane/package.json`

Automation classification:

| Automation/surface | Class | Approval needed | Status |
| --- | --- | --- | --- |
| Workplane status/validate package | read_only | No | PARTIAL |
| Art of War report/strategy dry-run | dry_run | No for local draft | PARTIAL |
| Art of War content/campaign drafts | local_write/dry_run | No for drafts; yes for publish | PARTIAL |
| Outreach queue prepare | local_write/dry_run | Approval before send | PARTIAL |
| Provider-connected Whop actions | provider_mutation | Yes for live mutation | GATED |
| Public marketing publish/send | public_action | Yes | GATED |
| Ad spend | spend_action | Yes | GATED |
| Destructive infra/data actions | destructive | Yes / blocked by default | BLOCKED |

Job surfaces:

- `automation_registry_refresh`
- `automation_dry_run`
- `automation_health_check`
- `automation_activation_review`

## Current activation posture

Overall: **PARTIAL**

Ready now:

- HH workplane status is machine-readable.
- HH-side jobs are represented and dispatchable.
- Laptop runner is install-ready and job-claim capable.
- Gemma and ML remain artifact-only.
- Whop/Art of War/automation activation gates are encoded.

Not ready for automatic public/provider/spend actions:

- Gemma write-canary remains ineligible.
- Laptop runner still needs a clean scheduled run from Omar's laptop after cooldown.
- Whop live mutations require approval.
- Art of War public actions/spend require approval.
