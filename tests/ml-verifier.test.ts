import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  extractJsonObjectText,
  parseVerifierOutput,
  sortAndDedupeVerifierCandidates,
  selectMlVerifierCandidates,
  runMlVerifierBatch,
  buildMlVerifierCandidateSql,
  deterministicPreCheck,
  resolveMlVerifierConfig,
  buildVerifierPrompt,
  transcriptContext,
  ML_VERIFIER_PROMPT_VERSION,
  DEFAULT_ML_VERIFIER_MODEL,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_ML_VERIFIER_BATCH_SIZE,
  DEFAULT_ML_VERIFIER_ATTEMPT_TIMEOUTS_MS,
  verifyCandidateWithOllama,
  deriveMlVerifierTrustDecision,
} from "../src/lib/ml-verifier";
import type { MlVerifierCandidate, ParsedVerifierOutput, MlVerifierConfig } from "../src/lib/ml-verifier";

import type { PipelineJob } from "../src/lib/pipeline";

// ──────────────────────────
// Helpers
// ──────────────────────────

function makeCandidate(overrides: Partial<MlVerifierCandidate> = {}): MlVerifierCandidate {
  return {
    id: 1,
    creator_id: 10,
    video_id: 100,
    creator_name: "Alice",
    youtube_handle: "@alice",
    video_title: "Bitcoin to 100k",
    symbol: "BTCUSDT",
    direction: "bullish",
    call_type: "spot",
    raw_quote: "Bitcoin is going to 100k",
    extraction_confidence: 0.85,
    specificity_score: 0.9,
    score: 0.88,
    call_date: "2024-06-01",
    transcript: "Bitcoin is going to 100k by end of year. The market looks bullish.",
    candidate_bucket: "low_confidence_score_ready",
    candidate_priority: 1,
    ...overrides,
  };
}

function makeValidOutput(overrides: Partial<ParsedVerifierOutput> = {}): ParsedVerifierOutput {
  return {
    decision: "approve",
    reason_code: "valid_call",
    confidence: 0.95,
    evidence_span: "Bitcoin is going to 100k",
    recommended_extraction_confidence: 0.9,
    reason: "Transcript clearly supports the call",
    ...overrides,
  };
}

function makeJob(payload: Record<string, unknown> = {}): PipelineJob {
  const now = new Date().toISOString();
  return {
    id: 1,
    run_id: null,
    type: "ml_verifier",
    status: "running",
    priority: 0,
    payload: { batch_size: 10, ...payload },
    attempts: 0,
    max_attempts: 3,
    locked_by: null,
    locked_at: null,
    heartbeat_at: null,
    lease_expires_at: null,
    run_after: now,
    idempotency_key: null,
    error: null,
    metrics: {},
    phase: null,
    created_at: now,
    updated_at: now,
  };
}

// ──────────────────────────
// extractJsonObjectText
// ──────────────────────────

test("extractJsonObjectText: direct strategy — clean JSON object", () => {
  const result = extractJsonObjectText('{"decision":"approve"}');
  assert.equal(result.strategy, "direct");
  assert.equal(result.json, '{"decision":"approve"}');
});

test("extractJsonObjectText: direct strategy — with markdown fences", () => {
  const result = extractJsonObjectText('```json\n{"decision":"approve"}\n```');
  assert.equal(result.strategy, "direct");
  assert.equal(result.json, '{"decision":"approve"}');
});

test("extractJsonObjectText: brace_count strategy — nested braces", () => {
  const wrapped = 'Some text before {"decision":"approve","meta":{"x":1}} trailing text';
  const result = extractJsonObjectText(wrapped);
  assert.equal(result.strategy, "brace_count");
  assert.equal(result.json, '{"decision":"approve","meta":{"x":1}}');
});

test("extractJsonObjectText: handles text with extra braces around JSON", () => {
  const wrapped = 'prefix { "nested": 1 } suffix';
  const result = extractJsonObjectText(wrapped);
  assert.equal(result.json, '{ "nested": 1 }');
  assert.equal(result.strategy, "brace_count");
});

