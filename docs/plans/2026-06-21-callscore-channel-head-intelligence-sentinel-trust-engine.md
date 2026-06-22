# CallScore Channel-Head Intelligence, Sentinel, and Trust Engine Implementation Plan

> **For Hermes:** This is a planning-only Kanban deliverable. Do not implement production runtime changes from this card. Use task-router -> writing-plans -> test-driven-development -> parent verification when executing the follow-up implementation cards.

**Goal:** Move CallScore from governed cron/queue rails toward bounded autonomous channel-head agents with higher intelligence, fresh-call/creator discovery sentinels, and a no-founder trust engine.

**Architecture:** Reuse the existing CallScore substrate first: Workplane gates, `pipeline_*`, workflow/artifact ledgers, migration `024-agent-autonomy-ledger.sql`, channel tasks, receipts, and the GTM registry. Add canonical TypeScript/Zod runtime contracts before adding behavior. Channel heads may decide, draft, monitor, suppress, or request gates; restricted live actions remain fail-closed.

**Tech stack:** TypeScript, Node 20, Zod v4, node:test, existing PostgreSQL-backed ledgers, existing Workplane/Hermes/channel task rails. Pydantic/Instructor is optional only at Python verifier/LLM sidecar boundaries; TypeScript must revalidate every returned payload with Zod before persistence or dispatch.

---

## 0. Status: BUILT / PARTIAL / NOT BUILT

| Layer | Status | Evidence in repo | Honest detail |
|---|---|---|---|
| Channel-head souls | BUILT | `docs/ops/callscore-channel-head-souls.yaml` | Eight persistent-capable heads have identity, mission, taste, bounded authority, memory policy, cadence, reads, outputs, and stop conditions. |
| Heartbeat contract | BUILT | `docs/ops/callscore-full-autonomy-heartbeat-contract.md` | Defines required packet, modes, dispatch preflight, receipt chain, watchdog, kill switch, rollback, and promotion drills. |
| Autonomy ledger migration | BUILT | `migrations/024-agent-autonomy-ledger.sql` | Additive tables exist for `agent_instances`, `agent_heartbeats`, `channel_tasks`, `autonomy_events`, `channel_publications`, `approval_packets`, `experiment_memory`, and `incidents`. Production DB mutation still requires explicit approval. |
| Agent heartbeat script | BUILT | `src/scripts/callscore-agent-heartbeat.ts`, npm `agents:heartbeat` | Registers agents from souls YAML, writes heartbeat rows, upserts bounded channel tasks, writes local receipts. This is liveness/queue seeding, not full agent intelligence. |
| Channel task execution rail | BUILT | `src/lib/channel-agent-tasks.ts`, `tests/channel-agent-tasks.test.ts` | Claims `channel_tasks` safely with `FOR UPDATE SKIP LOCKED`, maps tasks to safe Workplane jobs, writes execution receipts, forces `external_mutation_performed=false`. |
| ML verifier no-founder trust decision | PARTIAL | `src/lib/ml-verifier.ts`, `tests/ml-verifier.test.ts`, `src/scripts/ml-verifier-quality-gate.ts`, `tests/ml-verifier-quality-gate.test.ts` | Existing logic derives `publish | suppress | review` for verifier candidates and keeps founder review at zero. It is not yet a shared canonical `TrustDecisionSchema` used across video, score, profile, report, and sentinel paths. |
| Video intelligence publication decisions | PARTIAL | `src/lib/workflows/video-intelligence.ts`, `tests/video-intelligence-workflow.test.ts` | Workflow emits `publication_decision` artifacts with publish/suppress/review behavior and non-founder review gates. It is not yet wired to shared autonomy schemas or broader public page/profile/scoring gates. |
| CMO response learning monitor | BUILT | `src/scripts/callscore-cmo-response-monitor.ts`, `tests/callscore-cmo-response-monitor.test.ts`, npm `cmo:response-monitor` | Read-only monitor summarizes owned-public receipts and explicitly avoids replies, DMs, spend, provider writes, Whop mutation, DB/deploy/infra mutation. |
| Freshness/data sentinel | PARTIAL | `src/scripts/callscore-freshness-check.ts`, `tests/freshness-check.test.ts`, `src/lib/autonomy-status.ts` | Freshness checks are read-only and autonomy status can inspect production truth. There is no canonical `FreshCallDiscoveryEventSchema` / `SentinelRunReceiptSchema` yet. |
| Fresh-call / creator discovery sentinel | NOT BUILT | N/A | Existing `discover:videos:rss-api`, transcript worklist, and pipeline jobs can be reused, but no sentinel contract yet unifies dedupe, cooldown, receipt, and review/suppression decisions. |
| Channel-head decision contract | NOT BUILT | N/A | Heads do not yet emit a canonical `act | suppress | wait | request_gate | escalate_non_founder_review` decision object. |
| Autonomy receipt contract | NOT BUILT | N/A | Receipts exist in multiple shapes, but no shared `AutonomyReceiptSchema` enforces cross-head payload hash, evidence hash, gate, mutation flags, and parent receipt linkage. |
| Persistent autonomous channel-head intelligence | NOT BUILT | N/A | Current rails seed tasks and run Workplane jobs. They are not independent long-lived actors with policy-aware planning, learned taste, or guarded dispatch beyond dry-run/safe receipts. |
| LangGraph control plane | NOT BUILT / SPIKE ONLY | N/A | LangGraph is not canonical. It may be spiked only if it reduces node orchestration complexity without creating a second control plane or bypassing Workplane/ledger/gates. |
| Headroom autonomy logic | NOT BUILT / NOT DESIRED | N/A | Headroom is context/log plumbing and retrieval safety, not autonomy decision logic, not a scheduler, not a gate engine, and not an agent identity layer. |

