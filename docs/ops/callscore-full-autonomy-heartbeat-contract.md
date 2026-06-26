# CallScore Full Autonomy Heartbeat Contract

This contract defines the minimum runtime behavior for CallScore channel-head agents before the system can move from `CONTROLLED_FULL` to `FULL_AUTONOMOUS_BOUNDED_OWNED_GTM`.

The purpose is to make each channel head independently operable without Hermes prompting, while Hermes/Workplane retains oversight, kill-switch authority, and promotion control.

## Scope

Applies to every live `agent_id` in the canonical souls file. The original
heartbeat contract started from the 8 core lane/channel-head examples listed
below; those 8 are still useful lane examples, but they are not the complete
canonical roster. Current O13 acceptance requires **44 canonical agents/souls**
to validate, route through authority, and emit heartbeat/task receipts when
scheduled.

Core lane examples:

Current canonical baseline: 44 unique agents/souls. The former `callscore-x-linkedin-growth-head` was decomposed into the CMO hierarchy plus X/LinkedIn/Reddit channel heads and social specialists; do not use that deprecated ID for new heartbeat/router tests.

Representative high-level heads include:

- `callscore-artofwar-strategist`
- `callscore-cmo-head`
- `callscore-x-head`
- `callscore-linkedin-head`
- `callscore-reddit-head`
- `callscore-community-drops-head`
- `callscore-whop-commerce-head`
- `callscore-email-partnership-drafts-head`
- `callscore-opportunity-research-head`
- `callscore-compliance-linter-head`
- `callscore-data-pipeline-sentinel`

The full 44-agent roster, including social specialists, control agents, runtime worker head, and pipeline heads, is validated from the souls YAML by `tests/canonical-souls-schema.test.ts`.

The canonical soul definitions live in:

- `docs/ops/callscore-channel-head-souls.yaml`

Use the souls file for roster count and identity. Do not hard-code 8, 16, or 26
as the live agent count outside explicitly marked historical receipts/fixtures.

The canonical channel/provider/gate registry lives in:

- `docs/ops/callscore-gtm-agent-registry.json`

## Required runtime state

Job-level heartbeats already exist through `pipeline_jobs.heartbeat_at`. That is not enough for full autonomy. Channel heads need agent-level state.

A production implementation must persist at least these entities, preferably in HH Postgres:

1. `agent_instances`
   - identity, channel, status, runtime version, policy version, soul version.

2. `agent_heartbeats`
   - liveness, current mode, current task, queue depth, metrics, lease expiry, latest error.

3. `channel_tasks`
   - per-channel task queue with idempotency, payload hash, run-after, attempts, and state.

4. `autonomy_events`
   - append-only event ledger. This is the production source of truth.

5. `channel_publications`
   - published URL/provider ID/payload hash/readback/rollback state.

6. `approval_packets`
   - exact approval payloads for restricted actions.

7. `experiment_memory`
   - channel/campaign/template learning memory.

8. `incidents`
   - failures, policy blocks, kill-switch activations, rollback/correction events.

JSONL mirrors are allowed for debugging/recovery, but chat history and transient files are not production state.

## Heartbeat packet

Every scheduled agent/channel-head wake/run must write a heartbeat packet with
this shape:

```json
{
  "heartbeat_id": "callscore-x-head-2026-06-18T00:00:00Z",
  "agent_id": "callscore-x-head",
  "schema_version": "callscore_agent_heartbeat.v1",
  "mode": "observe|draft|execute_owned|blocked|escalate|sleep",
  "autonomy_mode": "controlled_full|full_autonomous_bounded|draft_only|disabled",
  "soul_version": "callscore_channel_head_souls.v1",
  "policy_version": "<gtm-registry-hash-or-version>",
  "lease_expires_at": "<iso8601>",
  "inputs_read": [],
  "decisions": [],
  "actions_taken": [],
  "receipts": [],
  "memory_delta": [],
  "blockers": [],
  "metrics": {},
  "next_wake_at": "<iso8601>",
  "stop_state": "continue|sleep|blocked|escalated"
}
```

Required invariants:

- `agent_id` must exist in `docs/ops/callscore-channel-head-souls.yaml`.
- `policy_version` must correspond to the GTM registry version/hash used for the run.
- Any public action must reference evidence, compliance, preflight, provider ack, readback, and monitoring receipts.
- Missing heartbeat before dispatch blocks external mutation.
- Missing kill-switch state is treated as kill switch active.

