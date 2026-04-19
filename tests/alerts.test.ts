/**
 * alerts.test.ts — unit tests for watchlist + alerts_queue data layer
 * and the /api/alerts/watch tier gate.
 *
 * Strategy: we swap the `query` export on the already-loaded `@/lib/db`
 * module by rewriting module.exports before importing any dependent
 * modules. tsx compiles TypeScript to CJS, so both the test file and
 * the lib share the same require cache entry for `src/lib/db`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-session-secret-1234567890-abc";
process.env.NEON_DATABASE_URL =
  process.env.NEON_DATABASE_URL ?? "postgres://stub";

/* ----------------------------------------------------------------- */
/*  In-memory "database" mocks                                        */
/* ----------------------------------------------------------------- */

interface WatchRow {
  id: number;
  user_id: string;
  creator_id: number;
  created_at: string;
}

interface AlertRow {
  id: number;
  user_id: string;
  creator_id: number | null;
  call_id: number | null;
  event_type: string;
  created_at: string;
  sent_at: string | null;
}

interface CallRow {
  id: number;
  symbol: string;
  direction: string;
  call_date: string;
}

interface CreatorRow {
  id: number;
  name: string;
}

interface UserRow {
  id: string;
  email: string;
}

interface DbState {
  watches: WatchRow[];
  alerts: AlertRow[];
  calls: CallRow[];
  creators: CreatorRow[];
  users: UserRow[];
  nextWatchId: number;
  nextAlertId: number;
}

function freshState(): DbState {
  return {
    watches: [],
    alerts: [],
    calls: [],
    creators: [],
    users: [],
    nextWatchId: 1,
    nextAlertId: 1,
  };
}

let db: DbState = freshState();

function resetDb(): void {
  db = freshState();
}

