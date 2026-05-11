import { query as defaultQuery } from "./db";
import { EXTRACTION_CONFIDENCE_THRESHOLD, getScoreReadyIgnoringConfidenceSql } from "./public-methodology";
import type { Direction } from "./types";
import type { PipelineJob } from "./pipeline";

export const ML_VERIFIER_PROMPT_VERSION = "ml-verifier-v1";
export const DEFAULT_ML_VERIFIER_PROVIDER = "ollama";
export const DEFAULT_ML_VERIFIER_MODEL = "kimi-k2.6";
export const DEFAULT_OLLAMA_HOST = "https://ollama.com";
export const DEFAULT_ML_VERIFIER_TIMEOUT_MS = 180_000;
export const DEFAULT_ML_VERIFIER_BATCH_SIZE = 250;

const AMBIGUOUS_TICKER_SYMBOLS = [
  "LINKUSDT",
  "NEARUSDT",
  "DOTUSDT",
  "ARUSDT",
] as const;

const DECISIONS = ["approve", "reject", "review"] as const;
const REASON_CODES = [
  "valid_call",
  "generic_word",
  "asset_not_supported",
  "direction_not_supported",
  "non_actionable",
  "quote_not_in_transcript",
  "unclear",
] as const;

export type MlVerifierDecision = (typeof DECISIONS)[number];
export type MlVerifierReasonCode = (typeof REASON_CODES)[number];

type QueryFn = <T>(text: string, params?: unknown[]) => Promise<T[]>;

export interface MlVerifierCandidate {
  readonly id: number;
  readonly creator_id: number;
  readonly video_id: number;
  readonly creator_name: string | null;
  readonly youtube_handle: string | null;
  readonly video_title: string | null;
  readonly symbol: string;
  readonly direction: Direction;
  readonly call_type: string | null;
  readonly raw_quote: string | null;
  readonly extraction_confidence: number;
  readonly specificity_score: number;
  readonly score: number;
  readonly call_date: string;
  readonly transcript: string;
  readonly candidate_bucket: string;
  readonly candidate_priority: number;
}

export interface ParsedVerifierOutput {
  readonly decision: MlVerifierDecision;
  readonly reason_code: MlVerifierReasonCode;
  readonly confidence: number;
  readonly evidence_span: string;
  readonly recommended_extraction_confidence: number;
  readonly reason: string;
}

export interface MlVerifierConfig {
  readonly provider: "ollama";
  readonly model: string;
  readonly ollamaHost: string;
  readonly promptVersion: string;
  readonly requestTimeoutMs: number;
}

export interface MlVerifierMetrics extends Record<string, unknown> {
  readonly selected: number;
  readonly processed: number;
  readonly approved: number;
  readonly rejected: number;
  readonly review: number;
  readonly prompt_version: string;
  readonly provider: string;
  readonly model: string;
  readonly audit_only: true;
}

interface RunVerifierDeps {
  readonly queryFn?: QueryFn;
  readonly verifyCandidate?: (
    candidate: MlVerifierCandidate,
    config: MlVerifierConfig,
  ) => Promise<ParsedVerifierOutput>;
}

function isDecision(value: unknown): value is MlVerifierDecision {
  return DECISIONS.includes(value as MlVerifierDecision);
}

function isReasonCode(value: unknown): value is MlVerifierReasonCode {
  return REASON_CODES.includes(value as MlVerifierReasonCode);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function zeroToOne(value: unknown, field: string): number {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed < 0 || parsed > 1) {
    throw new Error(`${field} must be a number from 0 to 1`);
  }
  return parsed;
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function extractJsonObjectText(text: string): string {
  const trimmed = stripJsonFence(text);
  // Strategy 1: whole string is already a JSON object
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // Not valid JSON, keep trying
    }
  }

  // Strategy 2: find first '{' and last '}' with balanced braces
  let start = -1;
  let end = -1;
  let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (start >= 0 && end > start) {
    try {
      const candidate = trimmed.slice(start, end + 1).trim();
      JSON.parse(candidate);
      return candidate;
    } catch {
      // keep trying
    }
  }

  // Strategy 3: brute force indexOf {/lastIndexOf } — tolerate trailing comma etc
  start = trimmed.indexOf("{");
  end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const candidate = trimmed.slice(start, end + 1).trim();
      JSON.parse(candidate);
      return candidate;
    } catch {
      // keep trying
    }
  }

  throw new Error(`Response does not contain valid JSON object. Received: ${trimmed.slice(0, 300)}${trimmed.length > 300 ? " ..." : ""}`);
}

