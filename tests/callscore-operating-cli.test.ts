import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("callscore-operating-goal CLI runs monitor dry-run and prints JSON summary", () => {
  const stdout = execFileSync(process.execPath, [
    "--import",
    "tsx",
    "src/scripts/callscore-operating-goal.ts",
    "--goal",
    "monitor",
    "--dry-run",
    "--test-fixtures",
  ], { cwd: "/opt/crypto-tuber-ranked", encoding: "utf8" });

  const parsed = JSON.parse(stdout) as { goal: string; status: string; node_count: number; blockers: string[] };
  assert.equal(parsed.goal, "monitor");
  assert.equal(parsed.status, "ok");
  assert.ok(parsed.node_count >= 4);
  assert.deepEqual(parsed.blockers, []);
});

test("callscore-operating-goal CLI fails closed for unknown goals", () => {
  assert.throws(() => execFileSync(process.execPath, [
    "--import",
    "tsx",
    "src/scripts/callscore-operating-goal.ts",
    "--goal",
    "not_a_goal",
  ], { cwd: "/opt/crypto-tuber-ranked", encoding: "utf8", stdio: "pipe" }), /Command failed/);
});

test("callscore-operating-goal CLI refresh_data bounded dry-run writes a real receipt", () => {
  const stdout = execFileSync("npm", [
    "run",
    "operating:goal",
    "--",
    "--goal",
    "refresh_data",
    "--bounded",
    "--dry-run",
    "--max-items",
    "1",
    "--test-fixtures",
  ], { cwd: "/opt/crypto-tuber-ranked", encoding: "utf8" });

  const jsonStart = stdout.indexOf("{");
  const parsed = JSON.parse(stdout.slice(jsonStart)) as {
    goal: string;
    status: string;
    receipt_count: number;
    latest_receipt_path: string;
    latest_summary_path: string;
    blockers: string[];
    mutation_flags: { db_write_performed: boolean; provider_mutation_performed: boolean };
  };
  assert.equal(parsed.goal, "refresh_data");
  assert.equal(parsed.status, "ok");
  assert.equal(parsed.blockers.length, 0);
  assert.equal(parsed.mutation_flags.db_write_performed, false);
  assert.equal(parsed.mutation_flags.provider_mutation_performed, false);
  assert.ok(parsed.receipt_count >= 1);
  assert.equal(existsSync(parsed.latest_receipt_path), true);
  assert.equal(existsSync(parsed.latest_summary_path), true);

  const summary = JSON.parse(readFileSync(parsed.latest_summary_path, "utf8")) as {
    schema_version: string;
    child_receipt_ids: string[];
    blockers_by_domain: Record<string, string[]>;
    mutation_flags: { db_write_performed: boolean };
    secret_redaction_applied: boolean;
  };
  assert.equal(summary.schema_version, "callscore_operating_summary.v1");
  assert.equal(summary.child_receipt_ids.length >= 3, true);
  assert.deepEqual(summary.blockers_by_domain, {});
  assert.equal(summary.mutation_flags.db_write_performed, false);
  assert.equal(summary.secret_redaction_applied, true);

  const receipt = JSON.parse(readFileSync(parsed.latest_receipt_path, "utf8")) as {
    goal: string;
    node_results: Array<{ node_id: string; detail: Record<string, unknown>; mutation_flags: Record<string, boolean> }>;
  };
  const dataNode = receipt.node_results.find((node) => node.node_id === "data_goal_loop");
  assert.equal(receipt.goal, "refresh_data");
  assert.equal(dataNode?.detail.data_pipeline_stage_count, 18);
  assert.equal(dataNode?.detail.executed, false);
  assert.equal(dataNode?.mutation_flags.db_write_performed, false);
});