## 1. Non-negotiable constraints

1. Zod is canonical for all TypeScript runtime contracts.
2. Pydantic/Instructor may be used only inside Python verifier or LLM sidecar boundaries. Any sidecar output must be revalidated by TypeScript Zod before persistence, scoring, public visibility, or dispatch.
3. LangGraph is spike-only unless a short proof shows it improves orchestration without creating a second control plane, second event ledger, second gate system, or bypass around Workplane/Hermes.
4. Headroom is context/log plumbing only. It must not make autonomy decisions, expand authority, bypass gates, or become a hidden control plane.
5. Restricted actions remain gated: Whop financial/customer/payment/provider mutations, provider spend/paid APIs, production DB writes/schema changes/backfills, deploy/infra changes, credential access/rotation, email/DM/outreach/newsletter sends, non-owned posting, and public claims outside policy.
6. No production implementation is included in this planning card.
7. No `.env` values, tokens, cookies, DB URLs, customer/payment data, provider payload secrets, or private credentials may be printed in logs, docs, receipts, or test fixtures.
8. Cron jobs are not agents. A channel head must have identity, bounded authority, governance, memory, cadence, stop conditions, and taste before it can be called an autonomous actor.

## 2. Target files for implementation follow-up

Create:
- `src/lib/autonomy/contracts.ts` — canonical Zod schemas and inferred TypeScript types.
- `tests/autonomy-contracts.test.ts` — pure contract tests for schemas, passthrough/strict behavior, and enum fail-closed behavior.
- `src/lib/autonomy/channel-head-decisions.ts` — helpers for constructing validated decisions from head inputs.
- `tests/channel-head-decisions.test.ts` — decision mapping tests.
- `src/lib/autonomy/fresh-call-sentinel.ts` — sentinel event builder, dedupe key, cooldown checks, receipt builder.
- `tests/fresh-call-sentinel.test.ts` — sentinel/dedupe/cooldown tests.
- `src/lib/autonomy/trust-decisions.ts` — shared no-founder `publish | suppress | review` helpers used by ML verifier/video/profile/report paths.
- `tests/trust-decisions.test.ts` — trust routing tests.
- `src/lib/autonomy/receipts.ts` — shared autonomy receipt builder and hash helpers.
- `tests/autonomy-receipts.test.ts` — receipt/hash/parent-chain tests.

Modify only after contract tests are green:
- `src/lib/ml-verifier.ts` — parse existing `deriveMlVerifierTrustDecision()` output through `TrustDecisionSchema`.
- `src/lib/workflows/video-intelligence.ts` — write `publication_decision` using `TrustDecisionSchema` and review packets using `NonFounderReviewItemSchema`.
- `src/scripts/callscore-agent-heartbeat.ts` — validate heartbeat-derived task decisions and receipts through `ChannelHeadInputSnapshotSchema`, `ChannelHeadDecisionSchema`, and `AutonomyReceiptSchema`; do not add external mutation.
- `src/lib/channel-agent-tasks.ts` — validate task result receipt through `AutonomyReceiptSchema`; keep `external_mutation_performed=false` unless a later gated adapter card explicitly changes it.
- `src/scripts/callscore-freshness-check.ts` or new sentinel module only — emit `SentinelRunReceiptSchema` for read-only sentinel runs.
- `package.json` only if adding narrow scripts is justified; default verification should use direct `node --import tsx --test ...` commands first.

Do not modify in this plan card:
- Production database data.
- Production scheduler/timers.
- Whop provider state.
- Netlify/deploy configuration.
- Credentials or env files.

## 3. Canonical Zod schemas to add

Add the following in `src/lib/autonomy/contracts.ts`. The code below is the intended contract source; implementation should copy it, then adjust only if tests demonstrate a mismatch with existing row shapes.

