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

export const RiskClassSchema = z.enum([
  "safe_owned_public",
  "restricted_provider",
  "restricted_financial",
  "restricted_db_deploy",
  "restricted_credentials",
  "restricted_outreach",
  "public_claim_risk",
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

const isRestrictedMutationRisk = (riskClass: z.infer<typeof RiskClassSchema>): boolean => riskClass.startsWith("restricted_");
const isGateRequiredPublishRisk = (riskClass: z.infer<typeof RiskClassSchema>): boolean => isRestrictedMutationRisk(riskClass) || riskClass === "public_claim_risk";
const hasGateEvidence = (gateReceiptId: string | null | undefined): boolean => Boolean(gateReceiptId?.trim());
const SECRET_LIKE_DETAIL_KEY_PATTERN = /(?:^|[_-])(?:api[_-]?key|key|token|access[_-]?token|refresh[_-]?token|secret|client[_-]?secret|password|passwd|private[_-]?key|credential|cookie|authorization|auth[_-]?token|bearer[_-]?token)(?:$|[_-])/i;

function hasSecretLikeDetailKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasSecretLikeDetailKey(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
    const secretLikeKey = SECRET_LIKE_DETAIL_KEY_PATTERN.test(normalized);
    return (secretLikeKey && nested !== "[REDACTED]") || hasSecretLikeDetailKey(nested);
  });
}

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
  }).strict(),
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
  }).strict(),
  freshness: z.object({
    status: z.enum(["fresh", "stale", "cooldown", "unknown"]),
    claim_bearing_allowed: z.boolean(),
    latest_pipeline_run_id: z.string().nullable().optional(),
    blockers: z.array(NonEmptyStringSchema).default([]),
  }).strict(),
  evidence: z.object({
    evidence_level: EvidenceLevelSchema,
    evidence_hash: Sha256Schema.nullable(),
    source_artifact_ids: z.array(NonEmptyStringSchema).default([]),
    public_claims_supported: z.boolean(),
  }).strict(),
  kill_switch: z.object({
    global_active: z.boolean(),
    channel_active: z.boolean(),
    agent_paused: z.boolean(),
    missing_state_blocks_dispatch: z.boolean().default(true),
  }).strict(),
  heartbeat: z.object({
    heartbeat_id: NonEmptyStringSchema.nullable(),
    fresh: z.boolean(),
    lease_expires_at: IsoTimestampSchema.nullable(),
  }).strict(),
  cooldowns: z.object({
    channel_cooldown_active: z.boolean().default(false),
    provider_error_cooldown_active: z.boolean().default(false),
    duplicate_payload_cooldown_active: z.boolean().default(false),
  }).strict(),
  caps: z.object({
    channel_posts_today: z.number().int().nonnegative().default(0),
    max_channel_posts_per_day: z.number().int().nonnegative().default(1),
    total_posts_today: z.number().int().nonnegative().default(0),
    max_total_posts_per_day: z.number().int().nonnegative().default(3),
    external_mutations_in_flight: z.number().int().nonnegative().default(0),
    max_external_mutations_in_flight: z.number().int().nonnegative().default(1),
  }).strict(),
  public_verify: z.object({
    status: z.enum(["pass", "fail", "unknown"]),
    checked_at: IsoTimestampSchema.optional(),
  }).strict(),
  prior_receipt_ids: z.array(NonEmptyStringSchema).default([]),
}).strict();

