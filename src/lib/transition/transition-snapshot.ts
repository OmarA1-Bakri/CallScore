import { query } from "../db";
import { creatorEligibilityReason, isEligibleCreatorForIntelligence } from "../creator-eligibility/creator-eligibility";
import type { CreatorTransitionExclusion, CreatorTransitionSnapshot, TransitionCallRow, TransitionCreatorRow, TransitionPeriod } from "./transition-schemas";

export interface TransitionSnapshotBuildResult {
  readonly snapshots: readonly CreatorTransitionSnapshot[];
  readonly exclusions: readonly CreatorTransitionExclusion[];
}

export interface LoadTransitionRowsInput {
  readonly from: string;
  readonly to: string;
}

const DAY_MS = 86_400_000;

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function quarterStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
}

function weekStart(date: Date): Date {
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() - day + 1);
  return base;
}

function addPeriod(date: Date, period: TransitionPeriod): Date {
  const next = new Date(date.getTime());
  if (period === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (period === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  if (period === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
  return next;
}

export function periodStartFor(date: Date, period: TransitionPeriod): Date {
  if (period === "weekly") return weekStart(date);
  if (period === "quarterly") return quarterStart(date);
  return monthStart(date);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isScoreReady(row: TransitionCallRow): boolean {
  return row.extraction_confidence >= 0.7 &&
    row.price_at_call !== null &&
    row.price_30d !== null &&
    row.return_30d !== null &&
    (row.target_price === null || (row.price_90d !== null && row.hit_target !== null));
}

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function stddev(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const mean = avg(values);
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Number(Math.sqrt(variance).toFixed(4));
}

function spread(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number((Math.max(...values) - Math.min(...values)).toFixed(4));
}
export async function loadTransitionRows(input: LoadTransitionRowsInput): Promise<readonly TransitionCallRow[]> {
  return query<TransitionCallRow>(`
    SELECT
      c.id AS call_id,
      c.creator_id,
      cr.name AS creator_name,
      cr.youtube_handle,
      cr.focus,
      c.call_date::text AS call_date,
      c.symbol,
      c.direction,
      c.extraction_confidence,
      c.specificity_score,
      c.score,
      c.alpha_30d,
      c.return_30d,
      c.correct_direction,
      c.price_at_call,
      c.price_30d,
      c.target_price,
      c.price_90d,
      c.hit_target
    FROM calls c
    JOIN creators cr ON cr.id = c.creator_id
    WHERE c.call_date >= $1::timestamptz
      AND c.call_date < $2::timestamptz
    ORDER BY c.creator_id ASC, c.call_date ASC, c.id ASC
  `, [input.from, input.to]);
}

export async function loadTransitionCreators(): Promise<readonly TransitionCreatorRow[]> {
  return query<TransitionCreatorRow>(`
    SELECT id AS creator_id, name AS creator_name, youtube_handle, focus
    FROM creators
    ORDER BY id ASC
  `);
}

export function buildCreatorExclusions(creators: readonly TransitionCreatorRow[]): readonly CreatorTransitionExclusion[] {
  return creators
    .map((creator) => ({ creator, reason: creatorEligibilityReason(creator) }))
    .filter((row): row is { creator: TransitionCreatorRow; reason: string } => row.reason !== null)
    .map(({ creator, reason }) => ({
      creator_id: Number(creator.creator_id),
      creator_name: creator.creator_name,
      youtube_handle: creator.youtube_handle,
      focus: creator.focus,
      excluded_reason: reason,
    }));
}

function snapshotFromCalls(
  calls: readonly TransitionCallRow[],
  period: TransitionPeriod,
  periodStart: Date,
): CreatorTransitionSnapshot {
  const creator = calls[0];
  if (!creator) throw new Error("snapshotFromCalls requires at least one call");
  const ready = calls.filter(isScoreReady);
  const scores = ready.map((call) => numberValue(call.score));
  const alphas = ready.map((call) => numberValue(call.alpha_30d));
  const returns = ready.map((call) => numberValue(call.return_30d));
  const bullish = calls.filter((call) => call.direction === "bullish").length;
  const bearish = calls.filter((call) => call.direction === "bearish").length;
  const latest = calls.map((call) => new Date(call.call_date).getTime()).filter(Number.isFinite).sort((a, b) => b - a)[0];
  return {
    creator_id: Number(creator.creator_id),
    creator_name: creator.creator_name,
    youtube_handle: creator.youtube_handle,
    period,
    period_start: isoDay(periodStart),
    period_end: isoDay(new Date(addPeriod(periodStart, period).getTime() - DAY_MS)),
    calls_count: calls.length,
    score_ready_calls: ready.length,
    win_rate: ready.length === 0 ? 0 : avg(ready.map((call) => call.correct_direction ? 1 : 0)),
    avg_score: avg(scores),
    avg_alpha_30d: avg(alphas),
    avg_return_30d: avg(returns),
    bullish_pct: calls.length === 0 ? 0 : Number((bullish / calls.length).toFixed(4)),
    bearish_pct: calls.length === 0 ? 0 : Number((bearish / calls.length).toFixed(4)),
    symbol_diversity: new Set(calls.map((call) => call.symbol)).size,
    specificity_avg: avg(calls.map((call) => numberValue(call.specificity_score))),
    extraction_confidence_avg: avg(calls.map((call) => numberValue(call.extraction_confidence))),
    score_stddev: stddev(scores),
    alpha_spread: spread(alphas),
    latest_call_at: latest ? new Date(latest).toISOString() : null,
    activity_status: calls.length > 0 ? "active" : "inactive",
    eligibility_status: "eligible",
    excluded_reason: null,
  };
}

export function buildTransitionSnapshots(input: {
  readonly rows: readonly TransitionCallRow[];
  readonly creators: readonly TransitionCreatorRow[];
  readonly period: TransitionPeriod;
}): TransitionSnapshotBuildResult {
  const exclusions = buildCreatorExclusions(input.creators);
  const eligibleCreatorIds = new Set(
    input.creators
      .filter(isEligibleCreatorForIntelligence)
      .map((creator) => Number(creator.creator_id)),
  );
  const buckets = new Map<string, TransitionCallRow[]>();
  for (const row of input.rows) {
    if (!eligibleCreatorIds.has(Number(row.creator_id))) continue;
    const date = new Date(row.call_date);
    if (!Number.isFinite(date.getTime())) continue;
    const start = periodStartFor(date, input.period);
    const key = `${row.creator_id}:${isoDay(start)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  const snapshots = Array.from(buckets.entries())
    .map(([key, calls]) => snapshotFromCalls(calls, input.period, new Date(`${key.split(":")[1]}T00:00:00.000Z`)))
    .sort((a, b) => a.creator_id - b.creator_id || a.period_start.localeCompare(b.period_start));
  return { snapshots, exclusions };
}
