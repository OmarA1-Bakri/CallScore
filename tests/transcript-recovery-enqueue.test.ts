import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTranscriptRecoveryEnqueuePayload,
  parseEnqueueJobArgs,
} from "../src/scripts/callscore-enqueue-job";

const ids = ["y1VZlQtjUwY", "5hRBjkrs3Ac", "ZqZB17fBclg", "wQBym5gj-pk", "DEU2Wy7pwtE"];

test("enqueue CLI builds a bounded exact-ID transcript_recover_hh Workplane payload", () => {
  const args = parseEnqueueJobArgs([
    "--job", "workplane",
    "--mode", "probe",
    "--workplane-type", "transcript_recover_hh",
    "--youtube-video-ids", ids.join(","),
    "--queued-by", "recovery-test",
  ]);
  const payload = buildTranscriptRecoveryEnqueuePayload(args, "transcript-recover-test-run");
  assert.deepEqual(payload.youtube_video_ids, ids);
  assert.equal(payload.limit, 5);
  assert.equal(payload.method, "hh_ytdlp_ejs_wpc");
  assert.equal(payload.force_targeted_retry, true);
  assert.equal(payload.continue_after_provider_block, false);
  assert.equal(payload.write, true);
  assert.equal(payload.run_id, "transcript-recover-test-run");
});

test("enqueue CLI rejects missing, malformed, duplicate, or oversized recovery IDs", () => {
  assert.throws(() => parseEnqueueJobArgs(["--job", "workplane", "--workplane-type", "transcript_recover_hh"]), /youtube-video-ids/);
  assert.throws(() => parseEnqueueJobArgs(["--job", "workplane", "--workplane-type", "transcript_recover_hh", "--youtube-video-ids", "bad"]), /11-character/);
  assert.throws(() => parseEnqueueJobArgs(["--job", "workplane", "--workplane-type", "transcript_recover_hh", "--youtube-video-ids", "y1VZlQtjUwY,y1VZlQtjUwY"]), /unique/);
  const ten = Array.from({ length: 10 }, (_, index) => `abcde${String(index).padStart(6, "0")}`);
  assert.throws(() => parseEnqueueJobArgs(["--job", "workplane", "--workplane-type", "transcript_recover_hh", "--youtube-video-ids", ten.join(",")]), /at most 9/);
});