async function fakeQuery<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const sql = text.replace(/\s+/g, " ").trim();

  // information_schema existence probe (userEmailsTableExists helper).
  if (/SELECT EXISTS .*information_schema\.tables/i.test(sql)) {
    const exists = db.users.length > 0;
    return [{ exists }] as unknown as T[];
  }

  if (/^INSERT INTO watchlists/i.test(sql)) {
    const userId = String(params[0]);
    const creatorId = Number(params[1]);
    const existing = db.watches.find(
      (w) => w.user_id === userId && w.creator_id === creatorId,
    );
    if (existing) return [existing] as unknown as T[];
    const row: WatchRow = {
      id: db.nextWatchId++,
      user_id: userId,
      creator_id: creatorId,
      created_at: new Date().toISOString(),
    };
    db.watches.push(row);
    return [row] as unknown as T[];
  }

  if (/^DELETE FROM watchlists/i.test(sql)) {
    const userId = String(params[0]);
    const creatorId = Number(params[1]);
    db.watches = db.watches.filter(
      (w) => !(w.user_id === userId && w.creator_id === creatorId),
    );
    return [] as unknown as T[];
  }

  if (/^SELECT .* FROM watchlists WHERE user_id/i.test(sql)) {
    const userId = String(params[0]);
    return db.watches
      .filter((w) => w.user_id === userId)
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at)) as unknown as T[];
  }

  if (/^INSERT INTO alerts_queue/i.test(sql)) {
    const userId = String(params[0]);
    const creatorId = params[1] === null ? null : Number(params[1]);
    const callId = params[2] === null ? null : Number(params[2]);
    if (callId !== null) {
      const dup = db.alerts.find(
        (a) => a.user_id === userId && a.call_id === callId,
      );
      if (dup) return [] as unknown as T[];
    }
    const row: AlertRow = {
      id: db.nextAlertId++,
      user_id: userId,
      creator_id: creatorId,
      call_id: callId,
      event_type: "new_call",
      created_at: new Date().toISOString(),
      sent_at: null,
    };
    db.alerts.push(row);
    return [{ id: row.id }] as unknown as T[];
  }

  if (
    /^SELECT .* FROM alerts_queue WHERE user_id = \$1 AND sent_at IS NULL/i.test(
      sql,
    )
  ) {
    const userId = String(params[0]);
    return db.alerts
      .filter((a) => a.user_id === userId && a.sent_at === null)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at)) as unknown as T[];
  }

  if (
    /^SELECT .* FROM alerts_queue WHERE user_id = \$1 ORDER BY created_at DESC/i.test(
      sql,
    )
  ) {
    const userId = String(params[0]);
    const limit = Number(params[1]);
    return db.alerts
      .filter((a) => a.user_id === userId)
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit) as unknown as T[];
  }

  // CTE-based atomic claim: FOR UPDATE SKIP LOCKED + UPDATE ... RETURNING
  // with joined call + creator payload. Matches claimPendingAlerts().
  if (/^WITH claimed AS/i.test(sql)) {
    const limit = Number(params[0]);
    const eligible = db.alerts
      .filter((a) => a.sent_at === null && a.event_type === "new_call")
      .slice()
      .sort((a, b) => {
        if (a.user_id !== b.user_id) return a.user_id.localeCompare(b.user_id);
        return a.created_at.localeCompare(b.created_at);
      })
      .slice(0, limit);

    const nowIso = new Date().toISOString();
    const claimed: Record<string, unknown>[] = [];
    for (const a of eligible) {
      a.sent_at = nowIso;
      const call = db.calls.find((c) => c.id === a.call_id);
      const creator = db.creators.find((c) => c.id === a.creator_id);
      const user = db.users.find((u) => u.id === a.user_id);
      if (!call || !creator) continue;
      claimed.push({
        alert_id: a.id,
        user_id: a.user_id,
        user_email: user?.email ?? null,
        call_id: a.call_id,
        creator_id: a.creator_id,
        creator_name: creator.name,
        symbol: call.symbol,
        direction: call.direction,
        call_date: call.call_date,
      });
    }
    return claimed as unknown as T[];
  }

  // Two distinct UPDATE paths now: revert (SET sent_at = NULL) and
  // markAlertsSent (SET sent_at = NOW()). Route based on SQL text so the
  // fake honours the revert semantics that the HIGH fix relies on.
  if (/^UPDATE alerts_queue/i.test(sql)) {
    const ids = (params[0] as number[]) ?? [];

    if (/SET\s+sent_at\s*=\s*NULL/i.test(sql)) {
      const reverted: { id: number }[] = [];
      for (const a of db.alerts) {
        if (ids.includes(a.id) && a.sent_at !== null) {
          a.sent_at = null;
          reverted.push({ id: a.id });
        }
      }
      return reverted as unknown as T[];
    }

    if (/SET\s+sent_at\s*=\s*NOW\(\)/i.test(sql)) {
      const updated: { id: number }[] = [];
      for (const a of db.alerts) {
        if (ids.includes(a.id) && a.sent_at === null) {
          a.sent_at = new Date().toISOString();
          updated.push({ id: a.id });
        }
      }
      return updated as unknown as T[];
    }

    throw new Error(`fakeQuery: unrecognized UPDATE alerts_queue: ${sql}`);
  }

  throw new Error(`fakeQuery: unrecognized SQL: ${sql}`);
}

/* ----------------------------------------------------------------- */
/*  Swap out @/lib/db and @/lib/auth BEFORE importing dependents      */
/* ----------------------------------------------------------------- */

type SessionStub = {
  userId: string;
  tier: "free" | "pro" | "elite";
  accessToken: string;
  exp: number;
} | null;

let stubbedSession: SessionStub = null;

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "src", "lib", "db.ts");
const AUTH_PATH = path.join(PROJECT_ROOT, "src", "lib", "auth.ts");

// Pre-populate require.cache with fake modules BEFORE anything else
// pulls in `@/lib/db` or `@/lib/auth`. tsx compiles TypeScript to CJS,
// so cache entries are keyed by absolute .ts file path.
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

primeCache(AUTH_PATH, {
  getSession: async () => stubbedSession,
  createSession: async () => undefined,
  destroySession: async () => undefined,
  getCurrentTier: async () => stubbedSession?.tier ?? "free",
});
/* eslint-enable @typescript-eslint/no-require-imports */

/* ----------------------------------------------------------------- */
/*  Now import modules under test                                     */
/* ----------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const alerts = require(path.join(PROJECT_ROOT, "src", "lib", "alerts.ts")) as
  typeof import("../src/lib/alerts");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const watchHelpers = require(
  path.join(PROJECT_ROOT, "src", "app", "api", "alerts", "watch", "helpers.ts"),
) as typeof import("../src/app/api/alerts/watch/helpers");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const watchRoute = require(
  path.join(PROJECT_ROOT, "src", "app", "api", "alerts", "watch", "route.ts"),
) as typeof import("../src/app/api/alerts/watch/route");

/* ----------------------------------------------------------------- */
/*  Tests                                                             */
/* ----------------------------------------------------------------- */

