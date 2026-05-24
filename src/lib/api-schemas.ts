import { z } from "zod";
import type { Call, Creator, CreatorStats, Direction, Period, Tier } from "./types";

const dbTimestampSchema = z.union([
  z.string(),
  z.date().transform((value) => value.toISOString()),
]);

const nullableString = z.string().nullable();
const nullableNumber = z.coerce.number().nullable();
const nullWhenMissing = (value: unknown): unknown => value === undefined ? null : value;
const optionalNullableString = z.preprocess(nullWhenMissing, nullableString);
const optionalNullableNumber = z.preprocess(nullWhenMissing, nullableNumber);
const optionalNullableTimestamp = z.preprocess(nullWhenMissing, dbTimestampSchema.nullable());
const numberFromDb = z.coerce.number();

export const tierSchema = z.enum(["free", "pro", "alpha"]) satisfies z.ZodType<Tier>;
export const periodSchema = z.enum(["all_time", "90d", "30d"]) satisfies z.ZodType<Period>;
export const directionSchema = z.enum(["bullish", "bearish", "neutral"]) satisfies z.ZodType<Direction>;
const optionalNullableDirection = z.preprocess(nullWhenMissing, directionSchema.nullable());

export const creatorRowSchema = z.object({
  id: numberFromDb,
  name: z.string(),
  youtube_handle: z.string(),
  youtube_channel_id: nullableString,
  subscribers: nullableString,
  focus: nullableString,
  tier: tierSchema.default("free"),
  total_calls: numberFromDb.default(0),
  win_rate: numberFromDb.default(0),
  avg_return: numberFromDb.default(0),
  alpha_score: numberFromDb.default(0),
  accuracy_rank: nullableNumber,
  last_scraped_at: dbTimestampSchema.nullable(),
  created_at: dbTimestampSchema.default(() => new Date(0).toISOString()),
}) satisfies z.ZodType<Creator>;

export const creatorStatsRowSchema = z.object({
  id: numberFromDb,
  creator_id: numberFromDb,
  period: periodSchema,
  total_calls: numberFromDb,
  win_rate: numberFromDb,
  avg_return_7d: numberFromDb,
  avg_return_30d: numberFromDb,
  avg_return_90d: numberFromDb,
  avg_alpha_30d: numberFromDb,
  best_call_id: nullableNumber,
  worst_call_id: nullableNumber,
  hit_rate: numberFromDb,
  most_called_symbol: nullableString,
  strategy_consistency: numberFromDb,
  specificity_avg: numberFromDb,
  alpha_score: numberFromDb,
  accuracy_rank: nullableNumber,
  effective_n: numberFromDb,
  wilson_lb: numberFromDb,
  bullish_win_rate: numberFromDb,
  bearish_win_rate: numberFromDb,
  bullish_pct: numberFromDb,
  sharpe_ratio: numberFromDb,
  updated_at: dbTimestampSchema,
}) satisfies z.ZodType<CreatorStats>;

export const callRowSchema = z.object({
  id: numberFromDb,
  creator_id: numberFromDb,
  video_id: numberFromDb,
  symbol: z.string(),
  direction: directionSchema,
  call_type: nullableString,
  entry_price: nullableNumber,
  target_price: nullableNumber,
  stop_loss: nullableNumber,
  timeframe: nullableString,
  confidence: nullableString,
  strategy_type: nullableString,
  raw_quote: nullableString,
  extraction_confidence: numberFromDb,
  specificity_score: numberFromDb,
  call_date: dbTimestampSchema,
  price_at_call: nullableNumber,
  btc_price_at_call: nullableNumber,
  price_7d: nullableNumber,
  price_30d: nullableNumber,
  price_90d: nullableNumber,
  btc_price_7d: nullableNumber,
  btc_price_30d: nullableNumber,
  btc_price_90d: nullableNumber,
  return_7d: nullableNumber,
  return_30d: nullableNumber,
  return_90d: nullableNumber,
  alpha_7d: nullableNumber,
  alpha_30d: nullableNumber,
  alpha_90d: nullableNumber,
  hit_target: z.boolean().nullable(),
  correct_direction: z.boolean().nullable(),
  regime_at_call: nullableNumber,
  regime_difficulty: numberFromDb,
  score: numberFromDb,
  created_at: dbTimestampSchema,
}).passthrough() satisfies z.ZodType<Call>;

export const consensusSignalRowSchema = z.object({
  id: numberFromDb,
  symbol: z.string(),
  direction: z.enum(["bullish", "bearish"]).nullable(),
  creator_count: numberFromDb,
  creator_ids: z.array(numberFromDb),
  call_ids: z.array(numberFromDb),
  signal_date: dbTimestampSchema,
  avg_target_price: nullableNumber,
  price_at_signal: nullableNumber,
  price_7d: nullableNumber,
  price_30d: nullableNumber,
  return_7d: nullableNumber,
  return_30d: nullableNumber,
  correct: z.boolean().nullable(),
  quality_score: nullableNumber,
  created_at: optionalNullableTimestamp,
}).passthrough();

export const leaderboardQueryRowSchema = creatorStatsRowSchema.extend({
  name: z.string(),
  youtube_handle: z.string(),
  youtube_channel_id: nullableString,
  subscribers: nullableString,
  focus: nullableString,
  tier: tierSchema,
  creator_alpha_score: numberFromDb,
  creator_total_calls: numberFromDb,
  creator_win_rate: numberFromDb,
  creator_avg_return: numberFromDb,
  creator_accuracy_rank: nullableNumber,
  creator_last_scraped_at: dbTimestampSchema.nullable(),
  creator_created_at: dbTimestampSchema,
  best_call_symbol: optionalNullableString,
  best_call_return: optionalNullableNumber,
  best_call_score: optionalNullableNumber,
  best_call_date: optionalNullableTimestamp,
  best_call_direction: optionalNullableDirection,
  worst_call_symbol: optionalNullableString,
  worst_call_return: optionalNullableNumber,
  worst_call_score: optionalNullableNumber,
  worst_call_date: optionalNullableTimestamp,
  worst_call_direction: optionalNullableDirection,
}).passthrough();

export type LeaderboardQueryRow = z.infer<typeof leaderboardQueryRowSchema>;

export function parseApiRow<T>(schema: z.ZodType<T>, row: unknown, label: string): T {
  try {
    return schema.parse(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`${label} row shape mismatch: ${JSON.stringify(error.flatten())}`);
    }
    throw error;
  }
}

export function parseApiRows<T>(schema: z.ZodType<T>, rows: readonly unknown[], label: string): T[] {
  return rows.map((row) => parseApiRow(schema, row, label));
}