test("extractJsonObjectText: throws when no JSON object found", () => {
  assert.throws(() => extractJsonObjectText("no json here"), /does not contain valid JSON/);
});

// ──────────────────────────
// parseVerifierOutput
// ──────────────────────────

test("parseVerifierOutput: happy path with all fields", () => {
  const raw = JSON.stringify({
    decision: "approve",
    reason_code: "valid_call",
    confidence: 0.95,
    evidence_span: "Bitcoin is going to 100k",
    recommended_extraction_confidence: 0.9,
    reason: "Looks good",
  });
  const out = parseVerifierOutput(raw);
  assert.equal(out.decision, "approve");
  assert.equal(out.reason_code, "valid_call");
  assert.equal(out.confidence, 0.95);
  assert.equal(out.evidence_span, "Bitcoin is going to 100k");
  assert.equal(out.recommended_extraction_confidence, 0.9);
  assert.equal(out.reason, "Looks good");
  assert.equal(out.parse_strategy, "direct");
});

test("parseVerifierOutput: overrides to missing_evidence when evidence_span is empty", () => {
  const raw = JSON.stringify({
    decision: "approve",
    reason_code: "valid_call",
    confidence: 0.95,
    evidence_span: "",
    recommended_extraction_confidence: 0.9,
    reason: "Looks good",
  });
  const out = parseVerifierOutput(raw);
  assert.equal(out.reason_code, "missing_evidence");
  assert.equal(out.evidence_span, "");
});

test("parseVerifierOutput: overrides to missing_evidence when evidence_span is whitespace-only", () => {
  const raw = JSON.stringify({
    decision: "approve",
    reason_code: "valid_call",
    confidence: 0.95,
    evidence_span: "   ",
    recommended_extraction_confidence: 0.9,
    reason: "Looks good",
  });
  const out = parseVerifierOutput(raw);
  assert.equal(out.reason_code, "missing_evidence");
  assert.equal(out.evidence_span, "");
});

test("parseVerifierOutput: preserves raw_llm_response when provided", () => {
  const raw = '{"decision":"approve","reason_code":"valid_call","confidence":0.5,"evidence_span":"x","recommended_extraction_confidence":0.5,"reason":"ok"}';
  const out = parseVerifierOutput(raw, "full body");
  assert.equal(out.raw_llm_response, "full body");
});

test("parseVerifierOutput: throws on invalid decision", () => {
  const raw = JSON.stringify({ decision: "banana", reason_code: "valid_call", confidence: 0.5, evidence_span: "x", recommended_extraction_confidence: 0.5, reason: "ok" });
  assert.throws(() => parseVerifierOutput(raw), /decision must be approve, reject, or review/);
});

test("parseVerifierOutput: throws on invalid reason_code", () => {
  const raw = JSON.stringify({ decision: "approve", reason_code: "banana", confidence: 0.5, evidence_span: "x", recommended_extraction_confidence: 0.5, reason: "ok" });
  assert.throws(() => parseVerifierOutput(raw), /reason_code is not supported/);
});

test("parseVerifierOutput: throws on confidence out of range", () => {
  const raw = JSON.stringify({ decision: "approve", reason_code: "valid_call", confidence: 1.5, evidence_span: "x", recommended_extraction_confidence: 0.5, reason: "ok" });
  assert.throws(() => parseVerifierOutput(raw), /confidence must be a number from 0 to 1/);
});

// ──────────────────────────
// trust decision mapping
// ──────────────────────────