```ts
import { z } from "zod";

export const IsoTimestampSchema = z.string().datetime({ offset: true });
export const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const NonEmptyStringSchema = z.string().trim().min(1);
export const ZeroToOneSchema = z.number().finite().min(0).max(1);

export const RestrictedGateSchema = z.enum([
  "SEND_GATE",
  "SPEND_GATE",
  "FINANCIAL_GATE",
  "PRODUCTION_GATE",
  "SECRET_GATE",
  "PUBLISH_GATE",
  "NON_FOUNDER_TRUST_REVIEW",
]);

export const ChannelHeadDecisionValueSchema = z.enum([
  "act",
  "suppress",
  "wait",
  "request_gate",
  "escalate_non_founder_review",
]);

export const ChannelHeadActionTypeSchema = z.enum([
  "observe",
  "draft",
  "generate_evidence_packet",
  "run_compliance_lint",
  "create_approval_packet",
  "publish_owned_public",
  "monitor_read_only",
  "readback_verify",
  "rollback_request",
  "create_non_founder_review_item",
  "sleep",
]);

export const TrustDecisionValueSchema = z.enum(["publish", "suppress", "review"]);

export const EvidenceLevelSchema = z.enum(["E0", "E1", "E2", "E3", "E4", "E5"]);

export const ChannelHeadInputSnapshotSchema = z.object({
  schema_version: z.literal("callscore_channel_head_input_snapshot.v1"),
  snapshot_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  agent_id: NonEmptyStringSchema,
  channel_id: NonEmptyStringSchema,
  autonomy_mode: z.enum(["controlled_full", "full_autonomous_bounded", "draft_only", "disabled"]),
  soul_version: NonEmptyStringSchema,
  policy_version: NonEmptyStringSchema,
  workplane: z.object({
    status: z.enum(["OK", "WARN", "BLOCKED", "UNKNOWN"]),
    automation_readiness: z.string().optional(),
    checked_at: IsoTimestampSchema.optional(),
    blockers: z.array(NonEmptyStringSchema).default([]),
  }),
  gtm_registry: z.object({
    lane_id: NonEmptyStringSchema,
    current_status: NonEmptyStringSchema,
    required_gate: z.union([RestrictedGateSchema, z.literal("NONE")]),
    required_receipt: NonEmptyStringSchema.optional(),
    rollback_path: NonEmptyStringSchema.optional(),
    owned_or_managed: z.boolean(),
    zero_spend_required: z.boolean().default(true),
    allowed_actions: z.array(NonEmptyStringSchema).default([]),
    forbidden_actions: z.array(NonEmptyStringSchema).default([]),
  }),
  freshness: z.object({
    status: z.enum(["fresh", "stale", "cooldown", "unknown"]),
    claim_bearing_allowed: z.boolean(),
    latest_pipeline_run_id: z.string().nullable().optional(),
    blockers: z.array(NonEmptyStringSchema).default([]),
  }),
  evidence: z.object({
    evidence_level: EvidenceLevelSchema,
    evidence_hash: Sha256Schema.nullable(),
    source_artifact_ids: z.array(NonEmptyStringSchema).default([]),
    public_claims_supported: z.boolean(),
  }),
  kill_switch: z.object({
    global_active: z.boolean(),
    channel_active: z.boolean(),
    agent_paused: z.boolean(),
    missing_state_blocks_dispatch: z.boolean().default(true),
  }),
  heartbeat: z.object({
    heartbeat_id: NonEmptyStringSchema.nullable(),
    fresh: z.boolean(),
    lease_expires_at: IsoTimestampSchema.nullable(),
  }),
  cooldowns: z.object({
    channel_cooldown_active: z.boolean().default(false),
    provider_error_cooldown_active: z.boolean().default(false),
    duplicate_payload_cooldown_active: z.boolean().default(false),
  }),
  caps: z.object({
    channel_posts_today: z.number().int().nonnegative().default(0),
    max_channel_posts_per_day: z.number().int().nonnegative().default(1),
    total_posts_today: z.number().int().nonnegative().default(0),
    max_total_posts_per_day: z.number().int().nonnegative().default(3),
    external_mutations_in_flight: z.number().int().nonnegative().default(0),
    max_external_mutations_in_flight: z.number().int().nonnegative().default(1),
  }),
  public_verify: z.object({
    status: z.enum(["pass", "fail", "unknown"]),
    checked_at: IsoTimestampSchema.optional(),
  }),
  prior_receipt_ids: z.array(NonEmptyStringSchema).default([]),
}).strict();

export const ChannelHeadActionSchema = z.object({
  schema_version: z.literal("callscore_channel_head_action.v1"),
  action_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  agent_id: NonEmptyStringSchema,
  channel_id: NonEmptyStringSchema,
  action_type: ChannelHeadActionTypeSchema,
  dry_run: z.boolean().default(true),
  external_mutation_requested: z.boolean().default(false),
  external_mutation_performed: z.boolean().default(false),
  restricted_gate_required: RestrictedGateSchema.nullable().default(null),
  payload_hash: Sha256Schema.nullable().default(null),
  evidence_hash: Sha256Schema.nullable().default(null),
  idempotency_key: NonEmptyStringSchema,
  parent_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  rollback_path: NonEmptyStringSchema.nullable().default(null),
  provider: z.string().nullable().default(null),
  provider_operation: z.string().nullable().default(null),
  reason: NonEmptyStringSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if (value.external_mutation_performed && value.dry_run) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["external_mutation_performed"], message: "dry_run actions cannot perform external mutations" });
  }
  if (value.action_type === "publish_owned_public" && !value.payload_hash) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["payload_hash"], message: "publish actions require payload_hash" });
  }
});

export const ChannelHeadDecisionSchema = z.object({
  schema_version: z.literal("callscore_channel_head_decision.v1"),
  decision_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  agent_id: NonEmptyStringSchema,
  channel_id: NonEmptyStringSchema,
  task_id: z.string().nullable().default(null),
  input_snapshot_id: NonEmptyStringSchema,
  decision: ChannelHeadDecisionValueSchema,
  confidence: ZeroToOneSchema,
  reason_codes: z.array(NonEmptyStringSchema).min(1),
  explanation: NonEmptyStringSchema,
  proposed_action: ChannelHeadActionSchema.nullable().default(null),
  gate_required: RestrictedGateSchema.nullable().default(null),
  non_founder_review_required: z.boolean().default(false),
  suppress_until: IsoTimestampSchema.nullable().default(null),
  wait_until: IsoTimestampSchema.nullable().default(null),
  blockers: z.array(NonEmptyStringSchema).default([]),
  receipts_to_write: z.array(NonEmptyStringSchema).default([]),
  next_wake_at: IsoTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if (value.decision === "act" && !value.proposed_action) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proposed_action"], message: "act decisions require proposed_action" });
  }
  if (value.decision === "request_gate" && !value.gate_required) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gate_required"], message: "request_gate decisions require gate_required" });
  }
  if (value.decision === "escalate_non_founder_review" && !value.non_founder_review_required) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["non_founder_review_required"], message: "non-founder escalation must set non_founder_review_required" });
  }
});

export const FreshCallDiscoveryEventSchema = z.object({
  schema_version: z.literal("callscore_fresh_call_discovery_event.v1"),
  event_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  source: z.enum(["youtube_rss", "youtube_api", "transcript_worklist", "manual_seed", "public_read_api", "pipeline_job"]),
  creator_id: z.union([z.string(), z.number()]).nullable(),
  creator_handle: z.string().nullable().default(null),
  video_id: z.union([z.string(), z.number()]).nullable().default(null),
  youtube_video_id: z.string().nullable().default(null),
  published_at: IsoTimestampSchema.nullable().default(null),
  transcript_status: z.enum(["missing", "queued", "ready", "cooldown", "failed", "not_required"]),
  candidate_call_count: z.number().int().nonnegative().default(0),
  evidence_level: EvidenceLevelSchema.default("E0"),
  dedupe_key: NonEmptyStringSchema,
  payload_hash: Sha256Schema,
  cooldown: z.object({
    active: z.boolean(),
    reason: z.string().nullable().default(null),
    until: IsoTimestampSchema.nullable().default(null),
  }),
  decision: z.enum(["enqueue_extract", "suppress_duplicate", "wait_cooldown", "review_source_identity", "ignore_no_call_signal"]),
  reason_codes: z.array(NonEmptyStringSchema).min(1),
}).strict();

export const SentinelRunReceiptSchema = z.object({
  schema_version: z.literal("callscore_sentinel_run_receipt.v1"),
  receipt_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  sentinel_id: NonEmptyStringSchema,
  mode: z.enum(["read_only", "dry_run_enqueue", "blocked"]),
  input_hash: Sha256Schema,
  events_seen: z.number().int().nonnegative(),
  events_new: z.number().int().nonnegative(),
  events_duplicate: z.number().int().nonnegative(),
  events_cooldown_blocked: z.number().int().nonnegative(),
  tasks_enqueued: z.number().int().nonnegative().default(0),
  production_mutation_performed: z.literal(false),
  provider_mutation_performed: z.literal(false),
  external_send_performed: z.literal(false),
  cooldowns_respected: z.boolean(),
  dedupe_keys: z.array(NonEmptyStringSchema).default([]),
  blocker: z.string().nullable().default(null),
  artifact_path: NonEmptyStringSchema,
}).strict();

export const TrustDecisionSchema = z.object({
  schema_version: z.literal("callscore_trust_decision.v1"),
  decision_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  entity_type: z.enum(["call", "video", "creator", "leaderboard", "profile", "report", "badge", "seo_page", "outreach_draft"]),
  entity_id: z.union([z.string(), z.number()]),
  decision: TrustDecisionValueSchema,
  confidence: ZeroToOneSchema,
  evidence_level: EvidenceLevelSchema,
  evidence_hash: Sha256Schema.nullable().default(null),
  suppress_from_public_scoring: z.boolean(),
  public_visibility_allowed: z.boolean(),
  non_founder_review_required: z.boolean().default(false),
  founder_review_required: z.literal(false),
  reason_codes: z.array(NonEmptyStringSchema).min(1),
  reviewer_role: z.enum(["none", "trust_ops_reviewer", "data_qa_reviewer", "growth_operator"]).default("none"),
  expires_at: IsoTimestampSchema.nullable().default(null),
  source_artifact_ids: z.array(NonEmptyStringSchema).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.decision === "publish" && !value.public_visibility_allowed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["public_visibility_allowed"], message: "publish requires public_visibility_allowed" });
  }
  if (value.decision === "suppress" && !value.suppress_from_public_scoring) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suppress_from_public_scoring"], message: "suppress must suppress public scoring" });
  }
  if (value.decision === "review" && !value.non_founder_review_required) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["non_founder_review_required"], message: "review must route to non-founder review" });
  }
});

export const NonFounderReviewItemSchema = z.object({
  schema_version: z.literal("callscore_non_founder_review_item.v1"),
  review_item_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  queue: z.enum(["trust_ops", "data_qa", "growth_ops"]),
  reviewer_role: z.enum(["trust_ops_reviewer", "data_qa_reviewer", "growth_operator"]),
  entity_type: TrustDecisionSchema.shape.entity_type,
  entity_id: z.union([z.string(), z.number()]),
  risk_class: z.enum(["low", "medium", "high", "critical"]),
  due_at: IsoTimestampSchema,
  trust_decision_id: NonEmptyStringSchema,
  artifact_ids: z.array(NonEmptyStringSchema).min(1),
  payload_hash: Sha256Schema,
  allowed_reviewer_actions: z.array(z.enum(["approve_publish", "keep_suppressed", "request_more_evidence", "restore_after_suppression", "reject"])).min(1),
  founder_escalation_allowed: z.literal(false),
  restricted_action_gate_required: RestrictedGateSchema.nullable().default(null),
  status: z.enum(["open", "in_review", "resolved", "expired", "blocked"]).default("open"),
}).strict();

export const AutonomyReceiptSchema = z.object({
  schema_version: z.literal("callscore_autonomy_receipt.v1"),
  receipt_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  agent_id: NonEmptyStringSchema,
  channel_id: z.string().nullable().default(null),
  run_id: z.string().nullable().default(null),
  task_id: z.string().nullable().default(null),
  receipt_type: z.enum([
    "input_snapshot",
    "decision",
    "action_preflight",
    "evidence",
    "risk_review",
    "compliance",
    "sentinel_run",
    "trust_decision",
    "non_founder_review_item",
    "monitoring",
    "blocked",
    "war_room_report",
  ]),
  status: z.enum(["succeeded", "blocked", "suppressed", "review", "failed", "dry_run"]),
  payload_hash: Sha256Schema.nullable().default(null),
  evidence_hash: Sha256Schema.nullable().default(null),
  policy_version: NonEmptyStringSchema,
  soul_version: NonEmptyStringSchema.nullable().default(null),
  dry_run: z.boolean().default(true),
  external_mutation_performed: z.boolean().default(false),
  provider_mutation_performed: z.boolean().default(false),
  whop_mutation_performed: z.boolean().default(false),
  production_mutation_performed: z.boolean().default(false),
  send_or_outreach_performed: z.boolean().default(false),
  gate_required: RestrictedGateSchema.nullable().default(null),
  gate_receipt_id: z.string().nullable().default(null),
  idempotency_key: z.string().nullable().default(null),
  parent_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  artifact_path: z.string().nullable().default(null),
  rollback_path: z.string().nullable().default(null),
  summary: NonEmptyStringSchema,
  detail: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  const anyMutation = value.external_mutation_performed || value.provider_mutation_performed || value.whop_mutation_performed || value.production_mutation_performed || value.send_or_outreach_performed;
  if (anyMutation && value.dry_run) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dry_run"], message: "mutation receipts cannot be dry_run" });
  }
  if ((value.whop_mutation_performed || value.production_mutation_performed || value.send_or_outreach_performed) && !value.gate_receipt_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gate_receipt_id"], message: "restricted mutations require gate receipt" });
  }
});

export type ChannelHeadInputSnapshot = z.infer<typeof ChannelHeadInputSnapshotSchema>;
export type ChannelHeadAction = z.infer<typeof ChannelHeadActionSchema>;
export type ChannelHeadDecision = z.infer<typeof ChannelHeadDecisionSchema>;
export type FreshCallDiscoveryEvent = z.infer<typeof FreshCallDiscoveryEventSchema>;
export type SentinelRunReceipt = z.infer<typeof SentinelRunReceiptSchema>;
export type TrustDecision = z.infer<typeof TrustDecisionSchema>;
export type NonFounderReviewItem = z.infer<typeof NonFounderReviewItemSchema>;
export type AutonomyReceipt = z.infer<typeof AutonomyReceiptSchema>;
```

