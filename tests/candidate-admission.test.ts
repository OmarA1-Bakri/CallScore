import test from "node:test";
import assert from "node:assert/strict";
import {
  CREATOR_CANDIDATE_ADMISSION_JOB_TYPE,
  buildCandidateAdmissionRecords,
  decideCandidateAdmission,
  parseCandidateAdmissionPolicy,
  runCandidateAdmissionJob,
  summarizeCandidateAdmissionRecords,
  summarizeCreatorDiscoveryStatus,
} from "../src/lib/candidate-admission";
import { summarizeFreshCallInflow } from "../src/scripts/callscore-freshness-check";
import type { GlobalCreatorCandidateWithSource } from "../src/lib/global-creator-candidates";

type CandidateOverride = Partial<GlobalCreatorCandidateWithSource>;

function candidate(overrides: CandidateOverride = {}): GlobalCreatorCandidateWithSource {
  return {
    name: "Alpha Calls",
    youtube_handle: "@AlphaCalls",
    youtube_channel_id: null,
    country: "US",
    region: "North America",
    primary_language: "en",
    subscriber_count: "100K",
    avg_views: "10K",
    source_rank: 1,
    content_type: "creator_calls",
    crypto_relevance_score: 0.92,
    rankability_guess: "high",
    status: "approved",
    rejection_reason: null,
    source_name: "test-source",
    source_url: "https://example.com/source",
    source_snapshot_date: "2026-06-01",
    ...overrides,
  };
}

test("candidate admission emits deterministic decision records without publishing side effects", () => {
  const trackedKeys = new Set(["@tracked"]);
  const policy = parseCandidateAdmissionPolicy({
    max_records: 10,
    min_auto_approve_relevance: 0.85,
    min_needs_review_relevance: 0.7,
  });

  const records = buildCandidateAdmissionRecords({
    policy,
    trackedKeys,
    candidates: [
      candidate({ name: "Clear Source Approved", youtube_handle: "@ClearApproved" }),
      candidate({ name: "Manual Candidate", youtube_handle: "@ManualCandidate", status: "candidate" }),
      candidate({ name: "Exchange", youtube_handle: "@Exchange", content_type: "company_exchange" }),
      candidate({ name: "Weak", youtube_handle: "@Weak", crypto_relevance_score: 0.4 }),
      candidate({ name: "Tracked", youtube_handle: "@Tracked" }),
    ],
  });

  assert.deepEqual(records.map((record) => record.decision), [
    "approved",
    "needs_review",
    "quarantine",
    "rejected",
    "rejected",
  ]);
  assert.equal(records[0].candidate_key, "@clearapproved");
  assert.ok(records[1].reasons.includes("source_candidate_not_auto_admitted"));
  assert.ok(records[2].reasons.includes("adjacent_or_company_channel"));
  assert.ok(records[3].reasons.includes("already_tracked_creator"));
  assert.ok(records[4].reasons.includes("below_relevance_floor"));

  const counts = summarizeCandidateAdmissionRecords(records);
  assert.equal(counts.approved, 1);
  assert.equal(counts.needs_review, 1);
  assert.equal(counts.quarantine, 1);
  assert.equal(counts.rejected, 2);
});

test("candidate admission job is record-only and requires operator export before tracked creators change", () => {
  const metrics = runCandidateAdmissionJob(
    { payload: { max_records: 5, min_auto_approve_relevance: 0.85 } },
    new Date("2026-06-07T00:00:00.000Z"),
  );

  assert.equal(metrics.job_type, CREATOR_CANDIDATE_ADMISSION_JOB_TYPE);
  assert.equal(metrics.mode, "decision_record_only");
  assert.equal(metrics.generated_at, "2026-06-07T00:00:00.000Z");
  assert.equal(metrics.max_records, 5);
  assert.equal(metrics.selected, 5);
  assert.equal(metrics.safety.writes_tracked_creators, false);
  assert.equal(metrics.safety.mutates_creator_database, false);
  assert.equal(metrics.safety.publishes_buyer_facing_rankings, false);
  assert.equal(metrics.safety.operator_export_required, true);
  assert.ok(metrics.discovery_status.unique_candidate_count >= metrics.selected);
  assert.equal(metrics.discovery_status.writes_tracked_creators, false);
  assert.match(metrics.discovery_status.safe_next_action, /operator export/i);
  assert.ok(metrics.decisions.every((record) => record.schema_version === 1));
});

test("creator discovery status surfaces stagnant discovery without mutating tracked creators", () => {
  const status = summarizeCreatorDiscoveryStatus({
    sourceCount: 2,
    candidateCount: 12,
    uniqueCandidateCount: 10,
    approvedDecisionCount: 0,
    needsReviewDecisionCount: 3,
    newTrackedCreatorsLast7d: 0,
  });

  assert.equal(status.status, "STAGNANT");
  assert.equal(status.new_tracked_creators_last_7d, 0);
  assert.equal(status.writes_tracked_creators, false);
  assert.match(status.safe_next_action, /review approved\/needs-review candidate export/i);
});

test("fresh-call inflow sentinel classifies stagnant call ingestion without public mutation", () => {
  const stagnant = summarizeFreshCallInflow({
    latestCallInserted: "2026-06-10T00:00:00.000Z",
    generatedAt: "2026-06-20T00:00:00.000Z",
    callsLast24h: 0,
    callsLast7d: 0,
    videosLast7d: 14,
    transcriptsAvailableLast7d: 5,
  });

  assert.equal(stagnant.status, "STAGNANT");
  assert.equal(stagnant.public_mutation_allowed, false);
  assert.match(stagnant.safe_next_action, /run bounded transcript\/extraction/i);

  const healthy = summarizeFreshCallInflow({
    latestCallInserted: "2026-06-19T12:00:00.000Z",
    generatedAt: "2026-06-20T00:00:00.000Z",
    callsLast24h: 2,
    callsLast7d: 9,
    videosLast7d: 10,
    transcriptsAvailableLast7d: 3,
  });
  assert.equal(healthy.status, "ACTIVE");
});

test("single candidate decisions preserve explicit approved rejected quarantine and review states", () => {
  const trackedKeys = new Set<string>();
  assert.equal(decideCandidateAdmission(candidate(), undefined, trackedKeys).decision, "approved");
  assert.equal(
    decideCandidateAdmission(candidate({ status: "rejected", rejection_reason: "not crypto" }), undefined, trackedKeys).decision,
    "rejected",
  );
  assert.equal(
    decideCandidateAdmission(candidate({ content_type: "finance_crypto_adjacent" }), undefined, trackedKeys).decision,
    "quarantine",
  );
  assert.equal(
    decideCandidateAdmission(candidate({ status: "candidate", rankability_guess: "medium" }), undefined, trackedKeys).decision,
    "needs_review",
  );
});