test("deriveMlVerifierTrustDecision: high-confidence approval is publish-ready without founder review", () => {
  const decision = deriveMlVerifierTrustDecision(makeValidOutput({
    decision: "approve",
    reason_code: "valid_call",
    confidence: 0.91,
    recommended_extraction_confidence: 0.9,
  }));

  assert.equal(decision.publication_decision, "publish");
  assert.equal(decision.low_confidence_validation_decision, "PROMOTE");
  assert.equal(decision.suppress_from_public_scoring, false);
  assert.equal(decision.public_impact_allowed, false);
  assert.equal(decision.public_scoring_allowed, false);
  assert.equal(decision.reviewer_required, false);
  assert.equal(decision.founder_required, false);
  assert.deepEqual(decision.evidence_refs, ["ml_verifier:evidence_span"]);
  assert.equal(decision.non_founder_review_required, false);
  assert.equal(decision.founder_review_required, false);
});

test("deriveMlVerifierTrustDecision: rejected or missing evidence suppresses without founder review", () => {
  const decision = deriveMlVerifierTrustDecision(makeValidOutput({
    decision: "review",
    reason_code: "missing_evidence",
    confidence: 0,
    evidence_span: "",
    recommended_extraction_confidence: 0,
  }));

  assert.equal(decision.publication_decision, "suppress");
  assert.equal(decision.low_confidence_validation_decision, "REJECT");
  assert.equal(decision.suppress_from_public_scoring, true);
  assert.equal(decision.non_founder_review_required, false);
  assert.equal(decision.founder_review_required, false);
});

test("deriveMlVerifierTrustDecision: unclear review routes only to non-founder trust review", () => {
  const decision = deriveMlVerifierTrustDecision(makeValidOutput({
    decision: "review",
    reason_code: "unclear",
    confidence: 0.62,
    evidence_span: "Bitcoin could keep moving if liquidity improves",
    recommended_extraction_confidence: 0.61,
  }));

  assert.equal(decision.publication_decision, "review");
  assert.equal(decision.low_confidence_validation_decision, "NEEDS_HUMAN_REVIEW");
  assert.equal(decision.suppress_from_public_scoring, true);
  assert.equal(decision.non_founder_review_required, true);
  assert.equal(decision.founder_review_required, false);
});

test("deriveMlVerifierTrustDecision: low-confidence approvals suppress instead of review escalation", () => {
  const decision = deriveMlVerifierTrustDecision(makeValidOutput({
    decision: "approve",
    reason_code: "valid_call",
    confidence: 0.52,
    evidence_span: "Bitcoin could move higher",
    recommended_extraction_confidence: 0.52,
  }));

  assert.equal(decision.publication_decision, "suppress");
  assert.equal(decision.low_confidence_validation_decision, "REJECT");
  assert.equal(decision.non_founder_review_required, false);
  assert.equal(decision.founder_review_required, false);
});

test("deriveMlVerifierTrustDecision: terminal invalid review reasons suppress automatically", () => {
  const decision = deriveMlVerifierTrustDecision(makeValidOutput({
    decision: "review",
    reason_code: "non_actionable",
    confidence: 0.82,
    evidence_span: "Bitcoin is interesting to watch",
    recommended_extraction_confidence: 0.82,
  }));

  assert.equal(decision.publication_decision, "suppress");
  assert.equal(decision.low_confidence_validation_decision, "REJECT");
  assert.equal(decision.non_founder_review_required, false);
  assert.equal(decision.founder_review_required, false);
});

// ──────────────────────────
// deterministicPreCheck
// ──────────────────────────

test("deterministicPreCheck: quote not in transcript → review + quote_not_in_transcript", () => {
  const candidate = makeCandidate({ raw_quote: "Ethereum to the moon", transcript: "Bitcoin looks good today." });
  const result = deterministicPreCheck(candidate);
  assert.equal(result.skipLLM, true);
  assert.equal(result.output!.decision, "review");
  assert.equal(result.output!.reason_code, "quote_not_in_transcript");
  assert.equal(result.output!.parse_strategy, "deterministic_precheck");
});

test("deterministicPreCheck: missing raw_quote → review + missing_evidence", () => {
  const candidate = makeCandidate({ raw_quote: null, transcript: "Bitcoin looks good." });
  const result = deterministicPreCheck(candidate);
  assert.equal(result.skipLLM, true);
  assert.equal(result.output!.reason_code, "missing_evidence");
});

