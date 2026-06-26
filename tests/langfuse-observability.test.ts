import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  createLangfuseTrace,
  flushLangfuseObservability,
  langfuseObservabilityConfigured,
  resetLangfuseObservabilityForTests,
  setLangfuseClientForTests,
  traceLangfuseSpan,
  sanitizeLangfusePayload,
} from "../src/lib/langfuse-observability";

class FakeLangfuse {
  traces: unknown[] = [];
  spans: unknown[] = [];
  flushed = false;

  trace(input: unknown) {
    this.traces.push(input);
    return { id: "trace-test-1" };
  }

  span(input: unknown) {
    this.spans.push(input);
    return { id: "span-test-1" };
  }

  async flushAsync() {
    this.flushed = true;
  }
}

test("Langfuse observability can be disabled without credentials", () => {
  resetLangfuseObservabilityForTests();
  const oldPublic = process.env.LANGFUSE_PUBLIC_KEY;
  const oldSecret = process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  try {
    assert.equal(langfuseObservabilityConfigured(), false);
    assert.equal(createLangfuseTrace({ name: "test-disabled" }), null);
  } finally {
    if (oldPublic !== undefined) process.env.LANGFUSE_PUBLIC_KEY = oldPublic;
    if (oldSecret !== undefined) process.env.LANGFUSE_SECRET_KEY = oldSecret;
    resetLangfuseObservabilityForTests();
  }
});

test("Langfuse observability creates traces, spans, and flushes with injected client", async () => {
  const fake = new FakeLangfuse();
  setLangfuseClientForTests(fake);

  assert.equal(langfuseObservabilityConfigured(), true);
  const traceId = createLangfuseTrace({
    name: "pipeline-job/compute_scores",
    tags: ["callscore", "pipeline_job", "compute_scores"],
    metadata: { job_id: "job-1", password: "value" },
    input: { run_id: "run-1", credential: "value" },
  });
  assert.equal(traceId, "trace-test-1");

  traceLangfuseSpan({
    traceId: traceId!,
    name: "job_completed",
    input: { ok: true },
    output: { token: "value", count: 3 },
  });
  await flushLangfuseObservability();

  assert.equal(fake.traces.length, 1);
  assert.equal(fake.spans.length, 1);
  assert.equal(fake.flushed, true);
  assert.deepEqual(fake.traces[0], {
    name: "pipeline-job/compute_scores",
    tags: ["callscore", "pipeline_job", "compute_scores"],
    metadata: { job_id: "job-1", password: "[REDACTED]" },
    input: { run_id: "run-1", credential: "[REDACTED]" },
  });
  assert.deepEqual(fake.spans[0], {
    traceId: "trace-test-1",
    name: "job_completed",
    input: { ok: true },
    output: { token: "[REDACTED]", count: 3 },
  });
});

test("sanitizeLangfusePayload recursively redacts secret-shaped keys", () => {
  assert.deepEqual(sanitizeLangfusePayload({
    nested: { password: "pw", safe: "ok" },
    items: [{ cookie: "c", count: 1 }],
    public_key: "pk-placeholder",
  }), {
    nested: { password: "[REDACTED]", safe: "ok" },
    items: [{ cookie: "[REDACTED]", count: 1 }],
    public_key: "[REDACTED]",
  });
});

test("worker and operating-goal entrypoints are Langfuse instrumented", () => {
  const worker = readFileSync("src/scripts/hermes-worker.ts", "utf8");
  const operatingGoal = readFileSync("src/scripts/callscore-operating-goal.ts", "utf8");

  assert.match(worker, /createLangfuseTrace/);
  assert.match(worker, /traceLangfuseSpan/);
  assert.match(worker, /pipeline-job\/\$\{job\.type\}/);
  assert.match(worker, /channel-task\/\$\{task\.task_type\}/);
  assert.match(worker, /flushLangfuseObservability/);

  assert.match(operatingGoal, /createLangfuseTrace/);
  assert.match(operatingGoal, /traceLangfuseSpan/);
  assert.match(operatingGoal, /operating-goal\/\$\{input\.goal\}/);
  assert.match(operatingGoal, /flushLangfuseObservability/);
});
