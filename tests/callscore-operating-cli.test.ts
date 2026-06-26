import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildRunnableConfig } from "../src/scripts/callscore-operating-goal";
function writeFakeScout(root: string): { command: string; markerPath: string; receiptPath: string } {
  const command = join(root, "fake-scout.sh");
  const markerPath = join(root, "fake-scout-invoked.txt");
  const receiptPath = join(root, "fake-scout-receipt.json");
  writeFileSync(command, `#!/usr/bin/env bash
set -euo pipefail
echo invoked > ${JSON.stringify(markerPath)}
cat > ${JSON.stringify(receiptPath)} <<'JSON'
{
  "receipt_id": "creator-growth-scout-cli-test-receipt",
  "created_at": "2026-06-25T12:00:00.000Z",
  "external_mutation_performed": false,
  "provider_spend_performed": false,
  "queries": {
    "hidden_gems_count": 4,
    "recent_promising_count": 5,
    "missing_coverage_count": 6
  },
  "payload_hash": "sha256:test-cli-growth-scout"
}
JSON
echo "# CallScore Creator Growth Scout"
echo "Receipt: ${receiptPath}"
`, { mode: 0o700 });
  chmodSync(command, 0o700);
  return { command, markerPath, receiptPath };
}

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return path;
}

test("callscore-operating-goal CLI maps refresh_data producer flags into runnable config", () => {
  const root = mkdtempSync(join(tmpdir(), "operating-refresh-data-cli-test-"));
  const producerCommand = join(root, "fake-producer.sh");
  const config = buildRunnableConfig([
    "--goal",
    "refresh_data",
    "--mode",
    "bounded_write",
    "--refresh-data-producer",
    "candles",
    "--refresh-data-command",
    producerCommand,
    "--refresh-data-timeout-ms",
    "12345",
  ], "refresh_data");

  assert.equal(config.refreshDataProducer, "candles");
  assert.equal(config.refreshDataCommand, producerCommand);
  assert.equal(config.refreshDataTimeoutMs, 12345);
});

test("callscore-operating-goal CLI maps revenue_now social packet into runnable config", () => {
  const root = mkdtempSync(join(tmpdir(), "operating-revenue-social-cli-test-"));
  const packetPath = writeJson(join(root, "social-packet.json"), {
    ok: true,
    schema: "callscore.genuine_social_packet.v3",
    copy_rule: "ZERO COPY IN PACKET. Specialist agent writes from scratch using facts as evidence.",
    facts: { raw_calls: 123, ranked_creators: 45 },
    visual_asset: { required: true, brand_gate: { ok: true } },
    policy_checks: { no_mutation: true },
  });
  const config = buildRunnableConfig([
    "--goal",
    "revenue_now",
    "--draft-only",
    "--social-packet-json",
    packetPath,
  ], "revenue_now");

  assert.equal(config.socialPacketPath, packetPath);
  assert.equal((config.socialPacket as { schema: string }).schema, "callscore.genuine_social_packet.v3");
  assert.equal((config.socialPacket as { facts: { raw_calls: number } }).facts.raw_calls, 123);
});

test("callscore-operating-goal CLI maps produce_video scheduler flags into runnable config", () => {
  const root = mkdtempSync(join(tmpdir(), "operating-video-scheduler-cli-test-"));
  const artifactRoot = join(root, "artifacts");
  const queueRoot = join(root, "queue");
  const config = buildRunnableConfig([
    "--goal",
    "produce_video",
    "--read-live",
    "--video-scheduler-mode",
    "enqueue_scheduled",
    "--video-artifact-root",
    artifactRoot,
    "--video-queue-root",
    queueRoot,
    "--video-scheduler-now",
    "2026-06-24T08:00:00.000Z",
  ], "produce_video");

  assert.equal(config.videoSchedulerMode, "enqueue_scheduled");
  assert.equal(config.videoArtifactRoot, artifactRoot);
  assert.equal(config.videoQueueRoot, queueRoot);
  assert.equal(config.videoSchedulerNow, "2026-06-24T08:00:00.000Z");
});

test("callscore-operating-goal CLI evidence_research read-live accepts gate context files and invokes scout", () => {
  const root = mkdtempSync(join(tmpdir(), "operating-evidence-cli-test-"));
  const fake = writeFakeScout(root);
  const workplanePath = writeJson(join(root, "workplane.json"), { status: "OK", automation_readiness: "CONTROLLED_FULL", autonomous_revenue_status: "YES" });
  const heartbeatPath = writeJson(join(root, "heartbeat.json"), {
    heartbeat_id: "cli-evidence-heartbeat",
    fresh: true,
    lease_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });

  const stdout = execFileSync(process.execPath, [
    "--import",
    "tsx",
    "src/scripts/callscore-operating-goal.ts",
    "--goal",
    "evidence_research",
    "--read-live",
    "--max-items",
    "1",
    "--workplane-status-json",
    workplanePath,
    "--heartbeat-json",
    heartbeatPath,
    "--creator-growth-scout-command",
    fake.command,
  ], { cwd: "/opt/crypto-tuber-ranked", encoding: "utf8" });

  const parsed = JSON.parse(stdout) as { status: string; blockers: string[]; latest_receipt_path: string };
  assert.equal(parsed.status, "ok");
  assert.deepEqual(parsed.blockers, []);
  assert.equal(existsSync(fake.markerPath), true);
  assert.equal(existsSync(parsed.latest_receipt_path), true);
  const receipt = JSON.parse(readFileSync(parsed.latest_receipt_path, "utf8")) as {
    node_results: Array<{ node_id: string; receipt_id: string; detail: Record<string, unknown> }>;
  };
  const evidence = receipt.node_results.find((node) => node.node_id === "evidence_goal_loop");
  assert.equal(evidence?.receipt_id, "creator-growth-scout-cli-test-receipt");
  assert.equal(evidence?.detail.invoked_implementation, "callscore-creator-growth-scout");
  assert.equal(evidence?.detail.hidden_gems_count, 4);
});

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
