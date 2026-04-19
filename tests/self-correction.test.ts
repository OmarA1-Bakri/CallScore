/**
 * self-correction.test.ts — pure-function detection tests +
 * DB-layer scoring tests that prime require.cache with a fake `query`.
 *
 * Mirrors the pattern used in alerts.test.ts: we swap out @/lib/db BEFORE
 * importing @/lib/self-correction so the DB call stays deterministic.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import type { Call } from "../src/lib/types";

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-session-secret-1234567890-abc";
process.env.NEON_DATABASE_URL =
  process.env.NEON_DATABASE_URL ?? "postgres://stub";

/* ----------------------------------------------------------------- */
/*  Fake DB                                                           */
/* ----------------------------------------------------------------- */

interface RevisionRow {
  creator_id: number;
  original_call_id: number;
  revision_type: string;
}

interface ScoringCallRow {
  id: number;
  creator_id: number;
  return_30d: number | null;
  direction: string;
  hit_target: boolean | null;
  correct_direction: boolean | null;
  extraction_confidence: number;
}

interface FakeDbState {
  revisions: RevisionRow[];
  calls: ScoringCallRow[];
}

let fakeDb: FakeDbState = { revisions: [], calls: [] };

function resetFakeDb(): void {
  fakeDb = { revisions: [], calls: [] };
}

async function fakeQuery<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const sql = text.replace(/\s+/g, " ").trim();

  // computeSelfCorrectionScore revision join
  if (/FROM call_revisions r JOIN calls oc/i.test(sql) && /WHERE r\.creator_id = \$1/i.test(sql)) {
    const creatorId = Number(params[0]);
    return fakeDb.revisions
      .filter((r) => r.creator_id === creatorId)
      .map((r) => {
        const call = fakeDb.calls.find((c) => c.id === r.original_call_id);
        if (!call) return null;
        return {
          revision_type: r.revision_type,
          return_30d: call.return_30d,
          direction: call.direction,
          hit_target: call.hit_target,
          correct_direction: call.correct_direction,
          score_qualifies:
            call.extraction_confidence >= 0.6 && call.return_30d !== null,
        };
      })
      .filter((x) => x !== null) as unknown as T[];
  }

  // computeSelfCorrectionScore denominator
  if (
    /FROM calls WHERE creator_id = \$1 AND return_30d IS NOT NULL AND extraction_confidence >= 0\.6/i.test(
      sql,
    )
  ) {
    const creatorId = Number(params[0]);
    const scored = fakeDb.calls.filter(
      (c) =>
        c.creator_id === creatorId &&
        c.return_30d !== null &&
        c.extraction_confidence >= 0.6,
    );
    return [{ scored_count: String(scored.length) }] as unknown as T[];
  }

  // computeAllSelfCorrectionAggregates — bulk query
  if (/WITH scored AS/i.test(sql)) {
    const byCreator = new Map<
      number,
      { revisions: number; numerator: number; scored: number }
    >();
    const scoredByCreator = new Map<number, number>();
    for (const c of fakeDb.calls) {
      if (c.return_30d !== null && c.extraction_confidence >= 0.6) {
        scoredByCreator.set(
          c.creator_id,
          (scoredByCreator.get(c.creator_id) ?? 0) + 1,
        );
      }
    }
    for (const r of fakeDb.revisions) {
      const call = fakeDb.calls.find((c) => c.id === r.original_call_id);
      if (!call) continue;
      const existing = byCreator.get(r.creator_id) ?? {
        revisions: 0,
        numerator: 0,
        scored: scoredByCreator.get(r.creator_id) ?? 0,
      };
      existing.revisions += 1;
      if (r.revision_type === "updated_target") existing.numerator += 0.5;
      else if (r.revision_type === "retracted") existing.numerator += 0.5;
      else if (
        r.revision_type === "confirmed_miss" &&
        call.return_30d !== null &&
        call.extraction_confidence >= 0.6 &&
        ((call.direction === "bullish" && call.return_30d <= 0) ||
          (call.direction === "bearish" && call.return_30d >= 0))
      ) {
        existing.numerator += 1.0;
      } else if (
        r.revision_type === "reversed_direction" &&
        (call.correct_direction === false || call.hit_target === false)
      ) {
        existing.numerator += 0.5;
      }
      byCreator.set(r.creator_id, existing);
    }
    const out: Record<string, unknown>[] = [];
    for (const [creatorId, agg] of byCreator.entries()) {
      out.push({
        creator_id: creatorId,
        revision_count: String(agg.revisions),
        score_numerator: String(agg.numerator),
        scored_calls: String(agg.scored),
      });
    }
    return out as unknown as T[];
  }

  throw new Error(`fakeQuery: unrecognized SQL: ${sql.slice(0, 160)}`);
}

/* ----------------------------------------------------------------- */
/*  Prime require.cache with the fake db module BEFORE imports.      */
/* ----------------------------------------------------------------- */

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "src", "lib", "db.ts");

