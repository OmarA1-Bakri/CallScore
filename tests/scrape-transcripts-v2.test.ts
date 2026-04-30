import assert from "node:assert/strict";
import test from "node:test";
import { classifyScrapeFailure, parseCaptionPayload, parseScrapeV2Args } from "../src/scripts/scrape-transcripts-v2";

test("parseScrapeV2Args keeps scrape v2 dry-run by default", () => {
  const args = parseScrapeV2Args(["--creator", "@Example", "--limit-videos", "2", "--transcript-langs", "original,en,all"]);
  assert.equal(args.creator, "@Example");
  assert.equal(args.limitVideos, 2);
  assert.deepEqual(args.transcriptLangs, ["original", "en", "all"]);
  assert.equal(args.write, false);
});

test("parseCaptionPayload handles json3 captions", () => {
  const text = parseCaptionPayload(JSON.stringify({ events: [{ segs: [{ utf8: "hello " }, { utf8: "world" }] }] }), "json3");
  assert.equal(text, "hello world");
});

test("classifyScrapeFailure distinguishes transcript access blockers", () => {
  assert.equal(classifyScrapeFailure("HTTP Error 429: Too Many Requests"), "caption-http-429");
  assert.equal(classifyScrapeFailure("IpBlocked: blocked by YouTube"), "ip-blocked");
  assert.equal(classifyScrapeFailure("429 Client Error: limit-exceeded Plan usage limit was exceeded"), "provider-quota-exceeded");
  assert.equal(classifyScrapeFailure("This channel does not have a videos tab"), "no-videos-tab");
  assert.equal(classifyScrapeFailure("Forbidden", 403), "caption-http-forbidden");
});