export const ChannelHeadActionSchema = z.object({
  schema_version: z.literal("callscore_channel_head_action.v1"),
  action_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  agent_id: NonEmptyStringSchema,
  channel_id: NonEmptyStringSchema,
  action_type: ChannelHeadActionTypeSchema,
  risk_class: RiskClassSchema,
  dry_run: z.boolean().default(true),
  external_mutation_requested: z.boolean().default(false),
  external_mutation_performed: z.boolean().default(false),
  restricted_gate_required: RestrictedGateSchema.nullable().default(null),
  gate_receipt_id: NonEmptyStringSchema.nullable().default(null),
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
    ctx.addIssue({ code: "custom", path: ["external_mutation_performed"], message: "dry_run actions cannot perform external mutations" });
  }
  if (!value.payload_hash) {
    ctx.addIssue({ code: "custom", path: ["payload_hash"], message: "actions require payload_hash" });
  }
  if (!value.evidence_hash) {
    ctx.addIssue({ code: "custom", path: ["evidence_hash"], message: "actions require evidence_hash" });
  }
  if (isRestrictedMutationRisk(value.risk_class) && !hasGateEvidence(value.gate_receipt_id)) {
    ctx.addIssue({ code: "custom", path: ["gate_receipt_id"], message: "restricted mutation actions require explicit gate evidence" });
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
  risk_class: RiskClassSchema,
  decision: ChannelHeadDecisionValueSchema,
  confidence: ZeroToOneSchema,
  reason_codes: z.array(NonEmptyStringSchema).min(1),
  explanation: NonEmptyStringSchema,
  proposed_action: ChannelHeadActionSchema.nullable().default(null),
  gate_required: RestrictedGateSchema.nullable().default(null),
  gate_receipt_id: NonEmptyStringSchema.nullable().default(null),
  non_founder_review_required: z.boolean().default(false),
  suppress_until: IsoTimestampSchema.nullable().default(null),
  wait_until: IsoTimestampSchema.nullable().default(null),
  blockers: z.array(NonEmptyStringSchema).default([]),
  receipts_to_write: z.array(NonEmptyStringSchema).default([]),
  next_wake_at: IsoTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if (value.decision === "act" && !value.proposed_action) {
    ctx.addIssue({ code: "custom", path: ["proposed_action"], message: "act decisions require proposed_action" });
  }
  if (value.proposed_action && value.proposed_action.risk_class !== value.risk_class) {
    ctx.addIssue({ code: "custom", path: ["proposed_action", "risk_class"], message: "decision and proposed_action risk_class must match" });
  }
  if (value.decision === "request_gate" && !value.gate_required) {
    ctx.addIssue({ code: "custom", path: ["gate_required"], message: "request_gate decisions require gate_required" });
  }
  if (value.decision === "escalate_non_founder_review" && !value.non_founder_review_required) {
    ctx.addIssue({ code: "custom", path: ["non_founder_review_required"], message: "non-founder escalation must set non_founder_review_required" });
  }
  if (value.decision === "act" && (isRestrictedMutationRisk(value.risk_class) || (value.proposed_action && isRestrictedMutationRisk(value.proposed_action.risk_class))) && !hasGateEvidence(value.gate_receipt_id)) {
    ctx.addIssue({ code: "custom", path: ["gate_receipt_id"], message: "restricted act decisions require explicit gate evidence" });
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
  }).strict(),
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
  discovered_count: z.number().int().nonnegative().optional(),
  skipped_duplicate_count: z.number().int().nonnegative().optional(),
  skipped_cooldown_count: z.number().int().nonnegative().optional(),
  enqueued_count: z.number().int().nonnegative().optional(),
  recommended_count: z.number().int().nonnegative().optional(),
  production_mutation_performed: z.literal(false),
  provider_mutation_performed: z.literal(false),
  external_send_performed: z.literal(false),
  cooldowns_respected: z.boolean(),
  dedupe_keys: z.array(NonEmptyStringSchema).default([]),
  blockers: z.array(NonEmptyStringSchema).default([]),
  blocker: z.string().nullable().default(null),
  artifact_path: NonEmptyStringSchema,
  receipt_path: NonEmptyStringSchema.optional(),
}).strict();

