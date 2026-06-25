/**
 * Pipeline job schemas — validate pipeline job creation, claiming,
 * completion, and event logging.
 *
 * These match the existing PipelineJob / PipelineJobEvent interfaces
 * in pipeline.ts but enforce Zod validation at the boundary.
 */
import { z } from "zod";
import {
  IsoTimestampSchema,
  NonEmptyStringSchema,
  NumberFromDb,
} from "./shared";

// ── Enums ─────────────────────────────────────────────────

export const RalplanPhaseSchema = z.enum([
  "phase1-stabilize",
  "phase2-pipeline",
  "phase3-whop-scaffold",
  "phase4-commerce",
  "phase5-marketing",
]);

export const PipelineJobStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const PipelineRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const PipelineJobTypeSchema = z.enum([
  "ml_verifier_batch",
  "hermes_smoke_test",
  "candle_refresh",
  "match_prices_batch",
  "compute_scores",
  "promote_ml_verified",
  "candidate_admission",
  "discover_videos",
  "scrape_transcript",
  "extract_calls",
]);

// ── PipelineJob ────────────────────────────────────────────

export const PipelineJobSchema = z.object({
  id: z.number().int(),
  run_id: z.number().int().nullable(),
  type: PipelineJobTypeSchema.or(z.string()),
  status: PipelineJobStatusSchema,
  priority: z.number().int().min(0).default(0),
  payload: z.record(z.string(), z.unknown()).default({}),
  attempts: z.number().int().nonnegative().default(0),
  max_attempts: z.number().int().positive().default(3),
  locked_by: z.string().nullable(),
  locked_at: IsoTimestampSchema.nullable(),
  heartbeat_at: IsoTimestampSchema.nullable(),
  lease_expires_at: IsoTimestampSchema.nullable(),
  run_after: IsoTimestampSchema,
  idempotency_key: z.string().nullable(),
  error: z.string().nullable(),
  metrics: z.record(z.string(), z.unknown()).default({}),
  phase: z.string().nullable(),
  created_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
}).strict();

// ── PipelineJobEvent ───────────────────────────────────────

export const PipelineJobEventSchema = z.object({
  id: z.number().int(),
  run_id: z.number().int().nullable(),
  job_id: z.number().int().nullable(),
  event_type: NonEmptyStringSchema,
  status: z.string().nullable(),
  message: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: IsoTimestampSchema,
}).strict();

// ── Enqueue input ──────────────────────────────────────────

export const EnqueuePipelineJobInputSchema = z.object({
  runKey: NonEmptyStringSchema,
  runType: NonEmptyStringSchema,
  jobType: PipelineJobTypeSchema.or(z.string()),
  payload: z.record(z.string(), z.unknown()).default({}),
  priority: z.number().int().min(0).default(0),
  idempotencyKey: NonEmptyStringSchema,
  maxAttempts: z.number().int().positive().default(3),
  phase: RalplanPhaseSchema.or(z.string()).default("phase2-pipeline"),
}).strict();

// ── Worker args ────────────────────────────────────────────

export const WorkerArgsSchema = z.object({
  once: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  workerId: NonEmptyStringSchema,
  pollMs: z.number().int().positive().default(15_000),
  maxJobs: z.number().int().positive(),
  pipelineJobs: z.boolean().default(true),
  channelTaskTypes: z.array(z.string()).default([]),
}).strict();

export type PipelineJob = z.infer<typeof PipelineJobSchema>;
export type PipelineJobEvent = z.infer<typeof PipelineJobEventSchema>;
export type PipelineJobType = z.infer<typeof PipelineJobTypeSchema>;
export type EnqueuePipelineJobInput = z.infer<typeof EnqueuePipelineJobInputSchema>;
export type WorkerArgs = z.infer<typeof WorkerArgsSchema>;