## 4. No-founder trust decision contract

Canonical decision enum: `publish | suppress | review`.

| Decision | Meaning | Allowed next step | Required behavior |
|---|---|---|---|
| `publish` | Evidence is high-confidence, policy-safe, and public visibility is allowed. | Public scoring/profile/report path may proceed, still behind channel/action gates if external publication is involved. | `public_visibility_allowed=true`, `suppress_from_public_scoring=false`, `founder_review_required=false`. |
| `suppress` | Evidence is weak, invalid, stale, ambiguous, disputed, or unsafe. | Exclude from public scoring/claims; write suppression artifact/receipt. | `suppress_from_public_scoring=true`, no founder escalation, no public visibility. |
| `review` | Medium-confidence/high-impact ambiguity needs a non-founder reviewer. | Create `NonFounderReviewItemSchema`; workflow may block on `approval_gates.gate_type='non_founder_trust_review'`. | `non_founder_review_required=true`, `founder_review_required=false`, reviewer role must be one of Trust Ops, Data QA, Growth Operator. |

Initial mapping from existing verifier behavior:
- High-confidence `approve + valid_call` -> `publish`.
- Terminal invalid reasons (`missing_evidence`, `quote_not_in_transcript`, `non_actionable`, `ambiguous_ticker`, `model_timeout`, `malformed_model_output`, `model_provider_error`) -> `suppress`.
- Medium-confidence ambiguous `review + unclear` with enough evidence to inspect -> `review`, non-founder only.
- Low-confidence approval -> `suppress`, not review.

