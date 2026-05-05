import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { CLAIM_NEXT_PIPELINE_JOB_SQL, type PipelineJob } from "../src/lib/pipeline";
import {
  buildMlVerifierCandidateSql,
  parseVerifierOutput,
  runMlVerifierBatch,
  sortAndDedupeVerifierCandidates,
  type MlVerifierCandidate,
} from "../src/lib/ml-verifier";
import { POST as enqueueMlCron } from "../src/app/api/cron/ml/enqueue/route";

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
    run_after: "2026-01-01T00:00:00.000Z",
    idempotency_key: "test-key",
    error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

test("pipeline job claim SQL uses row locks with SKIP LOCKED", () => {
  assert.match(CLAIM_NEXT_PIPELINE_JOB_SQL, /FOR UPDATE SKIP LOCKED/i);
  assert.match(CLAIM_NEXT_PIPELINE_JOB_SQL, /status = 'pending'/i);
  assert.match(CLAIM_NEXT_PIPELINE_JOB_SQL, /attempts < max_attempts/i);
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

test("provider failures record a retryable verifier event", async () => {
  const eventParams: unknown[][] = [];
  const queryFn = async <T>(text: string, queryParams: unknown[] = []): Promise<T[]> => {
    if (text.includes("WITH candidates AS")) return [candidate({ id: 77 })] as T[];
    if (text.includes("INSERT INTO pipeline_job_events")) eventParams.push(queryParams);
    return [] as T[];
  };

  await assert.rejects(
    () => runMlVerifierBatch(job(), {
      queryFn,
      verifyCandidate: async () => {
        throw new Error("provider unavailable");
      },
    }),
    /provider unavailable/,
  );

  assert.ok(eventParams.some((params) => params.includes("ml_verifier_provider_error")));
  assert.ok(eventParams.some((params) => params.includes("retryable_error")));
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
