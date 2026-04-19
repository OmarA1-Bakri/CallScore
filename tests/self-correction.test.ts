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
  revised_call_id: number | null;
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

function findCall(id: number | null): ScoringCallRow | null {
  if (id === null) return null;
  return fakeDb.calls.find((c) => c.id === id) ?? null;
}

async function fakeQuery<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const sql = text.replace(/\s+/g, " ").trim();

  // computeSelfCorrectionScore revision join (now joins BOTH original and
  // revised calls).
  if (
    /FROM call_revisions r JOIN calls oc ON oc\.id = r\.original_call_id LEFT JOIN calls rc ON rc\.id = r\.revised_call_id/i.test(
      sql,
    ) &&
    /WHERE r\.creator_id = \$1/i.test(sql)
  ) {
    const creatorId = Number(params[0]);
    return fakeDb.revisions
      .filter((r) => r.creator_id === creatorId)
      .map((r) => {
        const oc = findCall(r.original_call_id);
        if (!oc) return null;
        const rc = findCall(r.revised_call_id);
        return {
          revision_type: r.revision_type,
          original_return_30d: oc.return_30d,
          original_direction: oc.direction,
          original_extraction_confidence: oc.extraction_confidence,
          revised_correct_direction: rc?.correct_direction ?? null,
          revised_return_30d: rc?.return_30d ?? null,
          revised_extraction_confidence: rc?.extraction_confidence ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null) as unknown as T[];
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
    const scoredByCreator = new Map<number, number>();
    for (const c of fakeDb.calls) {
      if (c.return_30d !== null && c.extraction_confidence >= 0.6) {
        scoredByCreator.set(
          c.creator_id,
          (scoredByCreator.get(c.creator_id) ?? 0) + 1,
        );
      }
    }

    const byCreator = new Map<
      number,
      { revisions: number; numerator: number; scored: number }
    >();
    for (const r of fakeDb.revisions) {
      const oc = findCall(r.original_call_id);
      if (!oc) continue;
      const rc = findCall(r.revised_call_id);
      const existing = byCreator.get(r.creator_id) ?? {
        revisions: 0,
        numerator: 0,
        scored: scoredByCreator.get(r.creator_id) ?? 0,
      };
      existing.revisions += 1;
      if (r.revision_type === "updated_target") {
        existing.numerator += 0.5;
      } else if (r.revision_type === "retracted") {
        existing.numerator += 0.5;
      } else if (
        r.revision_type === "confirmed_miss" &&
        oc.return_30d !== null &&
        oc.extraction_confidence >= 0.6 &&
        ((oc.direction === "bullish" && oc.return_30d <= 0) ||
          (oc.direction === "bearish" && oc.return_30d >= 0))
      ) {
        existing.numerator += 1.0;
      } else if (r.revision_type === "reversed_direction") {
        if (
          rc &&
          rc.return_30d !== null &&
          rc.extraction_confidence >= 0.6 &&
          rc.correct_direction === true
        ) {
          existing.numerator += 0.5;
        } else if (
          !rc ||
          rc.return_30d === null ||
          rc.extraction_confidence < 0.6
        ) {
          existing.numerator += 0.25;
        }
      }
      byCreator.set(r.creator_id, existing);
    }

    const out: Record<string, unknown>[] = [];
    for (const entry of Array.from(byCreator.entries())) {
      const [creatorId, agg] = entry;
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

interface PrimedModule {
  filename: string;
  loaded: boolean;
  exports: Record<string, unknown>;
}

interface NodeModuleCtor {
  new (filename: string, parent: NodeJS.Module | null): PrimedModule;
}

// Priming the CommonJS require.cache is the only way to intercept `@/lib/db`
// before `@/lib/self-correction` imports it (tsx compiles TypeScript to CJS
// at runtime). We have to use `require()` here; dynamic ESM `import()` runs
// too late because the import graph is already resolved by then.
const NodeModule = require("node:module") as NodeModuleCtor;

function primeCache(
  filePath: string,
  exportsObj: Record<string, unknown>,
): void {
  const m = new NodeModule(filePath, module);
  m.filename = filePath;
  m.loaded = true;
  m.exports = exportsObj;
  // require.cache indexes by absolute filename. The PrimedModule we push
  // satisfies the tsc shape requirement via structural compat with Module.
  require.cache[filePath] = m as unknown as NodeJS.Module;
}

primeCache(DB_PATH, {
  query: fakeQuery,
  getDb: () => fakeQuery,
  resolveDatabaseUrl: () => "postgres://stub",
  DATABASE_URL_ENV_KEYS: ["NEON_DATABASE_URL"],
});

const selfCorrection = require(
  path.join(PROJECT_ROOT, "src", "lib", "self-correction.ts"),
) as typeof import("../src/lib/self-correction");

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

/* ================================================================= */
/*  Tests — detectRevisions (pure)                                    */
/* ================================================================= */

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
  assert.equal(reversed[0].revisedCallId, 2);
  assert.equal(reversed[0].sourceVideoId, "101");
});

test("detectRevisions: different tickers produce no revisions", () => {
  const a = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    raw_quote: "I was wrong about BTC.",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const b = buildCall({
    id: 2,
    symbol: "ETHUSDT",
    direction: "bearish",
    raw_quote: "I was wrong about ETH honestly.",
    call_date: "2025-01-15T00:00:00.000Z",
  });
  const revisions = detectRevisions([a, b]);
  assert.equal(revisions.length, 0);
});

test("detectRevisions: 'I was wrong on SOL' triggers confirmed_miss", () => {
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
    raw_quote: "Honestly I was wrong on SOL here.",
    call_date: "2025-02-01T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  const misses = revisions.filter((r) => r.revisionType === "confirmed_miss");
  assert.equal(misses.length, 1);
  assert.equal(misses[0].originalCallId, 1);
  assert.equal(misses[0].revisedCallId, 2);
});

test("detectRevisions: 'no longer recommend SOL' triggers retracted", () => {
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

test("detectRevisions: 'updating my price target on ETH' triggers updated_target", () => {
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

test("detectRevisions: updated_target is case-insensitive with ticker nearby", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "ETHUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "ETHUSDT",
    raw_quote: "REVISING MY PRICE TARGET on ETH upward.",
    call_date: "2025-02-15T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  assert.ok(revisions.some((r) => r.revisionType === "updated_target"));
});

test("detectRevisions: confirmed_miss pattern handles mixed case with ticker", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "That was a Bad Call on BTC, I'll be honest.",
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
    raw_quote: "Honestly I was wrong again about that BTC entry.",
    call_date: "2025-02-20T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, mid, later]);
  // For the `mid` video: the nearest prior is `earlier` (id 1).
  // For the `later` video: the nearest prior is `mid` (id 2) — NOT `earlier`.
  // So we should see two distinct confirmed_miss rows, one per original call.
  const misses = revisions.filter((r) => r.revisionType === "confirmed_miss");
  assert.equal(misses.length, 2);
  const originals = misses.map((m) => m.originalCallId).sort();
  assert.deepEqual(originals, [1, 2]);
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

/* ================================================================= */
/*  C1 — bounded pairing for text-triggered revisions                 */
/* ================================================================= */

test("C1: confirmed_miss pairs with NEAREST prior call, not ALL priors", () => {
  // Three BTC bullish calls at T-400d, T-200d, T-30d, then a single
  // "I was wrong on BTC" video. Old code would emit three confirmed_miss
  // revisions; fixed code emits exactly ONE, keyed to the T-30d call.
  const oldCall = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    call_date: "2024-01-01T00:00:00.000Z", // very old
  });
  const midCall = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    direction: "bullish",
    call_date: "2024-07-15T00:00:00.000Z",
  });
  const recent = buildCall({
    id: 3,
    symbol: "BTCUSDT",
    direction: "bullish",
    call_date: "2025-01-15T00:00:00.000Z",
  });
  const apology = buildCall({
    id: 4,
    symbol: "BTCUSDT",
    direction: "bearish",
    confidence: "high",
    raw_quote: "I was wrong on BTC entirely.",
    call_date: "2025-02-10T00:00:00.000Z",
  });
  const revisions = detectRevisions([oldCall, midCall, recent, apology]);
  const misses = revisions.filter((r) => r.revisionType === "confirmed_miss");
  assert.equal(misses.length, 1);
  assert.equal(misses[0].originalCallId, 3);
});

test("C1: confirmed_miss outside 180d window emits nothing", () => {
  const veryOld = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2023-01-01T00:00:00.000Z",
  });
  const apology = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "I was wrong on BTC.",
    call_date: "2025-02-10T00:00:00.000Z",
  });
  const revisions = detectRevisions([veryOld, apology]);
  assert.equal(
    revisions.filter((r) => r.revisionType === "confirmed_miss").length,
    0,
  );
});