test("addWatch creates a new watchlist row", async () => {
  resetDb();
  const row = await alerts.addWatch("user_a", 42);
  assert.equal(row.user_id, "user_a");
  assert.equal(row.creator_id, 42);
});

test("addWatch is idempotent on duplicate (user, creator) pair", async () => {
  resetDb();
  const first = await alerts.addWatch("user_a", 42);
  const second = await alerts.addWatch("user_a", 42);
  assert.equal(first.id, second.id);
  const list = await alerts.listWatches("user_a");
  assert.equal(list.length, 1);
});

test("removeWatch deletes only the matching pair", async () => {
  resetDb();
  await alerts.addWatch("user_a", 1);
  await alerts.addWatch("user_a", 2);
  await alerts.removeWatch("user_a", 1);
  const list = await alerts.listWatches("user_a");
  assert.equal(list.length, 1);
  assert.equal(list[0].creator_id, 2);
});

test("listWatches returns only rows for the requested user", async () => {
  resetDb();
  await alerts.addWatch("user_a", 1);
  await alerts.addWatch("user_b", 1);
  await alerts.addWatch("user_a", 2);
  const aList = await alerts.listWatches("user_a");
  const bList = await alerts.listWatches("user_b");
  assert.equal(aList.length, 2);
  assert.equal(bList.length, 1);
});

test("enqueueNewCallAlert inserts a pending row", async () => {
  resetDb();
  const inserted = await alerts.enqueueNewCallAlert("user_a", 10, 1001);
  assert.equal(inserted, true);
  const pending = await alerts.getPendingAlertsForUser("user_a");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].call_id, 1001);
});

test("enqueueNewCallAlert is idempotent on duplicate (user, call)", async () => {
  resetDb();
  const first = await alerts.enqueueNewCallAlert("user_a", 10, 1001);
  const second = await alerts.enqueueNewCallAlert("user_a", 10, 1001);
  assert.equal(first, true);
  assert.equal(second, false);
  const pending = await alerts.getPendingAlertsForUser("user_a");
  assert.equal(pending.length, 1);
});

test("markAlertsSent flips sent_at for only the provided ids", async () => {
  resetDb();
  await alerts.enqueueNewCallAlert("user_a", 10, 1001);
  await alerts.enqueueNewCallAlert("user_a", 10, 1002);
  const pending = await alerts.getPendingAlertsForUser("user_a");
  const marked = await alerts.markAlertsSent([pending[0].id]);
  assert.equal(marked, 1);
  const stillPending = await alerts.getPendingAlertsForUser("user_a");
  assert.equal(stillPending.length, 1);
  assert.equal(stillPending[0].id, pending[1].id);
});

test("POST /api/alerts/watch returns 401 when session is missing", async () => {
  resetDb();
  stubbedSession = null;
  const req = new Request("http://x/api/alerts/watch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creatorId: 1 }),
  });
  const res = await watchRoute.POST(req as never);
  assert.equal(res.status, 401);
});

test("POST /api/alerts/watch gates free tier with 402 upgrade_required", async () => {
  resetDb();
  stubbedSession = {
    userId: "user_free",
    tier: "free",
    accessToken: "x",
    exp: Date.now() + 60_000,
  };
  const req = new Request("http://x/api/alerts/watch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creatorId: 1 }),
  });
  const res = await watchRoute.POST(req as never);
  assert.equal(res.status, 402);
  const body = (await res.json()) as { error: string; upgrade_url: string };
  assert.equal(body.error, "upgrade_required");
  assert.equal(body.upgrade_url, "/pricing");
});

test("POST /api/alerts/watch returns 200 for pro-tier session", async () => {
  resetDb();
  stubbedSession = {
    userId: "user_pro",
    tier: "pro",
    accessToken: "x",
    exp: Date.now() + 60_000,
  };
  const req = new Request("http://x/api/alerts/watch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creatorId: 7 }),
  });
  const res = await watchRoute.POST(req as never);
  assert.equal(res.status, 200);
  const list = await alerts.listWatches("user_pro");
  assert.equal(list.length, 1);
  assert.equal(list[0].creator_id, 7);
});