test("deterministicPreCheck: short raw_quote → review + missing_evidence", () => {
  const candidate = makeCandidate({ raw_quote: "ok", transcript: "Bitcoin looks good." });
  const result = deterministicPreCheck(candidate);
  assert.equal(result.skipLLM, true);
  assert.equal(result.output!.reason_code, "missing_evidence");
});

test("deterministicPreCheck: quote found in transcript → no skip", () => {
  const candidate = makeCandidate({ raw_quote: "Bitcoin is going to 100k", transcript: "Bitcoin is going to 100k by end of year." });
  const result = deterministicPreCheck(candidate);
  assert.equal(result.skipLLM, false);
});

test("deterministicPreCheck: fuzzy match works", () => {
  const candidate = makeCandidate({ raw_quote: "Bitcoin to 100k!", transcript: "bitcoin to 100k by end of year" });
  const result = deterministicPreCheck(candidate);
  assert.equal(result.skipLLM, false);
});

// ──────────────────────────
// sortAndDedupeVerifierCandidates
// ──────────────────────────

test("sortAndDedupeVerifierCandidates: sorts by priority then confidence then date then id", () => {
  const c1 = makeCandidate({ id: 1, candidate_priority: 2, extraction_confidence: 0.5, call_date: "2024-01-01" });
  const c2 = makeCandidate({ id: 2, candidate_priority: 1, extraction_confidence: 0.9, call_date: "2024-01-02" });
  const c3 = makeCandidate({ id: 3, candidate_priority: 1, extraction_confidence: 0.5, call_date: "2024-01-03" });
  const result = sortAndDedupeVerifierCandidates([c1, c2, c3], 10);
  // Lower extraction_confidence first within same priority, then newer date
  assert.deepEqual(result.map(c => c.id), [3, 2, 1]);
});

test("sortAndDedupeVerifierCandidates: dedupes by id", () => {
  const c1 = makeCandidate({ id: 1 });
  const c2 = makeCandidate({ id: 1 });
  const result = sortAndDedupeVerifierCandidates([c1, c2], 10);
  assert.equal(result.length, 1);
});

test("sortAndDedupeVerifierCandidates: respects limit", () => {
  const candidates = Array.from({ length: 5 }, (_, i) => makeCandidate({ id: i + 1, candidate_priority: i + 1 }));
  const result = sortAndDedupeVerifierCandidates(candidates, 3);
  assert.equal(result.length, 3);
});

// ──────────────────────────
// selectMlVerifierCandidates SQL
// ──────────────────────────

test("buildMlVerifierCandidateSql: contains expected CTEs and filters", () => {
  const sql = buildMlVerifierCandidateSql();
  assert.match(sql, /WITH candidates AS/);
  assert.match(sql, /low_confidence_score_ready/);
  assert.match(sql, /ambiguous_ticker/);
  assert.match(sql, /recent_low_confidence_transcript/);
  assert.match(sql, /NOT EXISTS/);
  assert.match(sql, /ml_verification_runs/);
  assert.match(sql, /ORDER BY candidate_priority/);
  assert.match(sql, /LIMIT \$4/);
});

test("selectMlVerifierCandidates: calls queryFn with correct params", async () => {
  let calledSql = "";
  let calledParams: unknown[] = [];
  const mockQuery = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    calledSql = sql;
    calledParams = params ?? [];
    return [] as T[];
  };
  await selectMlVerifierCandidates({ limit: 50, promptVersion: "v2", queryFn: mockQuery });
  assert.ok(calledSql.includes("WITH candidates AS"));
  assert.equal(calledParams[1], "v2");
  assert.deepEqual(calledParams[2], ["LINKUSDT", "NEARUSDT", "DOTUSDT", "ARUSDT"]);
});

// ──────────────────────────
// transcriptContext
// ──────────────────────────