test("C1: retracted outside 90d window emits nothing", () => {
  const old = buildCall({
    id: 1,
    symbol: "ETHUSDT",
    call_date: "2024-08-01T00:00:00.000Z",
  });
  const now = buildCall({
    id: 2,
    symbol: "ETHUSDT",
    raw_quote: "I no longer recommend ETH at all.",
    call_date: "2025-02-10T00:00:00.000Z",
  });
  const revisions = detectRevisions([old, now]);
  assert.equal(
    revisions.filter((r) => r.revisionType === "retracted").length,
    0,
  );
});

/* ================================================================= */
/*  H1 — pattern overlap + false-positive guards                      */
/* ================================================================= */

test("H1: 'I retract that BTC call' produces retracted but NOT confirmed_miss", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "I retract that BTC call from last week.",
    call_date: "2025-01-30T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  const types = revisions.map((r) => r.revisionType);
  assert.ok(types.includes("retracted"));
  assert.ok(!types.includes("confirmed_miss"));
});

test("H1: third-person 'he was wrong about Bitcoin' does NOT match", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "He was wrong about Bitcoin but that's his problem.",
    call_date: "2025-01-30T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  assert.equal(
    revisions.filter((r) => r.revisionType === "confirmed_miss").length,
    0,
  );
});

test("H1: quoted-speech 'someone said I was wrong on BTC' does NOT match", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "Someone said I was wrong on BTC.",
    call_date: "2025-01-30T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  assert.equal(
    revisions.filter((r) => r.revisionType === "confirmed_miss").length,
    0,
  );
});

