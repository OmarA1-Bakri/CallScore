import { readJsonlFile, writeJsonlRecord, type ShadowDiffRecord, type ShadowDiffStatus, type ShadowExtractedCallRecord } from "../lib/shadow-extraction";
import { loadEnv, replaceStoredCallsForVideo, timestamp } from "./script-helpers";

const PROMOTABLE_STATUSES: readonly ShadowDiffStatus[] = [
  "unchanged",
  "new_calls",
  "removed_calls",
  "changed_calls",
  "no_accepted_calls",
];

export interface PromoteShadowArgs {
  readonly shadowIn: string;
  readonly diffIn: string;
  readonly confirmRunId: string;
  readonly write: boolean;
  readonly allowStatuses: ReadonlySet<ShadowDiffStatus>;
  readonly videoIds: ReadonlySet<number>;
  readonly limit: number;
  readonly markVideoExtracted: boolean;
  readonly auditOut: string;
}

type ReplaceStoredCallsForVideo = typeof replaceStoredCallsForVideo;

interface PromoteShadowDependencies {
  readonly replaceStoredCallsForVideo?: ReplaceStoredCallsForVideo;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0 || !argv[i + 1]) return null;
  return argv[i + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function positiveIntList(value: string | null): readonly number[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((parsed) => Number.isInteger(parsed) && parsed > 0),
    ),
  );
}

function parseStatuses(value: string | null): ReadonlySet<ShadowDiffStatus> {
  if (!value) return new Set<ShadowDiffStatus>();
  const statuses = value.split(",").map((part) => part.trim()).filter(Boolean) as ShadowDiffStatus[];
  for (const status of statuses) {
    if (!PROMOTABLE_STATUSES.includes(status)) {
      throw new Error(`Unsupported or unsafe promotion status: ${status}`);
    }
  }
  return new Set(statuses);
}

export function parsePromoteShadowArgs(argv = process.argv.slice(2)): PromoteShadowArgs {
  const shadowIn = argValue(argv, "--shadow-in");
  const diffIn = argValue(argv, "--diff-in");
  const confirmRunId = argValue(argv, "--confirm-run-id");
  if (!shadowIn) throw new Error("--shadow-in is required");
  if (!diffIn) throw new Error("--diff-in is required");
  if (!confirmRunId) throw new Error("--confirm-run-id is required");

  return {
    shadowIn,
    diffIn,
    confirmRunId,
    write: argv.includes("--write"),
    allowStatuses: parseStatuses(argValue(argv, "--allow-statuses")),
    videoIds: new Set(
      positiveIntList(
        argValue(argv, "--video-ids") ?? argValue(argv, "--reviewed-video-ids"),
      ),
    ),
    limit: positiveInt(argValue(argv, "--limit"), Number.MAX_SAFE_INTEGER),
    markVideoExtracted: argv.includes("--mark-video-extracted"),
    auditOut: argValue(argv, "--audit-out") ?? diffIn.replace(/\.jsonl$/i, ".promote.jsonl"),
  };
}

function assertWriteGuardrails(args: PromoteShadowArgs): void {
  if (!args.write) return;
  if (args.allowStatuses.size === 0) {
    throw new Error("--write requires explicit --allow-statuses (manual_review is never promotable)");
  }
  if (args.videoIds.size === 0) {
    throw new Error("--write requires explicit --video-ids for reviewed promotion");
  }
}

function auditPromotion(
  args: PromoteShadowArgs,
  diff: ShadowDiffRecord,
  phase: "skipped" | "before_write" | "after_write" | "dry_run",
  details: {
    readonly action: "skip" | "promote";
    readonly reason: string | null;
    readonly acceptedCalls: number | null;
  },
): void {
  writeJsonlRecord(args.auditOut, {
    record_type: "shadow_promotion",
    ts: timestamp(),
    run_id: args.confirmRunId,
    mode: args.write ? "WRITE" : "DRY",
    phase,
    action: details.action,
    reason: details.reason,
    reviewed_video_ids: Array.from(args.videoIds),
    video: diff.video,
    status: diff.status,
    existing_count: diff.existing_count,
    accepted_count: diff.accepted_count,
    accepted_calls: details.acceptedCalls,
    diff_reasons: diff.reasons,
  });
}

export async function main(
  argv = process.argv.slice(2),
  deps: PromoteShadowDependencies = {},
): Promise<void> {
  loadEnv();
  const args = parsePromoteShadowArgs(argv);
  assertWriteGuardrails(args);
  const replaceCalls = deps.replaceStoredCallsForVideo ?? replaceStoredCallsForVideo;

  const shadowRecords = readJsonlFile<ShadowExtractedCallRecord>(args.shadowIn).filter(
    (record) => record.record_type === "shadow_extraction" && record.run_id === args.confirmRunId,
  );
  const diffRecords = readJsonlFile<ShadowDiffRecord>(args.diffIn).filter(
    (record) => record.record_type === "shadow_diff" && record.run_id === args.confirmRunId,
  );
  const shadowByVideo = new Map(shadowRecords.map((record) => [record.video.id, record]));

  console.log(
    `[${timestamp()}] promote shadow ${args.write ? "WRITE" : "DRY-RUN"}: run=${args.confirmRunId}, shadow=${shadowRecords.length}, diff=${diffRecords.length}, audit=${args.auditOut}`,
  );

  let considered = 0;
  let promoted = 0;
  let skipped = 0;

  for (const diff of diffRecords) {
    if (considered >= args.limit) break;
    considered += 1;
    const shadow = shadowByVideo.get(diff.video.id);
    if (!shadow) {
      skipped += 1;
      auditPromotion(args, diff, "skipped", {
        action: "skip",
        reason: "missing_shadow_record",
        acceptedCalls: null,
      });
      console.log(`[${timestamp()}] skip video ${diff.video.id}: missing_shadow_record`);
      continue;
    }

    const skipReason =
      diff.status === "manual_review"
        ? "manual_review"
        : args.videoIds.size > 0 && !args.videoIds.has(diff.video.id)
          ? "video_not_reviewed"
        : args.allowStatuses.size > 0 && !args.allowStatuses.has(diff.status)
          ? `status_not_allowed:${diff.status}`
          : !shadow.video.published_at
            ? "missing_exact_published_at"
            : shadow.error
              ? `shadow_error:${shadow.error}`
              : null;

    if (skipReason) {
      skipped += 1;
      auditPromotion(args, diff, "skipped", {
        action: "skip",
        reason: skipReason,
        acceptedCalls: shadow.accepted_calls.length,
      });
      console.log(`[${timestamp()}] skip video ${diff.video.id}: ${skipReason}`);
      continue;
    }

    auditPromotion(args, diff, args.write ? "before_write" : "dry_run", {
      action: "promote",
      reason: null,
      acceptedCalls: shadow.accepted_calls.length,
    });

    if (args.write) {
      await replaceCalls({
        creatorId: shadow.video.creator_id,
        videoId: shadow.video.id,
        callDate: shadow.video.published_at,
        calls: shadow.accepted_calls,
        markVideoExtracted: args.markVideoExtracted,
      });
      auditPromotion(args, diff, "after_write", {
        action: "promote",
        reason: null,
        acceptedCalls: shadow.accepted_calls.length,
      });
    }
    promoted += 1;
    console.log(`[${timestamp()}] ${args.write ? "promoted" : "would promote"} video ${diff.video.id}: status=${diff.status}, calls=${shadow.accepted_calls.length}`);
  }

  console.log(`[${timestamp()}] promote shadow complete: considered=${considered}, promoted=${promoted}, skipped=${skipped}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
