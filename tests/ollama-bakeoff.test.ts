import test from "node:test";
import assert from "node:assert/strict";
import {
  buildModelRunPaths,
  buildShadowDiffCommand,
  buildShadowExtractCommand,
  DEFAULT_OLLAMA_BAKEOFF_MODELS,
  parseOllamaBakeoffArgs,
} from "../src/scripts/bakeoff-ollama-cloud-models";
import {
  calculateClassificationMetrics,
  classifyFalsePositive,
  scoreExtractionSet,
} from "../src/lib/llm-eval";
import {
  buildKeywordWindows,
  scoreTranscriptForExtraction,
} from "../src/lib/extraction-triage";
import {
  buildLowConfidenceReextractArgs,
  parseLowConfidenceReextractArgs,
} from "../src/scripts/reextract-low-confidence-videos";

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

test("ollama bakeoff defaults to safe dry-run using approved recommendation set", () => {
  const args = parseOllamaBakeoffArgs(["--run-id", "bakeoff-test"]);

  assert.equal(args.execute, false);
  assert.equal(args.runId, "bakeoff-test");
  assert.equal(
    toPosixPath(args.outDir),
    ".tmp/ollama-model-bakeoff/bakeoff-test",
  );
  assert.deepEqual(args.models, [...DEFAULT_OLLAMA_BAKEOFF_MODELS]);
  assert.equal((args.models as readonly string[]).includes("gpt-oss:120b"), false);
  assert.equal(args.models.some((model) => model.startsWith("gemma3")), false);
  assert.equal((args.models as readonly string[]).includes("nemotron-3-super"), true);
  assert.equal((args.models as readonly string[]).includes("gemma4:31b"), true);
  assert.equal(args.limit, 8);
});

test("ollama bakeoff parses explicit models, bounds, and execute flag", () => {
  const args = parseOllamaBakeoffArgs([
    "--execute",
    "--run-id",
    "real-run",
    "--out-dir",
    ".tmp/custom-bakeoff",
    "--models",
    "deepseek-v4-flash,glm-5.1",
    "--video-ids",
    "101,202",
    "--limit",
    "2",
    "--request-timeout-ms",
    "400000",
    "--gap-ms",
    "2500",
    "--chunk-chars",
    "6000",
    "--max-chunks",
    "50",
  ]);

  assert.equal(args.execute, true);
  assert.deepEqual(args.models, ["deepseek-v4-flash", "glm-5.1"]);
  assert.deepEqual(args.videoIds, [101, 202]);
  assert.equal(args.limit, 2);
  assert.equal(args.requestTimeoutMs, 400_000);
  assert.equal(args.gapMs, 2500);
  assert.equal(args.chunkChars, 6000);
  assert.equal(args.maxChunks, 50);
});

test("ollama bakeoff wires each model through shadow extract and shadow diff", () => {
  const args = parseOllamaBakeoffArgs([
    "--execute",
    "--run-id",
    "bakeoff-test",
    "--models",
    "gemma4:31b",
    "--video-ids",
    "7,8",
    "--chunk-chars",
    "7000",
  ]);
  const paths = buildModelRunPaths(args, "gemma4:31b");
  const extract = buildShadowExtractCommand(args, paths, [7, 8]);
  const diff = buildShadowDiffCommand(paths);

  assert.deepEqual(extract.slice(0, 4), ["node", "--import", "tsx", "src/scripts/shadow-extract-transcripts.ts"]);
  assert.ok(extract.includes("--provider"));
  assert.ok(extract.includes("ollama"));
  assert.ok(extract.includes("--ollama-host"));
  assert.ok(extract.includes("https://ollama.com"));
  assert.ok(extract.includes("--model"));
  assert.ok(extract.includes("gemma4:31b"));
  assert.ok(extract.includes("--video-ids"));
  assert.ok(extract.includes("7,8"));
  assert.ok(extract.includes("--execute"));
  assert.ok(extract.includes("--chunk-chars"));
  assert.ok(extract.includes("7000"));
  assert.equal(extract.includes("--write"), false);

  assert.deepEqual(diff.slice(0, 4), ["node", "--import", "tsx", "src/scripts/shadow-diff-extractions.ts"]);
  assert.ok(diff.includes("--shadow-in"));
  assert.ok(diff.includes(paths.shadowOut));
  assert.ok(diff.includes("--diff-out"));
  assert.ok(diff.includes(paths.diffOut));
});