test("transcriptContext: returns full transcript when short", () => {
  const short = "Short transcript.";
  const candidate = makeCandidate({ transcript: short, raw_quote: "transcript" });
  const ctx = transcriptContext(candidate, 1000);
  assert.equal(ctx, short);
});

test("transcriptContext: extracts window around quote match", () => {
  const prefix = "a ".repeat(500);
  const suffix = "b ".repeat(500);
  const transcript = prefix + "Bitcoin is going to 100k" + suffix;
  const candidate = makeCandidate({ transcript, raw_quote: "Bitcoin is going to 100k" });
  const ctx = transcriptContext(candidate, 100);
  assert.ok(ctx.includes("Bitcoin is going to 100k"));
  assert.ok(ctx.length <= 110); // radius + quote
  // Should be a substring of the full transcript
  assert.ok(transcript.includes(ctx));
});

// ──────────────────────────
// buildVerifierPrompt
// ──────────────────────────

test("buildVerifierPrompt: contains candidate details and transcript", () => {
  const candidate = makeCandidate({ symbol: "ETHUSDT", direction: "bearish", raw_quote: "ETH will drop" });
  const prompt = buildVerifierPrompt(candidate);
  assert.ok(prompt.includes("ETHUSDT"));
  assert.ok(prompt.includes("bearish"));
  assert.ok(prompt.includes("ETH will drop"));
  assert.ok(prompt.includes("Transcript context:"));
  assert.ok(prompt.includes("missing_evidence")); // reason_code enum in prompt
});

// ──────────────────────────
// resolveMlVerifierConfig
// ──────────────────────────

test("resolveMlVerifierConfig: defaults", () => {
  const config = resolveMlVerifierConfig({} as any);
  assert.equal(config.provider, "ollama");
  assert.equal(config.model, DEFAULT_ML_VERIFIER_MODEL);
  assert.equal(config.ollamaHost, DEFAULT_OLLAMA_HOST);
  assert.equal(config.promptVersion, "ml-verifier-v1");
  assert.equal(config.requestTimeoutMs, 180_000);
  assert.deepEqual(config.attemptTimeoutMs, [...DEFAULT_ML_VERIFIER_ATTEMPT_TIMEOUTS_MS]);
});

test("resolveMlVerifierConfig: env overrides", () => {
  const config = resolveMlVerifierConfig({
    ML_VERIFIER_MODEL: "custom-model",
    OLLAMA_HOST: "http://localhost:11434/",
    ML_VERIFIER_TIMEOUT_MS: "5000",
    ML_VERIFIER_ATTEMPT_TIMEOUTS_MS: "1000,2000",
  } as any);
  assert.equal(config.model, "custom-model");
  assert.equal(config.ollamaHost, "http://localhost:11434");
  assert.equal(config.requestTimeoutMs, 5000);
  assert.deepEqual(config.attemptTimeoutMs, [1000, 2000]);
});


test("verifyCandidateWithOllama: timeout attempts become review/model_timeout", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    const error = new Error("operation timed out");
    error.name = "AbortError";
    throw error;
  }) as typeof fetch;

  try {
    const out = await verifyCandidateWithOllama(makeCandidate(), {
      provider: "ollama",
      model: "test-model",
      ollamaHost: "http://localhost:11434",
      promptVersion: "test-v1",
      requestTimeoutMs: 1_000,
      attemptTimeoutMs: [1_000, 1_000],
    });
    assert.equal(calls, 2);
    assert.equal(out.decision, "review");
    assert.equal(out.reason_code, "model_timeout");
    assert.equal(out.parse_strategy, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifyCandidateWithOllama: malformed JSON retries once then stores malformed_model_output", async () => {
  const originalFetch = globalThis.fetch;
  const prompts: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    prompts.push(String(JSON.parse(String(init?.body)).messages[0].content));
    return new Response(JSON.stringify({ message: { content: "not json" } }), { status: 200 });
  }) as typeof fetch;

  try {
    const out = await verifyCandidateWithOllama(makeCandidate(), {
      provider: "ollama",
      model: "test-model",
      ollamaHost: "http://localhost:11434",
      promptVersion: "test-v1",
      requestTimeoutMs: 1_000,
      attemptTimeoutMs: [1_000, 1_000],
    });
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /Return only valid JSON/);
    assert.equal(out.decision, "review");
    assert.equal(out.reason_code, "malformed_model_output");
    assert.equal(out.raw_llm_response, "not json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveMlVerifierConfig: throws on unsupported provider", () => {
  assert.throws(() => resolveMlVerifierConfig({ ML_VERIFIER_PROVIDER: "openai" } as any), /Unsupported/);
});

