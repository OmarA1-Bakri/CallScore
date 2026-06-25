/**
 * Transition schemas — Zod versions of the transition-schemas.ts types.
 *
 * Every transition state record that enters or leaves a LangGraph node
 * is validated here. The existing transition-state-classifier can
 * optionally be wrapped with `StateRecordSchema.parse()` for runtime
 * boundary enforcement.
 */
import { z } from "zod";
import {
  NonEmptyStringSchema,
  ZeroToOneSchema,
  NumberFromDb,
  DbTimestampSchema,
} from "./shared";

// ── Enums ─────────────────────────────────────────────────

export const TransitionPeriodSchema = z.enum(["weekly", "monthly", "quarterly"]);

export const CreatorTransitionStateSchema = z.enum([
  "INSUFFICIENT_DATA",
  "PROVISIONAL_SIGNAL",
  "STABLE_PERFORMER",
  "HOT_STREAK",
  "COLD_STREAK",
  "DETERIORATING",
  "RECOVERING",
  "DIRECTIONAL_BIAS_RISK",
  "HIGH_VOLATILITY",
  "STALE_OR_INACTIVE",
]);

export const DirectionSchema = z.enum(["bullish", "bearish", "neutral"]);
export const ActivityStatusSchema = z.enum(["active", "inactive"]);

// ── DB rows ────────────────────────────────────────────────

export const TransitionCreatorRowSchema = z.object({
  creator_id: z.number().int(),
  creator_name: NonEmptyStringSchema,
  youtube_handle: z.string().nullable(),
  focus: z.string().nullable(),
  entity_type: z.string().nullable().optional(),
  is_news_channel: z.boolean().nullable().optional(),
  eligible_for_creator_scoring: z.boolean().nullable().optional(),
}).strict();

export const TransitionCallRowSchema = TransitionCreatorRowSchema.extend({
  call_id: z.number().int(),
  call_date: z.string(),
  symbol: NonEmptyStringSchema,
  direction: DirectionSchema,
  extraction_confidence: NumberFromDb,
  specificity_score: NumberFromDb,
  score: NumberFromDb,
  alpha_30d: z.number().nullable(),
  return_30d: z.number().nullable(),
  correct_direction: z.boolean().nullable(),
  price_at_call: z.number().nullable(),
  price_30d: z.number().nullable(),
  target_price: z.number().nullable(),
  price_90d: z.number().nullable(),
  hit_target: z.boolean().nullable(),
}).strict();

// ── Snapshot ───────────────────────────────────────────────

export const CreatorTransitionSnapshotSchema = z.object({
  creator_id: z.number().int(),
  creator_name: NonEmptyStringSchema,
  youtube_handle: z.string().nullable(),
  period: TransitionPeriodSchema,
  period_start: z.string(),
  period_end: z.string(),
  calls_count: z.number().int().nonnegative(),
  score_ready_calls: z.number().int().nonnegative(),
  win_rate: ZeroToOneSchema,
  avg_score: z.number(),
  avg_alpha_30d: z.number(),
  avg_return_30d: z.number(),
  bullish_pct: ZeroToOneSchema,
  bearish_pct: ZeroToOneSchema,
  symbol_diversity: z.number().int().nonnegative(),
  specificity_avg: ZeroToOneSchema,
  extraction_confidence_avg: ZeroToOneSchema,
  score_stddev: z.number().nonnegative(),
  alpha_spread: z.number().nonnegative(),
  latest_call_at: z.string().nullable(),
  activity_status: ActivityStatusSchema,
  eligibility_status: z.literal("eligible"),
  excluded_reason: z.null(),
}).strict();

// ── Exclusion ──────────────────────────────────────────────

export const CreatorTransitionExclusionSchema = z.object({
  creator_id: z.number().int(),
  creator_name: NonEmptyStringSchema,
  youtube_handle: z.string().nullable(),
  focus: z.string().nullable(),
  excluded_reason: NonEmptyStringSchema,
}).strict();

// ── State record (the core type the classifier produces) ──

export const CreatorTransitionStateRecordSchema = z.object({
  creator_id: z.number().int(),
  creator_name: NonEmptyStringSchema,
  youtube_handle: z.string().nullable(),
  period_start: z.string(),
  period_end: z.string(),
  state: CreatorTransitionStateSchema,
  confidence: ZeroToOneSchema,
  drivers: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  snapshot: CreatorTransitionSnapshotSchema,
}).strict();

// ── Backtest ───────────────────────────────────────────────

export const TransitionBacktestBucketSchema = z.object({
  state: CreatorTransitionStateSchema,
  observations: z.number().int().nonnegative(),
  next_periods: z.number().int().nonnegative(),
  avg_next_win_rate: z.number(),
  avg_next_score: z.number(),
  avg_next_alpha_30d: z.number(),
  future_activity_rate: ZeroToOneSchema,
}).strict();

export const TransitionBacktestReportSchema = z.object({
  summary: NonEmptyStringSchema,
  buckets: z.array(TransitionBacktestBucketSchema),
}).strict();

// ── Full artifacts ─────────────────────────────────────────

export const TransitionReportArtifactsSchema = z.object({
  snapshots: z.array(CreatorTransitionSnapshotSchema),
  states: z.array(CreatorTransitionStateRecordSchema),
  backtest: TransitionBacktestReportSchema,
  exclusions: z.array(CreatorTransitionExclusionSchema),
}).strict();

// ── Type exports ───────────────────────────────────────────

export type CreatorTransitionState = z.infer<typeof CreatorTransitionStateSchema>;
export type CreatorTransitionSnapshot = z.infer<typeof CreatorTransitionSnapshotSchema>;
export type CreatorTransitionStateRecord = z.infer<typeof CreatorTransitionStateRecordSchema>;
export type TransitionBacktestReport = z.infer<typeof TransitionBacktestReportSchema>;
