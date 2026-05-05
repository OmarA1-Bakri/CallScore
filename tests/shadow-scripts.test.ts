import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseShadowExtractArgs } from "../src/scripts/shadow-extract-transcripts";
import {
  parseValidateShadowArgs,
  validateShadowRecords,
} from "../src/scripts/validate-shadow-extractions";
import { parseShadowDiffArgs } from "../src/scripts/shadow-diff-extractions";
import {
  main as promoteShadowMain,
  parsePromoteShadowArgs,
} from "../src/scripts/promote-shadow-extractions";

test("shadow extraction defaults to all transcript recheck selection without production writes", () => {
  const args = parseShadowExtractArgs([
    "--run-id",
    "shadow-test",
    "--limit",
    "5",
  ]);

  assert.equal(args.runId, "shadow-test");
  assert.equal(args.shadowOut, ".tmp/shadow-extraction/shadow-test.jsonl");
  assert.equal(args.execute, false);
  assert.equal(args.dryRun, true);
  assert.equal(args.write, false);
  assert.equal(args.provider, "ollama");
  assert.equal(args.model, "kimi-k2.6");
  assert.equal(args.requestTimeoutMs, 180_000);
  assert.equal(args.includeExtracted, true);
  assert.equal(args.pendingOnly, false);
  assert.equal(args.lowConfidenceReady, false);
  assert.equal(args.chunkAgents, 1);
  assert.equal(args.videoAgents, 1);
  assert.equal(args.limit, 5);
});

test("shadow extraction can target score-ready low-confidence videos", () => {
  const args = parseShadowExtractArgs([
    "--low-confidence-ready",
    "--limit",
    "25",
  ]);

  assert.equal(args.lowConfidenceReady, true);
  assert.equal(args.pendingOnly, false);
  assert.equal(args.limit, 25);
});

test("shadow extraction execute mode supports Ollama cloud settings", () => {
  const args = parseShadowExtractArgs([
    "--execute",
    "--provider",
    "ollama",
    "--model",
    "deepseek-v4-flash",
    "--chunk-agents",
    "2",
    "--video-agents",
    "2",
    "--shadow-out",
    ".tmp/custom.jsonl",
  ]);

  assert.equal(args.execute, true);
  assert.equal(args.provider, "ollama");
  assert.equal(args.model, "deepseek-v4-flash");
  assert.equal(args.chunkAgents, 2);
  assert.equal(args.videoAgents, 2);
  assert.equal(args.shadowOut, ".tmp/custom.jsonl");
});

test("shadow extraction caps per-creator video agents", () => {
  const args = parseShadowExtractArgs(["--video-agents", "99"]);

  assert.equal(args.videoAgents, 3);
});

test("shadow diff requires input and derives diff output", () => {
  assert.throws(() => parseShadowDiffArgs([]), /--shadow-in is required/);
  const args = parseShadowDiffArgs(["--shadow-in", ".tmp/run.jsonl"]);
  assert.equal(args.diffOut, ".tmp/run.diff.jsonl");
});

test("shadow promotion requires explicit run and status guardrails", () => {
  assert.throws(() => parsePromoteShadowArgs([]), /--shadow-in is required/);
  assert.throws(
    () =>
      parsePromoteShadowArgs([
        "--shadow-in",
        "s.jsonl",
        "--diff-in",
        "d.jsonl",
      ]),
    /--confirm-run-id is required/,
  );

  const args = parsePromoteShadowArgs([
    "--shadow-in",
    "s.jsonl",
    "--diff-in",
    "d.jsonl",
    "--confirm-run-id",
    "shadow-test",
    "--allow-statuses",
    "new_calls,changed_calls",
    "--write",
    "--limit",
    "2",
    "--audit-out",
    ".tmp/promote-audit.jsonl",
  ]);

  assert.equal(args.write, true);
  assert.equal(args.confirmRunId, "shadow-test");
  assert.equal(args.limit, 2);
  assert.equal(args.auditOut, ".tmp/promote-audit.jsonl");
  assert.equal(args.allowStatuses.has("new_calls"), true);
  assert.equal(args.allowStatuses.has("changed_calls"), true);
  assert.equal(args.allowStatuses.has("manual_review"), false);
  assert.throws(
    () =>
      parsePromoteShadowArgs([
        "--shadow-in",
        "s.jsonl",
        "--diff-in",
        "d.jsonl",
        "--confirm-run-id",
        "shadow-test",
        "--allow-statuses",
        "manual_review",
      ]),
    /Unsupported or unsafe promotion status: manual_review/,
  );
});

test("shadow promotion derives a structured audit output path by default", () => {
  const args = parsePromoteShadowArgs([
    "--shadow-in",
    "s.jsonl",
    "--diff-in",
    ".tmp/run.diff.jsonl",
    "--confirm-run-id",
    "shadow-test",
  ]);

  assert.equal(args.auditOut, ".tmp/run.diff.promote.jsonl");
});

