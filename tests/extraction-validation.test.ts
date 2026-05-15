import test from "node:test";
import assert from "node:assert/strict";
import { auditExtraction } from "../src/lib/extraction-validation";
import type { Direction } from "../src/lib/types";

function audit(input: {
  readonly symbol: string;
  readonly quote: string;
  readonly direction?: Direction;
  readonly transcript?: string;
}) {
  return auditExtraction({
    symbol: input.symbol,
    direction: input.direction ?? "bullish",
    target_price: null,
    raw_quote: input.quote,
    transcript: input.transcript ?? input.quote,
    extraction_confidence: 0.95,
  });
}

test("rejects LINK when it is only a generic web-link promo", () => {
  const result = audit({
    symbol: "LINKUSDT",
    quote: "Use my LINK down below to sign up, I am bullish on the market.",
  });

  assert.equal(result.isValid, false);
  assert.match(result.reasons.join(" "), /asset|promo|link/i);
});

test("accepts Chainlink when asset and directional stance are explicit", () => {
  const result = audit({
    symbol: "LINKUSDT",
    quote: "Chainlink looks suppressed here and I am bullish on LINK for the next cycle.",
  });

  assert.equal(result.isValid, true);
});

test("rejects NEAR when it is only the ordinary word near", () => {
  const result = audit({
    symbol: "NEARUSDT",
    quote: "Bitcoin is NEAR the resistance level and could push higher from here.",
  });

  assert.equal(result.isValid, false);
});

test("accepts NEAR Protocol when asset and direction are explicit", () => {
  const result = audit({
    symbol: "NEARUSDT",
    quote: "NEAR Protocol is breaking out and I am bullish on the NEAR token.",
  });

  assert.equal(result.isValid, true);
});

test("rejects DOT when it refers to dot crash or dot-com context", () => {
  const result = audit({
    symbol: "DOTUSDT",
    quote: "Back in the DOT crash, markets were brutal, but Bitcoin could rally now.",
  });

  assert.equal(result.isValid, false);
});

test("accepts Polkadot when asset and direction are explicit", () => {
  const result = audit({
    symbol: "DOTUSDT",
    quote: "Polkadot is undervalued and I think DOT can rally from here.",
  });

  assert.equal(result.isValid, true);
});

test("rejects AR when it refers to non-token augmented reality context", () => {
  const result = audit({
    symbol: "ARUSDT",
    quote: "AR glasses could be a huge market and I am bullish on that sector.",
  });

  assert.equal(result.isValid, false);
});

test("accepts Arweave when asset and direction are explicit", () => {
  const result = audit({
    symbol: "ARUSDT",
    quote: "Arweave is undervalued and I am bullish on AR if storage narratives return.",
  });

  assert.equal(result.isValid, true);
});

test("does not reject a valid trading call merely because an exchange is mentioned", () => {
  const result = audit({
    symbol: "SOLUSDT",
    quote: "I bought SOL on Bybit because Solana is breaking out and could push higher.",
  });

  assert.equal(result.isValid, true);
});

test("rejects prompt/example leakage when raw quote is not in transcript", () => {
  const result = audit({
    symbol: "BTCUSDT",
    quote: "if Bitcoin holds above 80,000 then we can see the next leg up",
    transcript: "This actual transcript discusses macro liquidity but never says the few-shot example sentence.",
  });

  assert.equal(result.isValid, false);
  assert.match(result.reasons.join(" "), /raw quote is not present/i);
});

test("accepts neutral watch calls when quote has actionable support or resistance level", () => {
  const quote = "Bitcoin is at support around 40-45000, I think we should wait for it to come there once.";
  const result = audit({
    symbol: "BTCUSDT",
    direction: "neutral",
    quote,
  });

  assert.equal(result.isValid, true);
});

test("accepts Hindi support-zone watch language as actionable", () => {
  const quote = "बिटकॉइन के अंदर यहां पर एक बड़ी अच्छी खासी सपोर्ट यहां पर दिख रही है। $65,000 के आसपास की है।";
  const result = audit({
    symbol: "BTCUSDT",
    direction: "bullish",
    quote,
  });

  assert.equal(result.isValid, true);
});

test("accepts Ethereum massive-comeback forecast wording", () => {
  const result = audit({
    symbol: "ETHUSDT",
    quote: "I believe Ethereum will make a massive comeback in 2025.",
  });

  assert.equal(result.isValid, true);
});

test("accepts Ethereum positioning forecast wording", () => {
  const result = audit({
    symbol: "ETHUSDT",
    quote: "January to May of this year is the best time to be positioned in Ethereum.",
  });

  assert.equal(result.isValid, true);
});

test("accepts Bitcoin all-time-high continuation wording", () => {
  const result = audit({
    symbol: "BTCUSDT",
    quote: "Bitcoin hitting all-time highs over $100,000 shows the rocket ship keeps climbing.",
  });

  assert.equal(result.isValid, true);
});

test("accepts Sui load-up market-strength wording", () => {
  const result = audit({
    symbol: "SUIUSDT",
    quote: "I made one of the big calls that people should load up on Sui; Sui has been one of the best performers.",
  });

  assert.equal(result.isValid, true);
});

test("accepts Doge looking-strong wording", () => {
  const result = audit({
    symbol: "DOGEUSDT",
    quote: "Doge is looking pretty strong and I think Doge is going to do pretty good.",
  });

  assert.equal(result.isValid, true);
});

test("accepts Bitcoin bearish capitulatory-decline wording", () => {
  const result = audit({
    symbol: "BTCUSDT",
    direction: "bearish",
    quote: "The Bitcoin price is now at risk of a potentially heinous capitulatory decline.",
  });

  assert.equal(result.isValid, true);
});
