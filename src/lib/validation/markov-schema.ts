/**
 * Markov HMM schemas — transition matrix, forward-backward
 * predictions, and readiness checks.
 *
 * These define the typed boundary for the callscore-markov-trajectory-head
 * LangGraph node and the pipeline guard's markov_readiness check.
 */
import { z } from "zod";
import {
  NonEmptyStringSchema,
  ZeroToOneSchema,
  IsoTimestampSchema,
} from "./shared";
import { CreatorTransitionStateSchema } from "./transition-schema";

// ── Matrix types ───────────────────────────────────────────

/** 10-state transition probability matrix row */
export const TransitionProbabilityRowSchema = z.record(
  CreatorTransitionStateSchema,
  ZeroToOneSchema,
);

/** Full transition matrix with metadata */
export const TransitionMatrixSchema = z.object({
  schema_version: z.literal("callscore_markov_matrix.v1"),
  generated_at: IsoTimestampSchema,
  states: z.array(CreatorTransitionStateSchema),
  /** P[i][j] where i,j index into `states` */
  matrix: z.array(z.array(ZeroToOneSchema)),
  total_observations: z.number().int().nonnegative(),
  sparsity_ratio: ZeroToOneSchema,
  smoothing: z.enum(["add_one", "dirichlet"]).default("add_one"),
  creator_count: z.number().int().nonnegative(),
}).strict();

// ── HMM config ─────────────────────────────────────────────

export const HMMConfigSchema = z.object({
  smoothing: z.enum(["add_one", "dirichlet"]).default("add_one"),
  alpha: z.number().positive().default(1),
  min_observations_per_row: z.number().int().positive().default(10),
  max_sparsity_ratio: ZeroToOneSchema.default(0.6),
  prediction_steps: z.number().int().min(1).max(8).default(4),
}).strict();

// ── Predictions ────────────────────────────────────────────

export const StatePredictionSchema = z.object({
  state: CreatorTransitionStateSchema,
  probability: ZeroToOneSchema,
}).strict();

export const StepPredictionSchema = z.object({
  step: z.number().int().positive(),
  distribution: z.array(StatePredictionSchema),
  entropy: z.number().nonnegative().optional(),
  low_confidence: z.boolean().default(false),
}).strict();

export const CreatorPredictionSchema = z.object({
  creator_id: z.number().int(),
  creator_name: NonEmptyStringSchema,
  current_state: CreatorTransitionStateSchema,
  current_state_confidence: ZeroToOneSchema,
  current_period: z.string(),
  predictions: z.array(StepPredictionSchema),
  stability_score: ZeroToOneSchema.optional(),
}).strict();

// ── Backtest ───────────────────────────────────────────────

export const MatrixBacktestResultSchema = z.object({
  state: CreatorTransitionStateSchema,
  accuracy: ZeroToOneSchema,
  observations: z.number().int().nonnegative(),
  precision: ZeroToOneSchema.optional(),
  recall: ZeroToOneSchema.optional(),
}).strict();

export const MarkovBacktestReportSchema = z.object({
  schema_version: z.literal("callscore_markov_backtest.v1"),
  generated_at: IsoTimestampSchema,
  period: z.string(),
  total_predictions: z.number().int().nonnegative(),
  overall_accuracy: ZeroToOneSchema,
  by_state: z.array(MatrixBacktestResultSchema),
  warnings: z.array(z.string()).default([]),
}).strict();

// ── Markov report (output of markov-head node) ─────────────

export const MarkovReportSchema = z.object({
  matrix: TransitionMatrixSchema,
  predictions: z.array(CreatorPredictionSchema),
  backtest: MarkovBacktestReportSchema.optional(),
  sparsity_warnings: z.array(z.string()).default([]),
  readiness: z.enum(["pass", "warn", "block"]).default("warn"),
  creator_count: z.number().int().nonnegative(),
}).strict();

// ── Pipeline guard check input ─────────────────────────────

export const MarkovReadinessInputSchema = z.object({
  total_observations: z.number().int().nonnegative(),
  sparsity_ratio: ZeroToOneSchema,
  rows_with_few_observations: z.array(CreatorTransitionStateSchema).default([]),
  backtest_available: z.boolean(),
  overall_accuracy: ZeroToOneSchema.nullable(),
}).strict();

// ── Type exports ───────────────────────────────────────────

export type TransitionMatrix = z.infer<typeof TransitionMatrixSchema>;
export type HMMConfig = z.infer<typeof HMMConfigSchema>;
export type CreatorPrediction = z.infer<typeof CreatorPredictionSchema>;
export type MarkovReport = z.infer<typeof MarkovReportSchema>;
export type MarkovBacktestReport = z.infer<typeof MarkovBacktestReportSchema>;
export type StepPrediction = z.infer<typeof StepPredictionSchema>;
export type StatePrediction = z.infer<typeof StatePredictionSchema>;
export type MatrixBacktestResult = z.infer<typeof MatrixBacktestResultSchema>;
