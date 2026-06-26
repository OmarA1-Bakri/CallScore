# CallScore Bounded Full Autonomy Plan — Channel Heads, Heartbeats, Souls

> Historical 8-core-channel-head plan. Superseded by O13/canonical-green 44-agent souls and the CMO → X/LinkedIn/Reddit specialist hierarchy. Do not use `callscore-x-linkedin-growth-head` for new tests, heartbeats, or router fixtures.

> **Historical note:** This was the 2026-06-18 design/implementation plan for moving CallScore from `CONTROLLED_FULL` toward bounded `FULL_AUTONOMOUS`. It is superseded for current implementation by the O13/canonical-green 44-agent baseline.

**Goal:** Make CallScore operate through independent channel-head agents with their own heartbeat, soul, memory, queue, receipts, and rollback constraints, while Hermes remains the oversight/orchestrator.

**Architecture:** Do not flip `CONTROLLED_FULL` into unrestricted autonomy. Build a bounded full-autonomy kernel: persistent channel-head agents act independently only inside registry-approved, zero-spend, owned-public, policy-safe envelopes; restricted sends/spend/provider/financial/deploy/DB/credential actions stay gated.

**Current verified state:**
- Core data pipeline loops are autonomous and healthy enough for `CONTROLLED_FULL`.
- Workplane reports `status=OK`, `automation_readiness=CONTROLLED_FULL`.
- Transcript lane is monitored WARN and cooldown-aware; agents must not hammer providers.
- GTM registry already marks owned X, LinkedIn, Discord, Telegram, YouTube/SEO, Whop marketplace copy/assets, and Art of War owned public work as `ready_public_owned`.
- Existing subagent roster defines the right six dimensions, but most agents are skill prompts / one-shot workflows, not persistent runtime actors.
- Current `Claude_Code_Automations` Art of War CLI is dry-run/local and lacks older documented Phase 10A/10B runtime commands/artifacts.

---

## Honest verdict

`FULL_AUTONOMOUS` is achievable, but not as a label change.

What exists now:
- Data pipeline automation.
- Workplane readiness/gate model.
- GTM registry and channel ownership.
- Specialist workflow definitions.
- Safe-owned public execution policy.
- Receipts and stabilization ledgers.

What is missing:
- Persistent channel-head runtime.
- Agent-level heartbeat and lease model.
- Versioned soul/policy packs applied at runtime.
- Postgres-first autonomy/event ledger.
- Evidence broker from real CallScore data into marketing candidates.
- Real channel adapters with idempotency, readback, rollback, and no-retry safety.
- Kill-switch and watchdog drills.
- Seven-day dry-run proof before bounded autonomous public execution.

---

## Target autonomy mode

Use this exact name first:

`FULL_AUTONOMOUS_BOUNDED_OWNED_GTM`

Allowed without operator approval:
- read-only scans and health checks;
- local/durable draft generation;
- evidence packets;
- compliance/taste/risk reviews;
- safe owned organic public posts only when registry row is `READY_PUBLIC_OWNED` and content is Class A;
- zero-spend monitoring and learning reports;
- receipts, rollback packets, and War Room reports.

Still gated:
- email sends, DMs, outreach, newsletters;
- paid spend, ads, paid boosts, paid APIs/SaaS/LLMs;
- Whop pricing/product/customer/payment/entitlement/payout/provider/webhook mutation;
- CRM/analytics/provider writes;
- DB schema/destructive writes, broad backfills, deploys, infra, credential rotation;
- Gemma promotion into canonical calls;
- non-owned public/community posting;
- named negative creator claims, disputes, legal/compliance accusations, investment advice, performance guarantees.

Initial caps:
- max 1 autonomous post per channel/day;
- max 3 total autonomous public posts/day;
- max 1 in-flight external mutation at a time;
- no autonomous retry after provider timeout/failure;
- 24h cooldown after provider error or negative-risk incident;
- pause all public autonomy if Workplane is not `OK` or public verify fails.

---

## Runtime model

### Current job heartbeat is not enough