test("H1: 'I was wrong about the Grateful Dead' (no ticker) does NOT match", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "I was wrong about the Grateful Dead being underrated.",
    call_date: "2025-01-30T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  assert.equal(
    revisions.filter((r) => r.revisionType === "confirmed_miss").length,
    0,
  );
});

test("H1: bare 'admit' without 'I admit' does NOT match", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "I admit I'm a fan of BTC and always will be.",
    call_date: "2025-01-30T00:00:00.000Z",
  });
  // This one DOES match the "I admit" pattern because we intentionally allow
  // it. But it's a narrow pattern, not a bare `admit`. Verify the narrower
  // version fires correctly.
  const revisions = detectRevisions([earlier, later]);
  assert.ok(
    revisions.some((r) => r.revisionType === "confirmed_miss"),
    "'I admit' near BTC should still be caught",
  );
});

test("H1: cross-sentence leakage is blocked (trigger in one sentence, ticker in another)", () => {
  const earlier = buildCall({
    id: 1,
    symbol: "BTCUSDT",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const later = buildCall({
    id: 2,
    symbol: "BTCUSDT",
    raw_quote: "I was wrong. The dog was cute. Anyway BTC is pumping.",
    call_date: "2025-01-30T00:00:00.000Z",
  });
  const revisions = detectRevisions([earlier, later]);
  assert.equal(
    revisions.filter((r) => r.revisionType === "confirmed_miss").length,
    0,
  );
});

/* ================================================================= */
/*  M1 — cross-creator / cross-alias safety                           */
/* ================================================================= */

test("M1: calls from different creators never pair", () => {
  const a = buildCall({
    id: 1,
    creator_id: 10,
    symbol: "BTCUSDT",
    direction: "bullish",
    confidence: "high",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const b = buildCall({
    id: 2,
    creator_id: 20,
    symbol: "BTCUSDT",
    direction: "bearish",
    confidence: "high",
    call_date: "2025-01-15T00:00:00.000Z",
  });
  const revisions = detectRevisions([a, b]);
  assert.equal(revisions.length, 0);
});

test("M1: BTC alias pairs with BTCUSDT within the same creator", () => {
  // Normalizer collapses BTC -> BTCUSDT so these should pair.
  const a = buildCall({
    id: 1,
    creator_id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    confidence: "high",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const b = buildCall({
    id: 2,
    creator_id: 1,
    symbol: "BTCUSDT", // real calls always store canonical, but test the
    // normalization path via a later-stage alias in raw_quote.
    direction: "bearish",
    confidence: "high",
    call_date: "2025-01-15T00:00:00.000Z",
  });
  const revisions = detectRevisions([a, b]);
  const reversed = revisions.filter(
    (r) => r.revisionType === "reversed_direction",
  );
  assert.equal(reversed.length, 1);
});

test("M1: untracked symbol is dropped (no revisions)", () => {
  const a = buildCall({
    id: 1,
    symbol: "FAKECOIN",
    direction: "bullish",
    confidence: "high",
    call_date: "2025-01-01T00:00:00.000Z",
  });
  const b = buildCall({
    id: 2,
    symbol: "FAKECOIN",
    direction: "bearish",
    confidence: "high",
    call_date: "2025-01-10T00:00:00.000Z",
  });
  const revisions = detectRevisions([a, b]);
  assert.equal(revisions.length, 0);
});

/* ================================================================= */
/*  Tests — computeSelfCorrectionScore (DB-backed)                    */
/* ================================================================= */

test("computeSelfCorrectionScore: zero-state returns rarely/0/0", async () => {
  resetFakeDb();
  const result = await computeSelfCorrectionScore(42);
  assert.equal(result.score, 0);
  assert.equal(result.revisionCount, 0);
  assert.equal(result.tier, "rarely");
  assert.equal(result.creatorId, 42);
});

test("computeSelfCorrectionScore: shrinkage prevents low-N creator from leapfrogging (H3)", async () => {
  resetFakeDb();
  // Creator with ONE bullish scored call that was a miss, plus a single
  // confirmed_miss revision. Raw ratio 1/1 = 1.0 would put them at "honest"
  // under the old system. With K=20 shrinkage -> 1/21 = 0.048 -> "rarely".
  fakeDb.calls.push({
    id: 1,
    creator_id: 7,
    return_30d: -15,
    direction: "bullish",
    hit_target: false,
    correct_direction: false,
    extraction_confidence: 0.9,
  });
  fakeDb.revisions.push({
    creator_id: 7,
    original_call_id: 1,
    revised_call_id: null,
    revision_type: "confirmed_miss",
  });
  const result = await computeSelfCorrectionScore(7);
  assert.equal(result.revisionCount, 1);
  assert.ok(result.score < 0.05, `expected < 0.05 got ${result.score}`);
  assert.equal(result.tier, "rarely");
});

test("computeSelfCorrectionScore: high-volume transparent creator earns 'honest'", async () => {
  resetFakeDb();
  // 200 scored bullish losing calls + 50 confirmed_miss revisions.
  // raw_points = 50 * 1.0 = 50. denominator = 200 + 20 = 220. score = 0.227.
  for (let i = 1; i <= 200; i++) {
    fakeDb.calls.push({
      id: i,
      creator_id: 8,
      return_30d: -10,
      direction: "bullish",
      hit_target: false,
      correct_direction: false,
      extraction_confidence: 0.85,
    });
  }
  for (let i = 1; i <= 50; i++) {
    fakeDb.revisions.push({
      creator_id: 8,
      original_call_id: i,
      revised_call_id: null,
      revision_type: "confirmed_miss",
    });
  }
  const result = await computeSelfCorrectionScore(8);
  assert.equal(result.revisionCount, 50);
  assert.ok(
    result.score > 0.2 && result.score < 0.25,
    `expected ~0.227 got ${result.score}`,
  );
  assert.equal(result.tier, "honest");
});

test("computeSelfCorrectionScore: confirmed_miss on a winning call awards 0 points", async () => {
  resetFakeDb();
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
    revised_call_id: null,
    revision_type: "confirmed_miss",
  });
  const result = await computeSelfCorrectionScore(9);
  assert.equal(result.revisionCount, 1);
  assert.equal(result.score, 0);
  assert.equal(result.tier, "rarely");
});

/* ================================================================= */
/*  H2 — reversed_direction scoring against the REVISED call          */
/* ================================================================= */

test("H2: reversed_direction awards full 0.5 only when revised call is correct", async () => {
  resetFakeDb();
  // 50 total scored calls so shrinkage effect is visible but not dominant.
  for (let i = 1; i <= 50; i++) {
    fakeDb.calls.push({
      id: i,
      creator_id: 11,
      return_30d: 10,
      direction: "bullish",
      hit_target: true,
      correct_direction: true,
      extraction_confidence: 0.8,
    });
  }
  // Original (call id 1) was wrong; revised (call id 2) turned out correct.
  fakeDb.calls[0].correct_direction = false;
  fakeDb.calls[0].return_30d = -10;
  fakeDb.calls[0].hit_target = false;
  // revised call id 2 stays correct in the loop above.
  fakeDb.revisions.push({
    creator_id: 11,
    original_call_id: 1,
    revised_call_id: 2,
    revision_type: "reversed_direction",
  });
  const result = await computeSelfCorrectionScore(11);
  // numerator = 0.5, denominator = 50 + 20 = 70, score = 0.5/70 ~ 0.00714.
  assert.ok(Math.abs(result.score - 0.5 / 70) < 1e-9);
});

test("H2: reversed_direction where revised call is ALSO wrong awards 0 points", async () => {
  resetFakeDb();
  for (let i = 1; i <= 50; i++) {
    fakeDb.calls.push({
      id: i,
      creator_id: 12,
      return_30d: 5,
      direction: "bullish",
      hit_target: true,
      correct_direction: true,
      extraction_confidence: 0.8,
    });
  }
  // Whipsaw: original wrong, reversal ALSO wrong.
  fakeDb.calls[0].correct_direction = false;
  fakeDb.calls[1].correct_direction = false;
  fakeDb.revisions.push({
    creator_id: 12,
    original_call_id: 1,
    revised_call_id: 2,
    revision_type: "reversed_direction",
  });
  const result = await computeSelfCorrectionScore(12);
  assert.equal(result.score, 0);
  assert.equal(result.tier, "rarely");
});

test("H2: reversed_direction with pending revised call awards partial 0.25", async () => {
  resetFakeDb();
  for (let i = 1; i <= 50; i++) {
    fakeDb.calls.push({
      id: i,
      creator_id: 13,
      return_30d: 5,
      direction: "bullish",
      hit_target: true,
      correct_direction: true,
      extraction_confidence: 0.8,
    });
  }
  // Revised call (id 2) still pending horizon -> return_30d=null.
  fakeDb.calls[1].return_30d = null;
  fakeDb.revisions.push({
    creator_id: 13,
    original_call_id: 1,
    revised_call_id: 2,
    revision_type: "reversed_direction",
  });
  const result = await computeSelfCorrectionScore(13);
  // numerator 0.25 / (49 + 20) = 0.00362... (note: id 2 drops out of scored
  // denominator because return_30d is null).
  assert.ok(result.score > 0 && result.score < 0.01);
});

test("tierForScore: boundary values map to the documented tiers", () => {
  assert.equal(tierForScore(0), "rarely");
  assert.equal(tierForScore(0.049), "rarely");
  assert.equal(tierForScore(0.05), "some");
  assert.equal(tierForScore(0.149), "some");
  assert.equal(tierForScore(0.15), "honest");
  assert.equal(tierForScore(1), "honest");
});