// ──────────────────────────
// runMlVerifierBatch integration
// ──────────────────────────

test("runMlVerifierBatch: full flow with pre-check skipping LLM", async () => {
  const events: Array<{ eventType: string; status: string }> = [];
  const runs: Array<{ callId: number; reasonCode: string }> = [];

  const mockQuery = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    if (sql.includes("pipeline_job_events")) {
      events.push({ eventType: params?.[2] as string, status: params?.[3] as string });
      return [] as T[];
    }
    if (sql.includes("INSERT INTO ml_verification_runs") || sql.includes("ON CONFLICT (call_id")) {
      runs.push({ callId: params?.[2] as number, reasonCode: params?.[10] as string });
      return [] as T[];
    }
    if (sql.includes("COUNT(*)")) {
      return [{ count: "0" }] as T[];
    }
    if (sql.includes("WITH candidates AS")) {
      return [makeCandidate({ id: 1, raw_quote: "", transcript: "nope" })] as unknown as T[];
    }
    return [] as T[];
  };

  const job = makeJob({ batch_size: 10 });
  const metrics = await runMlVerifierBatch(job, { queryFn: mockQuery });

  assert.equal(metrics.selected, 1);
  assert.equal(metrics.processed, 1);
  assert.equal(metrics.review, 1); // pre-check → review, then suppresses from public scoring
  assert.equal(metrics.suppressed, 1);
  assert.equal(metrics.non_founder_review, 0);
  assert.equal(metrics.approved, 0);
  assert.equal(metrics.rejected, 0);
  assert.ok(events.some(e => e.eventType === "ml_verifier_preflight"));
  assert.ok(events.some(e => e.eventType === "ml_verifier_completed"));
  assert.equal(runs.length, 1);
  assert.equal(runs[0].reasonCode, "missing_evidence");
});

test("runMlVerifierBatch: graceful degradation on LLM error", async () => {
  const runs: Array<{ callId: number; reasonCode: string; parseStrategy?: string }> = [];

  const mockQuery = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    if (sql.includes("INSERT INTO ml_verification_runs") || sql.includes("ON CONFLICT (call_id")) {
      runs.push({
        callId: params?.[2] as number,
        reasonCode: params?.[10] as string,
        parseStrategy: (params?.[16] as string)?.includes("failed") ? "failed" : undefined,
      });
      return [] as T[];
    }
    if (sql.includes("COUNT(*)")) return [{ count: "0" }] as T[];
    if (sql.includes("WITH candidates AS")) {
      return [makeCandidate({ id: 2, raw_quote: "Bitcoin to 100k", transcript: "Bitcoin to 100k" })] as unknown as T[];
    }
    if (sql.includes("pipeline_job_events")) return [] as T[];
    return [] as T[];
  };

  const failingVerify = async (): Promise<ParsedVerifierOutput> => {
    throw new Error("Ollama 500");
  };

  const job = makeJob({ batch_size: 10 });
  const metrics = await runMlVerifierBatch(job, { queryFn: mockQuery, verifyCandidate: failingVerify });

  assert.equal(metrics.selected, 1);
  assert.equal(metrics.processed, 1);
  assert.equal(metrics.review, 1); // degraded to review
  assert.equal(metrics.suppressed, 1); // provider failures fail closed instead of founder escalation
  assert.equal(metrics.founder_review_required, 0);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].reasonCode, "model_provider_error");
});