export function parseVerifierOutput(text: string): ParsedVerifierOutput {
  const parsed: unknown = JSON.parse(extractJsonObjectText(text));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Verifier response must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  if (!isDecision(record.decision)) {
    throw new Error("Verifier decision must be approve, reject, or review");
  }
  if (!isReasonCode(record.reason_code)) {
    throw new Error("Verifier reason_code is not supported");
  }
  const evidenceSpan = typeof record.evidence_span === "string"
    ? record.evidence_span.trim()
    : "";
  // evidence_span is optional — LLMs may omit or return empty
  return {
    decision: record.decision,
    reason_code: record.reason_code,
    confidence: zeroToOne(record.confidence, "confidence"),
    evidence_span: evidenceSpan.slice(0, 4000) || "",
    recommended_extraction_confidence: zeroToOne(
      record.recommended_extraction_confidence,
      "recommended_extraction_confidence",
    ),
    reason: typeof record.reason === "string" ? record.reason : "",
  };
}

function normalizeNumber(value: unknown): number {
  const parsed = finiteNumber(value);
  return parsed === null ? 0 : parsed;
}

function normalizeCandidate(row: MlVerifierCandidate): MlVerifierCandidate {
  return {
    ...row,
    id: Number(row.id),
    creator_id: Number(row.creator_id),
    video_id: Number(row.video_id),
    extraction_confidence: normalizeNumber(row.extraction_confidence),
    specificity_score: normalizeNumber(row.specificity_score),
    score: normalizeNumber(row.score),
    candidate_priority: Number(row.candidate_priority),
  };
}

export function sortAndDedupeVerifierCandidates(
  rows: readonly MlVerifierCandidate[],
  limit: number,
): MlVerifierCandidate[] {
  const byId = new Map<number, MlVerifierCandidate>();
  const sorted = rows
    .map(normalizeCandidate)
    .sort((a, b) => (
      a.candidate_priority - b.candidate_priority ||
      a.extraction_confidence - b.extraction_confidence ||
      new Date(b.call_date).getTime() - new Date(a.call_date).getTime() ||
      a.id - b.id
    ));

  for (const row of sorted) {
    if (!byId.has(row.id)) byId.set(row.id, row);
    if (byId.size >= limit) break;
  }

  return Array.from(byId.values());
}

export function buildMlVerifierCandidateSql(): string {
  const scoreReadySql = getScoreReadyIgnoringConfidenceSql("c");
  return `WITH candidates AS (
    SELECT
      c.id,
      c.creator_id,
      c.video_id,
      cr.name AS creator_name,
      cr.youtube_handle,
      v.title AS video_title,
      c.symbol,
      c.direction,
      c.call_type,
      c.raw_quote,
      c.extraction_confidence,
      c.specificity_score,
      c.score,
      c.call_date,
      v.transcript,
      'low_confidence_score_ready'::text AS candidate_bucket,
      1 AS candidate_priority
    FROM calls c
    JOIN videos v ON v.id = c.video_id
    JOIN creators cr ON cr.id = c.creator_id
    WHERE c.extraction_confidence < $1
      AND v.transcript IS NOT NULL
      AND v.transcript <> ''
      AND ${scoreReadySql}

    UNION ALL

    SELECT
      c.id,
      c.creator_id,
      c.video_id,
      cr.name AS creator_name,
      cr.youtube_handle,
      v.title AS video_title,
      c.symbol,
      c.direction,
      c.call_type,
      c.raw_quote,
      c.extraction_confidence,
      c.specificity_score,
      c.score,
      c.call_date,
      v.transcript,
      'ambiguous_ticker'::text AS candidate_bucket,
      2 AS candidate_priority
    FROM calls c
    JOIN videos v ON v.id = c.video_id
    JOIN creators cr ON cr.id = c.creator_id
    WHERE c.symbol = ANY($3::text[])
      AND v.transcript IS NOT NULL
      AND v.transcript <> ''

    UNION ALL

    SELECT
      c.id,
      c.creator_id,
      c.video_id,
      cr.name AS creator_name,
      cr.youtube_handle,
      v.title AS video_title,
      c.symbol,
      c.direction,
      c.call_type,
      c.raw_quote,
      c.extraction_confidence,
      c.specificity_score,
      c.score,
      c.call_date,
      v.transcript,
      'recent_low_confidence_transcript'::text AS candidate_bucket,
      3 AS candidate_priority
    FROM calls c
    JOIN videos v ON v.id = c.video_id
    JOIN creators cr ON cr.id = c.creator_id
    WHERE c.extraction_confidence < $1
      AND v.transcript IS NOT NULL
      AND v.transcript <> ''
      AND c.call_date >= NOW() - INTERVAL '180 days'
  )
  SELECT *
  FROM candidates candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM ml_verification_runs existing
    WHERE existing.call_id = candidate.id
      AND existing.prompt_version = $2
  )
  ORDER BY candidate_priority ASC, extraction_confidence ASC, call_date DESC, id ASC
  LIMIT $4`;
}