Implementation must preserve the existing invariant already tested in `tests/ml-verifier.test.ts`: `founder_review_required` remains `false`/`0` for all verifier outcomes.

## 5. Fresh-call discovery sentinel contract

Purpose: discover fresh creator/video/call candidates and decide whether to enqueue extraction, suppress duplicates, wait for cooldown, route source identity to review, or ignore no-call signals.

Canonical event: `FreshCallDiscoveryEventSchema`.

Input sources, in priority order:
1. Existing `discover:videos:rss-api` output and `videos` rows.
2. Transcript worklist state from existing transcript scripts.
3. Pipeline events for newly transcript-ready videos.
4. Existing public/read-only status surfaces.
5. Manual seed artifacts only when explicitly operator-provided and non-secret.

Dedupe guarantees:
- `dedupe_key = source + ':' + creator_or_channel + ':' + external_video_or_post_id + ':' + schema_version`.
- `payload_hash = sha256:` over normalized source payload after redacting secrets/private fields.
- If the same `dedupe_key` is seen inside an open or completed run window, event decision must be `suppress_duplicate` and `tasks_enqueued=0`.
- If the payload hash changes for the same external ID, create an event but route to `review_source_identity` unless the change is known-safe metadata drift.
- The sentinel must never enqueue two extraction jobs with the same idempotency key.