Existing `pipeline_jobs.heartbeat_at` is useful but job-level. Full autonomy needs agent-level heartbeat.

Required durable state:

1. `agent_instances`
   - `agent_id`, `agent_type`, `channel`, `status`, `version`, `policy_version`, `soul_version`, `created_at`, `last_started_at`.

2. `agent_heartbeats`
   - `agent_id`, `heartbeat_at`, `mode`, `current_task_id`, `status`, `metrics`, `error_class`, `lease_expires_at`.

3. `channel_tasks`
   - `task_id`, `channel`, `agent_id`, `task_type`, `state`, `priority`, `run_after`, `idempotency_key`, `payload_hash`, `max_attempts`, `created_by`.

4. `autonomy_events`
   - append-only event ledger with `event_id`, `created_at`, `source`, `schema_version`, `status`, `agent_id`, `task_id`, `run_id`, `parent_event_id`, `policy_version`, `soul_version`, `payload_hash`, `external_provider_id`.

5. `channel_publications`
   - `channel`, `provider`, `external_post_id`, `url`, `payload_hash`, `rollback_path`, `monitoring_status`.

6. `approval_packets`
   - exact payload hash, gate class, approval state, expiry, operator evidence.

7. `experiment_memory`
   - campaign/channel/template results, metrics, keep/kill/iterate decisions.

8. `incidents`
   - provider failures, policy blocks, rollback/correction events, negative reactions, duplicate prevention events.

Postgres should be the production event truth. JSONL can mirror for debugging/recovery only.

---

## Heartbeat packet

Every channel-head run emits this shape:

```json
{
  "heartbeat_id": "agent-iso-timestamp",
  "agent_id": "callscore-x-linkedin-growth-head",
  "mode": "observe|draft|execute_owned|blocked|escalate|sleep",
  "inputs_read": ["workplane_status", "gtm_registry", "freshness", "prior_receipts"],
  "decisions": [],
  "actions_taken": [],
  "receipts": [],
  "memory_delta": [],
  "blockers": [],
  "next_wake_at": "iso8601",
  "stop_state": "continue|sleep|blocked|escalated"
}
```

Watchdog behavior:
- 1 missed heartbeat: mark degraded.
- 2 missed heartbeats: pause new dispatch.
- 3 missed heartbeats / expired lease: force draft-only, cancel autonomous actions, alert War Room.
- missing/stale heartbeat before dispatch: block external action.

---

## Channel-head agents

### 1. `callscore-artofwar-strategist`

Mission: turn CallScore evidence into campaign strategy, campaign dossiers, and safe owned-public canary candidates.

Independent actions:
- run strategy pulse;
- select candidate angles;
- generate campaign dossier;
- run persona/taste checks;
- recommend owned public canary;
- execute owned-public action only if registry/policy/receipt path passes.

Stop on: missing fresh evidence, policy fail, restricted action, missing receipt, named negative claim.

Taste: evidence-first, sharp private strategy, restrained public claims, no empty launch theatre.

Cadence: daily pulse; event-driven after pipeline freshness/campaign metric changes; weekly strategy review.

### 2. `callscore-x-linkedin-growth-head`

Mission: operate owned X/LinkedIn growth without manual Hermes prompting.

Independent actions:
- draft posts/threads/LinkedIn posts;
- maintain queue;
- publish owned zero-cost public posts within caps;
- monitor read-only metrics;
- iterate hook/topic memory.

Stop on: duplicate hash, cap reached, stale data, compliance fail, provider error, DM/outreach/spend path.

Taste: concrete, crypto-native, non-hype, no “AI slop,” no alpha/profit promises.

Cadence: X 2-4 draft pulses/day with max 1 publish/day; LinkedIn max 1 publish/day; metrics at 4h/24h/48h.

### 3. `callscore-community-drops-head`

Mission: operate owned Telegram/Discord community drops and prepare non-owned community drafts.

Independent actions:
- publish owned/managed Telegram/Discord posts when safe;
- draft Reddit/community packets only;
- maintain rule context;
- monitor reactions.

Stop on: destination not owned, rule context unknown, Reddit/non-owned posting, DM/outreach, backlash/mod warning.

