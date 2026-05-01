import { query } from "../lib/db";
import { createGeminiModel, extractCallsFromTranscript } from "../lib/ai-extraction";
import type { Video } from "../lib/types";
import { loadEnv, replaceStoredCallsForVideo, sleep, timestamp } from "./script-helpers";

interface Args {
  readonly creatorHandle: string | null;
  readonly limit: number;
  readonly gapMs: number;
  readonly cooldownEvery: number;
  readonly cooldownMs: number;
  readonly dryRun: boolean;
}

function parseArgValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0 || !process.argv[i + 1]) return null;
  return process.argv[i + 1];
}

function parseArgs(): Args {
  const limit = Number(parseArgValue("--limit") ?? "10");
  const gapMs = Number(parseArgValue("--gap-ms") ?? "15000");
  const cooldownEvery = Number(parseArgValue("--cooldown-every") ?? "5");
  const cooldownMs = Number(parseArgValue("--cooldown-ms") ?? "90000");
  return {
    creatorHandle: parseArgValue("--creator"),
    limit: Number.isFinite(limit) && limit > 0 ? limit : 10,
    gapMs: Number.isFinite(gapMs) && gapMs > 0 ? gapMs : 15000,
    cooldownEvery: Number.isFinite(cooldownEvery) && cooldownEvery > 0 ? cooldownEvery : 5,
    cooldownMs: Number.isFinite(cooldownMs) && cooldownMs > 0 ? cooldownMs : 90000,
    dryRun: process.argv.includes("--dry-run"),
  };
}

async function loadVideos(args: Args): Promise<(Video & { creator_id: number; creator_name: string; youtube_handle: string })[]> {
  const params: unknown[] = [];
  let creatorFilter = "";
  if (args.creatorHandle) {
    params.push(args.creatorHandle);
    creatorFilter = ` AND c.youtube_handle = $${params.length}`;
  }
  params.push(args.limit);
  return query<Video & { creator_id: number; creator_name: string; youtube_handle: string }>(
    `SELECT v.*, v.creator_id, c.name as creator_name, c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE v.calls_extracted = false
       AND v.transcript IS NOT NULL
       AND v.transcript_quality > 0.2
       ${creatorFilter}
     ORDER BY v.published_at DESC NULLS LAST, v.id DESC
     LIMIT $${params.length}`,
    params,
  );
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  const videos = await loadVideos(args);
  console.log(`[${timestamp()}] Batch extract starting: ${videos.length} videos${args.creatorHandle ? ` for ${args.creatorHandle}` : ""}`);
  if (videos.length === 0) return;
  const model = createGeminiModel();
  let processed = 0;
  let totalCalls = 0;
  for (const video of videos) {
    try {
      const calls = await extractCallsFromTranscript(model, video.transcript ?? "");
      if (!args.dryRun) {
        await replaceStoredCallsForVideo({
          creatorId: video.creator_id,
          videoId: video.id,
          callDate: video.published_at ?? video.created_at,
          calls,
          markVideoExtracted: true,
        });
      }
      processed++;
      totalCalls += calls.length;
      console.log(`[${timestamp()}] [${processed}/${videos.length}] ${video.creator_name} :: ${video.title} -> ${calls.length} calls`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] FAIL video ${video.id} (${video.creator_name}): ${message}`);
    }
    await sleep(args.gapMs);
    if (processed > 0 && processed % args.cooldownEvery === 0) {
      console.log(`[${timestamp()}] cooldown ${Math.round(args.cooldownMs / 1000)}s`);
      await sleep(args.cooldownMs);
    }
  }
  console.log(`[${timestamp()}] Batch extract complete: ${processed}/${videos.length} videos, ${totalCalls} calls`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