Cooldown guarantees:
- Provider HTTP 429/transcript cooldown -> event decision `wait_cooldown`, no provider retry, no transcript hammering.
- Workplane not OK, public verify fail, or freshness blocker -> no claim-bearing publish path; sentinel may still log read-only blocked receipt.
- Provider error cooldown is at least 24h unless a future registry row explicitly narrows it with evidence; this is the provider error cooldown guard and the canonical field is `provider_error_cooldown_active`.
- Missing or ambiguous creator/source identity routes to `review_source_identity`, never auto-publish.

Receipt guarantees:
- Every run writes `SentinelRunReceiptSchema` with `production_mutation_performed=false`, `provider_mutation_performed=false`, and `external_send_performed=false`.
- Dry-run enqueue is allowed only for local queue rows explicitly marked as dry-run. Production DB writes require separate approval and are outside this planning card.

## 6. Channel-head decision contract

Canonical decision enum: `act | suppress | wait | request_gate | escalate_non_founder_review`.

| Decision | Meaning | Examples | Required schema guard |
|---|---|---|---|
| `act` | A safe action is allowed inside current authority. | Draft, evidence packet, read-only monitor, dry-run receipt, or later gated owned-public publish. | Must include `proposed_action`; publish action requires payload hash and all preflight inputs passing. |
| `suppress` | The head should block output due to risk, duplicate, stale data, cooldown, missing evidence, or policy fail. | Duplicate post payload, stale data, unsupported named claim. | Must include reason code and optional `suppress_until`. |
| `wait` | No safe work now; sleep until a later time. | Daily cap reached, cooldown active, waiting for pipeline freshness. | Must include `wait_until` or `next_wake_at`. |
| `request_gate` | The next action is restricted and needs an explicit gate receipt. | Send, Whop financial/provider mutation, production DB/deploy/infra, credential, paid spend. | Must include `gate_required`; no mutation before gate receipt. |
| `escalate_non_founder_review` | Trust/data/growth ambiguity needs non-founder review, not Omar. | Medium-confidence creator/profile/call/public claim ambiguity. | Must set `non_founder_review_required=true` and create a review item. |

