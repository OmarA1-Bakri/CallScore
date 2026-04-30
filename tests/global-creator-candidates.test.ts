import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeGlobalCreatorCandidates,
  getGlobalCreatorCandidates,
  getGlobalCreatorSources,
  normalizeCreatorHandle,
  summarizeGlobalCreatorCandidates,
} from "../src/lib/global-creator-candidates";
import { parseArgs, selectPromotionCandidates } from "../src/scripts/promote-creator-candidates";

test("global creator source file is valid and multilingual", () => {
  const sources = getGlobalCreatorSources();
  const candidates = getGlobalCreatorCandidates();
  const summary = summarizeGlobalCreatorCandidates(candidates);

  assert.equal(sources.schema_version, 1);
  assert.ok(summary.uniqueCandidateCount >= 200);
  assert.ok(Object.keys(summary.languageCounts).length >= 10);
  assert.ok(Object.keys(summary.regionCounts).length >= 5);
  assert.ok(summary.statusCounts.seeded >= 10);
  assert.ok(summary.statusCounts.candidate >= 10);
});

test("global candidates dedupe by normalized YouTube handle", () => {
  const candidates = getGlobalCreatorCandidates();
  const deduped = dedupeGlobalCreatorCandidates(candidates);
  assert.ok(deduped.length <= candidates.length);
  assert.equal(normalizeCreatorHandle("CoinBureau"), "@coinbureau");
  assert.equal(normalizeCreatorHandle("@CoinBureau"), "@coinbureau");
  assert.equal(
    normalizeCreatorHandle("channel/UC-5HLi3buMzdxjdTdic3Aig"),
    "channel/uc-5hli3bumzdxjdtdic3aig",
  );
});

test("promotion defaults are safe dry-run approved-only", () => {
  const args = parseArgs([]);
  assert.equal(args.write, false);
  assert.equal(args.status, "approved");
  assert.equal(args.minRelevance, 0.75);
});

test("candidate promotion excludes already tracked creators", () => {
  const args = parseArgs(["--status", "candidate", "--min-relevance", "0.75"]);
  const selected = selectPromotionCandidates(getGlobalCreatorCandidates(), args);
  assert.ok(selected.length > 0);
  assert.equal(selected.some((candidate) => candidate.youtube_handle === "@CoinBureau"), false);
});