Taste: useful, transparent, non-spam, community-first.

Cadence: daily community pulse; max 1 owned post/channel/day; Reddit research 2-3x/week draft-only.

### 4. `callscore-whop-commerce-head`

Mission: keep Whop marketplace copy/assets/conversion surfaces fresh while provider/financial mutation remains gated.

Independent actions:
- draft/review listing copy, FAQ, screenshot checklist;
- read-only Whop health/inventory;
- produce copy/assets receipts;
- recommend conversion improvements.

Stop on: pricing/product/customer/payment/provider mutation, missing rollback, provider ambiguity, secret/customer data exposure.

Taste: trust-first marketplace copy, clear offer, visible caveats, no hype.

Cadence: daily listing/conversion review; Whop read-only health every 6-12h during launch.

### 5. `callscore-email-partnership-drafts-head`

Mission: prepare approved-send-ready email/newsletter/partnership assets without sending.

Independent actions:
- draft partner pitches;
- draft right-of-reply invitations;
- build recipient assumptions and approval packets;
- maintain suppression/DNC checklist.

Never autonomous live-send.

Stop on: SEND_GATE missing, recipient uncertainty, suppression hit, defamatory wording, evidence incomplete.

Taste: respectful, precise, legally cautious, no mass-mail smell.

Cadence: M/W/F draft queue; event-driven after opportunity signal.

### 6. `callscore-opportunity-research-head`

Mission: continuously find market/channel/content opportunities for other heads.

Independent actions:
- scan sources;
- score signals;
- cluster objections/demand;
- feed content/community/Whop/partnership heads;
- maintain swipe files.

Stop on: API/source rate limit, private/sensitive source, insufficient validation, proposed action becomes outreach/posting.

Taste: pattern extraction, demand evidence, no trend-chasing, no plagiarism.

Cadence: daily scan; weekly “what changed” report; monthly swipefile refresh.

### 7. `callscore-compliance-linter-head`

Mission: act as independent gatekeeper for all content/actions.

Independent actions:
- lint every draft/public payload;
- return `approved_for_draft_review`, `changes_required`, or `blocked`;
- maintain blocked-claim patterns;
- run daily sample audit;
- require receipts/gates.

Cannot publish or silently weaken policy.

Stop on: forbidden claim, missing caveat, excluded channel, missing gate, private/secret/customer/provider data in payload.

Taste: conservative, boring, precise; allows sharp marketing only when supported and caveated.

Cadence: every asset before queue/publish/send; daily queue audit; weekly policy drift review.

### 8. `callscore-data-pipeline-sentinel`

Mission: protect product truth so marketing never outruns data quality.

Independent actions:
- run read-only status/freshness/audit checks;
- watch pipeline receipts;
- detect transcript/provider/data gaps;
- queue bounded dry-run diagnostics only where policy allows;
- block content that lacks fresh evidence.

Stop on: Workplane not OK, freshness blocker, evidence missing, production mutation needed, secret/env exposure risk, provider cooldown active.

Taste: skeptical operational guardian. “No fresh data, no claim.”

Cadence: hourly light heartbeat; daily deep audit; after every pipeline run; pre-GTM check before claim-bearing content.

---

## Execution pipeline for autonomous owned-public publish

```text
candidate
→ evidence packet
→ source span map
→ deterministic risk review
→ compliance/soul/taste check
→ channel registry check
→ idempotency reservation
→ preflight receipt write
→ kill-switch check
→ adapter dispatch
→ provider acknowledgement receipt
→ readback verification
→ monitoring task scheduled
→ War Room report
```

Any failure changes action to `blocked` or `draft_only`. No best-effort publish.

---

## Required adapters

Each adapter must implement:
- `health`
- `dry_run`
- `preflight`
- `dispatch` where allowed
- `readback`
- `monitor`
- `rollback` where allowed
- `redact`
- `idempotency_key`

Initial adapters:
- Composio X/Twitter
- Composio LinkedIn
- Discord owned channel
- Telegram owned channel
- SEO/repo-controlled page draft path
- Whop marketplace copy/assets path
- PostHog read-only metrics
- Whop read-only metrics/checkout/entitlement health

