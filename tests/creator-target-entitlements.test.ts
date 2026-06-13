import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import CallHistory from "../src/components/CallHistory";
import { SESSION_COOKIE_NAME, createSessionToken } from "../src/lib/auth";
import { serializeCall, type SerializedCall } from "../src/lib/public-serializer";
import type { Call, Creator, CreatorStats } from "../src/lib/types";
import { GET as creatorGET } from "../src/app/api/creator/[id]/route";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

const originalFetch = globalThis.fetch;
const originalReadBase = process.env.HH_READ_API_BASE;
const originalSessionSecret = process.env.SESSION_SECRET;

function restoreEnv() {
  globalThis.fetch = originalFetch;
  if (originalReadBase === undefined) delete process.env.HH_READ_API_BASE;
  else process.env.HH_READ_API_BASE = originalReadBase;
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
}

test.afterEach(restoreEnv);

function buildCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 24996,
    creator_id: 93,
    video_id: 7,
    symbol: "ETHUSDT",
    direction: "bearish",
    call_type: "watch",
    entry_price: null,
    target_price: 1700,
    stop_loss: null,
    timeframe: null,
    confidence: "medium",
    strategy_type: "technical_analysis",
    raw_quote: "ETH can fall to 1700 if support breaks.",
    extraction_confidence: 0.9,
    specificity_score: 0.25,
    call_date: "2026-03-11T00:00:00.000Z",
    price_at_call: 2034.39,
    btc_price_at_call: 83000,
    price_7d: 1900,
    price_30d: 1880,
    price_90d: 1669.12,
    btc_price_7d: 84000,
    btc_price_30d: 85000,
    btc_price_90d: 86000,
    return_7d: 2,
    return_30d: 7.6,
    return_90d: 17.9,
    alpha_7d: 1,
    alpha_30d: 4.8,
    alpha_90d: 15,
    hit_target: true,
    correct_direction: true,
    regime_at_call: 4,
    regime_difficulty: 0.7,
    score: 34.5,
    created_at: "2026-03-11T00:00:00.000Z",
    ...overrides,
  };
}

function creator(): Creator {
  return {
    id: 93,
    name: "99Bitcoins",
    youtube_handle: "@99Bitcoins",
    youtube_channel_id: "UCQQ_fGcMDxlKre3SEqEWrLA",
    subscribers: "714000",
    focus: "Bitcoin and crypto education",
    tier: "free",
    total_calls: 30,
    win_rate: 0.66,
    avg_return: 5.8,
    alpha_score: 38.5,
    accuracy_rank: 1,
    last_scraped_at: "2026-05-13T06:05:04.673Z",
    created_at: "2026-04-23T20:32:29.703Z",
  };
}

function stats(): CreatorStats {
  return {
    id: 90674,
    creator_id: 93,
    period: "all_time",
    total_calls: 3,
    win_rate: 0.66,
    avg_return_7d: 1,
    avg_return_30d: 5.8,
    avg_return_90d: -13.8,
    avg_alpha_30d: -1.1,
    best_call_id: null,
    worst_call_id: null,
    hit_rate: 0.66,
    most_called_symbol: "BTCUSDT",
    strategy_consistency: 0.4,
    specificity_avg: 0.2,
    alpha_score: 38.5,
    accuracy_rank: 1,
    effective_n: 11,
    wilson_lb: 0,
    bullish_win_rate: 0.74,
    bearish_win_rate: 0,
    bullish_pct: 0.9,
    sharpe_ratio: 1.75,
    updated_at: "2026-06-13T02:58:46.760Z",
  };
}