export const TrustDecisionSchema = z.object({
  schema_version: z.literal("callscore_trust_decision.v1"),
  decision_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  entity_type: z.enum(["call", "video", "creator", "leaderboard", "profile", "report", "badge", "seo_page", "outreach_draft"]),
  entity_id: z.union([z.string(), z.number()]),
  risk_class: RiskClassSchema,
  decision: TrustDecisionValueSchema,
  confidence: ZeroToOneSchema,
  evidence_level: EvidenceLevelSchema,
  evidence_hash: Sha256Schema.nullable().default(null),
  gate_receipt_id: NonEmptyStringSchema.nullable().default(null),
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
    ctx.addIssue({ code: "custom", path: ["public_visibility_allowed"], message: "publish requires public_visibility_allowed" });
  }
  if (value.decision === "publish" && value.suppress_from_public_scoring) {
    ctx.addIssue({ code: "custom", path: ["suppress_from_public_scoring"], message: "publish cannot suppress public scoring" });
  }
  if (value.decision === "publish" && !value.evidence_hash) {
    ctx.addIssue({ code: "custom", path: ["evidence_hash"], message: "publish requires evidence_hash" });
  }
  if (value.decision === "publish" && value.evidence_level === "E0") {
    ctx.addIssue({ code: "custom", path: ["evidence_level"], message: "publish requires non-zero evidence level" });
  }
  if (value.decision === "publish" && value.source_artifact_ids.length === 0) {
    ctx.addIssue({ code: "custom", path: ["source_artifact_ids"], message: "publish requires source artifacts" });
  }
  if (value.decision === "publish" && isGateRequiredPublishRisk(value.risk_class) && !hasGateEvidence(value.gate_receipt_id)) {
    ctx.addIssue({ code: "custom", path: ["gate_receipt_id"], message: "restricted or public-claim publish decisions require explicit gate evidence" });
  }
  if (value.decision === "suppress" && !value.suppress_from_public_scoring) {
    ctx.addIssue({ code: "custom", path: ["suppress_from_public_scoring"], message: "suppress must suppress public scoring" });
  }
  if ((value.decision === "suppress" || value.decision === "review") && value.public_visibility_allowed) {
    ctx.addIssue({ code: "custom", path: ["public_visibility_allowed"], message: "suppress/review decisions cannot allow public visibility" });
  }
  if (value.decision === "review" && !value.non_founder_review_required) {
    ctx.addIssue({ code: "custom", path: ["non_founder_review_required"], message: "review must route to non-founder review" });
  }
  if (value.decision === "review" && value.reviewer_role === "none") {
    ctx.addIssue({ code: "custom", path: ["reviewer_role"], message: "review decisions require a non-founder reviewer role" });
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
  risk_class: RiskClassSchema,
  due_at: IsoTimestampSchema,
  expires_at: IsoTimestampSchema.nullable().default(null),
  reconsider_after: IsoTimestampSchema.nullable().default(null),
  trust_decision_id: NonEmptyStringSchema,
  artifact_ids: z.array(NonEmptyStringSchema).min(1),
  evidence: z.array(z.object({
    artifact_id: NonEmptyStringSchema,
    evidence_type: z.enum(["workflow_artifact", "approval_gate", "receipt", "local_artifact"]),
    uri: NonEmptyStringSchema,
    summary: NonEmptyStringSchema,
    hash: Sha256Schema.optional(),
  }).strict()).min(1),
  reason_codes: z.array(NonEmptyStringSchema).min(1),
  recommended_action: z.enum(["approve_publish", "keep_suppressed", "request_more_evidence"]),
  source_workflow: NonEmptyStringSchema,
  source_workflow_run_id: NonEmptyStringSchema,
  source_run_id: NonEmptyStringSchema,
  payload_hash: Sha256Schema,
  allowed_reviewer_actions: z.array(z.enum(["approve_publish", "keep_suppressed", "request_more_evidence", "restore_after_suppression", "reject"])).min(1),
  founder_escalation_allowed: z.literal(false),
  restricted_action_gate_required: RestrictedGateSchema.nullable().default(null),
  status: z.enum(["open", "in_review", "resolved", "expired", "blocked"]).default("open"),
  external_send_performed: z.literal(false).default(false),
  provider_mutation_performed: z.literal(false).default(false),
  whop_mutation_performed: z.literal(false).default(false),
  production_mutation_performed: z.literal(false).default(false),
  resolution: z.object({
    action: z.enum(["approve_publish", "keep_suppressed", "request_more_evidence"]),
    resolved_at: IsoTimestampSchema,
    resolved_by: NonEmptyStringSchema,
    gate_receipt_id: NonEmptyStringSchema.nullable().default(null),
    notes: z.string().nullable().default(null),
    public_scoring_allowed: z.boolean(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.expires_at && !value.reconsider_after) {
    ctx.addIssue({ code: "custom", path: ["expires_at"], message: "review items require expires_at or reconsider_after" });
  }
  if (value.status === "resolved" && !value.resolution) {
    ctx.addIssue({ code: "custom", path: ["resolution"], message: "resolved review items require resolution details" });
  }
  if (value.resolution?.action === "approve_publish" && !hasGateEvidence(value.resolution.gate_receipt_id)) {
    ctx.addIssue({ code: "custom", path: ["resolution", "gate_receipt_id"], message: "approve_publish requires non-founder gate receipt evidence" });
  }
  if (value.resolution?.action === "approve_publish" && value.restricted_action_gate_required !== "NON_FOUNDER_TRUST_REVIEW") {
    ctx.addIssue({ code: "custom", path: ["restricted_action_gate_required"], message: "approve_publish requires NON_FOUNDER_TRUST_REVIEW gate" });
  }
});

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
  risk_class: RiskClassSchema,
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
    ctx.addIssue({ code: "custom", path: ["dry_run"], message: "mutation receipts cannot be dry_run" });
  }
  if (anyMutation && !hasGateEvidence(value.gate_receipt_id)) {
    ctx.addIssue({ code: "custom", path: ["gate_receipt_id"], message: "restricted mutations require gate receipt" });
  }
  if (hasSecretLikeDetailKey(value.detail)) {
    ctx.addIssue({ code: "custom", path: ["detail"], message: "receipt detail cannot contain secret-like detail keys" });
  }
});

export type RiskClass = z.infer<typeof RiskClassSchema>;
export type ChannelHeadInputSnapshot = z.infer<typeof ChannelHeadInputSnapshotSchema>;
export type ChannelHeadAction = z.infer<typeof ChannelHeadActionSchema>;
export type ChannelHeadDecision = z.infer<typeof ChannelHeadDecisionSchema>;
export type FreshCallDiscoveryEvent = z.infer<typeof FreshCallDiscoveryEventSchema>;
export type SentinelRunReceipt = z.infer<typeof SentinelRunReceiptSchema>;
export type TrustDecision = z.infer<typeof TrustDecisionSchema>;
export type NonFounderReviewItem = z.infer<typeof NonFounderReviewItemSchema>;
export type AutonomyReceipt = z.infer<typeof AutonomyReceiptSchema>;
