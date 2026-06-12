import { query } from "../lib/db";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  getScoreReadyIgnoringConfidenceSql,
} from "../lib/public-methodology";
import { buildRunId, hashTranscript, writeJsonFile, writeJsonlRecord, type ShadowExtractedCallRecord, type ShadowExtractionRunMetadata } from "../lib/shadow-extraction";
import type { Video } from "../lib/types";
import { extractWithModelFallback, parseOpenRouterExtractionArgs, type OpenRouterArgs } from "./extract-calls-openrouter";
import { loadEnv, runWithConcurrency, sleep, timestamp } from "./script-helpers";

type ShadowVideo = Video & { creator_id: number; creator_name: string; youtube_handle: string };

const DEFAULT_VIDEO_AGENTS = 1;
const MAX_VIDEO_AGENTS = 3;
const DEFAULT_SHADOW_MODEL = "callscore-gemma4-extractor:latest";
const DEFAULT_LOCAL_OLLAMA_HOST = "http://127.0.0.1:11434";
const DEFAULT_SHADOW_PROMPT_PROFILE = "shadow-compact";
const DEFAULT_SHADOW_CHUNK_CHARS = 350;
const DEFAULT_SHADOW_CHUNK_OVERLAP = 50;
const DEFAULT_SHADOW_MAX_CHUNKS = 1;
const DEFAULT_SHADOW_NUM_PREDICT = 350;
const DEFAULT_SHADOW_REQUEST_TIMEOUT_MS = 45_000;
const SHADOW_PROMPT_VERSION = "callscore-gemma4-shadow-v2-compact";

export interface ShadowExtractArgs extends OpenRouterArgs {
  readonly execute: boolean;
  readonly shadowOut: string;
  readonly runMetaOut: string | null;
  readonly runId: string;
  readonly pendingOnly: boolean;
  readonly lowConfidenceReady: boolean;
  readonly videoAgents: number;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0 || !argv[i + 1]) return null;
  return argv[i + 1];
}

function withShadowProviderDefaults(argv: readonly string[]): string[] {
  const withDefaults = [...argv];
  if (!argv.includes("--provider")) withDefaults.push("--provider", "ollama");
  if (!argv.includes("--model")) withDefaults.push("--model", DEFAULT_SHADOW_MODEL);
  if (!argv.includes("--ollama-host")) withDefaults.push("--ollama-host", DEFAULT_LOCAL_OLLAMA_HOST);
  if (!argv.includes("--prompt-profile")) withDefaults.push("--prompt-profile", DEFAULT_SHADOW_PROMPT_PROFILE);
  if (!argv.includes("--chunk-chars")) withDefaults.push("--chunk-chars", String(DEFAULT_SHADOW_CHUNK_CHARS));
  if (!argv.includes("--chunk-overlap")) withDefaults.push("--chunk-overlap", String(DEFAULT_SHADOW_CHUNK_OVERLAP));
  if (!argv.includes("--max-chunks")) withDefaults.push("--max-chunks", String(DEFAULT_SHADOW_MAX_CHUNKS));
  if (!argv.includes("--num-predict")) withDefaults.push("--num-predict", String(DEFAULT_SHADOW_NUM_PREDICT));
  if (!argv.includes("--request-timeout-ms")) withDefaults.push("--request-timeout-ms", String(DEFAULT_SHADOW_REQUEST_TIMEOUT_MS));
  return withDefaults;
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function boundedPositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  return Math.min(positiveInt(value, fallback), max);
}

export function parseShadowExtractArgs(argv = process.argv.slice(2)): ShadowExtractArgs {
  const base = parseOpenRouterExtractionArgs(withShadowProviderDefaults(argv));
  const execute = argv.includes("--execute") || argv.includes("--write-shadow");
  const pendingOnly = argv.includes("--pending-only");
  const lowConfidenceReady = argv.includes("--low-confidence-ready");
  const runId = argValue(argv, "--run-id") ?? buildRunId("shadow");
  return {
    ...base,
    write: false,
    dryRun: !execute,
    includeExtracted: pendingOnly ? false : true,
    execute,
    pendingOnly,
    lowConfidenceReady,
    videoAgents: boundedPositiveInt(
      argValue(argv, "--video-agents"),
      DEFAULT_VIDEO_AGENTS,
      MAX_VIDEO_AGENTS,
    ),
    shadowOut: argValue(argv, "--shadow-out") ?? `.tmp/shadow-extraction/${runId}.jsonl`,
    runMetaOut: argValue(argv, "--run-meta-out"),
    runId,
  };
}

