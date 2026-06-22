import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FreshCallDiscoveryEventSchema, SentinelRunReceiptSchema, type FreshCallDiscoveryEvent } from "../autonomy/contracts";

export const FRESH_CALL_SENTINEL_ID = "fresh-call-sentinel" as const;
export const FRESH_CALL_SENTINEL_RECEIPT_SCHEMA_VERSION = "callscore_sentinel_run_receipt.v1" as const;
export const FRESH_CALL_SENTINEL_RECEIPT_DIR = ".tmp/workflow-receipts/fresh_call_sentinel" as const;

export const FRESH_CALL_CANDIDATE_SOURCES = [
  "youtube_rss",
  "youtube_api",
  "transcript_worklist",
  "manual_seed",
  "public_read_api",
  "pipeline_job",
] as const;

export const FRESH_CALL_TRANSCRIPT_STATUSES = [
  "missing",
  "queued",
  "ready",
  "cooldown",
  "failed",
  "not_required",
] as const;

export type FreshCallCandidateSource = (typeof FRESH_CALL_CANDIDATE_SOURCES)[number];
export type FreshCallTranscriptStatus = (typeof FRESH_CALL_TRANSCRIPT_STATUSES)[number];
export type FreshCallCandidateKind = "creator" | "video" | "call";
export type FreshCallSentinelMode = "read_only" | "dry_run_enqueue" | "blocked";
export type FreshCallRecommendationAction =
  | "review_creator_candidate"
  | "collect_transcript_laptop"
  | "run_bounded_call_extraction";

export interface FreshCallCandidate {
  readonly kind: FreshCallCandidateKind;
  readonly source: FreshCallCandidateSource;
  readonly creator_id?: string | number | null;
  readonly creator_handle?: string | null;
  readonly video_id?: string | number | null;
  readonly youtube_video_id?: string | null;
  readonly published_at?: string | null;
  readonly transcript_status?: FreshCallTranscriptStatus;
  readonly candidate_call_count?: number;
  readonly dedupe_key?: string | null;
}

export interface FreshCallDedupeState {
  readonly dedupeKeys?: ReadonlySet<string> | readonly string[];
  readonly creatorHandles?: ReadonlySet<string> | readonly string[];
  readonly videoYoutubeIds?: ReadonlySet<string> | readonly string[];
  readonly callVideoIds?: ReadonlySet<string> | readonly string[];
  readonly callYoutubeVideoIds?: ReadonlySet<string> | readonly string[];
  readonly pipelineJobIdempotencyKeys?: ReadonlySet<string> | readonly string[];
  readonly channelTaskIdempotencyKeys?: ReadonlySet<string> | readonly string[];
}

export interface FreshCallProviderCooldown {
  readonly active: boolean;
  readonly reason?: string | null;
  readonly until?: string | null;
}

export interface FreshCallSentinelInput {
  readonly candidates: readonly FreshCallCandidate[];
  readonly existing?: FreshCallDedupeState;
  readonly cooldown?: FreshCallProviderCooldown | null;
  readonly mode?: Exclude<FreshCallSentinelMode, "blocked">;
  readonly now?: Date;
  readonly repoRoot?: string;
  readonly writeReceipt?: boolean;
}

export interface FreshCallRecommendation {
  readonly action: FreshCallRecommendationAction;
  readonly candidate: FreshCallCandidate;
  readonly dedupe_key: string;
  readonly idempotency_key: string;
  readonly reason_codes: readonly string[];
}

export interface FreshCallSentinelReceipt {
  readonly schema_version: typeof FRESH_CALL_SENTINEL_RECEIPT_SCHEMA_VERSION;
  readonly receipt_id: string;
  readonly created_at: string;
  readonly sentinel_id: typeof FRESH_CALL_SENTINEL_ID;
  readonly mode: FreshCallSentinelMode;
  readonly input_hash: string;
  readonly events_seen: number;
  readonly events_new: number;
  readonly events_duplicate: number;
  readonly events_cooldown_blocked: number;
  readonly tasks_enqueued: number;
  readonly discovered_count: number;
  readonly skipped_duplicate_count: number;
  readonly skipped_cooldown_count: number;
  readonly enqueued_count: number;
  readonly recommended_count: number;
  readonly production_mutation_performed: false;
  readonly provider_mutation_performed: false;
  readonly external_send_performed: false;
  readonly cooldowns_respected: boolean;
  readonly dedupe_keys: readonly string[];
  readonly blockers: readonly string[];
  readonly blocker: string | null;
  readonly artifact_path: string;
  readonly receipt_path: string;
}