test("POST /api/alerts/watch accepts elite (alpha) tier", async () => {
  resetDb();
  stubbedSession = {
    userId: "user_alpha",
    tier: "elite",
    accessToken: "x",
    exp: Date.now() + 60_000,
  };
  const req = new Request("http://x/api/alerts/watch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creatorId: 9 }),
  });
  const res = await watchRoute.POST(req as never);
  assert.equal(res.status, 200);
});

test("POST /api/alerts/watch rejects non-numeric creatorId with 400", async () => {
  resetDb();
  stubbedSession = {
    userId: "user_pro",
    tier: "pro",
    accessToken: "x",
    exp: Date.now() + 60_000,
  };
  const req = new Request("http://x/api/alerts/watch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creatorId: "not-a-number" }),
  });
  const res = await watchRoute.POST(req as never);
  assert.equal(res.status, 400);
});

test("DELETE /api/alerts/watch removes the watchlist row", async () => {
  resetDb();
  stubbedSession = {
    userId: "user_pro",
    tier: "pro",
    accessToken: "x",
    exp: Date.now() + 60_000,
  };
  await alerts.addWatch("user_pro", 4);
  const req = new Request("http://x/api/alerts/watch?creatorId=4", {
    method: "DELETE",
  });
  const res = await watchRoute.DELETE(req as never);
  assert.equal(res.status, 200);
  const list = await alerts.listWatches("user_pro");
  assert.equal(list.length, 0);
});

/* ----------------------------------------------------------------- */
/*  parseCreatorId strict-parse unit tests (Codex M3)                 */
/* ----------------------------------------------------------------- */

test("parseCreatorId rejects '7abc' and other non-numeric suffixes", () => {
  const { parseCreatorId } = watchHelpers;
  assert.equal(parseCreatorId("7abc"), null);
  assert.equal(parseCreatorId("abc7"), null);
  assert.equal(parseCreatorId("7 "), null);
  assert.equal(parseCreatorId(" 7"), null);
});

test("parseCreatorId rejects exponential and decimal strings", () => {
  const { parseCreatorId } = watchHelpers;
  assert.equal(parseCreatorId("1e3"), null);
  assert.equal(parseCreatorId("7.5"), null);
  assert.equal(parseCreatorId("7.0"), null);
  assert.equal(parseCreatorId("0x7"), null);
});

test("parseCreatorId rejects leading zeros and zero", () => {
  const { parseCreatorId } = watchHelpers;
  assert.equal(parseCreatorId("07"), null);
  assert.equal(parseCreatorId("0"), null);
  assert.equal(parseCreatorId("-1"), null);
  assert.equal(parseCreatorId(""), null);
});

test("parseCreatorId accepts positive integers as number or string", () => {
  const { parseCreatorId } = watchHelpers;
  assert.equal(parseCreatorId(1), 1);
  assert.equal(parseCreatorId(42), 42);
  assert.equal(parseCreatorId("1"), 1);
  assert.equal(parseCreatorId("42"), 42);
});

test("parseCreatorId rejects non-integer numbers and non-string types", () => {
  const { parseCreatorId } = watchHelpers;
  assert.equal(parseCreatorId(0), null);
  assert.equal(parseCreatorId(-1), null);
  assert.equal(parseCreatorId(1.5), null);
  assert.equal(parseCreatorId(NaN), null);
  assert.equal(parseCreatorId(Infinity), null);
  assert.equal(parseCreatorId(null), null);
  assert.equal(parseCreatorId(undefined), null);
  assert.equal(parseCreatorId({}), null);
  assert.equal(parseCreatorId([]), null);
});

/* ----------------------------------------------------------------- */
/*  Atomic claim + revertClaim coverage (reviewer M8)                 */
/* ----------------------------------------------------------------- */

function seedClaimFixture(): void {
  db.creators.push({ id: 10, name: "Creator Alpha" });
  db.calls.push({
    id: 1001,
    symbol: "BTCUSDT",
    direction: "bullish",
    call_date: "2026-04-19T00:00:00.000Z",
  });
  db.users.push({ id: "user_a", email: "user_a@example.com" });
}

