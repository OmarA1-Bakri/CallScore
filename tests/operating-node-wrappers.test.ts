import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  DEFAULT_MUTATION_FLAGS,
  mergeMutationFlags,
  nodeResultToStatePatch,
  wrapChildProcessNode,
  wrapDirectFunctionNode,
  type OperatingGraphState,
  type OperatingNodeResult,
} from "../src/lib/workplane/operating-node-utils";
import {
  buildOperatingReceiptPath,
  generateOperatingReceiptId,
  redactCommandOutput,
  writeOperatingReceipt,
} from "../src/lib/workplane/operating-receipts";
import { normalizeOperatingGoalConfig } from "../src/lib/workplane/operating-goals";
import {
  DATA_PIPELINE_STAGE_NAMES,
  buildBoundedDataPipelineCommandPlan,
} from "../src/lib/workplane/node-wrappers/data-pipeline-nodes";

function emptyState(): OperatingGraphState {
  return {
    config: normalizeOperatingGoalConfig({ goal: "monitor" }),
    node_results: [],
    blockers: [],
    warnings: [],
    errors: [],
    mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
    receipts: [],
    artifacts: {},
  };
}

test("mergeMutationFlags defaults every mutation surface to false and ORs true values", () => {
  const merged = mergeMutationFlags(
    undefined,
    { public_publish_performed: true },
    { db_write_performed: false, provider_mutation_performed: true },
  );

  assert.deepEqual(merged, {
    external_mutation_performed: false,
    send_or_outreach_performed: false,
    provider_mutation_performed: true,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    db_write_performed: false,
    public_publish_performed: true,
  });
});

test("nodeResultToStatePatch appends node results and aggregates blockers warnings and mutation flags", () => {
  const result: OperatingNodeResult = {
    node_id: "fixture_node",
    domain: "monitoring",
    status: "blocked",
    receipt_id: "receipt-fixture",
    artifact_path: null,
    blockers: ["provider_auth_missing"],
    warnings: ["dry_run_only"],
    started_at: "2026-06-25T00:00:00.000Z",
    finished_at: "2026-06-25T00:00:01.000Z",
    duration_ms: 1000,
    mutation_flags: { ...DEFAULT_MUTATION_FLAGS, external_mutation_performed: true },
    summary: "blocked on auth",
    detail: {},
  };

  const patch = nodeResultToStatePatch(result, emptyState());

  assert.deepEqual(patch.node_results, [result]);
  assert.deepEqual(patch.blockers, ["provider_auth_missing"]);
  assert.deepEqual(patch.warnings, ["dry_run_only"]);
  assert.equal(patch.mutation_flags?.external_mutation_performed, true);
});

test("wrapDirectFunctionNode maps successful direct functions to validated state patches", async () => {
  const node = wrapDirectFunctionNode({
    nodeId: "direct_success",
    domain: "monitoring",
    run: async () => ({ summary: "direct ok", detail: { checked: true } }),
  });

  const patch = await node(emptyState(), { configurable: { thread_id: "test-direct" } });
  assert.equal(patch.node_results?.[0]?.status, "ok");
  assert.equal(patch.node_results?.[0]?.summary, "direct ok");
  assert.equal(patch.mutation_flags?.external_mutation_performed, false);
});

test("wrapDirectFunctionNode maps thrown errors to failed node results", async () => {
  const node = wrapDirectFunctionNode({
    nodeId: "direct_fail",
    domain: "data",
    run: async () => {
      throw new Error("fixture failure");
    },
  });

  const patch = await node(emptyState(), { configurable: { thread_id: "test-fail" } });
  assert.equal(patch.node_results?.[0]?.status, "failed");
  assert.deepEqual(patch.errors, ["fixture failure"]);
  assert.equal(patch.node_results?.[0]?.blockers.includes("fixture failure"), true);
});

test("wrapChildProcessNode records command output artifact and exit status", async () => {
  const artifactDir = mkdtempSync(join(tmpdir(), "operating-node-test-"));
  const node = wrapChildProcessNode({
    nodeId: "child_success",
    domain: "evidence_research",
    command: process.execPath,
    args: ["-e", "console.log('child-ok')"],
    cwd: "/opt/crypto-tuber-ranked",
    artifactDir,
    timeoutMs: 10_000,
  });

  const patch = await node(emptyState(), { configurable: { thread_id: "test-child" } });
  const result = patch.node_results?.[0];
  assert.equal(result?.status, "ok");
  assert.ok(result?.artifact_path);
  assert.equal(existsSync(result!.artifact_path!), true);
  assert.match(readFileSync(result!.artifact_path!, "utf8"), /child-ok/);
});

test("writeOperatingReceipt persists redacted receipt JSON", () => {
  const artifactDir = mkdtempSync(join(tmpdir(), "operating-receipt-test-"));
  const receiptId = generateOperatingReceiptId("monitor", "freshness");
  const path = buildOperatingReceiptPath({ artifactDir, receiptId });
  const written = writeOperatingReceipt({
    path,
    receipt: {
      receipt_id: receiptId,
      goal: "monitor",
      domain: "monitoring",
      parent_receipt_ids: [],
      node_results: [],
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
      approval_receipt_id: null,
      rollback_or_recovery_note: "No rollback; no mutation.",
      artifact_paths: [],
      created_at: "2026-06-25T00:00:00.000Z",
    },
  });

  assert.equal(written, path);
  assert.equal(existsSync(path), true);
  assert.match(readFileSync(path, "utf8"), /receipt_id/);
});

test("redactCommandOutput redacts secret-shaped values", () => {
  const redacted = redactCommandOutput("TOKEN=abc123\nDATABASE_URL=postgres://user:pass@host/db\nAuthorization: Bearer abc.def\npassword: hunter2\nnormal line");
  assert.match(redacted, /TOKEN=\[REDACTED\]/);
  assert.match(redacted, /DATABASE_URL=\[REDACTED\]/);
  assert.match(redacted, /Authorization: Bearer \[REDACTED\]/);
  assert.match(redacted, /password: \[REDACTED\]/);
  assert.match(redacted, /normal line/);
});

test("buildBoundedDataPipelineCommandPlan wraps the current 18-stage run-data-pipeline command builder safely", () => {
  const plan = buildBoundedDataPipelineCommandPlan({
    config: normalizeOperatingGoalConfig({ goal: "refresh_data", maxItems: 1 }),
    auditDir: ".tmp/workflow-receipts/callscore_operating_graph/test-data-pipeline",
  });

  assert.equal(DATA_PIPELINE_STAGE_NAMES.length, 18);
  assert.deepEqual(plan.stages.map((stage) => stage.stage), [...DATA_PIPELINE_STAGE_NAMES]);
  assert.equal(plan.mode, "DRY");
  assert.equal(plan.write, false);
  assert.equal(plan.executed, false);
  assert.equal(plan.stages.find((stage) => stage.stage === "evaluation-backfill")?.status, "skipped");
  assert.equal(plan.stages.find((stage) => stage.stage === "compute-scores")?.status, "skipped");
  assert.ok(plan.stages.find((stage) => stage.stage === "secret-hygiene")?.commands.length);

  const flattened = plan.stages.flatMap((stage) => stage.commands).flat();
  assert.equal(flattened.some((part) => part === "--write" || part === "--execute"), false);
  assert.equal(flattened.some((part) => part.includes("run-daily-pipeline.ts")), false);
  assert.equal(flattened.some((part) => part.includes("extract-calls-local.ts")), false);
});
