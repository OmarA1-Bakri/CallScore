import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import {
  CLAIM_NEXT_PIPELINE_JOB_SQL,
  candleRefreshRunKey,
  computeScoresRunKey,
  matchPricesBatchRunKey,
  mlPromotionRunKey,
  resetStalePipelineJobs,
  updatePipelineJobHeartbeat,
  type PipelineJob,
} from "../src/lib/pipeline";
import { candleRefreshArgsFromPayload, matchPricesArgsFromPayload } from "../src/lib/pipeline-jobs";
import {
  buildMlVerifierCandidateSql,
  parseVerifierOutput,
  runMlVerifierBatch,
  sortAndDedupeVerifierCandidates,
  type MlVerifierCandidate,
} from "../src/lib/ml-verifier";
import {
  PROMOTE_ML_VERIFIED_JOB_TYPE,
  buildMlPromotionCandidateSql,
  runMlPromotionJob,
  validateMlPromotionGates,
} from "../src/lib/ml-promotion";
import { POST as enqueueMlCron } from "../src/app/api/cron/ml/enqueue/route";
import { POST as enqueueCandlesCron } from "../src/app/api/cron/candles/enqueue/route";
import { POST as enqueueMatchCron } from "../src/app/api/cron/match/enqueue/route";
import { POST as enqueueScoresCron } from "../src/app/api/cron/scores/enqueue/route";
import {
  SUPPORTED_JOB_TYPES,
  executeJobWithKeepalive,
} from "../src/scripts/hermes-worker";
import { buildSetBasedMatchSql } from "../src/scripts/match-prices-set-based";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  try {
    return readFileSync(join(root, relativePath), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${relativePath}: ${message}`);
  }
}

function candidate(overrides: Partial<MlVerifierCandidate>): MlVerifierCandidate {
  return {
    id: 1,
    creator_id: 10,
    video_id: 20,
    creator_name: "Creator",
    youtube_handle: "@creator",
    video_title: "Video",
    symbol: "BTCUSDT",
    direction: "bullish",
    call_type: "buy",
    raw_quote: "Bitcoin is a buy above support",
    extraction_confidence: 0.5,
    specificity_score: 0.2,
    score: 0,
    call_date: "2026-01-01T00:00:00.000Z",
    transcript: "Bitcoin is a buy above support and can move higher.",
    candidate_bucket: "low_confidence_score_ready",
    candidate_priority: 1,
    ...overrides,
  };
}

function job(payload: Record<string, unknown> = { batch_size: 1 }): PipelineJob {
  return {
    id: 100,
    run_id: 200,
    type: "ml_verifier_batch",
    status: "running",
    priority: 100,
    payload,
    attempts: 1,
    max_attempts: 3,
    locked_by: "test-worker",
    locked_at: "2026-01-01T00:00:00.000Z",
    heartbeat_at: "2026-01-01T00:00:00.000Z",
    lease_expires_at: "2026-01-01T00:10:00.000Z",
    run_after: "2026-01-01T00:00:00.000Z",
    idempotency_key: "test-key",
    error: null,
    metrics: {},
    phase: "phase2-pipeline",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

test("pipeline job claim SQL uses row locks with SKIP LOCKED", () => {
  assert.match(CLAIM_NEXT_PIPELINE_JOB_SQL, /FOR UPDATE SKIP LOCKED/i);
  assert.match(CLAIM_NEXT_PIPELINE_JOB_SQL, /status = 'pending'/i);
  assert.match(CLAIM_NEXT_PIPELINE_JOB_SQL, /attempts < max_attempts/i);
  assert.match(CLAIM_NEXT_PIPELINE_JOB_SQL, /heartbeat_at = NOW\(\)/i);
  assert.match(CLAIM_NEXT_PIPELINE_JOB_SQL, /lease_expires_at = NOW\(\) \+ \(\$3::int \* INTERVAL '1 second'\)/i);
});

test("Phase 2 pipeline recovery adds heartbeats, keepalive, and stale reset semantics", () => {
  const migration = read("migrations/010-pipeline-heartbeats.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ/i);
  assert.match(migration, /idx_pipeline_jobs_stale_running/i);
  const leaseMigration = read("migrations/020-pipeline-job-lease-expiry.sql");
  assert.match(leaseMigration, /ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ/i);
  assert.match(leaseMigration, /idx_pipeline_jobs_running_lease_expiry/i);
  assert.equal(typeof updatePipelineJobHeartbeat, "function");
  assert.equal(typeof resetStalePipelineJobs, "function");
  assert.equal(typeof executeJobWithKeepalive, "function");
});

test("Phase 3 set-based matcher uses lateral candle lookups and SQL batch update", () => {
  const sql = buildSetBasedMatchSql(false);
  assert.match(sql, /WITH candidates AS/i);
  assert.match(sql, /LEFT JOIN LATERAL/i);
  assert.match(sql, /UPDATE calls c/i);
  assert.match(sql, /RETURNING c\.id/i);
  assert.match(sql, /price_at_call IS NULL/i);

  const migration = read("migrations/011-candle-daily-closes.sql");
  assert.match(migration, /CREATE MATERIALIZED VIEW IF NOT EXISTS candle_daily_closes/i);
  assert.match(migration, /uniq_candle_daily_closes_symbol_day/i);
});

test("Phase 1 automation jobs use deterministic daily idempotency keys", () => {
  const now = new Date("2026-05-05T12:34:56.000Z");
  assert.equal(candleRefreshRunKey(now), "candle-refresh:2026-05-05");
  assert.equal(matchPricesBatchRunKey(now), "match-prices-batch:2026-05-05");
  assert.equal(computeScoresRunKey(now), "compute-scores:2026-05-05");
  assert.equal(mlPromotionRunKey(now), "ml-promotion:2026-05-05");
});

test("Hermes worker advertises Phase 1 job types while keeping dry-run smoke support", () => {
  assert.ok(SUPPORTED_JOB_TYPES.includes("hermes_smoke_test"));
  assert.ok(SUPPORTED_JOB_TYPES.includes("candle_refresh"));
  assert.ok(SUPPORTED_JOB_TYPES.includes("match_prices_batch"));
  assert.ok(SUPPORTED_JOB_TYPES.includes("compute_scores"));
  assert.ok(SUPPORTED_JOB_TYPES.includes(PROMOTE_ML_VERIFIED_JOB_TYPE));
});

test("Phase 1 job payload parsers keep bounded production-safe defaults", () => {
  const candleArgs = candleRefreshArgsFromPayload({
    symbols: "btc, eth, btc",
    max_requests_per_symbol: 10,
    dry_run: true,
  });
  assert.deepEqual(candleArgs.symbols, ["BTC", "ETH"]);
  assert.equal(candleArgs.maxRequestsPerSymbol, 10);
  assert.equal(candleArgs.write, false);

  const matchArgs = matchPricesArgsFromPayload({ limit: 50, batch_size: 10, start_after_id: 123 });
  assert.deepEqual(matchArgs, {
    rematchAll: false,
    limit: 50,
    batchSize: 10,
    startAfterId: 123,
  });
});

test("ML verifier reason-code migration uses lookup table and provider failure codes", () => {
  const migration = read("migrations/019-ml-verifier-reason-code-lookup.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ml_verification_reason_codes/i);
  assert.match(migration, /model_timeout/);
  assert.match(migration, /malformed_model_output/);
  assert.match(migration, /model_provider_error/);
  assert.match(migration, /FOREIGN KEY \(reason_code\)/i);
  assert.match(migration, /DROP CONSTRAINT/i);
});

test("verifier parser accepts valid schema and rejects malformed output", () => {
  const parsed = parseVerifierOutput(
    '```json\n{"decision":"reject","reason_code":"generic_word","confidence":0.91,"evidence_span":"join the link below","recommended_extraction_confidence":0.1,"reason":"generic link"}\n```',
  );

  assert.equal(parsed.decision, "reject");
  assert.equal(parsed.reason_code, "generic_word");
  assert.equal(parsed.confidence, 0.91);

  assert.throws(
    () => parseVerifierOutput(JSON.stringify({ decision: "maybe", confidence: 2 })),
    /decision|reason_code|confidence/,
  );
});

test("candidate selector SQL and TS sorter prioritize low-confidence score-ready before ambiguous ticker and recent transcript rows", () => {
  assert.match(buildMlVerifierCandidateSql(), /low_confidence_score_ready/);
  assert.match(buildMlVerifierCandidateSql(), /ambiguous_ticker/);
  assert.match(buildMlVerifierCandidateSql(), /recent_low_confidence_transcript/);

  const ranked = sortAndDedupeVerifierCandidates([
    candidate({ id: 3, candidate_bucket: "recent_low_confidence_transcript", candidate_priority: 3, call_date: "2026-04-01T00:00:00.000Z" }),
    candidate({ id: 2, symbol: "LINKUSDT", candidate_bucket: "ambiguous_ticker", candidate_priority: 2, extraction_confidence: 0.95 }),
    candidate({ id: 1, candidate_bucket: "low_confidence_score_ready", candidate_priority: 1, extraction_confidence: 0.69 }),
    candidate({ id: 1, candidate_bucket: "recent_low_confidence_transcript", candidate_priority: 3 }),
  ], 3);

  assert.deepEqual(ranked.map((row) => row.id), [1, 2, 3]);
  assert.equal(ranked[0].candidate_bucket, "low_confidence_score_ready");
});

test("mocked verifier writes ml_verification_runs and never mutates calls in audit-only mode", async () => {
  const statements: string[] = [];
  const params: unknown[][] = [];
  const selected = candidate({ id: 42 });
  const queryFn = async <T>(text: string, queryParams: unknown[] = []): Promise<T[]> => {
    statements.push(text);
    params.push(queryParams);
    if (text.includes("WITH candidates AS")) return [selected] as T[];
    return [] as T[];
  };

  const metrics = await runMlVerifierBatch(job(), {
    queryFn,
    verifyCandidate: async () => ({
      decision: "approve",
      reason_code: "valid_call",
      confidence: 0.88,
      evidence_span: "Bitcoin is a buy above support",
      recommended_extraction_confidence: 0.86,
      reason: "Transcript supports the stored call",
    }),
  });

  assert.equal(metrics.processed, 1);
  assert.ok(statements.some((statement) => /INSERT INTO ml_verification_runs/i.test(statement)));
  assert.ok(params.some((paramSet) => paramSet.includes(42)));
  assert.equal(
    statements.some((statement) => /\b(UPDATE|INSERT INTO|DELETE FROM)\s+calls\b/i.test(statement)),
    false,
  );
});

test("provider failures fall back to review and do not abort batch", async () => {
  const eventParams: unknown[][] = [];
  const insertions: unknown[][] = [];
  const queryFn = async <T>(text: string, queryParams: unknown[] = []): Promise<T[]> => {
    if (text.includes("WITH candidates AS")) return [candidate({ id: 77 })] as T[];
    if (text.includes("INSERT INTO pipeline_job_events")) eventParams.push(queryParams);
    if (text.includes("INSERT INTO ml_verification_runs")) insertions.push(queryParams);
    return [] as T[];
  };

  const metrics = await runMlVerifierBatch(job(), {
    queryFn,
    verifyCandidate: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(metrics.processed, 1);
  assert.equal(metrics.review, 1);
  assert.equal(metrics.approved, 0);
  assert.equal(metrics.rejected, 0);
  assert.ok(eventParams.some((params) => params.includes("ml_verifier_provider_error")));
  assert.ok(eventParams.some((params) => params.includes("review")));
  assert.ok(insertions.some((params) => params.some(p => {
    const s = typeof p === "string" ? p : typeof p === "number" || p === null || p === undefined ? String(p) : JSON.stringify(p);
    return s.includes("provider unavailable");
  })));
});

test("Phase 6 ML promotion gates are disabled by default and require review, shadow diff, and gold set pass", () => {
  const blocked = validateMlPromotionGates({
    manualReviewApproved: false,
    manualReviewedBy: null,
    manualReviewTicket: null,
    shadowDiffPassed: false,
    goldSetPassed: false,
  }, {});

  assert.equal(blocked.passed, false);
  assert.deepEqual(blocked.blockers, [
    "ml_promotion_disabled",
    "manual_review_required",
    "shadow_diff_required",
    "gold_set_required",
  ]);
  assert.equal(blocked.preserves_public_confidence_threshold, true);

  const passed = validateMlPromotionGates({
    manualReviewApproved: true,
    manualReviewedBy: "ops",
    manualReviewTicket: "review-123",
    shadowDiffPassed: true,
    goldSetPassed: true,
  }, { ML_PROMOTION_ENABLED: "true" });

  assert.equal(passed.passed, true);
});

test("Phase 6 ML promotion SQL only selects approved verifier rows below public threshold", () => {
  const sql = buildMlPromotionCandidateSql();
  assert.match(sql, /decision = 'approve'/);
  assert.match(sql, /recommended_extraction_confidence >= \$3/);
  assert.match(sql, /c\.extraction_confidence < \$3/);
});

test("Phase 6 migration creates the ML promotion audit table", () => {
  assert.match(read("migrations/014-ml-promotion-audit.sql"), /CREATE TABLE IF NOT EXISTS ml_promotion_audit/);
});

test("Phase 6 dry-run promotion writes audit events and does not update calls", async () => {
  const statements: string[] = [];
  const params: unknown[][] = [];
  const promotionJob = job({
    batch_size: 1,
    limit: 10,
    write: false,
    prompt_version: "ml-verifier-v1",
  });
  const queryFn = async <T>(text: string, queryParams: unknown[] = []): Promise<T[]> => {
    statements.push(text);
    params.push(queryParams);
    if (text.includes("FROM latest_verification")) {
      return [{
        call_id: 123,
        current_extraction_confidence: 0.4,
        recommended_extraction_confidence: 0.91,
        verifier_confidence: 0.93,
        verification_run_id: 456,
      }] as T[];
    }
    if (text.includes("INSERT INTO ml_promotion_audit")) return [{ id: 9 }] as T[];
    return [] as T[];
  };

  const metrics = await runMlPromotionJob(promotionJob, { queryFn, env: {} });

  assert.equal(metrics.dry_run, true);
  assert.equal(metrics.selected, 1);
  assert.equal(metrics.promoted, 0);
  assert.ok(statements.some((statement) => /INSERT INTO ml_promotion_audit/i.test(statement)));
  assert.ok(params.some((paramSet) => paramSet.includes("ml_promotion_dry_run")));
  assert.equal(
    statements.some((statement) => /\bUPDATE\s+calls\b/i.test(statement)),
    false,
  );
});

test("Phase 6 write promotion preserves the public confidence threshold floor", async () => {
  const statements: string[] = [];
  const promotionJob = job({
    limit: 10,
    write: true,
    prompt_version: "ml-verifier-v1",
    manual_review_approved: true,
    manual_reviewed_by: "ops",
    manual_review_ticket: "review-123",
    shadow_diff_passed: true,
    gold_set_passed: true,
  });
  const queryFn = async <T>(text: string, queryParams: unknown[] = []): Promise<T[]> => {
    statements.push(text);
    if (text.includes("WITH selected(call_id)")) {
      return [{ promoted_count: 1, promoted_call_ids: [123] }] as T[];
    }
    if (text.includes("FROM latest_verification")) {
      return [{
        call_id: 123,
        current_extraction_confidence: 0.4,
        recommended_extraction_confidence: 0.91,
        verifier_confidence: 0.93,
        verification_run_id: 456,
      }] as T[];
    }
    if (text.includes("INSERT INTO ml_promotion_audit")) return [{ id: 9 }] as T[];
    return [] as T[];
  };

  const metrics = await runMlPromotionJob(promotionJob, {
    queryFn,
    env: { ML_PROMOTION_ENABLED: "true" },
  });

  assert.equal(metrics.promoted, 1);
  assert.ok(statements.some((statement) => /SET extraction_confidence = GREATEST/i.test(statement)));
  assert.ok(statements.some((statement) => /recommended_extraction_confidence >= \$4/i.test(statement)));
});

test("Vercel ML enqueue endpoint rejects missing or invalid CRON_SECRET before DB work", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-secret";

  try {
    const missing = await enqueueMlCron(new NextRequest("http://localhost/api/cron/ml/enqueue", { method: "POST" }));
    assert.equal(missing.status, 401);

    const invalid = await enqueueMlCron(new NextRequest("http://localhost/api/cron/ml/enqueue", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }));
    assert.equal(invalid.status, 401);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("Phase 1 cron enqueue endpoints reject missing CRON_SECRET before DB work", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-secret";

  try {
    const routes = [
      ["candles", enqueueCandlesCron],
      ["match", enqueueMatchCron],
      ["scores", enqueueScoresCron],
    ] as const;

    for (const [name, handler] of routes) {
      const response = await handler(new NextRequest(`http://localhost/api/cron/${name}/enqueue`, {
        method: "POST",
      }));
      assert.equal(response.status, 401);
    }
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