test("runMlVerifierBatch: success path with LLM approval", async () => {
  const runs: Array<{ callId: number; decision: string }> = [];

  const mockQuery = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    if (sql.includes("INSERT INTO ml_verification_runs") || sql.includes("ON CONFLICT (call_id")) {
      runs.push({ callId: params?.[2] as number, decision: params?.[9] as string });
      return [] as T[];
    }
    if (sql.includes("COUNT(*)")) return [{ count: "0" }] as T[];
    if (sql.includes("WITH candidates AS")) {
      return [makeCandidate({ id: 3, raw_quote: "Bitcoin to 100k", transcript: "Bitcoin to 100k" })] as unknown as T[];
    }
    if (sql.includes("pipeline_job_events")) return [] as T[];
    return [] as T[];
  };

  const successVerify = async (): Promise<ParsedVerifierOutput> =>
    makeValidOutput({ decision: "approve", reason_code: "valid_call" });

  const job = makeJob({ batch_size: 10 });
  const metrics = await runMlVerifierBatch(job, { queryFn: mockQuery, verifyCandidate: successVerify });

  assert.equal(metrics.selected, 1);
  assert.equal(metrics.processed, 1);
  assert.equal(metrics.approved, 1);
  assert.equal(metrics.publish_ready, 1);
  assert.equal(metrics.suppressed, 0);
  assert.equal(metrics.founder_review_required, 0);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].decision, "approve");
});

test("runMlVerifierBatch: empty candidate list returns zero metrics", async () => {
  const mockQuery = async <T>(sql: string): Promise<T[]> => {
    if (sql.includes("COUNT(*)")) return [{ count: "0" }] as T[];
    if (sql.includes("WITH candidates AS")) return [] as T[];
    if (sql.includes("pipeline_job_events")) return [] as T[];
    return [] as T[];
  };

  const job = makeJob({ batch_size: 10 });
  const metrics = await runMlVerifierBatch(job, { queryFn: mockQuery });

  assert.equal(metrics.selected, 0);
  assert.equal(metrics.processed, 0);
  assert.equal(metrics.approved, 0);
  assert.equal(metrics.rejected, 0);
  assert.equal(metrics.review, 0);
});

// ──────────────────────────
// Edge cases
// ──────────────────────────

test("parseVerifierOutput: handles string numbers for confidence fields", () => {
  const raw = JSON.stringify({
    decision: "approve",
    reason_code: "valid_call",
    confidence: "0.75",
    evidence_span: "x",
    recommended_extraction_confidence: "0.8",
    reason: "ok",
  });
  const out = parseVerifierOutput(raw);
  assert.equal(out.confidence, 0.75);
  assert.equal(out.recommended_extraction_confidence, 0.8);
});

test("parseVerifierOutput: evidence_span capped at 4000 chars", () => {
  const longSpan = "x".repeat(5000);
  const raw = JSON.stringify({
    decision: "approve",
    reason_code: "valid_call",
    confidence: 0.5,
    evidence_span: longSpan,
    recommended_extraction_confidence: 0.5,
    reason: "ok",
  });
  const out = parseVerifierOutput(raw);
  assert.equal(out.evidence_span.length, 4000);
});

test("selectMlVerifierCandidates: clamps limit to [1, 1000]", async () => {
  const paramsLog: unknown[][] = [];
  const mockQuery = async <T>(_sql: string, params?: unknown[]): Promise<T[]> => {
    paramsLog.push(params ?? []);
    return [] as T[];
  };
  await selectMlVerifierCandidates({ limit: 0, queryFn: mockQuery });
  assert.equal(paramsLog[paramsLog.length - 1][3], 4); // broadLimit = max(1, 0) * 4

  await selectMlVerifierCandidates({ limit: 5000, queryFn: mockQuery });
  assert.equal(paramsLog[paramsLog.length - 1][3], 4000); // broadLimit = 1000 * 4
});
