/**
 * Pipeline state schema — the shared state that flows between every
 * LangGraph node in the CallScore agent graph.
 *
 * Every agent node reads from and writes to this state. Zod validates
 * the boundary at each node entry/exit so LangGraph nodes never
 * receive or produce corrupt state.
 */
import { z } from "zod";
import {
  IsoTimestampSchema,
  NonEmptyStringSchema,
  Sha256Schema,
  ZeroToOneSchema,
} from "./shared";
import { PipelineJobStatusSchema } from "./pipeline-job-schema";
import { CreatorTransitionStateSchema } from "./transition-schema";

// ── Shared substructures ─────────────────────────────────

export const PipelineReceiptSchema = z.object({
  receipt_id: NonEmptyStringSchema,
  agent_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  job_id: z.union([z.number().int(), z.string()]).optional(),
  status: z.enum(["ok", "failed", "running", "blocked"]),
  summary: z.string().optional(),
  payload_hash: Sha256Schema.optional(),
}).strict();

export const PipelineErrorSchema = z.object({
  agent_id: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  error_code: z.string().optional(),
  ts: IsoTimestampSchema,
  context: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const FreshnessEntrySchema = z.object({
  status: z.enum(["fresh", "stale", "cooldown", "unknown"]),
  latest_job_id: z.union([z.number().int(), z.string()]).nullable().optional(),
  latest_run_at: IsoTimestampSchema.nullable().optional(),
  blockers: z.array(NonEmptyStringSchema).default([]),
}).strict();

// ── Guard / Readiness ─────────────────────────────────────

export const HardeningStatusSchema = z.enum(["pass", "warn", "block"]);
export const ReadinessStatusSchema = z.enum(["green", "warn", "blocked"]);

export const HardeningCheckSchema = z.object({
  id: NonEmptyStringSchema,
  status: HardeningStatusSchema,
  summary: NonEmptyStringSchema,
  metrics: z.record(z.string(), z.unknown()).default({}),
  next_action: NonEmptyStringSchema,
}).strict();

export const PipelineGuardAuditSchema = z.object({
  generated_at: IsoTimestampSchema,
  checks: z.array(HardeningCheckSchema),
  overall_status: HardeningStatusSchema,
  core_pipeline_status: ReadinessStatusSchema,
  transition_readiness: ReadinessStatusSchema,
  storm_readiness: ReadinessStatusSchema,
  public_publish_readiness: ReadinessStatusSchema,
  markov_readiness: ReadinessStatusSchema.optional(),
}).strict();

// ── LangGraph pipeline state ──────────────────────────────

export const CreatorStateEntrySchema = z.object({
  creator_id: z.number().int(),
  creator_name: NonEmptyStringSchema,
  youtube_handle: z.string().nullable(),
  period_start: IsoTimestampSchema,
  period_end: IsoTimestampSchema,
  state: CreatorTransitionStateSchema,
  confidence: ZeroToOneSchema,
  drivers: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
}).strict();

/**
 * Full shared state that flows between LangGraph nodes.
 * Every node in the pipeline graph accepts Partial<PipelineState>
 * and returns Partial<PipelineState> — a new diff is merged on
 * each step.
 */
export const PipelineStateSchema = z.object({
  // Pipeline run identity
  run_id: NonEmptyStringSchema.optional(),
  pipeline_version: NonEmptyStringSchema.optional(),
  started_at: IsoTimestampSchema.optional(),

  // Freshness state per pipeline lane
  freshness: z.record(z.string(), FreshnessEntrySchema).optional(),

  // Latest pipeline guard audit
  guard: PipelineGuardAuditSchema.optional(),

  // Creator transition state records (output of transition-state-classifier)
  creator_states: z.array(CreatorStateEntrySchema).default([]),

  // Markov predictions (output of markov-head)
  transition_matrix: z.unknown().optional(),
  predictions: z.array(z.unknown()).default([]),

  // Pipeline job receipts
  receipts: z.array(PipelineReceiptSchema).default([]),

  // Errors accumulated during graph execution
  errors: z.array(PipelineErrorSchema).default([]),

  // Current agent node identity (set by the graph runtime)
  current_agent: NonEmptyStringSchema.optional(),
  previous_agent: NonEmptyStringSchema.optional(),

  // Routing decisions
  routing_decision: z.string().optional(),
  routing_reason: z.string().optional(),
}).strict();

export type PipelineState = z.infer<typeof PipelineStateSchema>;
export type PipelineReceipt = z.infer<typeof PipelineReceiptSchema>;
export type PipelineError = z.infer<typeof PipelineErrorSchema>;
export type FreshnessEntry = z.infer<typeof FreshnessEntrySchema>;
export type HardeningCheck = z.infer<typeof HardeningCheckSchema>;
export type PipelineGuardAudit = z.infer<typeof PipelineGuardAuditSchema>;
export type CreatorStateEntry = z.infer<typeof CreatorStateEntrySchema>;
