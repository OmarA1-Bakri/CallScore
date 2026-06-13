import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTranscriptExtractionPlan,
  parseTranscriptExtractionMethodChain,
  resolveYtDlpBinaryForMethod,
} from "../src/lib/transcript-extraction-methods";
import {
  buildYtDlpTranscriptArgs,
  fetchTranscript,
  parseBackfillTranscriptsArgs,
} from "../src/scripts/backfill-transcripts";

test("transcript extraction method chain combines local providers and safe handoffs", () => {
  const methods = parseTranscriptExtractionMethodChain(
    "serpapi_transcript,hh_ytdlp_ejs_wpc,laptop_ytdlp,youtube_transcript_api_laptop,media_asr_fallback",
  );

  assert.deepEqual(methods, [
    "serpapi_transcript",
    "hh_ytdlp_ejs_wpc",
    "laptop_ytdlp",
    "youtube_transcript_api_laptop",
    "media_asr_fallback",
  ]);

  const plan = buildTranscriptExtractionPlan(methods);
  assert.deepEqual(plan.map((entry) => entry.executionLocation), ["HH", "HH", "laptop", "laptop", "HH"]);
  assert.equal(plan[0].provider, "serpapi");
  assert.equal(plan[1].provider, "yt-dlp");
  assert.equal(plan[2].requiresExternalRunner, true);
  assert.match(plan[2].command, /run-transcript-collector\.ps1/);
  assert.equal(plan[3].requiresIngest, true);
  assert.equal(plan[4].maxBatchSize, 1);
});

test("backfill transcript args preserve legacy defaults and accept explicit method chains", () => {
  assert.deepEqual(parseBackfillTranscriptsArgs(["--limit", "1"]).methods, ["hh_ytdlp"]);
  assert.deepEqual(parseBackfillTranscriptsArgs(["--serpapi", "--limit", "1"]).methods, ["serpapi_transcript", "hh_ytdlp"]);
  assert.deepEqual(parseBackfillTranscriptsArgs(["--no-yt-dlp", "--limit", "1"]).methods, []);
  assert.deepEqual(
    parseBackfillTranscriptsArgs([
      "--methods",
      "serpapi,hh-ytdlp-ejs-wpc,media-asr-fallback",
      "--limit",
      "1",
    ]).methods,
    ["serpapi_transcript", "hh_ytdlp_ejs_wpc", "media_asr_fallback"],
  );
});

test("HH EJS/WPC method prefers isolated yt-dlp runtime and transcript-only args", () => {
  const args = parseBackfillTranscriptsArgs(["--methods", "hh_ytdlp_ejs_wpc", "--limit", "1"]);
  assert.equal(
    resolveYtDlpBinaryForMethod("hh_ytdlp_ejs_wpc", {}, (candidate) => candidate === "/opt/callscore/yt-dlp-2026.6.9/bin/yt-dlp"),
    "/opt/callscore/yt-dlp-2026.6.9/bin/yt-dlp",
  );

  const ytdlpArgs = buildYtDlpTranscriptArgs("video123", args, {}, [], "hh_ytdlp_ejs_wpc");
  assert.ok(ytdlpArgs.includes("--skip-download"));
  assert.ok(ytdlpArgs.includes("--write-auto-subs"));
  assert.ok(ytdlpArgs.includes("--write-subs"));
  assert.ok(ytdlpArgs.includes("--js-runtimes"));
  assert.ok(ytdlpArgs.includes("node"));
  assert.ok(ytdlpArgs.includes("--remote-components"));
  assert.ok(ytdlpArgs.includes("ejs:github"));
  assert.equal(ytdlpArgs.includes("--extract-audio"), false);
  assert.equal(ytdlpArgs.includes("-f"), false);
});

test("external transcript methods produce non-terminal handoff signals", async () => {
  const laptopArgs = parseBackfillTranscriptsArgs(["--methods", "laptop_ytdlp", "--limit", "1"]);
  const laptopResult = await fetchTranscript("video123", laptopArgs);

  assert.equal(laptopResult.ok, false);
  assert.ok("handoff" in laptopResult);
  assert.equal(laptopResult.handoff.status, "pending_handoff");
  assert.equal(laptopResult.handoff.reason, "external_handoff_required");
  assert.equal(laptopResult.handoff.method, "laptop_ytdlp");

  const mediaArgs = parseBackfillTranscriptsArgs(["--methods", "media_asr_fallback", "--limit", "1"]);
  const mediaResult = await fetchTranscript("video123", mediaArgs);

  assert.equal(mediaResult.ok, false);
  assert.ok("handoff" in mediaResult);
  assert.equal(mediaResult.handoff.status, "pending_handoff");
  assert.equal(mediaResult.handoff.reason, "media_fallback_required");
});
