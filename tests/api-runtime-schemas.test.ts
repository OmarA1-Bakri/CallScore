import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { buildHealthResponse, pingDatabase } from "../src/app/api/health/helpers";
import { runWeeklyCron, type StepResult } from "../src/app/api/cron/weekly/helpers";
import { callRowSchema, creatorRowSchema, leaderboardQueryRowSchema, parseApiRow } from "../src/lib/api-schemas";

function cronRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cron/weekly", {
    method: "POST",
    headers: { authorization: "Bearer cron-secret" },
  });
}

function step(name: string, onRun?: () => void): () => Promise<StepResult> {
  return async () => {
    onRun?.();
    return { step: name, status: "completed", message: name, duration_ms: 1 };
  };
}

test("health ping uses injectable DB query and surfaces DB failures", async () => {
  let statement = "";
  await pingDatabase(async <T>(text: string): Promise<T[]> => {
    statement = text;
    return [{ ok: 1 }] as T[];
  });
  assert.match(statement, /SELECT 1 AS ok/);

  await assert.rejects(
    () => pingDatabase(async () => {
      throw new Error("db unavailable");
    }),
    /db unavailable/,
  );

  const unavailable = await buildHealthResponse(async () => {
    throw new Error("db unavailable");
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { ok: false, db: "unavailable" });
});

test("weekly cron stops before the next step when the deadline aborts mid-batch", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-secret";
  const controller = new AbortController();
  const ran: string[] = [];

  try {
    const response = await runWeeklyCron(cronRequest(), {
      deadlineSignal: controller.signal,
      steps: [
        step("first", () => {
          ran.push("first");
          controller.abort();
        }),
        step("second", () => ran.push("second")),
      ],
      now: () => 1_000,
    });

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.data.deadline_exceeded, true);
    assert.deepEqual(body.data.steps_completed.map((item: StepResult) => item.step), ["first"]);
    assert.deepEqual(ran, ["first"]);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("API row schemas coerce DB numerics and reject malformed enum values", () => {
  const creator = parseApiRow(creatorRowSchema, {
    id: "7",
    name: "Creator",
    youtube_handle: "@creator",
    youtube_channel_id: null,
    subscribers: null,
    focus: null,
    tier: "pro",
    total_calls: "11",
    win_rate: "0.42",
    avg_return: "3.2",
    alpha_score: "77",
    accuracy_rank: null,
    last_scraped_at: null,
  }, "creator");
  assert.equal(creator.id, 7);
  // The public API contract uses a stable epoch default when DB rows predate
  // creator.created_at backfill data.
  assert.equal(creator.created_at, "1970-01-01T00:00:00.000Z");

  const leaderboard = parseApiRow(leaderboardQueryRowSchema, {
    id: "1",
    creator_id: "7",
    period: "all_time",
    total_calls: "11",
    win_rate: "0.42",
    avg_return_7d: "1",
    avg_return_30d: "2",
    avg_return_90d: "3",
    avg_alpha_30d: "4",
    best_call_id: null,
    worst_call_id: null,
    hit_rate: "0.5",
    most_called_symbol: null,
    strategy_consistency: "0.8",
    specificity_avg: "0.7",
    alpha_score: "77",
    accuracy_rank: "2",
    effective_n: "10",
    wilson_lb: "0.3",
    bullish_win_rate: "0.6",
    bearish_win_rate: "0.4",
    bullish_pct: "0.55",
    sharpe_ratio: "1.2",
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    name: "Creator",
    youtube_handle: "@creator",
    youtube_channel_id: null,
    subscribers: null,
    focus: null,
    tier: "pro",
    creator_alpha_score: "77",
    creator_total_calls: "11",
    creator_win_rate: "0.42",
    creator_avg_return: "3.2",
    creator_accuracy_rank: null,
    creator_last_scraped_at: null,
    creator_created_at: "2026-01-01T00:00:00.000Z",
  }, "leaderboard");
  assert.equal(leaderboard.accuracy_rank, 2);
  assert.equal(leaderboard.updated_at, "2026-01-01T00:00:00.000Z");

  assert.throws(
    () => parseApiRow(callRowSchema, {
      id: 1,
      creator_id: 7,
      video_id: 9,
      symbol: "BTC",
      direction: "sideways",
      call_type: null,
      entry_price: null,
      target_price: null,
      stop_loss: null,
      timeframe: null,
      confidence: null,
      strategy_type: null,
      raw_quote: null,
      extraction_confidence: 0.8,
      specificity_score: 0.4,
      call_date: "2026-01-01T00:00:00.000Z",
      price_at_call: null,
      btc_price_at_call: null,
      price_7d: null,
      price_30d: null,
      price_90d: null,
      btc_price_7d: null,
      btc_price_30d: null,
      btc_price_90d: null,
      return_7d: null,
      return_30d: null,
      return_90d: null,
      alpha_7d: null,
      alpha_30d: null,
      alpha_90d: null,
      hit_target: null,
      correct_direction: null,
      regime_at_call: null,
      regime_difficulty: 0,
      score: 0,
      created_at: "2026-01-01T00:00:00.000Z",
    }, "call"),
    /call row shape mismatch/,
  );
});