/* eslint-disable @typescript-eslint/no-require-imports */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NodeModule = require("node:module") as any;

function primeCache(
  filePath: string,
  exportsObj: Record<string, unknown>,
): void {
  const m = new NodeModule(filePath, module);
  m.filename = filePath;
  m.loaded = true;
  m.exports = exportsObj;
  require.cache[filePath] = m;
}

primeCache(DB_PATH, {
  query: fakeQuery,
  getDb: () => fakeQuery,
  resolveDatabaseUrl: () => "postgres://stub",
  DATABASE_URL_ENV_KEYS: ["NEON_DATABASE_URL"],
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const selfCorrection = require(
  path.join(PROJECT_ROOT, "src", "lib", "self-correction.ts"),
) as typeof import("../src/lib/self-correction");
/* eslint-enable @typescript-eslint/no-require-imports */

const { detectRevisions, computeSelfCorrectionScore, tierForScore } =
  selfCorrection;

/* ----------------------------------------------------------------- */
/*  Fixture helpers                                                   */
/* ----------------------------------------------------------------- */

function buildCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 1,
    creator_id: 1,
    video_id: 101,
    symbol: "BTCUSDT",
    direction: "bullish",
    call_type: "buy",
    entry_price: null,
    target_price: null,
    stop_loss: null,
    timeframe: null,
    confidence: "high",
    strategy_type: "narrative",
    raw_quote: "",
    extraction_confidence: 0.8,
    specificity_score: 0.3,
    call_date: "2025-01-01T00:00:00.000Z",
    price_at_call: 100,
    btc_price_at_call: 100,
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
    regime_difficulty: 0.5,
    score: 0,
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/* ----------------------------------------------------------------- */
/*  Tests — detectRevisions (pure)                                    */
/* ----------------------------------------------------------------- */

test("detectRevisions: direction-reversal pair produces one reversed_direction", () => {
  const bullish = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    confidence: "high",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const bearish = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    direction: "bearish",
    confidence: "high",
    call_date: "2025-01-15T00:00:00.000Z",
  });
  const revisions = detectRevisions([bullish, bearish]);
  const reversed = revisions.filter(
    (r) => r.revisionType === "reversed_direction",
  );
  assert.equal(reversed.length, 1);
  assert.equal(reversed[0].originalCallId, 1);
  assert.equal(reversed[0].sourceVideoId, "101");
});

test("detectRevisions: different tickers produce no revisions", () => {
  const a = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const b = buildCall({
    id: 2,
    symbol: "ETHUSDT",
    direction: "bearish",
    raw_quote: "I was wrong about everything and retract.",
    call_date: "2025-01-15T00:00:00.000Z",
  });
  const revisions = detectRevisions([a, b]);
  assert.equal(revisions.length, 0);
});

test("detectRevisions: 'I was wrong' triggers confirmed_miss", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "SOLUSDT",
    direction: "bullish",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "SOLUSDT",
    direction: "bullish",
    raw_quote: "Honestly I was wrong on SOL, the setup didn't play out.",
    call_date: "2025-02-01T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  const misses = revisions.filter((r) => r.revisionType === "confirmed_miss");
  assert.equal(misses.length, 1);
  assert.equal(misses[0].originalCallId, 1);
});

test("detectRevisions: 'no longer recommend' triggers retracted", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "SOLUSDT",
    direction: "bullish",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "SOLUSDT",
    direction: "bullish",
    raw_quote: "I no longer recommend SOL given the new data.",
    call_date: "2025-02-01T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  const retracted = revisions.filter((r) => r.revisionType === "retracted");
  assert.equal(retracted.length, 1);
});

test("detectRevisions: 'updating my price target' triggers updated_target", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "ETHUSDT",
    direction: "bullish",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "ETHUSDT",
    direction: "bullish",
    raw_quote: "I'm updating my price target on ETH to 5000.",
    call_date: "2025-02-15T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  const updated = revisions.filter((r) => r.revisionType === "updated_target");
  assert.equal(updated.length, 1);
});

test("detectRevisions: updated_target is case-insensitive", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "ETHUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "ETHUSDT",
    raw_quote: "REVISING MY PRICE TARGET upward.",
    call_date: "2025-02-15T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  assert.ok(revisions.some((r) => r.revisionType === "updated_target"));
});

test("detectRevisions: confirmed_miss pattern handles mixed case", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "That was a Bad Call, I'll be honest.",
    call_date: "2025-02-01T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  assert.ok(revisions.some((r) => r.revisionType === "confirmed_miss"));
});

test("detectRevisions: reversal outside 30-day window is ignored", () => {
  const bullish = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    confidence: "high",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const bearish = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    direction: "bearish",
    confidence: "high",
    call_date: "2025-03-10T00:00:00.000Z",
  });
  const revisions = detectRevisions([bullish, bearish]);
  const reversed = revisions.filter(
    (r) => r.revisionType === "reversed_direction",
  );
  assert.equal(reversed.length, 0);
});

