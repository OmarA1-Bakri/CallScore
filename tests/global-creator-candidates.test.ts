import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeGlobalCreatorCandidates,
  getGlobalCreatorCandidates,
  getGlobalCreatorSources,
  getCreatorCallSampleStatus,
  getCreatorRankabilityStatus,
  normalizeCreatorHandle,
  summarizeGlobalCreatorCandidates,
  type GlobalCreatorCandidateWithSource,
} from "../src/lib/global-creator-candidates";
import { evaluatePromotionCandidate, parseArgs, selectPromotionCandidates } from "../src/scripts/promote-creator-candidates";

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
  const evaluation = evaluatePromotionCandidate(buildCandidate({ youtube_handle: "@CoinBureau" }), new Set(["@coinbureau"]), 0.75);
  assert.equal(evaluation.eligible, false);
  assert.ok(evaluation.reasons.includes("already tracked"));
});


function buildCandidate(overrides: Partial<GlobalCreatorCandidateWithSource> = {}): GlobalCreatorCandidateWithSource {
  return {
    name: "Audited Creator",
    youtube_handle: "@AuditedCreator",
    youtube_channel_id: null,
    country: "United States",
    region: "North America",
    primary_language: "en",
    subscriber_count: "100K",
    avg_views: null,
    source_rank: null,
    content_type: "creator_calls",
    crypto_relevance_score: 0.9,
    rankability_guess: "high",
    creator_call_sample_status: "passed",
    rankability_status: "rankable_caller",
    rankability_reason: "sampled creator-owned calls",
    rankability_source: "unit-test",
    rankability_reviewed_at: "2026-06-06T00:00:00.000Z",
    status: "approved",
    rejection_reason: null,
    source_name: "Unit Source",
    source_url: "https://example.com/source",
    source_snapshot_date: "2026-06-06",
    ...overrides,
  };
}

test("candidate admission metadata defaults fail closed", () => {
  assert.equal(getCreatorCallSampleStatus({}), "not_reviewed");
  assert.equal(getCreatorRankabilityStatus({}), "rejected");
});

test("promotion gate passes only audited rankable creator callers", () => {
  const evaluation = evaluatePromotionCandidate(buildCandidate(), new Set(), 0.75);
  assert.equal(evaluation.eligible, true);
  assert.deepEqual(evaluation.reasons, []);
});

test("promotion gate blocks non creator-call content types", () => {
  for (const content_type of ["creator_news", "creator_education", "macro_bitcoin"] as const) {
    const evaluation = evaluatePromotionCandidate(buildCandidate({ content_type }), new Set(), 0.75);
    assert.equal(evaluation.eligible, false, content_type);
    assert.ok(evaluation.reasons.some((reason) => reason.includes(`content_type=${content_type}`)));
  }
});

test("promotion gate blocks third-party news commentary rankability statuses", () => {
  for (const rankability_status of [
    "news_commentary",
    "third_party_aggregator",
    "education_only",
    "macro_commentary",
    "mixed_requires_audit",
    "rejected",
  ] as const) {
    const evaluation = evaluatePromotionCandidate(buildCandidate({ rankability_status }), new Set(), 0.75);
    assert.equal(evaluation.eligible, false, rankability_status);
    assert.ok(evaluation.reasons.some((reason) => reason.includes(`rankability_status=${rankability_status}`)));
  }
});

test("promotion gate blocks approved candidates that are not sample-passed", () => {
  for (const creator_call_sample_status of ["not_reviewed", "failed", "mixed_requires_audit"] as const) {
    const evaluation = evaluatePromotionCandidate(buildCandidate({ creator_call_sample_status }), new Set(), 0.75);
    assert.equal(evaluation.eligible, false, creator_call_sample_status);
    assert.ok(evaluation.reasons.some((reason) => reason.includes(`creator_call_sample_status=${creator_call_sample_status}`)));
  }
});

test("promotion selection remains empty for approved candidates missing admission metadata", () => {
  const selected = selectPromotionCandidates([
    buildCandidate({
      creator_call_sample_status: undefined,
      rankability_status: undefined,
    }),
  ], parseArgs(["--status", "approved", "--min-relevance", "0.75"]));

  assert.equal(selected.length, 0);
});
