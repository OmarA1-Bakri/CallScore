import { z } from "zod";
import {
  OperatingDomainSchema,
  OperatingGoalModeSchema,
  OperatingGoalSchema,
} from "./operating-goals";

const IsoTimestampSchema = z.string().datetime({ offset: true });
const NonEmptyStringSchema = z.string().trim().min(1);

export const DEFAULT_OPERATING_MUTATION_FLAGS = {
  external_mutation_performed: false,
  send_or_outreach_performed: false,
  provider_mutation_performed: false,
  whop_mutation_performed: false,
  production_mutation_performed: false,
  db_write_performed: false,
  public_publish_performed: false,
  public_engagement_performed: false,
} as const;

export const MutationFlagsSchema = z.object({
  external_mutation_performed: z.boolean().default(false),
  send_or_outreach_performed: z.boolean().default(false),
  provider_mutation_performed: z.boolean().default(false),
  whop_mutation_performed: z.boolean().default(false),
  production_mutation_performed: z.boolean().default(false),
  db_write_performed: z.boolean().default(false),
  public_publish_performed: z.boolean().default(false),
  public_engagement_performed: z.boolean().default(false),
}).strict();

export type MutationFlags = z.infer<typeof MutationFlagsSchema>;

export function anyMutationPerformed(flags: Partial<MutationFlags> | null | undefined): boolean {
  if (!flags) return false;
  return Object.values(MutationFlagsSchema.parse({ ...DEFAULT_OPERATING_MUTATION_FLAGS, ...flags })).some(Boolean);
}

export const OperatingGoalConfigSchema = z.object({
  goal: OperatingGoalSchema,
  mode: OperatingGoalModeSchema.default("dry_run"),
  dryRun: z.boolean().default(true),
  approved: z.boolean().default(false),
  approvalReceiptId: NonEmptyStringSchema.nullable().default(null),
  approvedByOperator: NonEmptyStringSchema.nullable().default(null),
  bounded: z.boolean().default(true),
  maxItems: z.number().int().positive().default(1),
  campaignId: NonEmptyStringSchema.nullable().default(null),
  videoJobId: NonEmptyStringSchema.nullable().default(null),
  testFixtures: z.boolean().default(false),
}).strict();

export type OperatingGoalConfig = z.infer<typeof OperatingGoalConfigSchema>;

export const OperatingNodeStatusSchema = z.enum(["ok", "blocked", "failed", "skipped"]);
export type OperatingNodeStatus = z.infer<typeof OperatingNodeStatusSchema>;

