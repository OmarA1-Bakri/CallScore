import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildFreshCallCandidateSql,
  buildFreshCallExistingDedupeSql,
  rowsToFreshCallCandidates,
} from "../src/lib/sentinels/creator-discovery";
import {
  buildFreshCallDedupeKey,
  runFreshCallSentinel,
  type FreshCallCandidate,
} from "../src/lib/sentinels/fresh-call-sentinel";
import { FreshCallDiscoveryEventSchema, SentinelRunReceiptSchema } from "../src/lib/autonomy/contracts";

const now = new Date("2026-06-21T12:00:00.000Z");

function candidate(overrides: Partial<FreshCallCandidate> = {}): FreshCallCandidate {
  return {
    kind: "call",
    source: "transcript_worklist",
    creator_id: 42,
    creator_handle: "@AlphaCalls",
    video_id: 1001,
    youtube_video_id: "yt-alpha-1",
    published_at: "2026-06-21T11:00:00.000Z",
    transcript_status: "ready",
    candidate_call_count: 1,
    ...overrides,
  };
}

test("fresh-call sentinel accepts first discovery and emits a schema-valid receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "fresh-call-sentinel-"));
  const result = runFreshCallSentinel({
    candidates: [candidate()],
    existing: {},
    now,
    repoRoot: root,
    writeReceipt: true,
  });

  assert.equal(result.receipt.discovered_count, 1);
  assert.equal(result.receipt.recommended_count, 1);
  assert.equal(result.receipt.enqueued_count, 0);
  assert.equal(result.receipt.skipped_duplicate_count, 0);
  assert.equal(result.receipt.skipped_cooldown_count, 0);
  assert.equal(result.receipt.production_mutation_performed, false);
  assert.equal(result.receipt.provider_mutation_performed, false);
  assert.equal(result.receipt.external_send_performed, false);
  assert.deepEqual(result.recommendations.map((item) => item.action), ["run_bounded_call_extraction"]);
  assert.equal(result.events.length, 1);
  assert.equal(FreshCallDiscoveryEventSchema.safeParse(result.events[0]).success, true);
  assert.equal(result.events[0].decision, "enqueue_extract");
  assert.equal(result.events[0].cooldown.active, false);
  assert.equal(existsSync(result.receipt.receipt_path), true);

  const persisted = JSON.parse(readFileSync(result.receipt.receipt_path, "utf8"));
  assert.equal(SentinelRunReceiptSchema.safeParse(persisted).success, true);
});

test("fresh-call sentinel emits schema-valid discovery events for every candidate decision", () => {
  const extractCandidate = candidate({ youtube_video_id: "yt-extract", video_id: 1100, candidate_call_count: 1 });
  const duplicateCandidate = candidate({ youtube_video_id: "yt-duplicate", video_id: 1200, candidate_call_count: 1 });
  const cooldownCandidate = candidate({ kind: "video", youtube_video_id: "yt-cooldown", video_id: 1300, transcript_status: "missing", candidate_call_count: 0 });
  const creatorCandidate = candidate({ kind: "creator", source: "youtube_rss", creator_id: "creator-1400", creator_handle: "NewCreator", video_id: null, youtube_video_id: null, transcript_status: "not_required", candidate_call_count: 0 });
  const noSignalCandidate = candidate({ kind: "video", youtube_video_id: "yt-no-signal", video_id: 1500, transcript_status: "ready", candidate_call_count: 0 });

  const result = runFreshCallSentinel({
    candidates: [extractCandidate, duplicateCandidate, cooldownCandidate, creatorCandidate, noSignalCandidate],
    existing: { callYoutubeVideoIds: new Set([duplicateCandidate.youtube_video_id as string]) },
    cooldown: { active: true, reason: "HTTP 429", until: "2026-06-22T00:00:00.000Z" },
    now,
    writeReceipt: false,
  });

  assert.equal(result.events.length, 5);
  assert.deepEqual(result.events.map((event) => event.decision), [
    "enqueue_extract",
    "suppress_duplicate",
    "wait_cooldown",
    "review_source_identity",
    "ignore_no_call_signal",
  ]);
  for (const event of result.events) {
    assert.equal(FreshCallDiscoveryEventSchema.safeParse(event).success, true);
  }
  assert.deepEqual(result.recommendations.map((item) => item.dedupe_key), [buildFreshCallDedupeKey(extractCandidate)]);
  assert.equal(result.receipt.recommended_count, 1);
  assert.equal(result.receipt.skipped_duplicate_count, 1);
  assert.equal(result.receipt.skipped_cooldown_count, 1);
});

