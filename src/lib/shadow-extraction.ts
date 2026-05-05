import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { NormalizedExtractedCall } from "./ai-extraction";
import type { CallType, Direction, StrategyType } from "./types";

export type ShadowDiffStatus =
  | "unchanged"
  | "new_calls"
  | "removed_calls"
  | "changed_calls"
  | "manual_review"
  | "no_accepted_calls";

export interface ShadowExtractionRunMetadata {
  readonly run_id: string;
  readonly started_at: string;
  readonly provider: string;
  readonly model: string;
  readonly fallback_model: string | null;
  readonly dry_run: boolean;
  readonly bounded_by: {
    readonly creator: string | null;
    readonly video_ids: readonly number[];
    readonly limit: number;
    readonly include_extracted: boolean;
  };
}

export interface ShadowVideoMetadata {
  readonly id: number;
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string;
  readonly youtube_video_id: string;
  readonly title: string | null;
  readonly published_at: string | null;
  readonly created_at: string | null;
}

export interface ShadowExtractedCallRecord {
  readonly record_type: "shadow_extraction";
  readonly ts: string;
  readonly run_id: string;
  readonly provider: string;
  readonly model: string;
  readonly fallback_model: string | null;
  readonly video: ShadowVideoMetadata;
  readonly transcript_sha256: string;
  readonly transcript_length: number;
  readonly candidate_count: number;
  readonly accepted_count: number;
  readonly accepted_calls: readonly NormalizedExtractedCall[];
  readonly chunk_summary: {
    readonly chunk_count: number;
    readonly covered_until_offset: number;
    readonly reached_transcript_end: boolean;
  };
  readonly error: string | null;
}

export interface ExistingCallSnapshot {
  readonly id?: number;
  readonly symbol: string;
  readonly direction: Direction;
  readonly call_type: CallType | string | null;
  readonly entry_price: number | null;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly timeframe: string | null;
  readonly confidence: "high" | "medium" | "low" | string | null;
  readonly strategy_type: StrategyType | string | null;
  readonly raw_quote: string | null;
  readonly extraction_confidence: number;
  readonly specificity_score: number;
}

export interface ShadowDiffRecord {
  readonly record_type: "shadow_diff";
  readonly ts: string;
  readonly run_id: string;
  readonly video: ShadowVideoMetadata;
  readonly status: ShadowDiffStatus;
  readonly existing_count: number;
  readonly accepted_count: number;
  readonly unchanged_count: number;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly reasons: readonly string[];
}

export function buildRunId(prefix = "shadow"): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = createHash("sha256")
    .update(`${stamp}:${process.pid}:${Math.random()}`)
    .digest("hex")
    .slice(0, 8);
  return `${prefix}-${stamp}-${suffix}`;
}

export function hashTranscript(transcript: string): string {
  return createHash("sha256").update(transcript, "utf8").digest("hex");
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return Number(value.toFixed(8)).toString();
}

export function callComparisonSignature(call: ExistingCallSnapshot | NormalizedExtractedCall): string {
  return [
    call.symbol.toUpperCase(),
    call.direction,
    call.call_type ?? "",
    normalizeNumber(call.entry_price),
    normalizeNumber(call.target_price),
    normalizeNumber(call.stop_loss),
    normalizeText(call.timeframe),
    normalizeText(call.raw_quote),
  ].join("|");
}

export function summarizeCallForDiff(call: ExistingCallSnapshot | NormalizedExtractedCall): string {
  const quote = normalizeText(call.raw_quote).slice(0, 120);
  const price = call.target_price != null ? ` target=${call.target_price}` : "";
  return `${call.symbol} ${call.direction} ${call.call_type ?? "watch"}${price}${quote ? ` :: ${quote}` : ""}`;
}

export function diffVideoShadow(
  existingCalls: readonly ExistingCallSnapshot[],
  acceptedCalls: readonly NormalizedExtractedCall[],
  reasons: readonly string[] = [],
): Omit<ShadowDiffRecord, "record_type" | "ts" | "run_id" | "video"> {
  const existingBySignature = new Map(existingCalls.map((call) => [callComparisonSignature(call), call]));
  const acceptedBySignature = new Map(acceptedCalls.map((call) => [callComparisonSignature(call), call]));

  const added = acceptedCalls
    .filter((call) => !existingBySignature.has(callComparisonSignature(call)))
    .map(summarizeCallForDiff);
  const removed = existingCalls
    .filter((call) => !acceptedBySignature.has(callComparisonSignature(call)))
    .map(summarizeCallForDiff);
  const unchangedCount = acceptedCalls.length - added.length;

  let status: ShadowDiffStatus;
  if (reasons.length > 0) status = "manual_review";
  else if (existingCalls.length === 0 && acceptedCalls.length === 0) status = "no_accepted_calls";
  else if (added.length === 0 && removed.length === 0) status = "unchanged";
  else if (existingCalls.length === 0) status = "new_calls";
  else if (acceptedCalls.length === 0) status = "removed_calls";
  else status = "changed_calls";

  return {
    status,
    existing_count: existingCalls.length,
    accepted_count: acceptedCalls.length,
    unchanged_count: Math.max(0, unchangedCount),
    added,
    removed,
    reasons,
  };
}

export function readJsonlFile<T>(filePath: string): T[] {
  const text = readFileSync(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export function writeJsonlRecord(filePath: string, record: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

export function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