export interface FreshCallSentinelResult {
  readonly receipt: FreshCallSentinelReceipt;
  readonly recommendations: readonly FreshCallRecommendation[];
  readonly events: readonly FreshCallDiscoveryEvent[];
}

type FreshCallDiscoveryDecision = FreshCallDiscoveryEvent["decision"];

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function timestampForPath(value: Date): string {
  return value.toISOString().replace(/[:.]/g, "-");
}

function toSet(value: ReadonlySet<string> | readonly string[] | undefined): ReadonlySet<string> {
  if (!value) return new Set();
  if (value instanceof Set) return value;
  return new Set(value);
}

function normalizeKeyPart(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function normalizeHandle(value: string | null | undefined): string | null {
  const part = normalizeKeyPart(value);
  if (!part) return null;
  return part.startsWith("@") ? part : `@${part}`;
}

function isCandidateSource(value: unknown): value is FreshCallCandidateSource {
  return typeof value === "string" && (FRESH_CALL_CANDIDATE_SOURCES as readonly string[]).includes(value);
}

function isTranscriptStatus(value: unknown): value is FreshCallTranscriptStatus {
  return typeof value === "string" && (FRESH_CALL_TRANSCRIPT_STATUSES as readonly string[]).includes(value);
}

function normalizePublishedAt(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const postgresLike = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:\s*([+-]\d{2})(?::?(\d{2}))?|\s*(Z))?$/i);
  const normalized = postgresLike
    ? `${postgresLike[1]}T${postgresLike[2]}${postgresLike[5] ? "Z" : postgresLike[3] ? `${postgresLike[3]}:${postgresLike[4] ?? "00"}` : "Z"}`
    : trimmed;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function malformedCandidateBlocker(candidate: FreshCallCandidate): string | null {
  if (!["creator", "video", "call"].includes(candidate.kind)) return "malformed_source";
  if (!isCandidateSource(candidate.source)) return "malformed_source";
  if (candidate.transcript_status !== undefined && !isTranscriptStatus(candidate.transcript_status)) return "malformed_source";
  if (candidate.published_at !== undefined && candidate.published_at !== null && !normalizePublishedAt(candidate.published_at)) return "malformed_published_at";
  if (candidate.kind === "creator") return !normalizeHandle(candidate.creator_handle) && !normalizeKeyPart(candidate.creator_id) ? "malformed_source" : null;
  if (candidate.kind === "video" || candidate.kind === "call") {
    return !normalizeKeyPart(candidate.video_id) && !normalizeKeyPart(candidate.youtube_video_id) ? "malformed_source" : null;
  }
  return "malformed_source";
}

export function buildFreshCallDedupeKey(candidate: FreshCallCandidate): string {
  if (candidate.dedupe_key?.trim()) return candidate.dedupe_key.trim().toLowerCase();
  const creator = normalizeHandle(candidate.creator_handle) ?? normalizeKeyPart(candidate.creator_id) ?? "unknown-creator";
  const video = normalizeKeyPart(candidate.youtube_video_id) ?? normalizeKeyPart(candidate.video_id);
  if (candidate.kind === "creator") return `${candidate.source}:creator:${creator}`;
  return `${candidate.source}:${candidate.kind}:${creator}:${video ?? "unknown-video"}`;
}

export function buildFreshCallRecommendationIdempotencyKey(candidate: FreshCallCandidate): string {
  return `${FRESH_CALL_SENTINEL_ID}:${candidate.kind}:${buildFreshCallDedupeKey(candidate)}`;
}

function needsTranscriptProvider(candidate: FreshCallCandidate): boolean {
  if (candidate.kind !== "video") return false;
  const status = candidate.transcript_status ?? "missing";
  return status === "missing" || status === "queued" || status === "cooldown";
}

function recommendationAction(candidate: FreshCallCandidate): FreshCallRecommendationAction {
  if (candidate.kind === "creator") return "review_creator_candidate";
  if (needsTranscriptProvider(candidate)) return "collect_transcript_laptop";
  return "run_bounded_call_extraction";
}

