import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFreshnessCheckArgs } from "../src/scripts/callscore-freshness-check";

test("freshness check is read-only and can validate a read API base", () => {
  assert.deepEqual(parseFreshnessCheckArgs(["--read-api-base", "https://ops-bridge.call-score.com/api/read"]), {
    readApiBase: "https://ops-bridge.call-score.com/api/read",
  });
  const source = readFileSync(join(__dirname, "../src/scripts/callscore-freshness-check.ts"), "utf8");
  assert.match(source, /SELECT MAX\(created_at\)::text FROM pipeline_jobs/);
  assert.match(source, /information_schema\.role_table_grants/);
  assert.doesNotMatch(source, /await query\(\s*`(?:UPDATE|INSERT|DELETE|TRUNCATE|ALTER)\b/i);
});
