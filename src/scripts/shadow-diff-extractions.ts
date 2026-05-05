import { query } from "../lib/db";
import { diffVideoShadow, readJsonlFile, writeJsonlRecord, type ExistingCallSnapshot, type ShadowDiffRecord, type ShadowExtractedCallRecord } from "../lib/shadow-extraction";
import { loadEnv, timestamp } from "./script-helpers";

export interface ShadowDiffArgs {
  readonly shadowIn: string;
  readonly diffOut: string;
  readonly runId: string | null;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0 || !argv[i + 1]) return null;
  return argv[i + 1];
}

export function parseShadowDiffArgs(argv = process.argv.slice(2)): ShadowDiffArgs {
  const shadowIn = argValue(argv, "--shadow-in");
  if (!shadowIn) throw new Error("--shadow-in is required");
  return {
    shadowIn,
    diffOut: argValue(argv, "--diff-out") ?? shadowIn.replace(/\.jsonl$/i, ".diff.jsonl"),
    runId: argValue(argv, "--run-id"),
  };
}

async function loadExistingCalls(videoIds: readonly number[]): Promise<Map<number, ExistingCallSnapshot[]>> {
  if (videoIds.length === 0) return new Map();
  const rows = await query<ExistingCallSnapshot & { video_id: number }>(
    `SELECT id, video_id, symbol, direction, call_type, entry_price, target_price, stop_loss,
            timeframe, confidence, strategy_type, raw_quote, extraction_confidence, specificity_score
     FROM calls
     WHERE video_id = ANY($1::int[])
     ORDER BY id ASC`,
    [videoIds],
  );
  const grouped = new Map<number, ExistingCallSnapshot[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.video_id) ?? [];
    bucket.push(row);
    grouped.set(row.video_id, bucket);
  }
  return grouped;
}

function reasonsForShadow(record: ShadowExtractedCallRecord): string[] {
  const reasons: string[] = [];
  if (record.error) reasons.push(`shadow_error:${record.error}`);
  if (!record.video.published_at) reasons.push("missing_exact_published_at");
  if (!record.chunk_summary.reached_transcript_end && record.error !== "dry_run_no_model_call") reasons.push("transcript_not_fully_covered");
  return reasons;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseShadowDiffArgs(argv);
  const records = readJsonlFile<ShadowExtractedCallRecord>(args.shadowIn).filter(
    (record) => record.record_type === "shadow_extraction" && (!args.runId || record.run_id === args.runId),
  );
  const existingByVideo = await loadExistingCalls(Array.from(new Set(records.map((record) => record.video.id))));

  console.log(`[${timestamp()}] shadow diff: records=${records.length}, in=${args.shadowIn}, out=${args.diffOut}`);

  const counts = new Map<string, number>();
  for (const record of records) {
    const diff = diffVideoShadow(
      existingByVideo.get(record.video.id) ?? [],
      record.accepted_calls,
      reasonsForShadow(record),
    );
    const diffRecord: ShadowDiffRecord = {
      record_type: "shadow_diff",
      ts: timestamp(),
      run_id: record.run_id,
      video: record.video,
      ...diff,
    };
    writeJsonlRecord(args.diffOut, diffRecord);
    counts.set(diffRecord.status, (counts.get(diffRecord.status) ?? 0) + 1);
  }

  console.log(`[${timestamp()}] shadow diff complete: ${JSON.stringify(Object.fromEntries(counts.entries()))}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