---

## Promotion gates

Do not promote to bounded full autonomy until all pass:

1. 7 consecutive dry-run days.
2. 100% risk golden pass.
3. 100% missing-caveat block behavior.
4. 100% named-negative gate behavior.
5. 0 duplicate publish attempts in replay.
6. 0 unsupported public claims.
7. Postgres-first receipt ledger deployed and replay-tested.
8. Heartbeat/watchdog failure drill passes.
9. Kill-switch drill passes.
10. Rollback drill passes.
11. Channel adapter/auth verified in controlled mode.
12. Transcript/source cooldown enforcement proven.
13. Per-channel autonomous policy exists in registry.
14. First controlled live pilot per channel completes without incident.
15. War Room reports include shipped, blocked, gated, rollback, heartbeat, and kill-switch state.
16. Operator signs promotion from `CONTROLLED_FULL` to `FULL_AUTONOMOUS_BOUNDED_OWNED_GTM`.

---

## Implementation plan

### Phase A — Define soul packs and heartbeat contracts

Files:
- Create `docs/ops/callscore-channel-head-souls.yaml`.
- Create `docs/ops/callscore-full-autonomy-heartbeat-contract.md`.
- Update `docs/ops/callscore-canonical-subagent-roster.md` to link them.

Verification:
- YAML parse.
- Registry rows map to a channel head.
- No secret-like values.

### Phase B — Build autonomy DB schema and event models

Files:
- Create migration for `agent_instances`, `agent_heartbeats`, `channel_tasks`, `autonomy_events`, `channel_publications`, `experiment_memory`, `incidents`.
- Create `src/lib/autonomy/*` models/helpers.
- Tests for idempotency, heartbeat expiry, stale lease reset, event append, replay.

Verification:
- Typecheck.
- Unit tests.
- Dry-run migration check.
- No production writes without explicit migration approval.

### Phase C — Build supervisor and heartbeat CLI

Files:
- Create `src/scripts/autonomy-supervisor.ts`.
- Create `src/scripts/agent-heartbeat.ts`.
- Add npm scripts: `autonomy:status`, `autonomy:heartbeat`, `autonomy:supervisor:once`.

Verification:
- `autonomy:status` read-only works.
- Missed-heartbeat simulation pauses dispatch.
- Kill-switch missing means blocked.

### Phase D — Evidence broker from real CallScore data

Files:
- Create `src/lib/autonomy/evidence-broker.ts`.
- Create tests for evidence sufficiency levels E0-E5.
- Art of War moves from fixtures to read-only evidence packets.

Verification:
- Source spans/hash every claim.
- Stale/low-confidence evidence blocks public content.

### Phase E — Dry-run channel-head agents

Files:
- Create agent prompts/runtime configs under `docs/ops/channel-heads/` and/or `src/lib/autonomy/channel-heads.ts`.
- Start with: data sentinel, compliance linter, Art of War strategist, X/LinkedIn head.

Verification:
- Agents produce heartbeats and draft receipts only.
- No external mutation.
- 7-day dry-run can start.

### Phase F — Adapters and controlled canaries

Files:
- Create adapter interfaces and provider implementations.
- Use Composio first for connected apps.
- Add readback/rollback/idempotency tests.

Verification:
- Adapter health/readback passes.
- Controlled canary produces preflight, provider ack, verification, and monitoring receipts.

### Phase G — Enable bounded full autonomy

Files:
- Update registry per channel with `autonomy_mode: full_autonomous_bounded` only after evidence.
- Add supervisor kill-switch runbook and War Room report.

Verification:
- All promotion gates pass.
- Operator approval receipt exists.

---

## Immediate next action

Do **not** launch persistent channel-head processes yet.

Next implementation should be Phase A + Phase B plan-level scaffolding:
1. commit this plan;
2. create soul/heartbeat contracts;
3. run three-agent review;
4. only then implement DB/runtime code.

This avoids building another cron-shaped theatre layer. The heads need soul + heartbeat + memory + authority before launch.