async function loadShadowVideos(args: ShadowExtractArgs): Promise<ShadowVideo[]> {
  const params: unknown[] = [];
  const filters: string[] = ["v.transcript IS NOT NULL", "v.transcript_quality > 0.2"];
  const lowConfidenceReadySql = [
    `lc.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD}`,
    getScoreReadyIgnoringConfidenceSql("lc"),
  ].join(" AND ");

  if (args.pendingOnly && args.videoIds.length === 0) filters.push("v.calls_extracted = false");
  if (args.lowConfidenceReady) {
    filters.push(`EXISTS (SELECT 1 FROM calls lc WHERE lc.video_id = v.id AND ${lowConfidenceReadySql})`);
  }

  if (args.creatorHandle) {
    params.push(args.creatorHandle);
    filters.push(`c.youtube_handle = $${params.length}`);
  }

  if (args.videoIds.length > 0) {
    params.push(args.videoIds);
    filters.push(`v.id = ANY($${params.length}::int[])`);
  }

  const orderBy = args.lowConfidenceReady
    ? `(SELECT COUNT(*) FROM calls lc WHERE lc.video_id = v.id AND ${lowConfidenceReadySql}) DESC, v.published_at DESC NULLS LAST, v.id DESC`
    : "v.published_at DESC NULLS LAST, v.id DESC";

  params.push(args.limit);
  return query<ShadowVideo>(
    `SELECT v.*, v.creator_id, c.name as creator_name, c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE ${filters.join(" AND ")}
     ORDER BY ${orderBy}
     LIMIT $${params.length}`,
    params,
  );
}

function runMetadata(args: ShadowExtractArgs): ShadowExtractionRunMetadata {
  return {
    run_id: args.runId,
    started_at: timestamp(),
    provider: args.provider,
    model: args.model,
    fallback_model: args.fallbackModel,
    dry_run: args.dryRun,
    bounded_by: {
      creator: args.creatorHandle,
      video_ids: args.videoIds,
      limit: args.limit,
      include_extracted: args.includeExtracted,
      chunk_agents: args.chunkAgents,
      video_agents: args.videoAgents,
      low_confidence_ready: args.lowConfidenceReady,
      chunk_chars: args.chunkChars,
      chunk_overlap: args.chunkOverlap,
      max_chunks: args.maxChunks,
      request_timeout_ms: args.requestTimeoutMs,
      num_predict: args.numPredict,
      prompt_profile: args.promptProfile,
    },
  };
}

function dryRunRecord(args: ShadowExtractArgs, video: ShadowVideo): ShadowExtractedCallRecord {
  const transcript = video.transcript ?? "";
  return {
    record_type: "shadow_extraction",
    ts: timestamp(),
    run_id: args.runId,
    provider: args.provider,
    model: args.model,
    fallback_model: args.fallbackModel,
    video: {
      id: video.id,
      creator_id: video.creator_id,
      creator_name: video.creator_name,
      youtube_handle: video.youtube_handle,
      youtube_video_id: video.youtube_video_id,
      title: video.title,
      published_at: video.published_at,
      created_at: video.created_at,
    },
    transcript_sha256: hashTranscript(transcript),
    transcript_length: transcript.length,
    prompt_version: SHADOW_PROMPT_VERSION,
    schema_valid: false,
    confidence_distribution: {
      min: null,
      max: null,
      average: null,
      high_confidence_count: 0,
      medium_confidence_count: 0,
      low_confidence_count: 0,
    },
    parser_errors: ["dry_run_no_model_call"],
    latency_ms: null,
    comparison_to_rule_extractor: {
      status: "pending_shadow_diff",
      note: "Run npm run shadow:diff against this artifact for rule-extractor comparison.",
    },
    candidate_count: 0,
    accepted_count: 0,
    accepted_calls: [],
    chunk_summary: {
      chunk_count: 0,
      covered_until_offset: 0,
      reached_transcript_end: false,
    },
    error: "dry_run_no_model_call",
  };
}

function confidenceDistribution(calls: readonly { extraction_confidence?: number; confidence?: string | null }[]): NonNullable<ShadowExtractedCallRecord["confidence_distribution"]> {
  const scores = calls
    .map((call) => Number(call.extraction_confidence ?? 0))
    .filter((value) => Number.isFinite(value));
  const high = calls.filter((call) => call.confidence === "high").length;
  const medium = calls.filter((call) => call.confidence === "medium").length;
  const low = calls.filter((call) => call.confidence === "low").length;
  return {
    min: scores.length ? Math.min(...scores) : null,
    max: scores.length ? Math.max(...scores) : null,
    average: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    high_confidence_count: high,
    medium_confidence_count: medium,
    low_confidence_count: low,
  };
}

