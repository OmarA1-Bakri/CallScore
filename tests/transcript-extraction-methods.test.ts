import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTranscriptExtractionPlan,
  parseTranscriptExtractionMethodChain,
  resolveYtDlpBinaryForMethod,
} from "../src/lib/transcript-extraction-methods";
import {
  buildMissingTranscriptVideosQuery,
  JOURNALED_TRANSCRIPT_FAILURE_SQL,
  JOURNALED_TRANSCRIPT_SUCCESS_SQL,
  buildYtDlpTranscriptArgs,
  assertBackfillWriteAuthority,
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

test("backfill transcript args accept only explicit bounded YouTube IDs for forced recovery", () => {
  const args = parseBackfillTranscriptsArgs([
    "--youtube-video-ids",
    "VCbmPx1l7AU,lVLvnT4j9TU,VCbmPx1l7AU",
    "--force-targeted-retry",
    "--limit",
    "9",
  ]);

  assert.deepEqual(args.youtubeVideoIds, ["VCbmPx1l7AU", "lVLvnT4j9TU"]);
  assert.equal(args.forceTargetedRetry, true);
  assert.throws(
    () => parseBackfillTranscriptsArgs(["--force-targeted-retry"]),
    /requires --youtube-video-ids/,
  );

  const tooManyIds = Array.from({ length: 26 }, (_, index) => `A${String(index).padStart(10, "0")}`).join(",");
  assert.throws(
    () => parseBackfillTranscriptsArgs(["--youtube-video-ids", tooManyIds, "--limit", "26", "--force-targeted-retry"]),
    /hard cap of 25/,
  );
});

test("exact-ID transcript writes are owned by the Workplane recovery job", () => {
  const forcedArgs = parseBackfillTranscriptsArgs([
    "--youtube-video-ids", "VCbmPx1l7AU",
    "--force-targeted-retry",
    "--workplane-job-id", "6632",
    "--workplane-worker-id", "worker-final-review",
    "--workplane-job-attempt", "2",
    "--methods", "hh_ytdlp_ejs_wpc",
    "--write",
    "--limit", "1",
  ]);
  assert.throws(() => assertBackfillWriteAuthority(forcedArgs, "cli"), /transcript_recover_hh Workplane ownership/);
  assert.doesNotThrow(() => assertBackfillWriteAuthority(forcedArgs, "workplane"));
  const missingWorkerFence = parseBackfillTranscriptsArgs([
    "--youtube-video-ids", "VCbmPx1l7AU",
    "--force-targeted-retry",
    "--workplane-job-id", "6632",
    "--workplane-job-attempt", "2",
    "--methods", "hh_ytdlp_ejs_wpc",
    "--write",
    "--limit", "1",
  ]);
  assert.throws(() => assertBackfillWriteAuthority(missingWorkerFence, "workplane"), /worker identity/);
  const missingClaimGeneration = parseBackfillTranscriptsArgs([
    "--youtube-video-ids", "VCbmPx1l7AU",
    "--force-targeted-retry",
    "--workplane-job-id", "6632",
    "--workplane-worker-id", "worker-final-review",
    "--methods", "hh_ytdlp_ejs_wpc",
    "--write",
    "--limit", "1",
  ]);
  assert.throws(() => assertBackfillWriteAuthority(missingClaimGeneration, "workplane"), /claim generation/);

  const exactWriteWithoutForce = parseBackfillTranscriptsArgs([
    "--youtube-video-ids", "VCbmPx1l7AU",
    "--workplane-job-id", "6632",
    "--workplane-worker-id", "worker-final-review",
    "--workplane-job-attempt", "2",
    "--methods", "hh_ytdlp_ejs_wpc",
    "--write",
    "--limit", "1",
  ]);
  assert.throws(() => assertBackfillWriteAuthority(exactWriteWithoutForce, "cli"), /transcript_recover_hh Workplane ownership/);
  assert.throws(() => assertBackfillWriteAuthority(exactWriteWithoutForce, "workplane"), /force-targeted-retry/);

  const tenIds = Array.from({ length: 10 }, (_, index) => `B${String(index).padStart(10, "0")}`).join(",");
  const oversizedWorkplane = parseBackfillTranscriptsArgs([
    "--youtube-video-ids", tenIds,
    "--force-targeted-retry",
    "--workplane-job-id", "6632",
    "--workplane-worker-id", "worker-final-review",
    "--workplane-job-attempt", "2",
    "--methods", "hh_ytdlp_ejs_wpc",
    "--write",
    "--limit", "10",
  ]);
  assert.throws(() => assertBackfillWriteAuthority(oversizedWorkplane, "workplane"), /at most 9/);
  assert.doesNotThrow(() => assertBackfillWriteAuthority(parseBackfillTranscriptsArgs(["--write", "--limit", "1"]), "cli"));
});

test("Workplane transcript mutations journal in the same SQL statement as the row update", () => {
  for (const sql of [JOURNALED_TRANSCRIPT_FAILURE_SQL, JOURNALED_TRANSCRIPT_SUCCESS_SQL]) {
    assert.match(sql, /WITH owner AS/i);
    assert.match(sql, /type = 'transcript_recover_hh'[\s\S]*status = 'running'/);
    assert.match(sql, /locked_by = \$12/);
    assert.match(sql, /lease_expires_at > NOW\(\)/);
    assert.match(sql, /attempts = \$13/);
    assert.match(sql, /UPDATE videos/i);
    assert.match(sql, /UPDATE pipeline_jobs/i);
    assert.match(sql, /transcript_recovery_mutations/);
    assert.match(sql, /jsonb_build_object/);
    assert.match(sql, /FROM updated/i);
  }
});

test("forced transcript recovery query selects exact IDs and bypasses cooldown only for those IDs", () => {
  const args = parseBackfillTranscriptsArgs([
    "--youtube-video-ids",
    "VCbmPx1l7AU,lVLvnT4j9TU",
    "--force-targeted-retry",
    "--limit",
    "9",
  ]);
  const selection = buildMissingTranscriptVideosQuery(args);

  assert.match(selection.sql, /v\.youtube_video_id = ANY\(\$1::text\[\]\)/);
  assert.match(selection.sql, /bot_verification_required/);
  assert.match(selection.sql, /js_challenge_runtime_missing/);
  assert.doesNotMatch(selection.sql, /transcript_last_attempt_at\s*</);
  assert.deepEqual(selection.params[0], ["VCbmPx1l7AU", "lVLvnT4j9TU"]);
  assert.equal(selection.params.at(-2), 9);
  assert.equal(selection.params.at(-1), 0);
});

test("transcript recovery persists pre-mutation state and rejects concurrent row changes", () => {
  const selection = buildMissingTranscriptVideosQuery(parseBackfillTranscriptsArgs([
    "--youtube-video-ids", "VCbmPx1l7AU",
    "--force-targeted-retry",
    "--limit", "1",
  ]));
  assert.match(selection.sql, /v\.transcript_status/);
  assert.match(selection.sql, /v\.transcript_error/);
  assert.match(selection.sql, /v\.transcript_attempts/);
  assert.match(selection.sql, /v\.transcript_last_attempt_at/);

  const source = readFileSync("src/scripts/backfill-transcripts.ts", "utf8");
  assert.ok((source.match(/RETURNING id/g) ?? []).length >= 2);
  assert.match(source, /transcript_status IS NOT DISTINCT FROM \$5/);
  assert.match(source, /transcript_last_attempt_at IS NOT DISTINCT FROM \$8::timestamptz/);
  assert.match(source, /status: "mutation_conflict"/);
  assert.match(source, /previous_transcript_status/);
});

test("HH EJS/WPC method prefers isolated yt-dlp runtime and transcript-only args", () => {
  const args = parseBackfillTranscriptsArgs(["--methods", "hh_ytdlp_ejs_wpc", "--limit", "1"]);
  assert.equal(
    resolveYtDlpBinaryForMethod("hh_ytdlp_ejs_wpc", {}, (candidate) => candidate === "/opt/callscore/yt-dlp-2026.6.9/bin/yt-dlp"),
    "/opt/callscore/yt-dlp-2026.6.9/bin/yt-dlp",
  );
  assert.throws(
    () => resolveYtDlpBinaryForMethod("hh_ytdlp_ejs_wpc", {}, () => false),
    /canonical isolated yt-dlp runtime is unavailable/,
  );

  const ytdlpArgs = buildYtDlpTranscriptArgs("video123", args, {}, [], "hh_ytdlp_ejs_wpc");
  assert.ok(ytdlpArgs.includes("--skip-download"));
  assert.ok(ytdlpArgs.includes("--write-auto-subs"));
  assert.ok(ytdlpArgs.includes("--write-subs"));
  assert.ok(ytdlpArgs.includes("--js-runtimes"));
  assert.ok(ytdlpArgs.includes("node:/usr/local/bin/node"));
  assert.equal(ytdlpArgs.includes("--remote-components"), false);
  assert.equal(ytdlpArgs.includes("ejs:github"), false);
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
