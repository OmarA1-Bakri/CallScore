import { existsSync } from "node:fs";
import {
  readJsonlFile,
  writeJsonFile,
  type ShadowExtractedCallRecord,
} from "../lib/shadow-extraction";
import { timestamp } from "./script-helpers";

interface ValidateShadowArgs {
  readonly shadowIn: string;
  readonly runId: string | null;
  readonly creator: string | null;
  readonly auditOut: string | null;
  readonly requireRecords: boolean;
  readonly allowErrors: boolean;
  readonly summary: boolean;
}

interface ValidationIssue {
  readonly video_id?: number;
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly detail: string;
}

interface ValidationSummary {
  readonly generated_at: string;
  readonly shadow_in: string;
  readonly run_id: string | null;
  readonly creator: string | null;
  readonly records: number;
  readonly videos: number;
  readonly accepted_calls: number;
  readonly failed_records: number;
  readonly duplicate_videos: number;
  readonly issues: readonly ValidationIssue[];
  readonly ok: boolean;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

export function parseValidateShadowArgs(
  argv = process.argv.slice(2),
): ValidateShadowArgs {
  const shadowIn = argValue(argv, "--shadow-in");
  if (!shadowIn) throw new Error("--shadow-in is required");
  return {
    shadowIn,
    runId: argValue(argv, "--run-id"),
    creator: argValue(argv, "--creator"),
    auditOut: argValue(argv, "--audit-out"),
    requireRecords: argv.includes("--require-records"),
    allowErrors: argv.includes("--allow-errors"),
    summary: argv.includes("--summary"),
  };
}

function isDryRunError(error: string | null): boolean {
  return error === "dry_run_no_model_call";
}

export function validateShadowRecords(
  args: ValidateShadowArgs,
  records: readonly ShadowExtractedCallRecord[],
): ValidationSummary {
  const issues: ValidationIssue[] = [];
  const filtered = records.filter((record) => {
    if (record.record_type !== "shadow_extraction") return false;
    if (args.runId && record.run_id !== args.runId) return false;
    if (args.creator && record.video.youtube_handle !== args.creator)
      return false;
    return true;
  });

  if (args.requireRecords && filtered.length === 0) {
    issues.push({
      severity: "error",
      code: "no_records",
      detail: "No matching shadow extraction records found",
    });
  }

  const seenVideos = new Set<number>();
  const duplicateVideos = new Set<number>();
  let acceptedCalls = 0;
  let failedRecords = 0;

  for (const record of filtered) {
    const videoId = record.video.id;
    if (seenVideos.has(videoId)) duplicateVideos.add(videoId);
    seenVideos.add(videoId);

    if (record.error && !isDryRunError(record.error)) {
      failedRecords += 1;
      if (!args.allowErrors) {
        issues.push({
          video_id: videoId,
          severity: "error",
          code: "extraction_error",
          detail: record.error.slice(0, 500),
        });
      }
    }

    if (record.accepted_count !== record.accepted_calls.length) {
      issues.push({
        video_id: videoId,
        severity: "error",
        code: "accepted_count_mismatch",
        detail: `accepted_count=${record.accepted_count} accepted_calls.length=${record.accepted_calls.length}`,
      });
    }

    if (record.candidate_count < record.accepted_count) {
      issues.push({
        video_id: videoId,
        severity: "error",
        code: "candidate_count_lt_accepted",
        detail: `candidate_count=${record.candidate_count} accepted_count=${record.accepted_count}`,
      });
    }

    if (record.transcript_sha256.length !== 64) {
      issues.push({
        video_id: videoId,
        severity: "error",
        code: "bad_transcript_hash",
        detail: "transcript_sha256 must be a 64-character sha256 hex digest",
      });
    }

    if (
      record.transcript_length < 0 ||
      record.chunk_summary.covered_until_offset < 0
    ) {
      issues.push({
        video_id: videoId,
        severity: "error",
        code: "negative_lengths",
        detail: "transcript/chunk lengths must be non-negative",
      });
    }

    if (
      !record.error &&
      record.chunk_summary.covered_until_offset > record.transcript_length
    ) {
      issues.push({
        video_id: videoId,
        severity: "warning",
        code: "chunk_offset_exceeds_transcript",
        detail: `covered_until_offset=${record.chunk_summary.covered_until_offset} transcript_length=${record.transcript_length}`,
      });
    }

    acceptedCalls += record.accepted_count;
  }

  for (const videoId of Array.from(duplicateVideos)) {
    issues.push({
      video_id: videoId,
      severity: "error",
      code: "duplicate_video",
      detail: "Multiple matching shadow records exist for the same video",
    });
  }

  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  return {
    generated_at: timestamp(),
    shadow_in: args.shadowIn,
    run_id: args.runId,
    creator: args.creator,
    records: filtered.length,
    videos: seenVideos.size,
    accepted_calls: acceptedCalls,
    failed_records: failedRecords,
    duplicate_videos: duplicateVideos.size,
    issues,
    ok: blockingIssues.length === 0,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseValidateShadowArgs(argv);
  if (!existsSync(args.shadowIn))
    throw new Error(`Shadow input not found: ${args.shadowIn}`);
  const records = readJsonlFile<ShadowExtractedCallRecord>(args.shadowIn);
  const summary = validateShadowRecords(args, records);
  if (args.auditOut) writeJsonFile(args.auditOut, summary);
  console.log(
    JSON.stringify(
      args.summary
        ? {
            generated_at: summary.generated_at,
            shadow_in: summary.shadow_in,
            run_id: summary.run_id,
            creator: summary.creator,
            records: summary.records,
            videos: summary.videos,
            accepted_calls: summary.accepted_calls,
            failed_records: summary.failed_records,
            duplicate_videos: summary.duplicate_videos,
            issue_count: summary.issues.length,
            ok: summary.ok,
          }
        : summary,
      null,
      2,
    ),
  );
  if (!summary.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