export const OperatingNodeResultSchema = z.object({
  node_id: NonEmptyStringSchema,
  domain: OperatingDomainSchema,
  status: OperatingNodeStatusSchema,
  receipt_id: NonEmptyStringSchema,
  artifact_path: NonEmptyStringSchema.nullable().default(null),
  blockers: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
  started_at: IsoTimestampSchema,
  finished_at: IsoTimestampSchema,
  duration_ms: z.number().nonnegative(),
  mutation_flags: MutationFlagsSchema.default(DEFAULT_OPERATING_MUTATION_FLAGS),
  summary: NonEmptyStringSchema,
  detail: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type OperatingNodeResult = z.infer<typeof OperatingNodeResultSchema>;

export const OperatingReceiptSchema = z.object({
  receipt_id: NonEmptyStringSchema,
  goal: OperatingGoalSchema,
  domain: OperatingDomainSchema,
  parent_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  node_results: z.array(OperatingNodeResultSchema).default([]),
  mutation_flags: MutationFlagsSchema.default(DEFAULT_OPERATING_MUTATION_FLAGS),
  approval_receipt_id: NonEmptyStringSchema.nullable().default(null),
  rollback_or_recovery_note: NonEmptyStringSchema,
  artifact_paths: z.array(NonEmptyStringSchema.nullable()).default([]),
  created_at: IsoTimestampSchema,
}).strict();

export type OperatingReceipt = z.infer<typeof OperatingReceiptSchema>;

export const OperatingSummarySchema = z.object({
  schema_version: z.literal("callscore_operating_summary.v1"),
  goal: OperatingGoalSchema,
  status: OperatingNodeStatusSchema,
  child_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  mutation_flags: MutationFlagsSchema.default(DEFAULT_OPERATING_MUTATION_FLAGS),
  blockers_by_domain: z.record(z.string(), z.array(NonEmptyStringSchema)).default({}),
  warnings_by_domain: z.record(z.string(), z.array(NonEmptyStringSchema)).default({}),
  node_status_counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  node_count: z.number().int().nonnegative(),
  receipt_count: z.number().int().nonnegative(),
  artifact_paths: z.array(NonEmptyStringSchema).default([]),
  audit_blockers: z.array(NonEmptyStringSchema).default([]),
  secret_redaction_applied: z.literal(true),
  created_at: IsoTimestampSchema,
}).strict();

export type OperatingSummary = z.infer<typeof OperatingSummarySchema>;

export const OperatingGraphStateSchema = z.object({
  config: OperatingGoalConfigSchema,
  node_results: z.array(OperatingNodeResultSchema).default([]),
  receipts: z.array(OperatingReceiptSchema).default([]),
  blockers: z.array(NonEmptyStringSchema).default([]),
  warnings: z.array(NonEmptyStringSchema).default([]),
  errors: z.array(NonEmptyStringSchema).default([]),
  mutation_flags: MutationFlagsSchema.default(DEFAULT_OPERATING_MUTATION_FLAGS),
  artifacts: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((state, ctx) => {
  if (state.config.dryRun && anyMutationPerformed(state.mutation_flags)) {
    ctx.addIssue({ code: "custom", message: "dry-run state cannot contain mutation flags" });
  }
  if (state.config.dryRun) {
    state.node_results.forEach((result, index) => {
      if (anyMutationPerformed(result.mutation_flags)) {
        ctx.addIssue({ code: "custom", path: ["node_results", index, "mutation_flags"], message: "dry-run node result cannot contain mutation flags" });
      }
    });
  }
});

export type OperatingGraphState = z.infer<typeof OperatingGraphStateSchema>;

export const ExternalMutationActionSchema = z.enum([
  "publish_owned_public",
  "public_engagement",
  "send_or_outreach",
  "provider_mutation",
  "whop_mutation",
  "db_write",
  "production_mutation",
]);

export const RequiredGateSchema = z.enum([
  "SEND_GATE",
  "SPEND_GATE",
  "FINANCIAL_GATE",
  "PRODUCTION_GATE",
  "SECRET_GATE",
  "PUBLISH_GATE",
  "NON_FOUNDER_TRUST_REVIEW",
]);

export const ExternalMutationRequestSchema = z.object({
  node_id: NonEmptyStringSchema,
  goal: OperatingGoalSchema,
  dryRun: z.boolean(),
  requested_action: ExternalMutationActionSchema,
  destination: NonEmptyStringSchema.nullable().default(null),
  approved: z.boolean().default(false),
  approvalReceiptId: NonEmptyStringSchema.nullable().default(null),
  approvedByOperator: NonEmptyStringSchema.nullable().default(null),
  authority: NonEmptyStringSchema,
  required_gate: RequiredGateSchema.nullable().default(null),
  rollback_or_recovery_note: NonEmptyStringSchema.nullable().default(null),
  mutation_flags: MutationFlagsSchema.default(DEFAULT_OPERATING_MUTATION_FLAGS),
}).strict().superRefine((request, ctx) => {
  const mutating = anyMutationPerformed(request.mutation_flags);
  if (request.dryRun && mutating) {
    ctx.addIssue({ code: "custom", path: ["mutation_flags"], message: "dry-run mutation request cannot report mutations" });
  }
  if (mutating && (!request.approved || (!request.approvalReceiptId && !request.approvedByOperator))) {
    ctx.addIssue({ code: "custom", path: ["approvalReceiptId"], message: "mutation requires approval evidence" });
  }
  if ((request.mutation_flags.public_publish_performed || request.mutation_flags.public_engagement_performed) && !request.destination) {
    ctx.addIssue({ code: "custom", path: ["destination"], message: "public publish/engagement requires destination" });
  }
  if (request.mutation_flags.public_publish_performed && !request.rollback_or_recovery_note) {
    ctx.addIssue({ code: "custom", path: ["rollback_or_recovery_note"], message: "public publish requires rollback/recovery note" });
  }
  if (request.mutation_flags.whop_mutation_performed && request.required_gate !== "FINANCIAL_GATE" && request.required_gate !== "PRODUCTION_GATE") {
    ctx.addIssue({ code: "custom", path: ["required_gate"], message: "Whop mutation requires financial or production gate" });
  }
});

export type ExternalMutationRequest = z.infer<typeof ExternalMutationRequestSchema>;

export const ApprovalBlockerDecisionSchema = z.object({
  status: z.enum([
    "clear_owned_public",
    "blocked",
    "cooldown",
    "approval_required",
    "non_founder_review_required",
    "tool_missing",
    "monitor_only",
  ]),
  required_gate: RequiredGateSchema.nullable().default(null),
  blocker_codes: z.array(NonEmptyStringSchema).default([]),
  approval_receipt_required: z.boolean(),
  allowed_next_action: z.enum([
    "monitor_read_only",
    "draft",
    "create_approval_packet",
    "create_non_founder_review_item",
    "ready_to_publish",
    "publish_owned_public",
    "sleep",
  ]),
  owner_agent: NonEmptyStringSchema,
  rollback_path: NonEmptyStringSchema.nullable().default(null),
  evidence_refs: z.array(NonEmptyStringSchema).default([]),
}).strict().superRefine((decision, ctx) => {
  if (decision.status === "clear_owned_public" && decision.required_gate !== null) {
    ctx.addIssue({ code: "custom", path: ["required_gate"], message: "clear owned public actions must not carry a restricted gate" });
  }
  if (decision.status === "approval_required" && !decision.approval_receipt_required) {
    ctx.addIssue({ code: "custom", path: ["approval_receipt_required"], message: "approval_required status must require approval receipt" });
  }
  if (decision.allowed_next_action === "publish_owned_public" && !decision.rollback_path) {
    ctx.addIssue({ code: "custom", path: ["rollback_path"], message: "publish_owned_public requires rollback path" });
  }
});

export type ApprovalBlockerDecision = z.infer<typeof ApprovalBlockerDecisionSchema>;

export const PipelineDispatchJobTypeSchema = z.enum([
  "ml_verifier_batch",
  "hermes_smoke_test",
  "candle_refresh",
  "match_prices_batch",
  "compute_scores",
  "promote_ml_verified",
  "candidate_admission",
  "transcript_collect_laptop",
  "transcript_ingest_result",
  "gemma_shadow_extract",
  "ml_extraction_eval",
  "ml_idle_improve",
  "extraction_promotion_review",
  "loop_engineering_eval",
  "whop_provider_health",
  "whop_plan_inventory_check",
  "whop_entitlement_sync_dry_run",
  "whop_webhook_replay_safe",
  "whop_customer_status_check",
  "whop_activation_review",
  "artofwar_strategy_brief",
  "artofwar_content_queue_dry_run",
  "artofwar_campaign_plan_generate",
  "artofwar_audience_research_dry_run",
  "artofwar_outreach_queue_prepare",
  "artofwar_publish_approval_review",
  "artofwar_owned_public_execution",
  "artofwar_spend_approval_review",
  "artofwar_campaign_preflight",
  "artofwar_campaign_iteration",
  "artofwar_campaign_verify",
  "artofwar_campaign_persona_test",
  "artofwar_campaign_dry_run",
  "artofwar_campaign_gemma_eval",
  "artofwar_campaign_receipt",
  "artofwar_campaign_dossier",
  "artofwar_campaign_approval_review",
  "automation_registry_refresh",
  "automation_dry_run",
  "automation_health_check",
  "automation_activation_review",
  "channel_task",
]);

const PositiveDispatchIntSchema = z.number().int().positive();
const NonNegativeDispatchIntSchema = z.number().int().nonnegative();
const DispatchJsonObjectSchema = z.record(z.string(), z.unknown());

const CandleRefreshPayloadSchema = z.object({
  dry_run: z.boolean().default(true),
  symbols: z.array(NonEmptyStringSchema).min(1).optional(),
  start_date: IsoTimestampSchema.optional(),
  end_date: IsoTimestampSchema.nullable().optional(),
  max_requests_per_symbol: PositiveDispatchIntSchema.max(1_000).optional(),
  gap_ms: PositiveDispatchIntSchema.max(60_000).optional(),
  write: z.boolean().default(false),
  audit_out: NonEmptyStringSchema.optional(),
}).strict().default({ dry_run: true, write: false });

const MatchPricesPayloadSchema = z.object({
  rematch_all: z.boolean().default(false),
  limit: PositiveDispatchIntSchema.max(100_000).default(1_000),
  batch_size: PositiveDispatchIntSchema.max(10_000).default(200),
  start_after_id: NonNegativeDispatchIntSchema.default(0),
  fetch_binance: z.boolean().default(false),
  binance_tolerance_minutes: PositiveDispatchIntSchema.max(24 * 60).default(30),
}).strict().default({
  rematch_all: false,
  limit: 1_000,
  batch_size: 200,
  start_after_id: 0,
  fetch_binance: false,
  binance_tolerance_minutes: 30,
});

const ComputeScoresPayloadSchema = z.object({}).strict().default({});

const MlVerifierBatchPayloadSchema = z.object({
  batch_size: PositiveDispatchIntSchema.max(1_000).default(25),
}).strict().default({ batch_size: 25 });

const MlPromotionPayloadSchema = z.object({
  write: z.boolean().default(false),
  prompt_version: NonEmptyStringSchema.optional(),
  provider: NonEmptyStringSchema.nullable().optional(),
  model: NonEmptyStringSchema.nullable().optional(),
  limit: PositiveDispatchIntSchema.max(1_000).default(100),
  min_verifier_confidence: z.number().min(0).max(1).default(0.85),
  manual_review_approved: z.boolean().default(false),
  manual_reviewed_by: NonEmptyStringSchema.nullable().optional(),
  manual_review_ticket: NonEmptyStringSchema.nullable().optional(),
  shadow_diff_passed: z.boolean().default(false),
  shadow_diff_summary: DispatchJsonObjectSchema.default({}),
  gold_set_passed: z.boolean().default(false),
  gold_set_metrics: DispatchJsonObjectSchema.default({}),
}).strict().superRefine((payload, ctx) => {
  if (!payload.write) return;
  if (!payload.manual_review_approved || !payload.manual_reviewed_by || !payload.manual_review_ticket) {
    ctx.addIssue({ code: "custom", path: ["manual_review_approved"], message: "write promotion requires manual review evidence" });
  }
  if (!payload.shadow_diff_passed) {
    ctx.addIssue({ code: "custom", path: ["shadow_diff_passed"], message: "write promotion requires passing shadow diff evidence" });
  }
  if (!payload.gold_set_passed) {
    ctx.addIssue({ code: "custom", path: ["gold_set_passed"], message: "write promotion requires passing gold-set evidence" });
  }
}).default({
  write: false,
  limit: 100,
  min_verifier_confidence: 0.85,
  manual_review_approved: false,
  shadow_diff_passed: false,
  shadow_diff_summary: {},
  gold_set_passed: false,
  gold_set_metrics: {},
});

const CandidateAdmissionPayloadSchema = z.object({
  min_auto_approve_relevance: z.number().min(0).max(1).optional(),
  min_needs_review_relevance: z.number().min(0).max(1).optional(),
  max_records: PositiveDispatchIntSchema.max(500).default(50),
}).strict().default({ max_records: 50 });

const HermesSmokePayloadSchema = z.object({
  worker_id: NonEmptyStringSchema.optional(),
  dry_run: z.boolean().default(true),
}).strict().default({ dry_run: true });

const ChannelTaskPayloadSchema = z.object({
  task_type: z.enum([
    "artofwar_campaign_dossier",
    "owned_social_draft_and_monitor",
    "owned_community_draft_and_monitor",
    "whop_copy_asset_and_read_only_health",
    "email_partnership_draft_packet_only",
    "opportunity_research_brief",
    "compliance_lint_gate",
    "data_pipeline_freshness_sentinel",
  ]),
  task_id: NonEmptyStringSchema.optional(),
  agent_id: NonEmptyStringSchema.optional(),
  channel_id: NonEmptyStringSchema.optional(),
}).strict();

const WorkplaneDispatchJobSchema = z.object({
  job_type: PipelineDispatchJobTypeSchema.exclude([
    "ml_verifier_batch",
    "hermes_smoke_test",
    "candle_refresh",
    "match_prices_batch",
    "compute_scores",
    "promote_ml_verified",
    "candidate_admission",
    "channel_task",
  ]),
  job_id: z.number().int().positive().optional(),
  payload: DispatchJsonObjectSchema.default({}),
}).strict();

export const PipelineDispatchJobSchema = z.union([
  z.object({ job_type: z.literal("ml_verifier_batch"), job_id: z.number().int().positive().optional(), payload: MlVerifierBatchPayloadSchema }).strict(),
  z.object({ job_type: z.literal("hermes_smoke_test"), job_id: z.number().int().positive().optional(), payload: HermesSmokePayloadSchema }).strict(),
  z.object({ job_type: z.literal("candle_refresh"), job_id: z.number().int().positive().optional(), payload: CandleRefreshPayloadSchema }).strict(),
  z.object({ job_type: z.literal("match_prices_batch"), job_id: z.number().int().positive().optional(), payload: MatchPricesPayloadSchema }).strict(),
  z.object({ job_type: z.literal("compute_scores"), job_id: z.number().int().positive().optional(), payload: ComputeScoresPayloadSchema }).strict(),
  z.object({ job_type: z.literal("promote_ml_verified"), job_id: z.number().int().positive().optional(), payload: MlPromotionPayloadSchema }).strict(),
  z.object({ job_type: z.literal("candidate_admission"), job_id: z.number().int().positive().optional(), payload: CandidateAdmissionPayloadSchema }).strict(),
  z.object({ job_type: z.literal("channel_task"), job_id: z.number().int().positive().optional(), payload: ChannelTaskPayloadSchema }).strict(),
  WorkplaneDispatchJobSchema,
]);

export type PipelineDispatchJob = z.infer<typeof PipelineDispatchJobSchema>;