function installReadApiMock() {
  process.env.HH_READ_API_BASE = "https://ops-bridge.call-score.com/api/read";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/home")) {
      return new Response(JSON.stringify({
        ok: true,
        officialRankedRows: [{ creator_id: 93, youtube_handle: "@99Bitcoins" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.endsWith("/creator/99Bitcoins")) {
      return new Response(JSON.stringify({
        ok: true,
        creator: creator(),
        stats: stats(),
        calls: [
          buildCall(),
          buildCall({ id: 25057, symbol: "SOLUSDT", direction: "bullish", target_price: 60, hit_target: true, raw_quote: "SOL can reclaim 60." }),
          buildCall({ id: 25056, symbol: "BTCUSDT", target_price: 55000, hit_target: false, raw_quote: "BTC can revisit 55000." }),
          buildCall({ id: 1, target_price: null, hit_target: null, raw_quote: "ETH direction only." }),
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  }) as typeof fetch;
}

async function creatorResponse(tier: "free" | "pro" | "alpha") {
  installReadApiMock();
  process.env.SESSION_SECRET = "01234567890123456789012345678901";
  const headers = new Headers();
  if (tier !== "free") {
    const token = createSessionToken({
      userId: `user-${tier}`,
      tier,
      accessToken: null,
      exp: Date.now() + 60_000,
    });
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  }
  const request = new NextRequest("https://call-score.com/api/creator/93?limit=100", { headers });
  const response = await creatorGET(request, { params: Promise.resolve({ id: "93" }) });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ data: { calls: SerializedCall[] } }>;
}

test("serializer gates numeric target prices and raw target quotes for free users", () => {
  const free = serializeCall(buildCall({ target_price: 55000, raw_quote: "BTC can revisit 55000." }), {
    now: new Date("2026-06-13T00:00:00.000Z"),
    userTier: "free",
  });

  assert.equal(free.target_price, null);
  assert.equal(free.validated_target_price, null);
  assert.equal(free.hit_target, true);
  assert.equal(free.target_status, "available");
  assert.equal(free.target_required_tier, "pro");
  assert.equal(free.can_view_target_price, false);
  assert.equal(free.raw_quote, null);
  assert.doesNotMatch(JSON.stringify(free), /55000/);
});

test("serializer exposes numeric target prices to Pro and Alpha users", () => {
  const pro = serializeCall(buildCall({ target_price: 1700 }), { userTier: "pro" });
  const alpha = serializeCall(buildCall({ target_price: 60 }), { userTier: "alpha" });

  assert.equal(pro.target_price, 1700);
  assert.equal(pro.validated_target_price, 1700);
  assert.equal(pro.target_required_tier, "pro");
  assert.equal(pro.can_view_target_price, true);
  assert.equal(alpha.target_price, 60);
  assert.equal(alpha.can_view_target_price, true);
});

test("creator API free response preserves target outcomes but not target numbers", async () => {
  const json = await creatorResponse("free");
  const calls = json.data.calls;
  const targetRows = calls.filter((call) => call.target_required_tier === "pro");

  assert.equal(targetRows.length, 3);
  assert.deepEqual(targetRows.map((call) => call.hit_target), [true, true, false]);
  assert.deepEqual(targetRows.map((call) => call.can_view_target_price), [false, false, false]);
  assert.deepEqual(targetRows.map((call) => call.target_price), [null, null, null]);
  assert.deepEqual(targetRows.map((call) => call.validated_target_price), [null, null, null]);
  assert.equal(calls.find((call) => call.target_required_tier === null)?.target_price, null);
  assert.doesNotMatch(JSON.stringify(json), /1700|55000|SOL can reclaim 60|BTC can revisit 55000/);
});

test("creator API Pro and Alpha responses expose target numbers", async () => {
  const pro = await creatorResponse("pro");
  const alpha = await creatorResponse("alpha");

  assert.deepEqual(
    pro.data.calls.filter((call) => call.target_required_tier === "pro").map((call) => call.target_price),
    [1700, 60, 55000],
  );
  assert.deepEqual(
    alpha.data.calls.filter((call) => call.target_required_tier === "pro").map((call) => call.can_view_target_price),
    [true, true, true],
  );
});

test("CallHistory renders gated, entitled, and empty target cells", () => {
  const freeCalls = [
    serializeCall(buildCall({ id: 1, target_price: 1700, hit_target: true }), { userTier: "free" }),
    serializeCall(buildCall({ id: 2, target_price: 55000, hit_target: false }), { userTier: "free" }),
    serializeCall(buildCall({ id: 3, target_price: null, hit_target: null }), { userTier: "free" }),
  ];
  const proCalls = [
    serializeCall(buildCall({ id: 4, target_price: 1700, hit_target: true }), { userTier: "pro" }),
    serializeCall(buildCall({ id: 5, target_price: 55000, hit_target: false }), { userTier: "pro" }),
  ];

  const freeHtml = renderToStaticMarkup(React.createElement(CallHistory, { calls: freeCalls }));
  const proHtml = renderToStaticMarkup(React.createElement(CallHistory, { calls: proCalls }));

  assert.match(freeHtml, /Pro ✓/);
  assert.match(freeHtml, /Pro ✕/);
  assert.match(freeHtml, />—<|>—<!--/);
  assert.match(proHtml, /1,700 ✓/);
  assert.match(proHtml, /55,000 ✕/);
});