test("shadow promotion emits structured dry-run audit rows before any write", async () => {
  const dir = mkdtempSync(join(tmpdir(), "shadow-promote-"));
  const shadowIn = join(dir, "shadow.jsonl");
  const diffIn = join(dir, "diff.jsonl");
  const auditOut = join(dir, "promote.jsonl");
  const video = {
    id: 101,
    creator_id: 7,
    creator_name: "Creator",
    youtube_handle: "@Creator",
    youtube_video_id: "yt101",
    title: "BTC update",
    published_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  };

  writeFileSync(
    shadowIn,
    `${JSON.stringify({
      record_type: "shadow_extraction",
      ts: "2026-01-01T00:00:00.000Z",
      run_id: "shadow-test",
      provider: "ollama",
      model: "deepseek-v4-flash",
      fallback_model: null,
      video,
      transcript_sha256: "abc",
      transcript_length: 100,
      candidate_count: 0,
      accepted_count: 0,
      accepted_calls: [],
      chunk_summary: {
        chunk_count: 1,
        covered_until_offset: 100,
        reached_transcript_end: true,
      },
      error: null,
    })}\n`,
  );
  writeFileSync(
    diffIn,
    `${JSON.stringify({
      record_type: "shadow_diff",
      ts: "2026-01-01T00:00:00.000Z",
      run_id: "shadow-test",
      video,
      status: "no_accepted_calls",
      existing_count: 0,
      accepted_count: 0,
      unchanged_count: 0,
      added: [],
      removed: [],
      reasons: [],
    })}\n`,
  );

  await promoteShadowMain([
    "--shadow-in",
    shadowIn,
    "--diff-in",
    diffIn,
    "--confirm-run-id",
    "shadow-test",
    "--audit-out",
    auditOut,
  ]);

  const rows = readFileSync(auditOut, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].record_type, "shadow_promotion");
  assert.equal(rows[0].mode, "DRY");
  assert.equal(rows[0].phase, "dry_run");
  assert.equal(rows[0].action, "promote");
  assert.equal(rows[0].video.id, 101);
});

test("shadow validation catches failed and duplicate records before promotion", () => {
  const args = parseValidateShadowArgs([
    "--shadow-in",
    "shadow.jsonl",
    "--run-id",
    "shadow-test",
    "--creator",
    "@Creator",
    "--require-records",
  ]);
  const base = {
    record_type: "shadow_extraction",
    ts: "2026-01-01T00:00:00.000Z",
    run_id: "shadow-test",
    provider: "ollama",
    model: "kimi-k2.6",
    fallback_model: null,
    video: {
      id: 101,
      creator_id: 7,
      creator_name: "Creator",
      youtube_handle: "@Creator",
      youtube_video_id: "yt101",
      title: "BTC update",
      published_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    transcript_sha256: "a".repeat(64),
    transcript_length: 100,
    candidate_count: 1,
    accepted_count: 0,
    accepted_calls: [],
    chunk_summary: {
      chunk_count: 1,
      covered_until_offset: 100,
      reached_transcript_end: true,
    },
    error: null,
  } as const;

  const summary = validateShadowRecords(args, [
    base,
    { ...base, error: "Model response did not contain JSON" },
  ]);

  assert.equal(summary.ok, false);
  assert.equal(summary.records, 2);
  assert.equal(summary.failed_records, 1);
  assert.ok(summary.issues.some((issue) => issue.code === "extraction_error"));
  assert.ok(summary.issues.some((issue) => issue.code === "duplicate_video"));
});

test("shadow validation treats dry-run records as safe validation artifacts", () => {
  const args = parseValidateShadowArgs([
    "--shadow-in",
    "shadow.jsonl",
    "--require-records",
  ]);
  const summary = validateShadowRecords(args, [
    {
      record_type: "shadow_extraction",
      ts: "2026-01-01T00:00:00.000Z",
      run_id: "shadow-test",
      provider: "ollama",
      model: "kimi-k2.6",
      fallback_model: null,
      video: {
        id: 101,
        creator_id: 7,
        creator_name: "Creator",
        youtube_handle: "@Creator",
        youtube_video_id: "yt101",
        title: "BTC update",
        published_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      transcript_sha256: "a".repeat(64),
      transcript_length: 100,
      candidate_count: 0,
      accepted_count: 0,
      accepted_calls: [],
      chunk_summary: {
        chunk_count: 0,
        covered_until_offset: 0,
        reached_transcript_end: false,
      },
      error: "dry_run_no_model_call",
    },
  ]);

  assert.equal(summary.ok, true);
  assert.equal(summary.failed_records, 0);
});
