import test from "node:test";
import assert from "node:assert/strict";
import {
  buildModelRunPaths,
  buildShadowDiffCommand,
  buildShadowExtractCommand,
  DEFAULT_OLLAMA_BAKEOFF_MODELS,
  parseOllamaBakeoffArgs,
} from "../src/scripts/bakeoff-ollama-cloud-models";

test("ollama bakeoff defaults to safe dry-run using approved recommendation set", () => {
  const args = parseOllamaBakeoffArgs(["--run-id", "bakeoff-test"]);

  assert.equal(args.execute, false);
  assert.equal(args.runId, "bakeoff-test");
  assert.equal(args.outDir, ".tmp/ollama-model-bakeoff/bakeoff-test");
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
