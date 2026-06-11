import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  getLeaderboardEmptyMessage,
  getOfficialRankedReadApiRows,
  isPendingMaturityLeaderboard,
} from "../src/lib/home-read-api-contract";
import { read } from "./page-helpers";

const pageSrc = read("src/app/page.tsx");

test("homepage source code reads officialRankedRows explicitly for official ranking UI", () => {
  assert.match(pageSrc, /getOfficialRankedReadApiRows\(readApiHome\)/);
  assert.match(pageSrc, /const readApiOfficialRows = getOfficialRankedReadApiRows/);
  assert.match(pageSrc, /buildLeaderboardRows\(readApiOfficialRows/);
  assert.doesNotMatch(pageSrc, /buildLeaderboardRows\(readApiHome\.leaderboard\.rows/);
});

test("homepage safely buckets legacy HH leaderboard rows before compatibility rendering", () => {
  assert.match(pageSrc, /Array\.isArray\(readApiHome\.leaderboard\?\.rows\)/);
  assert.match(pageSrc, /toReadApiLeaderboardContract\(period, readApiHome\.leaderboard\.rows/);
  assert.match(pageSrc, /requireFreshnessProof:\s*false/);
  assert.match(pageSrc, /getOfficialRankedReadApiRows\(legacySafeContract\)/);
});

test("homepage buckets direct DB fallback before rendering official rows", () => {
  assert.match(pageSrc, /toReadApiLeaderboardContract\(period, rows/);
  assert.match(pageSrc, /const officialRows = getOfficialRankedReadApiRows\(safeContract\)/);
  assert.match(pageSrc, /buildLeaderboardRows\(officialRows/);
});

test("official rankings ignore compatibility leaderboard rows and unsafe buckets", () => {
  interface FixtureRow {
    readonly name: string;
    readonly rank?: number | null;
  }

  const valid: FixtureRow = { name: "Valid Alpha", rank: 1 };
  const altcoinDaily: FixtureRow = { name: "Altcoin Daily", rank: 19 };
  const alexBecker: FixtureRow = { name: "Alex Becker's Channel", rank: 1 };
  const moneyZg: FixtureRow = { name: "MoneyZG", rank: 2 };
  const cryptoInspector: FixtureRow = { name: "Crypto Inspector", rank: 3 };

  const officialRows = getOfficialRankedReadApiRows({
    officialRankedRows: [valid],
    leaderboard: { rows: [altcoinDaily, alexBecker] },
    excludedRows: [altcoinDaily],
    staleRows: [alexBecker],
    provisionalRows: [moneyZg, cryptoInspector],
    watchlistRows: [{ name: "Watchlisted", rank: null }],
    pendingMaturityRows: [{ name: "Pending 30d", rank: null }],
  });

  assert.deepEqual(officialRows, [valid]);
  assert.equal(officialRows.some((row) => row.name === "Altcoin Daily"), false);
  assert.equal(officialRows.some((row) => row.name === "Alex Becker's Channel"), false);
  assert.equal(officialRows.some((row) => row.name === "MoneyZG"), false);
  assert.equal(officialRows.some((row) => row.name === "Crypto Inspector"), false);
});

test("30d pending maturity renders an unavailable-state message", () => {
  const contract = {
    period: "30d",
    emptyReason: "PENDING_MATURITY",
    officialRankedRows: [],
    pendingMaturityRows: [{ name: "Recent Creator" }],
  };

  assert.equal(isPendingMaturityLeaderboard(contract), true);
  assert.match(getLeaderboardEmptyMessage(contract), /30d official rankings are pending maturity/);
  assert.match(getLeaderboardEmptyMessage(contract), /complete 30-day outcome window/);
});

test("missing officialRankedRows fails closed instead of using leaderboard.rows", () => {
  const altcoinDaily = { name: "Altcoin Daily" };
  const officialRows = getOfficialRankedReadApiRows({
    leaderboard: { rows: [altcoinDaily] },
  });

  assert.deepEqual(officialRows, []);
});