test("claimPendingAlerts atomically flips sent_at and returns payload", async () => {
  resetDb();
  seedClaimFixture();
  await alerts.enqueueNewCallAlert("user_a", 10, 1001);

  const rows = await alerts.claimPendingAlerts(10, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, "user_a");
  assert.equal(rows[0].user_email, "user_a@example.com");
  assert.equal(rows[0].creator_id, 10);
  assert.equal(rows[0].call_id, 1001);
  assert.equal(rows[0].symbol, "BTCUSDT");

  // A second claim must now find nothing — the first call flipped sent_at.
  const second = await alerts.claimPendingAlerts(10, true);
  assert.equal(second.length, 0);
});

test("revertClaim pushes sent_at back to NULL for the given ids", async () => {
  resetDb();
  seedClaimFixture();
  await alerts.enqueueNewCallAlert("user_a", 10, 1001);
  const claimed = await alerts.claimPendingAlerts(10, true);
  assert.equal(claimed.length, 1);

  const reverted = await alerts.revertClaim([claimed[0].alert_id]);
  assert.equal(reverted, 1);

  // Row is eligible to be claimed again after revert.
  const reclaimed = await alerts.claimPendingAlerts(10, true);
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].call_id, 1001);
});

test("revertClaim is a no-op for ids that are already unsent", async () => {
  resetDb();
  seedClaimFixture();
  await alerts.enqueueNewCallAlert("user_a", 10, 1001);

  // No claim yet — sent_at is still NULL, so revert matches nothing.
  const row = db.alerts[0];
  const reverted = await alerts.revertClaim([row.id]);
  assert.equal(reverted, 0);
});

test("revertClaim returns 0 for an empty id list without hitting the DB", async () => {
  const reverted = await alerts.revertClaim([]);
  assert.equal(reverted, 0);
});

test("claimPendingAlerts respects the batch limit", async () => {
  resetDb();
  seedClaimFixture();
  db.calls.push({
    id: 1002,
    symbol: "ETHUSDT",
    direction: "bullish",
    call_date: "2026-04-19T01:00:00.000Z",
  });
  db.calls.push({
    id: 1003,
    symbol: "SOLUSDT",
    direction: "bearish",
    call_date: "2026-04-19T02:00:00.000Z",
  });
  await alerts.enqueueNewCallAlert("user_a", 10, 1001);
  await alerts.enqueueNewCallAlert("user_a", 10, 1002);
  await alerts.enqueueNewCallAlert("user_a", 10, 1003);

  const firstBatch = await alerts.claimPendingAlerts(2, true);
  assert.equal(firstBatch.length, 2);

  const secondBatch = await alerts.claimPendingAlerts(10, true);
  assert.equal(secondBatch.length, 1);
});

/* ----------------------------------------------------------------- */
/*  Unsubscribe token (reviewer H1)                                   */
/* ----------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const unsub = require(
  path.join(PROJECT_ROOT, "src", "lib", "unsubscribe-token.ts"),
) as typeof import("../src/lib/unsubscribe-token");

test("buildUnsubscribeToken round-trips through verifyUnsubscribeToken", () => {
  const token = unsub.buildUnsubscribeToken("user_abc");
  const payload = unsub.verifyUnsubscribeToken(token);
  assert.ok(payload);
  assert.equal(payload.userId, "user_abc");
  assert.equal(payload.scope, "alerts-unsubscribe");
});

test("verifyUnsubscribeToken rejects tampered tokens", () => {
  const token = unsub.buildUnsubscribeToken("user_abc");
  const tampered = token.slice(0, -4) + "AAAA";
  assert.equal(unsub.verifyUnsubscribeToken(tampered), null);
});

test("verifyUnsubscribeToken rejects malformed input", () => {
  assert.equal(unsub.verifyUnsubscribeToken(""), null);
  assert.equal(unsub.verifyUnsubscribeToken("no-dot"), null);
  assert.equal(unsub.verifyUnsubscribeToken("."), null);
  assert.equal(unsub.verifyUnsubscribeToken(".sig"), null);
  assert.equal(unsub.verifyUnsubscribeToken("payload."), null);
});

test("buildUnsubscribeUrl produces a URL containing a verifiable token", () => {
  const url = unsub.buildUnsubscribeUrl(
    "https://cryptotubersranked.com",
    "user_xyz",
  );
  assert.ok(url.startsWith("https://cryptotubersranked.com/api/alerts/unsubscribe?token="));
  const extracted = decodeURIComponent(url.split("token=")[1]);
  const payload = unsub.verifyUnsubscribeToken(extracted);
  assert.ok(payload);
  assert.equal(payload.userId, "user_xyz");
});
