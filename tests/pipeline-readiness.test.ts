import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPipelineReadinessSummary,
  summarizePromotionAudit,
  summarizeShadowArtifacts,
  type CreatorCompletenessInput,
} from "../src/lib/pipeline-readiness";
import type { ShadowDiffRecord, ShadowExtractedCallRecord } from "../src/lib/shadow-extraction";
import { DEFAULT_PUBLIC_COUNTS } from "../src/lib/public-counts";

const video = {
  id: 10,
  creator_id: 1,
  creator_name: "Creator",
  youtube_handle: "@Creator",
  youtube_video_id: "yt10",
  title: "BTC update",
  published_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
};

function shadow(overrides: Partial<ShadowExtractedCallRecord> = {}): ShadowExtractedCallRecord {
  return {
    record_type: "shadow_extraction",
    ts: "2026-01-01T00:00:00.000Z",
    run_id: "run",
    provider: "ollama",
    model: "kimi-k2.6",
    fallback_model: null,
    video,
    transcript_sha256: "abc",
    transcript_length: 100,
    candidate_count: 1,
    accepted_count: 1,
    accepted_calls: [{
      symbol: "BTCUSDT",
      direction: "bullish",
      call_type: "buy",
      entry_price: null,
      target_price: null,
      stop_loss: null,
      timeframe: null,
      confidence: "high",
      strategy_type: "technical_analysis",
      raw_quote: "Bitcoin looks bullish",
      extraction_confidence: 0.9,
      specificity_score: 0.7,
      validation_notes: [],
    }],
    chunk_summary: {
      chunk_count: 1,
      covered_until_offset: 100,
      reached_transcript_end: true,
    },
    error: null,
    ...overrides,
  };
}

function creator(overrides: Partial<CreatorCompletenessInput> = {}): CreatorCompletenessInput {
  return {
    creator_id: 1,
    creator_name: "Creator",
    youtube_handle: "@Creator",
    total_videos: 1,
    published_videos: 1,
    transcript_videos: 1,
    extraction_eligible_videos: 1,
    missing_transcript_videos: 0,
    low_quality_transcript_videos: 0,
    production_calls: 0,
    ...overrides,
  };
}

test("summarizeShadowArtifacts counts records, accepted calls, errors, and diff statuses", () => {
  const diff: ShadowDiffRecord = {
    record_type: "shadow_diff",
    ts: "2026-01-01T00:00:00.000Z",
    run_id: "run",
    video,
    status: "new_calls",
    existing_count: 0,
    accepted_count: 1,
    unchanged_count: 0,
    added: ["BTC bullish buy"],
    removed: [],
    reasons: [],
  };
  const summary = summarizeShadowArtifacts([shadow(), shadow({ error: "provider_failed" })], [diff]);

  assert.equal(summary.extractionRecords, 2);
  assert.equal(summary.shadowVideos, 1);
  assert.equal(summary.acceptedCalls, 2);
  assert.equal(summary.failedExtractions, 1);
  assert.equal(summary.diffStatuses.new_calls, 1);
});

test("summarizePromotionAudit separates dry-run, written, and skipped promotion rows", () => {
  const summary = summarizePromotionAudit([
    { record_type: "shadow_promotion", phase: "dry_run", action: "promote", video },
    { record_type: "shadow_promotion", phase: "before_write", action: "promote", video },
    { record_type: "shadow_promotion", phase: "after_write", action: "promote", video },
    { record_type: "shadow_promotion", phase: "skipped", action: "skip", video },
  ]);

  assert.equal(summary.records, 4);
  assert.equal(summary.dryRunPromotions, 1);
  assert.equal(summary.writtenPromotions, 1);
  assert.equal(summary.promotedVideos, 1);
  assert.equal(summary.skipped, 1);
});

test("buildPipelineReadinessSummary reports creator completeness and final funnel blockers", () => {
  const summary = buildPipelineReadinessSummary({
    generatedAt: "2026-01-01T00:00:00.000Z",
    publicCounts: { ...DEFAULT_PUBLIC_COUNTS, trackedCalls: 10, publicScoredCalls: 3 },
    creators: [
      creator(),
      creator({ creator_id: 2, youtube_handle: "@Missing", missing_transcript_videos: 1 }),
    ],
    extractionRecords: [shadow()],
    diffRecords: [],
    promotionRecords: [{ record_type: "shadow_promotion", phase: "after_write", action: "promote", video }],
  });

  assert.equal(summary.creatorCompleteness.byStatus.shadow_complete, 1);
  assert.equal(summary.creatorCompleteness.byStatus.missing_transcripts, 1);
  assert.equal(summary.funnel.trackedCalls, 10);
  assert.equal(summary.funnel.shadowAcceptedCalls, 1);
  assert.equal(summary.funnel.promotedVideos, 1);
  assert.ok(summary.blockers.includes("missing_transcripts_or_terminal_reasons"));
});

test("buildPipelineReadinessSummary accepts terminal date and transcript audit coverage", () => {
  const summary = buildPipelineReadinessSummary({
    generatedAt: "2026-01-01T00:00:00.000Z",
    publicCounts: DEFAULT_PUBLIC_COUNTS,
    creators: [
      creator({ total_videos: 2, published_videos: 1, transcript_videos: 1, extraction_eligible_videos: 1, missing_transcript_videos: 1 }),
    ],
    extractionRecords: [shadow()],
    diffRecords: [],
    promotionRecords: [],
    terminalPublicationDateRecords: [{ record_type: "publication_date_backfill", status: "missing_date", video_id: 20, creator_id: 1 }],
    terminalTranscriptRecords: [{ record_type: "transcript_backfill", status: "terminal_no_transcript", video_id: 21, creator_id: 1 }],
  });

  assert.equal(summary.creatorCompleteness.byStatus.shadow_complete, 1);
  assert.equal(summary.terminalCoverage.publicationDateVideos, 1);
  assert.equal(summary.terminalCoverage.transcriptVideos, 1);
  assert.deepEqual(summary.blockers, []);
});

test("buildPipelineReadinessSummary can allow bounded shadow runs for shipping readiness", () => {
  const summary = buildPipelineReadinessSummary({
    generatedAt: "2026-01-01T00:00:00.000Z",
    publicCounts: DEFAULT_PUBLIC_COUNTS,
    creators: [
      creator({ extraction_eligible_videos: 2 }),
    ],
    extractionRecords: [shadow()],
    diffRecords: [],
    promotionRecords: [],
    requireFullShadowRecheck: false,
  });

  assert.equal(summary.creatorCompleteness.byStatus.pending_shadow, 1);
  assert.ok(!summary.blockers.includes("pending_shadow_recheck"));
});