export async function selectMlVerifierCandidates(input: {
  readonly limit: number;
  readonly promptVersion?: string;
  readonly queryFn?: QueryFn;
}): Promise<MlVerifierCandidate[]> {
  const limit = Math.max(1, Math.min(1000, Math.floor(input.limit)));
  const broadLimit = Math.max(limit, limit * 4);
  const queryFn = input.queryFn ?? defaultQuery;
  const rows = await queryFn<MlVerifierCandidate>(
    buildMlVerifierCandidateSql(),
    [
      EXTRACTION_CONFIDENCE_THRESHOLD,
      input.promptVersion ?? ML_VERIFIER_PROMPT_VERSION,
      [...AMBIGUOUS_TICKER_SYMBOLS],
      broadLimit,
    ],
  );
  return sortAndDedupeVerifierCandidates(rows, limit);
}

function sanitizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function transcriptContext(candidate: MlVerifierCandidate, maxChars = 12_000): string {
  const transcript = candidate.transcript ?? "";
  const quote = sanitizeWhitespace(candidate.raw_quote ?? "");
  const lowerTranscript = transcript.toLowerCase();
  const lowerQuote = quote.toLowerCase();

  if (lowerQuote.length >= 16) {
    const index = lowerTranscript.indexOf(lowerQuote.slice(0, Math.min(160, lowerQuote.length)));
    if (index >= 0) {
      const radius = Math.floor(maxChars / 2);
      return transcript.slice(Math.max(0, index - radius), Math.min(transcript.length, index + radius));
    }
  }

  return transcript.slice(0, maxChars);
}

export function buildVerifierPrompt(candidate: MlVerifierCandidate): string {
  return `You are an audit-only verifier for extracted crypto YouTube calls.

Your job: decide whether the stored candidate is a real actionable tracked-asset call supported by the transcript. Do not promote or mutate production data.

Pay special attention to ambiguous tickers:
- LINK must mean Chainlink, not a generic link.
- NEAR must mean NEAR Protocol, not the word "near".
- DOT must mean Polkadot, not a dot on a chart.
- AR must mean Arweave, not AR glasses, augmented reality, or the word "are".

Return ONLY one JSON object:
{
  "decision": "approve|reject|review",
  "reason_code": "valid_call|generic_word|asset_not_supported|direction_not_supported|non_actionable|quote_not_in_transcript|unclear",
  "confidence": 0.0,
  "evidence_span": "short exact transcript span supporting your decision",
  "recommended_extraction_confidence": 0.0,
  "reason": "short audit explanation"
}

Decision rules:
- approve: transcript clearly supports the same asset and direction/actionability.
- reject: candidate is clearly false, generic, unsupported, non-actionable, or quote is absent from transcript.
- review: evidence is mixed or insufficient for an automated audit decision.

Candidate:
creator: ${candidate.creator_name ?? "unknown"} (${candidate.youtube_handle ?? "unknown"})
video_title: ${candidate.video_title ?? "unknown"}
call_id: ${candidate.id}
symbol: ${candidate.symbol}
direction: ${candidate.direction}
call_type: ${candidate.call_type ?? "unknown"}
raw_quote: ${candidate.raw_quote ?? ""}
stored_extraction_confidence: ${candidate.extraction_confidence}
candidate_bucket: ${candidate.candidate_bucket}

Transcript context:
${transcriptContext(candidate)}`;
}