## Agent modes

- `observe`: read-only checks, metrics, registry, prior receipts.
- `draft`: creates drafts, approval packets, evidence packets, risk reviews; no external mutation.
- `execute_owned`: narrow owned-public organic action; only for Class A content and registry-approved channels.
- `blocked`: explicit stop; includes blocker and safest next action.
- `escalate`: needs Hermes/operator gate.
- `sleep`: no safe action; writes next wake time.

## Dispatch preflight for owned-public action

An agent may only enter `execute_owned` if all checks pass:

1. Workplane status is `OK`.
2. Public live verify passes.
3. Global kill switch is false.
4. Per-channel kill switch is false.
5. Agent heartbeat is fresh and lease is active.
6. GTM registry row exists, is unexpired, and explicitly allows owned-public organic action.
7. Channel/account is owned or managed.
8. Budget cap is exactly zero.
9. No DM/email/outreach semantics.
10. No paid spend or paid promotion.
11. No Whop/provider/customer/payment/entitlement mutation.
12. No production DB/deploy/credential mutation.
13. Evidence sufficiency is high enough for the claim.
14. Risk class is Class A.
15. Compliance linter approved the payload.
16. No missing caveat.
17. No named negative creator framing.
18. Every public claim maps to a source span/hash.
19. Payload hash is new for the channel/cooldown window.
20. Rate limits/cooldowns pass.
21. Preflight receipt write succeeds before external mutation.

If any check fails, the agent must downgrade to `blocked` or `draft`.

## Receipt chain for public action

Minimum receipt chain:

1. `candidate_receipt`
2. `evidence_receipt`
3. `risk_review_receipt`
4. `compliance_receipt`
5. `preflight_receipt`
6. `publish_attempt_receipt`
7. `provider_ack_receipt`
8. `readback_verification_receipt`
9. `monitoring_receipt`
10. `war_room_report_receipt`

Each receipt must include:

- `receipt_id`
- `created_at`
- `agent_id`
- `channel_id`
- `run_id`
- `task_id`
- `payload_hash`
- `evidence_hash`
- `policy_version`
- `soul_version`
- `dry_run`
- `external_mutation_performed`
- `idempotency_key`
- parent receipt link

Provider-facing receipts additionally include:

- provider name
- provider response class
- external ID, if any
- published/readback URL, if any
- redacted response hash

## Watchdog rules

- 1 missed heartbeat: mark agent `degraded`.
- 2 missed heartbeats: pause new dispatch for that agent/channel.
- 3 missed heartbeats or expired lease: force `draft_only`, cancel scheduled autonomous actions, and alert War Room.
- Stale heartbeat before dispatch: block external action.
- Any unclassified exception during external dispatch: activate channel cooldown and require human review before retry.

## Kill switch rules

Required kill switches:

- global autonomy kill switch;
- per-channel kill switch;
- per-agent pause flag.

Rules:

- Missing kill-switch state equals active.
- Kill switch is checked before every external mutation and retry.
- Active kill switch forces `draft_only` or `blocked`.
- Adapter must refuse external mutation when kill switch is active even if caller requests publish.
- Activation writes a `kill_switch_receipt`.

## Rollback rules

Every autonomous public action must have a rollback plan before dispatch.

Plan includes:

1. affected `channel_publication` row;
2. provider ID / URL;
3. whether delete/hide is technically available;
4. whether autonomous delete/hide is pre-authorized;
5. correction/escalation path if delete/hide is unavailable;
6. monitoring window;
7. owner for incident review.

Autonomous rollback can only delete/hide if the channel policy explicitly allows it. Corrections involving reputation, disputes, legal claims, or admissions remain Trust-gated.

## Promotion drill requirements

Before bounded full autonomy:

- 7 consecutive dry-run days;
- heartbeat expiry drill passes;
- kill-switch drill passes;
- duplicate publish replay blocks correctly;
- provider timeout does not retry/publish twice;
- rollback dry-run passes;
- first controlled live canary has full receipt chain and no trust incident.

## Orchestrator oversight

Hermes/Workplane oversight remains responsible for:

- enabling/disabling autonomy mode;
- setting promotion state;
- inspecting heartbeats;
- pausing or killing agents;
- reviewing escalation packets;
- summarizing War Room state;
- preserving safety gates.

Channel heads own their channels. Hermes owns the system boundary.