test("detectRevisions: reversal below confidence threshold is ignored", () => {
  const bullish = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    confidence: "low",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const bearish = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    direction: "bearish",
    confidence: "low",
    call_date: "2025-01-10T00:00:00.000Z",
  });
  const revisions = detectRevisions([bullish, bearish]);
  const reversed = revisions.filter(
    (r) => r.revisionType === "reversed_direction",
  );
  assert.equal(reversed.length, 0);
});

test("detectRevisions: de-duplicates per (originalCallId, revisionType)", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const mid = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "I was wrong on BTC.",
    call_date: "2025-01-20T00:00:00.000Z",
  });
  const later = buildCall({
    id: 3,
    symbol: "BTCUSDT",
    raw_quote: "Honestly I was wrong again about that entry.",
    call_date: "2025-02-20T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, mid, later]);
  const miss1 = revisions.filter(
    (r) => r.revisionType === "confirmed_miss" && r.originalCallId === 1,
  );
  // Only one confirmed_miss per original call regardless of how many later
  // videos rehash the apology.
  assert.equal(miss1.length, 1);
});

test("detectRevisions: unsorted input still pairs correctly", () => {
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    direction: "bearish",
    confidence: "high",
    call_date: "2025-01-15T00:00:00.000Z",
  });
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    confidence: "high",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const revisions = detectRevisions([later, earlier]);
  const reversed = revisions.filter(
    (r) => r.revisionType === "reversed_direction",
  );
  assert.equal(reversed.length, 1);
  assert.equal(reversed[0].originalCallId, 1);
});

/* ----------------------------------------------------------------- */
/*  Tests — computeSelfCorrectionScore (DB-backed)                    */
/* ----------------------------------------------------------------- */

test("computeSelfCorrectionScore: zero-state returns rarely/0/0", async () => {
  resetFakeDb();
  const result = await computeSelfCorrectionScore(42);
  assert.equal(result.score, 0);
  assert.equal(result.revisionCount, 0);
  assert.equal(result.tier, "rarely");
  assert.equal(result.creatorId, 42);
});

test("computeSelfCorrectionScore: fixture produces expected score + tier", async () => {
  resetFakeDb();
  // Creator 7 has 10 scored bullish calls, 5 of which were losses.
  for (let i = 1; i <= 10; i++) {
    fakeDb.calls.push({
      id: i,
      creator_id: 7,
      return_30d: i <= 5 ? -12 : 15,
      direction: "bullish",
      hit_target: i <= 5 ? false : true,
      correct_direction: i <= 5 ? false : true,
      extraction_confidence: 0.85,
    });
  }
  // Revisions: 3 confirmed_miss against the 5 real misses (+3.0 points),
  // 1 updated_target (+0.5), 1 retracted (+0.5). Total numerator = 4.0,
  // denominator = 10 scored calls -> score 0.40, tier "honest".
  fakeDb.revisions.push(
    { creator_id: 7, original_call_id: 1, revision_type: "confirmed_miss" },
    { creator_id: 7, original_call_id: 2, revision_type: "confirmed_miss" },
    { creator_id: 7, original_call_id: 3, revision_type: "confirmed_miss" },
    { creator_id: 7, original_call_id: 4, revision_type: "updated_target" },
    { creator_id: 7, original_call_id: 5, revision_type: "retracted" },
  );

  const result = await computeSelfCorrectionScore(7);
  assert.equal(result.revisionCount, 5);
  assert.ok(
    Math.abs(result.score - 0.4) < 1e-9,
    `expected 0.40 got ${result.score}`,
  );
  assert.equal(result.tier, "honest");
});

test("computeSelfCorrectionScore: confirmed_miss on a winning call awards 0 points", async () => {
  resetFakeDb();
  // Single bullish call that actually hit (return > 0).
  fakeDb.calls.push({
    id: 1,
    creator_id: 9,
    return_30d: 50,
    direction: "bullish",
    hit_target: true,
    correct_direction: true,
    extraction_confidence: 0.9,
  });
  fakeDb.revisions.push({
    creator_id: 9,
    original_call_id: 1,
    revision_type: "confirmed_miss",
  });
  const result = await computeSelfCorrectionScore(9);
  // Revision is counted but contributes 0 points -> score 0, tier rarely.
  assert.equal(result.revisionCount, 1);
  assert.equal(result.score, 0);
  assert.equal(result.tier, "rarely");
});

test("tierForScore: boundary values map to the documented tiers", () => {
  assert.equal(tierForScore(0), "rarely");
  assert.equal(tierForScore(0.049), "rarely");
  assert.equal(tierForScore(0.05), "some");
  assert.equal(tierForScore(0.149), "some");
  assert.equal(tierForScore(0.15), "honest");
  assert.equal(tierForScore(1), "honest");
});