function getOllamaApiKey(env = process.env): string | undefined {
  return env.OLLAMA_API_KEY || env.OLLAMA_TOKEN;
}

function buildOllamaHeaders(host: string, apiKey = getOllamaApiKey()): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (host.replace(/\/+$/, "") === DEFAULT_OLLAMA_HOST && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export function resolveMlVerifierConfig(env = process.env): MlVerifierConfig {
  const provider = env.ML_VERIFIER_PROVIDER ?? DEFAULT_ML_VERIFIER_PROVIDER;
  if (provider !== "ollama") {
    throw new Error(`Unsupported ML_VERIFIER_PROVIDER ${provider}; v1 supports ollama only`);
  }
  const requestTimeoutMs = Math.max(
    1_000,
    Math.floor(Number(env.ML_VERIFIER_TIMEOUT_MS ?? DEFAULT_ML_VERIFIER_TIMEOUT_MS)),
  );
  return {
    provider,
    model: env.ML_VERIFIER_MODEL ?? env.OLLAMA_MODEL ?? DEFAULT_ML_VERIFIER_MODEL,
    ollamaHost: (env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST).replace(/\/+$/, ""),
    promptVersion: env.ML_VERIFIER_PROMPT_VERSION ?? ML_VERIFIER_PROMPT_VERSION,
    requestTimeoutMs,
  };
}

export function buildOllamaVerifierRequestBody(
  candidate: MlVerifierCandidate,
  config: MlVerifierConfig,
): Record<string, unknown> {
  return {
    model: config.model,
    messages: [{ role: "user", content: buildVerifierPrompt(candidate) }],
    stream: false,
    format: "json",
    think: false,
    options: {
      temperature: 0,
      num_predict: 900,
    },
  };
}

export async function verifyCandidateWithOllama(
  candidate: MlVerifierCandidate,
  config: MlVerifierConfig,
): Promise<ParsedVerifierOutput> {
  if (config.ollamaHost === DEFAULT_OLLAMA_HOST && !getOllamaApiKey()) {
    throw new Error("OLLAMA_API_KEY or OLLAMA_TOKEN not configured for Ollama Cloud");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${config.ollamaHost}/api/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: buildOllamaHeaders(config.ollamaHost),
      body: JSON.stringify(buildOllamaVerifierRequestBody(candidate, config)),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Ollama verifier timed out after ${config.requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama verifier HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const parsed: unknown = JSON.parse(body);
  const content = (parsed as { message?: { content?: unknown } }).message?.content;
  if (typeof content !== "string") {
    throw new Error(`Ollama verifier response missing message content: ${body.slice(0, 500)}`);
  }
  return parseVerifierOutput(content);
}

function payloadNumber(payload: Record<string, unknown>, key: string, fallback: number): number {
  const parsed = finiteNumber(payload[key]);
  return parsed !== null && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function insertVerificationRun(input: {
  readonly job: PipelineJob;
  readonly candidate: MlVerifierCandidate;
  readonly config: MlVerifierConfig;
  readonly output: ParsedVerifierOutput;
  readonly queryFn: QueryFn;
}): Promise<void> {
  await input.queryFn(
    `INSERT INTO ml_verification_runs (
       run_id,
       job_id,
       call_id,
       video_id,
       creator_id,
       provider,
       model,
       prompt_version,
       candidate_bucket,
       decision,
       reason_code,
       confidence,
       evidence_span,
       recommended_extraction_confidence,
       reason,
       request_payload,
       response_payload
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb
     )
     ON CONFLICT (call_id, prompt_version, provider, model) DO UPDATE
       SET run_id = EXCLUDED.run_id,
           job_id = EXCLUDED.job_id,
           candidate_bucket = EXCLUDED.candidate_bucket,
           decision = EXCLUDED.decision,
           reason_code = EXCLUDED.reason_code,
           confidence = EXCLUDED.confidence,
           evidence_span = EXCLUDED.evidence_span,
           recommended_extraction_confidence = EXCLUDED.recommended_extraction_confidence,
           reason = EXCLUDED.reason,
           request_payload = EXCLUDED.request_payload,
           response_payload = EXCLUDED.response_payload,
           created_at = NOW()`,
    [
      input.job.run_id,
      input.job.id,
      input.candidate.id,
      input.candidate.video_id,
      input.candidate.creator_id,
      input.config.provider,
      input.config.model,
      input.config.promptVersion,
      input.candidate.candidate_bucket,
      input.output.decision,
      input.output.reason_code,
      input.output.confidence,
      input.output.evidence_span,
      input.output.recommended_extraction_confidence,
      input.output.reason,
      JSON.stringify({
        call_id: input.candidate.id,
        symbol: input.candidate.symbol,
        direction: input.candidate.direction,
        raw_quote: input.candidate.raw_quote,
        extraction_confidence: input.candidate.extraction_confidence,
        prompt_version: input.config.promptVersion,
      }),
      JSON.stringify(input.output),
    ],
  );
}

async function writeVerifierEvent(input: {
  readonly job: PipelineJob;
  readonly eventType: string;
  readonly status: string;
  readonly message: string;
  readonly payload?: Record<string, unknown>;
  readonly queryFn: QueryFn;
}): Promise<void> {
  await input.queryFn(
    `INSERT INTO pipeline_job_events (
       run_id, job_id, event_type, status, message, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.job.run_id,
      input.job.id,
      input.eventType,
      input.status,
      input.message,
      JSON.stringify(input.payload ?? {}),
    ],
  );
}

export async function runMlVerifierBatch(
  job: PipelineJob,
  deps: RunVerifierDeps = {},
): Promise<MlVerifierMetrics> {
  const queryFn = deps.queryFn ?? defaultQuery;
  const config = resolveMlVerifierConfig();
  const batchSize = payloadNumber(job.payload, "batch_size", DEFAULT_ML_VERIFIER_BATCH_SIZE);
  const candidates = await selectMlVerifierCandidates({
    limit: batchSize,
    promptVersion: config.promptVersion,
    queryFn,
  });

  await writeVerifierEvent({
    job,
    eventType: "ml_verifier_started",
    status: "running",
    message: `Selected ${candidates.length} verifier candidates`,
    payload: { selected: candidates.length, batch_size: batchSize },
    queryFn,
  });

  let processed = 0;
  let approved = 0;
  let rejected = 0;
  let review = 0;

  for (const candidate of candidates) {
    let output: ParsedVerifierOutput;
    try {
      output = deps.verifyCandidate
        ? await deps.verifyCandidate(candidate, config)
        : await verifyCandidateWithOllama(candidate, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeVerifierEvent({
        job,
        eventType: "ml_verifier_provider_error",
        status: "review",
        message,
        payload: { call_id: candidate.id, symbol: candidate.symbol, error: message },
        queryFn,
      });
      // Degrade gracefully: mark candidate as "review" and continue.
      // Do NOT throw — one bad LLM response must not abort 249 other candidates.
      output = {
        decision: "review",
        reason_code: "unclear",
        confidence: 0,
        evidence_span: "",
        recommended_extraction_confidence: 0,
        reason: `LLM parse error: ${message.slice(0, 200)}`,
      };
      review += 1;
      processed += 1;
      await insertVerificationRun({ job, candidate, config, output, queryFn });
      continue;
    }

    await insertVerificationRun({ job, candidate, config, output, queryFn });

    processed += 1;
    if (output.decision === "approve") approved += 1;
    if (output.decision === "reject") rejected += 1;
    if (output.decision === "review") review += 1;
  }

  const metrics: MlVerifierMetrics = {
    selected: candidates.length,
    processed,
    approved,
    rejected,
    review,
    prompt_version: config.promptVersion,
    provider: config.provider,
    model: config.model,
    audit_only: true,
  };

  await writeVerifierEvent({
    job,
    eventType: "ml_verifier_completed",
    status: "succeeded",
    message: `Verifier wrote ${metrics.processed} audit decisions`,
    payload: metrics,
    queryFn,
  });

  return metrics;
}
