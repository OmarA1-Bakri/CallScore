import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrompt,
  extractJsonArrayText,
  loadFixtures,
  readBenchmarkSchema,
  scoreFixture,
  validateExtraction,
  validateExtractionForSchema,
  validateProductionExtraction,
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
  assert.throws(
    () => extractJsonArrayText('{"status":"accepted_call"}'),
    /JSON array/,
  );
  assert.equal(
    extractJsonArrayText('```json\n[{"ok":true}]\n```'),
    '[{"ok":true}]',
  );
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
  const [fixture] = loadFixtures(
    "data/eval/call-extraction-fixtures.jsonl",
  ).filter((item) => item.id === "btc-news-non-call");
  const score = scoreFixture(
    fixture,
    [
      {
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
      },
    ],
    true,
    true,
  );
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

test("benchmark schema parser defaults to eval and rejects unknown schemas", () => {
  assert.equal(readBenchmarkSchema(null), "eval");
  assert.equal(readBenchmarkSchema(""), "eval");
  assert.equal(readBenchmarkSchema("eval"), "eval");
  assert.equal(readBenchmarkSchema("production"), "production");
  assert.throws(
    () => readBenchmarkSchema("legacy"),
    /Unsupported benchmark schema/,
  );
});

test("eval schema accepts PR66 normalized objects and rejects production objects", () => {
  const evalCall = {
    status: "accepted_call",
    quote:
      "I am buying SOL around 150, target 220 over 60 days, invalidated below 130",
    asset_symbol: "SOLUSDT",
    direction: "bullish",
    call_type: "price_target",
    thesis: "creator is buying SOL",
    timeframe: "60 days",
    entry_reference: "150",
    target: "220",
    stop_loss_or_invalidation: "130",
    ownership: "creator_own_call",
    is_creator_owned: true,
    confidence: 0.85,
    rejection_reason: null,
  };
  const productionCall = {
    symbol: "SOLUSDT",
    direction: "bullish",
    call_type: "buy",
    entry_price: 150,
    target_price: 220,
    stop_loss: 130,
    timeframe: "60 days",
    confidence: "high",
    strategy_type: "technical_analysis",
    raw_quote:
      "I am buying SOL around 150, target 220 over 60 days, invalidated below 130",
    extraction_confidence: 0.9,
  };
  assert.equal(validateExtractionForSchema(evalCall, "eval").ok, true);
  assert.equal(validateExtractionForSchema(productionCall, "eval").ok, false);
});

test("eval and production schema use separate supported asset allowlists", () => {
  const evalAvax = validateExtractionForSchema(
    {
      status: "accepted_call",
      quote: "I am buying AVAX here",
      asset_symbol: "AVAXUSDT",
      direction: "bullish",
      call_type: "directional",
      thesis: null,
      timeframe: null,
      entry_reference: null,
      target: null,
      stop_loss_or_invalidation: null,
      ownership: "creator_own_call",
      is_creator_owned: true,
      confidence: 0.8,
      rejection_reason: null,
    },
    "eval",
  );
  assert.equal(evalAvax.ok, false);
  assert.ok(evalAvax.errors.includes("unsupported_asset_symbol"));

  const productionAvax = validateProductionExtraction({
    symbol: "AVAXUSDT",
    direction: "bullish",
    call_type: "watch",
    entry_price: null,
    target_price: null,
    stop_loss: null,
    timeframe: null,
    confidence: "medium",
    strategy_type: "technical_analysis",
    raw_quote: "I am watching AVAX here",
    extraction_confidence: 0.75,
  });
  assert.equal(productionAvax.ok, true);
});

test("production schema accepts current Gemma objects and rejects malformed objects", () => {
  const productionCall = {
    symbol: "solusdt",
    direction: "bullish",
    call_type: "buy",
    entry_price: 150,
    target_price: 220,
    stop_loss: 130,
    timeframe: "60 days",
    confidence: "high",
    strategy_type: "technical_analysis",
    raw_quote:
      "I am buying SOL around 150, target 220 over 60 days, invalidated below 130",
    extraction_confidence: 0.9,
  };
  const valid = validateProductionExtraction(productionCall);
  assert.equal(valid.ok, true);
  assert.equal(valid.value?.symbol, "SOLUSDT");
  assert.equal(valid.normalized?.asset_symbol, "SOLUSDT");
  assert.equal(valid.normalized?.target, "220");
  assert.equal(valid.normalized?.ownership, "creator_own_call");

  const malformed = validateProductionExtraction({
    ...productionCall,
    confidence: "certain",
  });
  assert.equal(malformed.ok, false);
  assert.ok(malformed.errors.includes("invalid_confidence"));
});

test("production avoid calls normalize entry trigger as invalidation for eval scoring", () => {
  const result = validateProductionExtraction({
    symbol: "DOGEUSDT",
    direction: "bearish",
    call_type: "avoid",
    entry_price: 0.12,
    target_price: 0.08,
    stop_loss: null,
    timeframe: "next month",
    confidence: "high",
    strategy_type: "technical_analysis",
    raw_quote:
      "if DOGE loses 12 cents, the risk is a fast drop toward 8 cents over the next month.",
    extraction_confidence: 0.9,
  });
  assert.equal(result.ok, true);
  assert.equal(result.normalized?.entry_reference, null);
  assert.equal(result.normalized?.target, "0.08");
  assert.equal(result.normalized?.stop_loss_or_invalidation, "0.12");
});

test("production schema scorer treats empty arrays as valid no-call rejections", () => {
  const [fixture] = loadFixtures(
    "data/eval/call-extraction-fixtures.jsonl",
  ).filter((item) => item.id === "btc-news-non-call");
  const score = scoreFixture(fixture, [], true, true);
  assert.equal(score.falsePositive, false);
  assert.equal(score.pass, true);
});

test("model-specific prompts are intentionally different", () => {
  const [fixture] = loadFixtures("data/eval/call-extraction-fixtures.jsonl");
  const gemma = buildPrompt("gemma-optimized", fixture);
  const qwen = buildPrompt("qwen-optimized", fixture);
  assert.notEqual(gemma.user, qwen.user);
  assert.match(gemma.user, /Decision policy/);
  assert.match(qwen.user, /Output must start with \[/);
});
