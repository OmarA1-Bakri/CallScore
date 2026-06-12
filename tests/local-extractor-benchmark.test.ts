import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrompt,
  extractJsonArrayText,
  loadFixtures,
  scoreFixture,
  validateExtraction,
} from "../src/scripts/benchmark-local-extractors";

test("call extraction fixtures cover required safety categories", () => {
  const fixtures = loadFixtures("data/eval/call-extraction-fixtures.jsonl");
  assert.ok(fixtures.length >= 10);
  const sourceTypes = fixtures.map((fixture) => fixture.source_type).join(" ");
  for (const expected of [
    "creator_owned",
    "news",
    "quoted",
    "guest",
    "aggregation",
    "ambiguous",
    "subtitle",
    "bearish",
    "risk_warning",
    "multi_asset",
  ]) {
    assert.match(sourceTypes, new RegExp(expected));
  }
});

test("extractJsonArrayText rejects object-only model output", () => {
  assert.throws(() => extractJsonArrayText('{"status":"accepted_call"}'), /JSON array/);
  assert.equal(extractJsonArrayText('```json\n[{"ok":true}]\n```'), '[{"ok":true}]');
});

test("schema validator rejects accepted calls that are not creator-owned", () => {
  const result = validateExtraction({
    status: "accepted_call",
    quote: "Arthur says ETH goes to 10k",
    asset_symbol: "ETHUSDT",
    direction: "bullish",
    call_type: "price_target",
    thesis: "third party call",
    timeframe: null,
    entry_reference: null,
    target: "10000",
    stop_loss_or_invalidation: null,
    ownership: "quoted_external_call",
    is_creator_owned: false,
    confidence: 0.9,
    rejection_reason: null,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("accepted_not_creator_owned"));
});

test("fixture scorer flags high-confidence non-call false positives", () => {
  const [fixture] = loadFixtures("data/eval/call-extraction-fixtures.jsonl").filter((item) => item.id === "btc-news-non-call");
  const score = scoreFixture(fixture, [{
    status: "accepted_call",
    quote: fixture.transcript_text,
    asset_symbol: "BTCUSDT",
    direction: "neutral",
    call_type: "directional",
    thesis: "market news",
    timeframe: null,
    entry_reference: "96000",
    target: null,
    stop_loss_or_invalidation: null,
    ownership: "creator_own_call",
    is_creator_owned: true,
    confidence: 0.75,
    rejection_reason: null,
  }], true, true);
  assert.equal(score.falsePositive, true);
  assert.equal(score.pass, false);
});

test("schema validator cleans literal null strings", () => {
  const cleaned = validateExtraction({
    status: "accepted_call",
    quote: "x",
    asset_symbol: "BTCUSDT",
    direction: "bullish",
    call_type: "directional",
    thesis: "null",
    timeframe: "null",
    entry_reference: "100",
    target: "null",
    stop_loss_or_invalidation: "null",
    ownership: "creator_own_call",
    is_creator_owned: true,
    confidence: 0.8,
    rejection_reason: "null",
  });
  assert.equal(cleaned.ok, true);
  assert.equal(cleaned.value?.target, null);
  assert.equal(cleaned.value?.rejection_reason, null);
});

test("model-specific prompts are intentionally different", () => {
  const [fixture] = loadFixtures("data/eval/call-extraction-fixtures.jsonl");
  const gemma = buildPrompt("gemma-optimized", fixture);
  const qwen = buildPrompt("qwen-optimized", fixture);
  assert.notEqual(gemma.user, qwen.user);
  assert.match(gemma.user, /Decision policy/);
  assert.match(qwen.user, /Output must start with \[/);
});