Decision preflight must read and hash:
- Workplane status.
- GTM registry row.
- Souls YAML version/hash.
- Freshness/public verify status.
- Evidence artifact IDs and evidence hash.
- Prior receipts for dedupe/cooldown.
- Heartbeat freshness and lease.
- Kill switch state.
- Daily caps and in-flight mutation count.

## 7. Implementation task graph

### Phase 1 — Contract foundation, no behavior change

Objective: add shared Zod contracts and pure tests.

Files:
- Create `src/lib/autonomy/contracts.ts`.
- Create `tests/autonomy-contracts.test.ts`.

RED tests:
- Valid minimal `TrustDecisionSchema` publish/suppress/review fixtures parse.
- `review` without `non_founder_review_required=true` fails.
- `suppress` without `suppress_from_public_scoring=true` fails.
- `request_gate` channel-head decision without `gate_required` fails.
- Dry-run action with `external_mutation_performed=true` fails.
- Restricted autonomy receipt with Whop/production/send mutation and no `gate_receipt_id` fails.
- Unknown enum values fail closed.

Commands:
- RED: `node --import tsx --test tests/autonomy-contracts.test.ts`
- GREEN: `node --import tsx --test tests/autonomy-contracts.test.ts`
- Integration gate: `npm run typecheck`

Acceptance:
- Zod schemas compile and tests pass.
- No production behavior changed.

### Phase 2 — Trust decision helper integration

Objective: make existing verifier/video trust decisions pass through the shared schema.

Files:
- Create `src/lib/autonomy/trust-decisions.ts`.
- Create `tests/trust-decisions.test.ts`.
- Modify `src/lib/ml-verifier.ts` narrowly.
- Modify `src/lib/workflows/video-intelligence.ts` narrowly.

RED tests:
- Existing high-confidence verifier approval maps to valid `TrustDecisionSchema` publish.
- Existing missing evidence maps to valid suppress.
- Existing unclear medium-confidence maps to valid review + `NonFounderReviewItemSchema`.
- `founder_review_required` is always false.

Commands:
- `node --import tsx --test tests/trust-decisions.test.ts tests/ml-verifier.test.ts tests/video-intelligence-workflow.test.ts`
- `npm run typecheck`

Acceptance:
- Existing tests keep passing.
- `publication_decision` artifact shape is either migrated to or wrapped by `TrustDecisionSchema` without breaking artifact chain tests.

### Phase 3 — Channel-head input snapshot and decision helper

Objective: build a deterministic decision helper for current dry-run/read-only heads.

Files:
- Create `src/lib/autonomy/channel-head-decisions.ts`.
- Create `tests/channel-head-decisions.test.ts`.
- Optionally modify `src/scripts/callscore-agent-heartbeat.ts` only to validate generated snapshot/decision receipts; no behavior expansion.

RED tests:
- Workplane `BLOCKED` -> `suppress` or `wait`, never `act`.
- Missing kill switch state -> `suppress`/blocked.
- Stale heartbeat before dispatch -> `suppress`/blocked.
- Daily cap reached -> `wait`.
- Restricted lane action -> `request_gate`.
- Medium-confidence trust ambiguity -> `escalate_non_founder_review`.
- Safe read-only monitor -> `act` with action type `monitor_read_only`, mutation flags false.

Commands:
- `node --import tsx --test tests/channel-head-decisions.test.ts tests/channel-agent-tasks.test.ts`
- `npm run typecheck`

Acceptance:
- Channel-head decisions are deterministic and schema-validated.
- No external mutation enabled.

### Phase 4 — Fresh-call discovery sentinel contract

Objective: add read-only event/receipt generation for discovery signals with dedupe/cooldown guarantees.

Files:
- Create `src/lib/autonomy/fresh-call-sentinel.ts`.
- Create `tests/fresh-call-sentinel.test.ts`.
- Modify `src/scripts/callscore-freshness-check.ts` only if needed to export reusable read-only status helpers.

RED tests:
- New video/source event with no cooldown -> `enqueue_extract` in dry-run mode.
- Duplicate `dedupe_key` -> `suppress_duplicate`, `tasks_enqueued=0`.
- Provider cooldown -> `wait_cooldown`, `tasks_enqueued=0`.
- Ambiguous creator/source -> `review_source_identity`.
- Sentinel receipt always has mutation/send/provider flags false.

