import test from "node:test";
import assert from "node:assert/strict";
import {
  extractJsonArrayText,
  parseOpenRouterExtractionArgs,
} from "../src/scripts/extract-calls-openrouter";

test("OpenRouter extraction defaults to Gemma 4 31B free with paid 31B fallback", () => {
  const args = parseOpenRouterExtractionArgs([]);

  assert.equal(args.model, "google/gemma-4-31b-it:free");
  assert.equal(args.fallbackModel, "google/gemma-4-31b-it");
  assert.equal(args.limit, 10);
  assert.equal(args.dryRun, true);
  assert.equal(args.write, false);
  assert.equal(args.auditOut, null);
});

test("OpenRouter extraction parses explicit CLI arguments safely", () => {
  const args = parseOpenRouterExtractionArgs([
    "--limit",
    "21",
    "--model",
    "google/gemma-4-31b-it",
    "--fallback-model",
    "openai/gpt-4.1-mini",
    "--gap-ms",
    "3000",
    "--write",
    "--video-ids",
    "7950,7951,not-a-number,7969",
    "--include-extracted",
    "--audit-out",
    "/tmp/openrouter-audit.jsonl",
  ]);

  assert.equal(args.limit, 21);
  assert.equal(args.model, "google/gemma-4-31b-it");
  assert.equal(args.fallbackModel, "openai/gpt-4.1-mini");
  assert.equal(args.gapMs, 3000);
  assert.equal(args.write, true);
  assert.equal(args.dryRun, false);
  assert.deepEqual(args.videoIds, [7950, 7951, 7969]);
  assert.equal(args.includeExtracted, true);
  assert.equal(args.auditOut, "/tmp/openrouter-audit.jsonl");
});

test("extractJsonArrayText accepts bare arrays and fenced JSON", () => {
  assert.equal(extractJsonArrayText('[{"symbol":"BTCUSDT"}]'), '[{"symbol":"BTCUSDT"}]');
  assert.equal(
    extractJsonArrayText('```json\n[{"symbol":"ETHUSDT"}]\n```'),
    '[{"symbol":"ETHUSDT"}]',
  );
});

test("extractJsonArrayText extracts first JSON array from explanatory model output", () => {
  assert.equal(
    extractJsonArrayText('Here are the calls:\n[{"symbol":"SOLUSDT"}]\nDone.'),
    '[{"symbol":"SOLUSDT"}]',
  );
});
