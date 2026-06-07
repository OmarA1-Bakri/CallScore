import { query } from "../lib/db";
import { loadEnv, timestamp, sleep } from "./script-helpers";
import { fetchChannelMetrics, chunkArray } from "../lib/youtube";

interface CreatorRow {
  readonly id: number;
  readonly youtube_channel_id: string;
  readonly name: string | null;
}

interface SyncArgs {
  readonly write: boolean;
  readonly chunkSize: number;
  readonly gapMs: number;
}

function argPresent(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function positiveInt(argv: readonly string[], flag: string, fallback: number): number {
  const idx = argv.indexOf(flag);
  if (idx < 0 || !argv[idx + 1]) return fallback;
  const n = Number(argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseArgs(argv = process.argv.slice(2)): SyncArgs {
  return {
    write: argPresent(argv, "--write") && !argPresent(argv, "--dry-run"),
    chunkSize: Math.min(50, positiveInt(argv, "--chunk-size", 50)),
    gapMs: Math.max(0, positiveInt(argv, "--gap-ms", 500)),
  };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();

  if (!process.env.YOUTUBE_API_KEY) {
    console.error("[FATAL] YOUTUBE_API_KEY is not set in the environment.");
    process.exit(1);
  }

  const args = parseArgs(argv);
  console.log(`[${timestamp()}] youtube-metrics-sync ${args.write ? "WRITE" : "DRY-RUN"}: chunkSize=${args.chunkSize}, gapMs=${args.gapMs}`);

  const creators = await query<CreatorRow>(
    `SELECT id, youtube_channel_id, name
     FROM creators
     WHERE youtube_channel_id IS NOT NULL
       AND length(trim(youtube_channel_id)) > 0
     ORDER BY id`
  );

  console.log(`[${timestamp()}] Loaded ${creators.length} creators with channel IDs`);

  const chunks = chunkArray(creators.map((c) => c.youtube_channel_id), args.chunkSize);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const batchIds = chunks[i];
    try {
      const metrics = await fetchChannelMetrics(batchIds);

      for (const m of metrics) {
        if (args.write) {
          await query(
            `UPDATE creators
             SET subscribers = $1,
                 video_count = $2,
                 name = COALESCE($3, creators.name),
                 last_scraped_at = NOW()
             WHERE youtube_channel_id = $4`,
            [m.subscribers, m.videoCount, m.title, m.channelId]
          );
        }
        updated++;
        console.log(`[${timestamp()}] ${args.write ? "updated" : "would-update"} ${m.channelId} name="${m.title}" subs=${m.subscribers} videos=${m.videoCount}`);
      }

      // Log missing IDs (hidden / terminated channels)
      const returnedIds = new Set(metrics.map((m) => m.channelId));
      const missing = batchIds.filter((id) => !returnedIds.has(id));
      if (missing.length > 0) {
        console.log(`[${timestamp()}] missing ${missing.length} channel(s): ${missing.join(", ")}`);
        failed += missing.length;
      }
    } catch (err) {
      console.error(`[${timestamp()}] batch-fail chunk=${i}: ${err instanceof Error ? err.message : String(err)}`);
      failed += batchIds.length;
    }

    if (args.gapMs > 0 && i < chunks.length - 1) {
      await sleep(args.gapMs);
    }
  }

  console.log(`[${timestamp()}] sync complete: updated=${updated}, failed=${failed}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
