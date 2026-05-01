import assert from "node:assert/strict";
import test from "node:test";
import { insideSinceDays, parseDiscoverVideosArgs, parsePublicationDate } from "../src/scripts/discover-videos-365";

test("parseDiscoverVideosArgs defaults to safe dry-run and explicit 365-day window", () => {
  const args = parseDiscoverVideosArgs([]);
  assert.equal(args.write, false);
  assert.equal(args.sinceDays, 365);
  assert.equal(args.limitVideos, 250);
  assert.equal(args.oldStopAfter, 8);
  assert.equal(args.gapMs, 0);
  assert.equal(args.accessBlockStopAfter, 10);
});

test("parseDiscoverVideosArgs parses sharding and audit options", () => {
  const args = parseDiscoverVideosArgs([
    "--offset-creators",
    "10",
    "--limit-creators",
    "5",
    "--limit-videos",
    "500",
    "--since-days",
    "365",
    "--old-stop-after",
    "12",
    "--gap-ms",
    "5000",
    "--access-block-stop-after",
    "3",
    "--audit-out",
    ".tmp/discovery.jsonl",
    "--write",
  ]);
  assert.equal(args.offsetCreators, 10);
  assert.equal(args.limitCreators, 5);
  assert.equal(args.limitVideos, 500);
  assert.equal(args.sinceDays, 365);
  assert.equal(args.oldStopAfter, 12);
  assert.equal(args.gapMs, 5000);
  assert.equal(args.accessBlockStopAfter, 3);
  assert.equal(args.auditOut, ".tmp/discovery.jsonl");
  assert.equal(args.write, true);
});

test("parsePublicationDate explicitly marks upload_date source", () => {
  const result = parsePublicationDate({ id: "abc", upload_date: "20260427", timestamp: 1777286400 });
  assert.deepEqual(result, {
    publishedAt: "2026-04-27T00:00:00Z",
    dateSource: "upload_date",
  });
});

test("parsePublicationDate falls back to timestamp source", () => {
  const result = parsePublicationDate({ id: "abc", timestamp: 1777248000 });
  assert.equal(result.publishedAt, "2026-04-27T00:00:00.000Z");
  assert.equal(result.dateSource, "timestamp");
});

test("parsePublicationDate rejects missing/untrusted dates", () => {
  const result = parsePublicationDate({ id: "abc", upload_date: "yesterday" });
  assert.equal(result.publishedAt, null);
  assert.equal(result.dateSource, null);
});

test("insideSinceDays enforces the target window", () => {
  const now = Date.parse("2026-04-27T00:00:00Z");
  assert.equal(insideSinceDays("2025-04-28T00:00:00Z", 365, now), true);
  assert.equal(insideSinceDays("2025-04-26T23:59:59Z", 365, now), false);
});
