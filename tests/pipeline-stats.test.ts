import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  DEFAULT_PIPELINE_STATS_LIMIT,
  MAX_PIPELINE_STATS_LIMIT,
  normalizePipelineStatsLimit,
} from "../src/lib/pipeline-stats";
import { GET, dynamic } from "../src/app/api/pipeline/stats/route";

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/pipeline/stats?limit=3", {
    headers,
  });
}

test("pipeline stats limit stays bounded for operational payload size", () => {
  assert.equal(normalizePipelineStatsLimit(undefined), DEFAULT_PIPELINE_STATS_LIMIT);
  assert.equal(normalizePipelineStatsLimit(0), 1);
  assert.equal(normalizePipelineStatsLimit(3.8), 3);
  assert.equal(normalizePipelineStatsLimit(999), MAX_PIPELINE_STATS_LIMIT);
  assert.equal(normalizePipelineStatsLimit(Number.NaN), DEFAULT_PIPELINE_STATS_LIMIT);
});

test("pipeline stats route is dynamic and rejects unauthenticated requests before DB work", async () => {
  const previousPipelineSecret = process.env.PIPELINE_STATUS_SECRET;
  const previousCronSecret = process.env.CRON_SECRET;
  process.env.PIPELINE_STATUS_SECRET = "pipeline-secret";
  process.env.CRON_SECRET = "cron-secret";

  try {
    assert.equal(dynamic, "force-dynamic");
    const missing = await GET(request());
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: "unauthorized" });

    const invalid = await GET(request({ authorization: "Bearer wrong" }));
    assert.equal(invalid.status, 401);
  } finally {
    if (previousPipelineSecret === undefined) delete process.env.PIPELINE_STATUS_SECRET;
    else process.env.PIPELINE_STATUS_SECRET = previousPipelineSecret;

    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
  }
});