function isDuplicate(candidate: FreshCallCandidate, dedupeKey: string, idempotencyKey: string, seen: ReadonlySet<string>, existing: FreshCallDedupeState): boolean {
  if (seen.has(dedupeKey)) return true;
  if (toSet(existing.dedupeKeys).has(dedupeKey)) return true;
  if (toSet(existing.pipelineJobIdempotencyKeys).has(idempotencyKey)) return true;
  if (toSet(existing.channelTaskIdempotencyKeys).has(idempotencyKey)) return true;

  const handle = normalizeHandle(candidate.creator_handle);
  const videoId = normalizeKeyPart(candidate.video_id);
  const youtubeVideoId = normalizeKeyPart(candidate.youtube_video_id);

  if (candidate.kind === "creator" && handle && toSet(existing.creatorHandles).has(handle)) return true;
  if (candidate.kind === "video" && youtubeVideoId && toSet(existing.videoYoutubeIds).has(youtubeVideoId)) return true;
  if (candidate.kind === "call") {
    if (videoId && toSet(existing.callVideoIds).has(videoId)) return true;
    if (youtubeVideoId && toSet(existing.callYoutubeVideoIds).has(youtubeVideoId)) return true;
  }
  return false;
}

function buildReceipt(input: {
  readonly now: Date;
  readonly mode: FreshCallSentinelMode;
  readonly candidates: readonly FreshCallCandidate[];
  readonly recommendations: readonly FreshCallRecommendation[];
  readonly duplicateCount: number;
  readonly cooldownCount: number;
  readonly blockers: readonly string[];
  readonly receiptPath: string;
}): FreshCallSentinelReceipt {
  const createdAt = input.now.toISOString();
  const dedupeKeys = input.recommendations.map((item) => item.dedupe_key);
  const receipt = {
    schema_version: FRESH_CALL_SENTINEL_RECEIPT_SCHEMA_VERSION,
    receipt_id: `${FRESH_CALL_SENTINEL_ID}-${timestampForPath(input.now)}-${randomUUID()}`,
    created_at: createdAt,
    sentinel_id: FRESH_CALL_SENTINEL_ID,
    mode: input.mode,
    input_hash: sha256(input.candidates),
    events_seen: input.candidates.length,
    events_new: input.recommendations.length,
    events_duplicate: input.duplicateCount,
    events_cooldown_blocked: input.cooldownCount,
    tasks_enqueued: 0,
    discovered_count: input.mode === "blocked" ? 0 : input.candidates.length,
    skipped_duplicate_count: input.duplicateCount,
    skipped_cooldown_count: input.cooldownCount,
    enqueued_count: 0,
    recommended_count: input.recommendations.length,
    production_mutation_performed: false,
    provider_mutation_performed: false,
    external_send_performed: false,
    cooldowns_respected: true,
    dedupe_keys: dedupeKeys,
    blockers: [...input.blockers],
    blocker: input.blockers[0] ?? null,
    artifact_path: input.receiptPath,
    receipt_path: input.receiptPath,
  } satisfies FreshCallSentinelReceipt;
  SentinelRunReceiptSchema.parse(receipt);
  return receipt;
}

function buildDiscoveryEvent(input: {
  readonly now: Date;
  readonly candidate: FreshCallCandidate;
  readonly dedupeKey: string;
  readonly decision: FreshCallDiscoveryDecision;
  readonly reasonCodes: readonly string[];
  readonly cooldown?: FreshCallProviderCooldown | null;
}): FreshCallDiscoveryEvent {
  return FreshCallDiscoveryEventSchema.parse({
    schema_version: "callscore_fresh_call_discovery_event.v1",
    event_id: `fresh-call-event-${createHash("sha256").update(`${input.now.toISOString()}:${input.dedupeKey}:${input.decision}`).digest("hex").slice(0, 16)}`,
    created_at: input.now.toISOString(),
    source: input.candidate.source,
    creator_id: input.candidate.creator_id ?? null,
    creator_handle: input.candidate.creator_handle ?? null,
    video_id: input.candidate.video_id ?? null,
    youtube_video_id: input.candidate.youtube_video_id ?? null,
    published_at: normalizePublishedAt(input.candidate.published_at) ?? null,
    transcript_status: input.candidate.transcript_status ?? (input.candidate.kind === "creator" ? "not_required" : "missing"),
    candidate_call_count: input.candidate.candidate_call_count ?? 0,
    evidence_level: (input.candidate.candidate_call_count ?? 0) > 0 ? "E2" : "E1",
    dedupe_key: input.dedupeKey,
    payload_hash: sha256({ candidate: input.candidate, decision: input.decision, dedupe_key: input.dedupeKey }),
    cooldown: {
      active: Boolean(input.cooldown?.active),
      reason: input.cooldown?.reason ?? null,
      until: input.cooldown?.until ?? null,
    },
    decision: input.decision,
    reason_codes: [...input.reasonCodes],
  });
}

