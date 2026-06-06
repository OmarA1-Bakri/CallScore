// tests/leaderboard-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/Leaderboard.tsx"),
  "utf8",
);
const rankTierSrc = readFileSync(
  join(__dirname, "..", "src/components/RankTierBadge.tsx"),
  "utf8",
);

test("Leaderboard exposes the 8-column spec subset", () => {
  // Spec headers (case-insensitive match on the rendered text).
  // Per Phase 2 scope: 8 of 11 dev-pack columns. Trend, Provenance, multi-select
  // checkbox are explicitly deferred — see Task 2 prompt. Last call label is replaced by Best coin for scored-call clarity.
  for (const h of ["Rank", "Creator", "Alpha", "Avg α", "Win", "Tier", "Best coin"]) {
    assert.match(src, new RegExp(`>\\s*${h}`, "i"), `header ${h} missing`);
  }
});

test("Leaderboard does not render pastel avatar circles (initial-letter avatars allowed)", () => {
  // Pastel/random palettes banned per Phase 1; initial-letter avatars per
  // dev-pack are kept (square or 2px corners only — no rounded-full).
  assert.doesNotMatch(src, /bg-(blue|pink|cyan|purple|emerald|teal)-\d{3}/);
  assert.doesNotMatch(src, /rounded-full/);
});

test("Leaderboard is not wrapped in glass-card", () => {
  assert.doesNotMatch(src, /\bglass-card\b/);
});

test("Leaderboard renders score-Tier column distinct from auth-tier grouping", () => {
  // Score tier (S/A/B/C) is a per-row cell; auth tier (free/pro/alpha) is the
  // group wrapper. Both must coexist.
  assert.match(src, /tier_required/, "auth-tier grouping must be preserved");
  assert.match(src, /score.*tier|tier.*score|RankTierBadge/i, "score-Tier column must render");
});

test("RankTierBadge separates obsolete rows from low-N warning rows", () => {
  assert.match(rankTierSrc, /MIN_PUBLIC_LEADERBOARD_CALLS/);
  assert.match(rankTierSrc, /LOW_N_WARNING_CALLS/);
  assert.match(rankTierSrc, /Obsolete/);
  assert.match(rankTierSrc, /Low N/);
  assert.doesNotMatch(rankTierSrc, /totalCalls\s*<\s*50/);
});