Commands:
- `node --import tsx --test tests/fresh-call-sentinel.test.ts tests/freshness-check.test.ts`
- `npm run typecheck`

Acceptance:
- Dedupe and cooldown are proven by tests.
- The sentinel does not write production DB or contact providers in this phase.

### Phase 5 — Autonomy receipt unification

Objective: validate heartbeat, channel task, sentinel, trust, and monitor receipts with one shared contract.

Files:
- Create `src/lib/autonomy/receipts.ts`.
- Create `tests/autonomy-receipts.test.ts`.
- Modify `src/lib/channel-agent-tasks.ts`, `src/scripts/callscore-cmo-response-monitor.ts`, and `src/scripts/callscore-agent-heartbeat.ts` narrowly if needed to emit a compatible `AutonomyReceiptSchema` wrapper.

RED tests:
- Receipt with secret-like detail key is rejected or redacted by builder.
- Parent receipt chain accepts known parent IDs.
- Any dry-run receipt with mutation flag true fails.
- `cmo:response-monitor` receipt remains read-only.
- Channel task result remains no external/provider/Whop/production mutation.

Commands:
- `node --import tsx --test tests/autonomy-receipts.test.ts tests/callscore-cmo-response-monitor.test.ts tests/channel-agent-tasks.test.ts`
- `npm run typecheck`

Acceptance:
- Receipt wrappers validate without weakening existing safety flags.

### Phase 6 — Full local verification for implementation branch

Commands:
- `node --import tsx --test tests/autonomy-contracts.test.ts tests/trust-decisions.test.ts tests/channel-head-decisions.test.ts tests/fresh-call-sentinel.test.ts tests/autonomy-receipts.test.ts tests/ml-verifier.test.ts tests/ml-verifier-quality-gate.test.ts tests/video-intelligence-workflow.test.ts tests/channel-agent-tasks.test.ts tests/freshness-check.test.ts tests/callscore-cmo-response-monitor.test.ts`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Acceptance:
- All commands pass or any pre-existing unrelated failure is documented with exact output.
- `git diff` contains only planned files.
- No `.env*` or secret-bearing files are touched.

## 8. Risks and blockers

| Blocker class | Risk | Mitigation |
|---|---|---|
| code | Existing verifier/video decision shapes may not exactly match new Zod schemas. | Wrap/normalize with minimum diff helpers; keep legacy fields if public APIs/tests depend on them. |
| code | Current receipts have multiple legacy schemas. | Add `AutonomyReceiptSchema` wrapper rather than rewriting every receipt in one pass. |
| code | Migration `024` tables exist, but contract schemas may need extra columns later. | Keep first implementation artifact-first and additive; do not mutate production DB in contract card. |
| external-tool | Provider readback/Composio may be unavailable for future live channel adapters. | This plan stops before live provider dispatch; adapter cards must use Composio-first and block on connection/tool gaps. |
| external-policy | Non-founder reviewers may not exist operationally yet. | Represent review queue as `approval_gates`/artifacts first; role names are contracts, not staffing claims. |
| operator-approval | Production DB migrations, deploys, Whop/provider/customer/payment actions, sends/outreach, spend, and credential operations require explicit approval. | Keep all implementation phases local/test/dry-run until separate approved cards exist. |

## 9. Built vs planned boundary

Built now:
- Souls YAML.
- Heartbeat contract doc.
- Agent autonomy ledger migration file.
- Heartbeat script that seeds agents/tasks.
- Channel task safe Workplane execution rail.
- ML verifier publish/suppress/review logic in existing domain shape.
- Video intelligence `publication_decision` artifacts.
- CMO read-only response monitor.

Planned by this document:
- Shared Zod contract module.
- Schema tests.
- Shared trust decision helper.
- Channel-head input/action/decision helper.
- Fresh-call sentinel event and receipt module.
- Autonomy receipt wrapper.
- Narrow integrations into existing scripts/workflows.

Not planned here:
- Starting persistent channel-head processes.
- Live owned-public publishing.
- Provider adapter dispatch.
- Production DB migrations or data writes.
- Netlify/deploy changes.
- Whop/provider/financial/customer/payment mutations.
- Email/DM/outreach/newsletter sends.

## 10. Definition of done for follow-up implementation

The implementation is complete only when:
1. All eight required schemas exist in `src/lib/autonomy/contracts.ts` and are exported with inferred types.
2. The exact test files named above exist and pass.
3. Existing tests for channel tasks, ML verifier, quality gate, video intelligence, freshness, and CMO still pass.
4. `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build` have been run and reported.
5. No production mutations occurred.
6. Restricted action gates remain fail-closed.
7. Any future live action has its own separate approval/receipt/rollback card.
