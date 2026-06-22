import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateCaptions } from "../src/video/captions/generate-captions";
import { captionsToSrt } from "../src/video/captions/write-srt";
import { synthesizeNarration } from "../src/video/tts/kokoro";
import { normalizeAudio } from "../src/video/tts/normalize-audio";
import { mockVideoCandidates } from "../src/video/data/mock-video-candidates";
import { renderDeterministicThumbnail } from "../src/video/thumbnail/render-thumbnail";
import { planVideo } from "../src/video/planning/video-planner.graph";
import { rankVideoCandidates } from "../src/video/data/rank-video-candidates";

const ranked = rankVideoCandidates(mockVideoCandidates, new Date("2026-06-23T00:00:00.000Z"));
const plan = planVideo({ rankedCandidates: ranked, runDate: "2026-06-23T00:00:00.000Z" });

test("caption generation produces ordered SRT cues", () => {
  const cues = generateCaptions(plan.scenes);
  const srt = captionsToSrt(cues);
  assert.ok(cues.length >= plan.scenes.length);
  assert.match(srt, /00:00:00,000 -->/);
  assert.match(srt, /CallScore/);
});

test("TTS writes raw and normalized wav files with fallback if Kokoro is unavailable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-video-audio-"));
  const raw = path.join(dir, "audio.raw.wav");
  const normalized = path.join(dir, "audio.normalized.wav");
  const result = await synthesizeNarration({ text: "CallScore tracks crypto creator calls.", outputPath: raw, device: "cpu" });
  assert.equal(result.ok, true);
  await normalizeAudio(raw, normalized);
  assert.ok((await fs.stat(raw)).size > 1000);
  assert.ok((await fs.stat(normalized)).size > 1000);
});

test("thumbnail generation writes png and jpg", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-video-thumb-"));
  const pngPath = path.join(dir, "thumbnail.png");
  const jpgPath = path.join(dir, "thumbnail.jpg");
  const result = await renderDeterministicThumbnail({ format: "daily_short", creator: mockVideoCandidates[0], pngPath, jpgPath });
  assert.equal(result.pngPath, pngPath);
  assert.ok((await fs.stat(pngPath)).size > 1000);
  assert.ok((await fs.stat(jpgPath)).size > 1000);
});