test("fresh-call sentinel skips duplicates from current run and existing jobs/tasks/calls/videos", () => {
  const duplicate = candidate();
  const existingCall = candidate({ video_id: 2002, youtube_video_id: "yt-with-call" });
  const existingVideo = candidate({ kind: "video", transcript_status: "missing", video_id: 3003, youtube_video_id: "yt-existing-video" });
  const openJob = candidate({ video_id: 4004, youtube_video_id: "yt-open-job" });
  const openTask = candidate({ video_id: 5005, youtube_video_id: "yt-open-task" });

  const openJobKey = `fresh-call-sentinel:call:${buildFreshCallDedupeKey(openJob)}`;
  const openTaskKey = `fresh-call-sentinel:call:${buildFreshCallDedupeKey(openTask)}`;
  const result = runFreshCallSentinel({
    candidates: [duplicate, duplicate, existingCall, existingVideo, openJob, openTask],
    existing: {
      callVideoIds: new Set([String(existingCall.video_id)]),
      videoYoutubeIds: new Set([existingVideo.youtube_video_id as string]),
      pipelineJobIdempotencyKeys: new Set([openJobKey]),
      channelTaskIdempotencyKeys: new Set([openTaskKey]),
    },
    now,
    writeReceipt: false,
  });

  assert.equal(result.receipt.discovered_count, 6);
  assert.equal(result.receipt.recommended_count, 1);
  assert.equal(result.receipt.skipped_duplicate_count, 5);
  assert.equal(result.recommendations.length, 1);
  assert.deepEqual(result.recommendations.map((item) => item.dedupe_key), [buildFreshCallDedupeKey(duplicate)]);
});

test("fresh-call sentinel respects transcript provider cooldown and suppresses provider work", () => {
  const result = runFreshCallSentinel({
    candidates: [
      candidate({ kind: "video", transcript_status: "missing", candidate_call_count: 0 }),
      candidate({ youtube_video_id: "yt-ready", video_id: 1010, transcript_status: "ready" }),
    ],
    existing: {},
    cooldown: { active: true, reason: "HTTP 429", until: "2026-06-22T00:00:00.000Z" },
    now,
    writeReceipt: false,
  });

  assert.equal(result.receipt.discovered_count, 2);
  assert.equal(result.receipt.skipped_cooldown_count, 1);
  assert.equal(result.receipt.recommended_count, 1);
  assert.equal(result.receipt.cooldowns_respected, true);
  assert.deepEqual(result.recommendations.map((item) => item.action), ["run_bounded_call_extraction"]);
});

test("fresh-call sentinel fails closed for malformed source input", () => {
  const malformed = { ...candidate(), source: "unknown_feed" } as unknown as FreshCallCandidate;
  const result = runFreshCallSentinel({
    candidates: [malformed],
    existing: {},
    now,
    writeReceipt: false,
  });

  assert.equal(result.receipt.mode, "blocked");
  assert.equal(result.receipt.discovered_count, 0);
  assert.equal(result.receipt.recommended_count, 0);
  assert.equal(result.receipt.blockers.includes("malformed_source"), true);
  assert.equal(result.recommendations.length, 0);
});

test("fresh-call discovery rows normalize PostgreSQL timestamp text before schema validation", () => {
  const [normalized] = rowsToFreshCallCandidates([
    {
      kind: "call",
      source: "transcript_worklist",
      creator_id: 42,
      creator_handle: "@AlphaCalls",
      video_id: 1001,
      youtube_video_id: "yt-alpha-db-row",
      published_at: "2026-06-21 11:00:00+00",
      transcript_status: "ready",
      candidate_call_count: "1",
    },
  ]);

  assert.equal(normalized?.published_at, "2026-06-21T11:00:00.000Z");
  const result = runFreshCallSentinel({ candidates: [normalized], existing: {}, now, writeReceipt: false });
  assert.equal(result.receipt.mode, "read_only");
  assert.equal(FreshCallDiscoveryEventSchema.safeParse(result.events[0]).success, true);
});

test("fresh-call sentinel fails closed for malformed published_at input", () => {
  const malformed = candidate({ published_at: "not-a-date" });
  const result = runFreshCallSentinel({
    candidates: [malformed],
    existing: {},
    now,
    writeReceipt: false,
  });

  assert.equal(result.receipt.mode, "blocked");
  assert.equal(result.receipt.discovered_count, 0);
  assert.equal(result.receipt.recommended_count, 0);
  assert.equal(result.receipt.blockers.includes("malformed_published_at"), true);
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.events.length, 0);
});

test("fresh-call discovery SQL is bounded, read-only, and dedupes open work before enqueueing", () => {
  const candidates = buildFreshCallCandidateSql({ limit: 25, sinceDays: 14 });
  assert.match(candidates.sql, /FROM videos v/i);
  assert.match(candidates.sql, /LEFT JOIN calls/i);
  assert.match(candidates.sql, /LIMIT \$2/i);
  assert.doesNotMatch(candidates.sql, /INSERT|UPDATE|DELETE|TRUNCATE|DROP/i);
  assert.deepEqual(candidates.params, [14, 25]);

  const existing = buildFreshCallExistingDedupeSql();
  assert.match(existing.sql, /pipeline_jobs/i);
  assert.match(existing.sql, /channel_tasks/i);
  assert.match(existing.sql, /status IN \('pending', 'running'\)/i);
  assert.doesNotMatch(existing.sql, /INSERT|UPDATE|DELETE|TRUNCATE|DROP/i);
});