export function runFreshCallSentinel(input: FreshCallSentinelInput): FreshCallSentinelResult {
  const now = input.now ?? new Date();
  const repoRoot = input.repoRoot ?? process.cwd();
  const receiptPath = join(repoRoot, FRESH_CALL_SENTINEL_RECEIPT_DIR, `${FRESH_CALL_SENTINEL_ID}-${timestampForPath(now)}.json`);
  const existing = input.existing ?? {};
  const malformedBlocker = input.candidates.map(malformedCandidateBlocker).find((blocker): blocker is string => Boolean(blocker));

  if (malformedBlocker) {
    const receipt = buildReceipt({
      now,
      mode: "blocked",
      candidates: input.candidates,
      recommendations: [],
      duplicateCount: 0,
      cooldownCount: 0,
      blockers: [malformedBlocker],
      receiptPath,
    });
    if (input.writeReceipt) writeFreshCallSentinelReceipt(receipt);
    return { receipt, recommendations: [], events: [] };
  }

  const seen = new Set<string>();
  const recommendations: FreshCallRecommendation[] = [];
  const events: FreshCallDiscoveryEvent[] = [];
  let duplicateCount = 0;
  let cooldownCount = 0;

  for (const item of input.candidates) {
    const dedupeKey = buildFreshCallDedupeKey(item);
    const idempotencyKey = buildFreshCallRecommendationIdempotencyKey(item);
    if (isDuplicate(item, dedupeKey, idempotencyKey, seen, existing)) {
      duplicateCount += 1;
      events.push(buildDiscoveryEvent({ now, candidate: item, dedupeKey, decision: "suppress_duplicate", reasonCodes: ["duplicate_candidate"], cooldown: input.cooldown }));
      continue;
    }
    seen.add(dedupeKey);

    if (input.cooldown?.active && needsTranscriptProvider(item)) {
      cooldownCount += 1;
      events.push(buildDiscoveryEvent({ now, candidate: item, dedupeKey, decision: "wait_cooldown", reasonCodes: ["provider_cooldown_active"], cooldown: input.cooldown }));
      continue;
    }

    const decision: FreshCallDiscoveryDecision = item.kind === "creator"
      ? "review_source_identity"
      : (item.candidate_call_count ?? 0) > 0
        ? "enqueue_extract"
        : "ignore_no_call_signal";
    const reasonCodes = decision === "review_source_identity"
      ? ["new_creator_candidate"]
      : decision === "enqueue_extract"
        ? ["fresh_call_opportunity"]
        : ["no_call_signal"];
    events.push(buildDiscoveryEvent({ now, candidate: item, dedupeKey, decision, reasonCodes, cooldown: input.cooldown }));

    if (decision !== "enqueue_extract") continue;

    recommendations.push({
      action: recommendationAction(item),
      candidate: item,
      dedupe_key: dedupeKey,
      idempotency_key: idempotencyKey,
      reason_codes: item.kind === "creator" ? ["new_creator_candidate"] : ["fresh_call_opportunity"],
    });
  }

  const receipt = buildReceipt({
    now,
    mode: input.mode ?? "read_only",
    candidates: input.candidates,
    recommendations,
    duplicateCount,
    cooldownCount,
    blockers: [],
    receiptPath,
  });
  if (input.writeReceipt) writeFreshCallSentinelReceipt(receipt);
  return { receipt, recommendations, events };
}

export function writeFreshCallSentinelReceipt(receipt: FreshCallSentinelReceipt): string {
  mkdirSync(dirname(receipt.receipt_path), { recursive: true });
  writeFileSync(receipt.receipt_path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt.receipt_path;
}
