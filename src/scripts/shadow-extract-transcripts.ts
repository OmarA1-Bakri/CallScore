import { query } from "../lib/db";
import { buildRunId, hashTranscript, writeJsonFile, writeJsonlRecord, type ShadowExtractedCallRecord, type ShadowExtractionRunMetadata } from "../lib/shadow-extraction";
import type { Video } from "../lib/types";
import { extractWithModelFallback, parseOpenRouterExtractionArgs, type OpenRouterArgs } from "./extract-calls-openrouter";
import { loadEnv, sleep, timestamp } from "./script-helpers";

type ShadowVideo = Video & { creator_id: number; creator_name: string; youtube_handle: string };

export interface ShadowExtractArgs extends OpenRouterArgs {
  readonly execute: boolean;
  readonly shadowOut: string;
  readonly runMetaOut: string | null;
  readonly runId: string;
  readonly pendingOnly: boolean;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0 || !argv[i + 1]) return null;
  return argv[i + 1];
}

export function parseShadowExtractArgs(argv = process.argv.slice(2)): ShadowExtractArgs {
  const base = parseOpenRouterExtractionArgs(argv);
  const execute = argv.includes("--execute") || argv.includes("--write-shadow");
  const pendingOnly = argv.includes("--pending-only");
  const runId = argValue(argv, "--run-id") ?? buildRunId("shadow");
  return {
    ...base,
    write: false,
    dryRun: !execute,
    includeExtracted: pendingOnly ? false : true,
    execute,
    pendingOnly,
    shadowOut: argValue(argv, "--shadow-out") ?? `.tmp/shadow-extraction/${runId}.jsonl`,
    runMetaOut: argValue(argv, "--run-meta-out"),
    runId,
  };
}

async function loadShadowVideos(args: ShadowExtractArgs): Promise<ShadowVideo[]> {
  const params: unknown[] = [];
  const filters: string[] = ["v.transcript IS NOT NULL", "v.transcript_quality > 0.2"];

  if (args.pendingOnly && args.videoIds.length === 0) filters.push("v.calls_extracted = false");

  if (args.creatorHandle) {
    params.push(args.creatorHandle);
    filters.push(`c.youtube_handle = $${params.length}`);
  }

  if (args.videoIds.length > 0) {
    params.push(args.videoIds);
    filters.push(`v.id = ANY($${params.length}::int[])`);
  }

  params.push(args.limit);
  return query<ShadowVideo>(
    `SELECT v.*, v.creator_id, c.name as creator_name, c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE ${filters.join(" AND ")}
     ORDER BY v.published_at DESC NULLS LAST, v.id DESC
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

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseShadowExtractArgs(argv);
  const metadata = runMetadata(args);
  if (args.runMetaOut) writeJsonFile(args.runMetaOut, metadata);

  const videos = await loadShadowVideos(args);
  console.log(
    `[${timestamp()}] shadow extract ${args.execute ? "EXECUTE" : "DRY-RUN"}: run=${args.runId}, videos=${videos.length}, provider=${args.provider}, model=${args.model}, out=${args.shadowOut}`,
  );

  let processed = 0;
  let failed = 0;
  let totalAccepted = 0;

  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index];
    const transcript = video.transcript ?? "";

    if (!args.execute) {
      writeJsonlRecord(args.shadowOut, dryRunRecord(args, video));
      processed += 1;
      console.log(`[${timestamp()}] [${index + 1}/${videos.length}] selected video ${video.id} (${video.creator_name})`);
      continue;
    }

    try {
      const result = await extractWithModelFallback(args, transcript, video.title);
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
      processed += 1;
      totalAccepted += result.calls.length;
      console.log(`[${timestamp()}] [${index + 1}/${videos.length}] shadowed video ${video.id} (${video.creator_name}) -> ${result.calls.length} accepted calls`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const record = dryRunRecord(args, video);
      writeJsonlRecord(args.shadowOut, { ...record, error: message });
      console.error(`[${timestamp()}] FAIL shadow video ${video.id} (${video.creator_name}): ${message}`);
    }

    if (index < videos.length - 1 && args.gapMs > 0) await sleep(args.gapMs);
  }

  console.log(`[${timestamp()}] shadow extract complete: ${processed}/${videos.length} videos, ${totalAccepted} accepted calls, ${failed} failed, out=${args.shadowOut}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
