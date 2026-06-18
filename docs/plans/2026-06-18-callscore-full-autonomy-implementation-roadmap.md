# CallScore Full Autonomy Implementation Roadmap

Target mode: `FULL_AUTONOMOUS_BOUNDED_OWNED_GTM`

This roadmap turns the design in `docs/plans/2026-06-18-callscore-full-autonomy-channel-heads.md` into implementation phases with acceptance gates.

## Principle

Do not create another cron-shaped theatre layer. Full autonomy requires independent channel-head agents with soul, heartbeat, durable state, receipts, kill-switches, rollback, and policy enforcement.

## Phase 0 — Current safe baseline

Status: current state.

Capabilities already present:
- core data pipeline loops;
- Workplane status/gate model;
- GTM registry;
- canonical subagent roster;
- transcript cooldown posture;
- initial system ledger;
- channel-head soul and heartbeat design artifacts.

Acceptance:
- Workplane remains `OK`.
- Public verify passes.
- No unrestricted public/financial/provider/deploy mutation is introduced.

## Phase 1 — Contract artifacts and registry alignment

Files:
- `docs/ops/callscore-channel-head-souls.yaml`
- `docs/ops/callscore-full-autonomy-heartbeat-contract.md`
- `docs/ops/callscore-canonical-subagent-roster.md`
- `docs/plans/2026-06-18-callscore-full-autonomy-channel-heads.md`

Tasks:
- Keep channel-head souls versioned.
- Map every GTM channel row to a channel-head owner.
- Add future registry fields for `autonomy_mode`, `kill_switch_ref`, `policy_hash`, `max_posts_per_day`, and `budget_cap`.

Acceptance:
- YAML validates.
- Every channel-head has identity, mission, authority, memory policy, cadence, stop conditions.
- Restricted lanes remain gated.

## Phase 2 — Autonomy state schema

Tasks:
- Add migration for:
  - `agent_instances`
  - `agent_heartbeats`
  - `channel_tasks`
  - `autonomy_events`
  - `channel_publications`
  - `approval_packets`
  - `experiment_memory`
  - `incidents`
- Add TS models/helpers under `src/lib/autonomy/`.
- Add replay/idempotency helpers.

Acceptance:
- Migration has dry-run review and explicit approval before production DB mutation.
- Unit tests cover heartbeat write/read, stale lease reset, event append, idempotency block, replay dedupe.
- Missing kill-switch state blocks dispatch.

## Phase 3 — Supervisor and heartbeat CLI

Tasks:
- Create `src/scripts/autonomy-supervisor.ts`.
- Create `src/scripts/agent-heartbeat.ts`.
- Add scripts:
  - `autonomy:status`
  - `autonomy:heartbeat`
  - `autonomy:supervisor:once`
- Implement channel pause/degrade/dead state transitions.

Acceptance:
- Supervisor runs read-only by default.
- Missed-heartbeat simulation pauses dispatch.
- Global/per-channel kill switch blocks external actions.
- War Room status reports shipped/blocked/gated/heartbeat/kill-switch state.

## Phase 4 — Evidence broker

Tasks:
- Create `src/lib/autonomy/evidence-broker.ts`.
- Generate source-spanned evidence packets from HH Read API / HH Postgres public-safe rows.
- Assign evidence levels E0-E5.
- Block weak/stale evidence for public claims.

Acceptance:
- Every public claim maps to source span/hash.
- E0/E1 block; E2 draft-only; E3 aggregate/positive only; E4 named positive/neutral only; E5 gated.
- Public content cannot bypass data sentinel.

## Phase 5 — Dry-run channel-head runtime

Initial heads:
- `callscore-data-pipeline-sentinel`
- `callscore-compliance-linter-head`
- `callscore-artofwar-strategist`
- `callscore-x-linkedin-growth-head`
- `callscore-community-drops-head`
- `callscore-whop-commerce-head`

Tasks:
- Implement runtime wrappers that load the soul YAML and GTM registry.
- Each agent wakes, reads inputs, writes heartbeat, emits draft/blocked/sleep receipt.
- No external mutation.

Acceptance:
- All heads emit heartbeat packets.
- All external-action attempts downgrade to dry-run/blocked.
- Seven-day dry-run can start.

## Phase 6 — Adapter interfaces

Tasks:
- Define adapter interface: `health`, `dry_run`, `preflight`, `dispatch`, `readback`, `monitor`, `rollback`, `redact`, `idempotency_key`.
- Implement read-only/dry-run adapters first.
- Use Composio first for connected X/LinkedIn/Discord/etc where appropriate.

Acceptance:
- Adapter health/readback works without mutation.
- Provider errors do not retry external mutation.
- Idempotency reservations block duplicate payloads.

## Phase 7 — Controlled live canaries

Scope:
- one owned-public organic channel at a time;
- zero spend;
- Class A only;
- exact payload hash;
- preflight and rollback plan recorded.

Acceptance:
- Full receipt chain exists:
  1. candidate
  2. evidence
  3. risk review
  4. compliance
  5. preflight
  6. publish attempt
  7. provider ack
  8. readback verification
  9. monitoring
  10. War Room report
- First canary has no trust incident.
- Kill-switch and rollback drills pass.

## Phase 8 — Promotion to bounded full autonomy

Promotion criteria:
- 7 consecutive dry-run days.
- 100% risk golden pass.
- 100% missing-caveat block behavior.
- 100% named-negative gate behavior.
- 0 duplicate publish attempts in replay.
- 0 unsupported public claims.
- Postgres-first receipt ledger deployed and replay-tested.
- Heartbeat/watchdog failure drill passes.
- Kill-switch drill passes.
- Rollback drill passes.
- Channel adapter/auth verified in controlled mode.
- Transcript/source cooldown enforcement proven.
- Per-channel autonomous policy exists in registry.
- First controlled live pilot per channel completes without incident.
- War Room reports include shipped, blocked, gated, rollback, heartbeat, and kill-switch state.
- Operator approval receipt exists for promotion.

Result:
- Set allowed channel rows to `autonomy_mode: full_autonomous_bounded`.
- Start with only owned X/LinkedIn or owned Telegram/Discord.
- Leave sends/spend/Whop financial/provider/DB/deploy/credentials gated.

## Phase 9 — Learning loop

Tasks:
- Ingest metrics from X/LinkedIn/Discord/Telegram/PostHog/Whop read-only sources.
- Update `experiment_memory`.
- Generate daily War Room and weekly learning report.
- Adjust templates/cadence within caps.

Acceptance:
- Every autonomous action has measured outcome or explicit no-data reason.
- Agents learn from metrics but cannot expand their own authority.
- Policy changes require explicit review.

## Next executable task

Implement Phase 1 validation and Phase 2 schema plan in a separate implementation branch/worktree. Do not apply production DB migrations or start persistent agents until schema and drills are reviewed.