test("LLM gold-set metrics compute precision recall F1 and false-positive buckets", () => {
  const metrics = scoreExtractionSet(
    [
      { symbol: "BTCUSDT", direction: "bullish", raw_quote: "Bitcoin can break resistance" },
      { symbol: "ETHUSDT", direction: "bullish", raw_quote: "Join my sponsor link below" },
    ],
    [{ symbol: "BTCUSDT", direction: "bullish" }],
  );

  assert.deepEqual(calculateClassificationMetrics({
    truePositives: 1,
    falsePositives: 1,
    falseNegatives: 0,
  }), metrics);
  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.recall, 1);
  assert.ok(Math.abs(metrics.f1 - 0.667) <= 1e-3, `F1 ${metrics.f1} should be approximately 0.667`);
  assert.equal(classifyFalsePositive({ symbol: "ETHUSDT", direction: "bullish", raw_quote: "Join my sponsor link below" }), "sponsor_or_link");
});

test("triage builds keyword windows around actionable transcript snippets", () => {
  const KEYWORD_WINDOW_SIZE = 160;  // Character window size for keyword extraction
  const MAX_KEYWORD_WINDOWS = 3;    // Maximum number of windows to extract
  const transcript = "Intro. ".repeat(100) + "Bitcoin is near support and I would buy BTC for a breakout target.";
  assert.ok(scoreTranscriptForExtraction(transcript) > 0);
  const windows = buildKeywordWindows(transcript, KEYWORD_WINDOW_SIZE, MAX_KEYWORD_WINDOWS);
  assert.equal(windows[0].symbol, "BTCUSDT");
  assert.match(windows[0].text, /buy BTC|Bitcoin/i);
});

test("extraction scoring handles false negatives", () => {
  const metrics = scoreExtractionSet(
    [{ symbol: "BTCUSDT", direction: "bullish", raw_quote: "Bitcoin will rise" }],
    [
      { symbol: "BTCUSDT", direction: "bullish" },
      { symbol: "ETHUSDT", direction: "bearish" },
    ],
  );
  assert.ok(metrics.falseNegatives > 0, "Should have false negatives for missing predictions");
  assert.ok(metrics.recall < 1, "Recall should be less than 1 when predictions are incomplete");
});

test("extraction scoring handles empty predictions", () => {
  const metrics = scoreExtractionSet(
    [],
    [{ symbol: "BTCUSDT", direction: "bullish" }],
  );
  assert.equal(metrics.precision, 0, "Precision should be 0 with no predictions");
  assert.equal(metrics.recall, 0, "Recall should be 0 with no predictions");
});

test("extraction scoring handles empty gold set", () => {
  const metrics = scoreExtractionSet(
    [{ symbol: "BTCUSDT", direction: "bullish", raw_quote: "Bitcoin" }],
    [],
  );
  assert.equal(metrics.recall, 0, "Recall should be 0 when there are no gold standard items");
});

test("extraction scoring handles all incorrect predictions", () => {
  const metrics = scoreExtractionSet(
    [
      { symbol: "DOGEUSDT", direction: "neutral", raw_quote: "Random text" },
      { symbol: "ADAUSDT", direction: "bearish", raw_quote: "More text" },
    ],
    [{ symbol: "BTCUSDT", direction: "bullish" }],
  );
  assert.equal(metrics.truePositives, 0, "Should have no true positives");
  assert.ok(metrics.falsePositives > 0, "Should have false positives");
  assert.equal(metrics.precision, 0, "Precision should be 0 when all predictions are wrong");
  assert.equal(metrics.f1, 0, "F1 should be 0 when precision is 0");
});

test("low-confidence re-extraction routes through stronger chunked extractor", () => {
  const args = parseLowConfidenceReextractArgs(["--write", "--provider", "ollama", "--model", "kimi-k2.6", "--chunk-chars", "6000"]);
  const mapped = buildLowConfidenceReextractArgs(args, [11, 12]);
  const maxChunksIndex = mapped.indexOf("--max-chunks");
  assert.ok(mapped.includes("--include-extracted"));
  assert.ok(mapped.includes("--chunk-chars"));
  assert.ok(mapped.includes("6000"));
  assert.ok(maxChunksIndex >= 0);
  assert.equal(mapped[maxChunksIndex + 1], String(args.maxChunks));
  assert.ok(mapped.includes("--write"));
  assert.equal(mapped.includes("--dry-run"), false);
});