interface ShadowVideoResult {
  readonly processed: number;
  readonly failed: number;
  readonly accepted: number;
}

async function processShadowVideo(
  args: ShadowExtractArgs,
  video: ShadowVideo,
  index: number,
  total: number,
): Promise<ShadowVideoResult> {
  const transcript = video.transcript ?? "";

  if (!args.execute) {
    writeJsonlRecord(args.shadowOut, dryRunRecord(args, video));
    console.log(`[${timestamp()}] [${index + 1}/${total}] selected video ${video.id} (${video.creator_name})`);
    return { processed: 1, failed: 0, accepted: 0 };
  }

  try {
    const started = Date.now();
    const result = await extractWithModelFallback(args, transcript, video.title);
    const latencyMs = Date.now() - started;
    const record: ShadowExtractedCallRecord = {
      record_type: "shadow_extraction",
      ts: timestamp(),
      run_id: args.runId,
      provider: args.provider,
      model: result.model,
      fallback_model: args.fallbackModel,
      video: {
        id: video.id,
        creator_id: video.creator_id,
        creator_name: video.creator_name,
        youtube_handle: video.youtube_handle,
        youtube_video_id: video.youtube_video_id,
        title: video.title,
        published_at: video.published_at,
        created_at: video.created_at,
      },
      transcript_sha256: hashTranscript(transcript),
      transcript_length: transcript.length,
      prompt_version: SHADOW_PROMPT_VERSION,
      schema_valid: true,
      confidence_distribution: confidenceDistribution(result.calls),
      parser_errors: [],
      latency_ms: latencyMs,
      comparison_to_rule_extractor: {
        status: "pending_shadow_diff",
        note: "Run npm run shadow:diff against this artifact for rule-extractor comparison.",
      },
      candidate_count: result.candidates.length,
      accepted_count: result.calls.length,
      accepted_calls: result.calls,
      chunk_summary: {
        chunk_count: result.chunks.length,
        covered_until_offset: result.chunks.at(-1)?.chunk.end ?? 0,
        reached_transcript_end: (result.chunks.at(-1)?.chunk.end ?? 0) >= transcript.length,
      },
      error: null,
    };
    writeJsonlRecord(args.shadowOut, record);
    console.log(`[${timestamp()}] [${index + 1}/${total}] shadowed video ${video.id} (${video.creator_name}) -> ${result.calls.length} accepted calls`);
    return { processed: 1, failed: 0, accepted: result.calls.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const record = dryRunRecord(args, video);
    writeJsonlRecord(args.shadowOut, { ...record, error: message, parser_errors: [message] });
    console.error(`[${timestamp()}] FAIL shadow video ${video.id} (${video.creator_name}): ${message}`);
    return { processed: 0, failed: 1, accepted: 0 };
  }
}

async function processShadowVideos(
  args: ShadowExtractArgs,
  videos: readonly ShadowVideo[],
): Promise<ShadowVideoResult> {
  const totals = { processed: 0, failed: 0, accepted: 0 };

  const results = await runWithConcurrency(
    videos,
    args.videoAgents,
    async (video, index) => {
      const result = await processShadowVideo(args, video, index, videos.length);
      if (index + 1 < videos.length && args.gapMs > 0) await sleep(args.gapMs);
      return result;
    },
  );

  for (const result of results) {
    totals.processed += result.processed;
    totals.failed += result.failed;
    totals.accepted += result.accepted;
  }

  return totals;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseShadowExtractArgs(argv);
  const metadata = runMetadata(args);
  if (args.runMetaOut) writeJsonFile(args.runMetaOut, metadata);

  const videos = await loadShadowVideos(args);
  console.log(
    `[${timestamp()}] shadow extract ${args.execute ? "EXECUTE" : "DRY-RUN"}: run=${args.runId}, videos=${videos.length}, provider=${args.provider}, model=${args.model}, promptProfile=${args.promptProfile}, chunkChars=${args.chunkChars}, maxChunks=${args.maxChunks}, numPredict=${args.numPredict}, requestTimeoutMs=${args.requestTimeoutMs}, videoAgents=${args.videoAgents}, chunkAgents=${args.chunkAgents}, modelAttempts=${args.modelAttempts}, out=${args.shadowOut}`,
  );

  const { processed, failed, accepted: totalAccepted } = await processShadowVideos(
    args,
    videos,
  );

  console.log(`[${timestamp()}] shadow extract complete: ${processed}/${videos.length} videos, ${totalAccepted} accepted calls, ${failed} failed, out=${args.shadowOut}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
