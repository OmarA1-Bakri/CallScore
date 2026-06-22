import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildHeartbeatDecisionArtifacts, extractAgents, registryStatusForChannel, runAgentHeartbeat } from "../src/scripts/callscore-agent-heartbeat";
import { AutonomyReceiptSchema, ChannelHeadDecisionSchema } from "../src/lib/autonomy/contracts";

const now = "2026-06-21T12:00:00.000Z";
const hash = `sha256:${"b".repeat(64)}`;

const soulsYaml = `channel_heads:
  - agent_id: callscore-x-linkedin-growth-head
    class: marketing_channel_head
    owner_surface: owned_social
    cadence: daily_plus_event_driven
`;

function createHeartbeatFixture(t: { after(callback: () => void): void }): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "callscore-heartbeat-dry-run-"));
  t.after(() => rmSync(repoRoot, { force: true, recursive: true }));
  mkdirSync(join(repoRoot, "docs/ops"), { recursive: true });
  writeFileSync(join(repoRoot, "docs/ops/callscore-channel-head-souls.yaml"), soulsYaml, "utf8");
  writeFileSync(
    join(repoRoot, "docs/ops/callscore-gtm-agent-registry.json"),
    `${JSON.stringify({ entries: [{ channel: "X / Twitter", current_status: "ready_public_owned" }] })}\n`,
    "utf8",
  );
  return repoRoot;
}

test("heartbeat helper extracts channel-head souls for decision inputs", () => {
  const agents = extractAgents(soulsYaml);

  assert.equal(agents.length, 1);
  assert.equal(agents[0]?.agentId, "callscore-x-linkedin-growth-head");
  assert.equal(agents[0]?.className, "marketing_channel_head");
  assert.equal(agents[0]?.ownerSurface, "owned_social");
});

test("heartbeat helper reads lane status from the GTM registry instead of hardcoding readiness", () => {
  const registry = JSON.stringify({
    entries: [
      { channel: "X / Twitter", current_status: "ready_public_owned" },
      { channel: "Gmail / email", current_status: "gated" },
      { channel: "Discord", current_status: "ready_public_owned" },
    ],
  });

  assert.equal(registryStatusForChannel(registry, "owned_social"), "ready_public_owned");
  assert.equal(registryStatusForChannel(registry, "email_partnership_drafts"), "gated");
  assert.equal(registryStatusForChannel(registry, "unknown"), "gated");
});

test("heartbeat helper builds schema-valid bounded decision artifacts without external mutation", () => {
  const [agent] = extractAgents(soulsYaml);
  assert.ok(agent);

  const artifacts = buildHeartbeatDecisionArtifacts({
    agent,
    nowIso: now,
    nextWakeAt: "2026-06-21T13:00:00.000Z",
    channelId: "owned_social",
    taskId: "task-1",
    taskType: "owned_social_draft_and_monitor",
    policyVersion: "policy.v1",
    soulVersion: "souls.v1",
    soulHash: hash,
    payloadHash: hash,
    registryStatus: "ready_public_owned",
    receiptPath: ".tmp/workflow-receipts/agent_heartbeat/decision.json",
  });

  assert.equal(artifacts.input.riskClass, "safe_owned_public");
  assert.equal(artifacts.decision.decision, "escalate_non_founder_review");
  assert.equal(artifacts.receipt.receipt_type, "decision");
  assert.equal(artifacts.receipt.external_mutation_performed, false);
  assert.equal(artifacts.receipt.provider_mutation_performed, false);
  assert.equal(artifacts.receipt.whop_mutation_performed, false);
  assert.equal(artifacts.receipt.production_mutation_performed, false);
  assert.equal(artifacts.receipt.send_or_outreach_performed, false);
  assert.equal(artifacts.receipt.artifact_path, ".tmp/workflow-receipts/agent_heartbeat/decision.json");
  assert.equal(ChannelHeadDecisionSchema.parse(artifacts.decision).decision, "escalate_non_founder_review");
  assert.equal(AutonomyReceiptSchema.parse(artifacts.receipt).status, "review");
});

test("heartbeat dry-run exercises decisions and task proposals without DB writes", async (t) => {
  const repoRoot = createHeartbeatFixture(t);

  let dbWriteCount = 0;
  const result = await runAgentHeartbeat({
    argv: ["--dry-run"],
    now: new Date(now),
    repoRoot,
    queryExecutor: async () => {
      dbWriteCount += 1;
      throw new Error("dry-run must not reach the DB executor");
    },
    stdout: () => undefined,
  });

  assert.equal(dbWriteCount, 0);
  assert.equal(result.dry_run, true);
  assert.equal(result.db_write_performed, false);
  assert.equal(result.agent_count, 1);
  assert.equal(result.heartbeat_count, 1);
  assert.equal(result.proposed_task_count, 1);
  assert.equal(result.task_count, 1);

  const receipt = JSON.parse(readFileSync(result.receipt, "utf8")) as {
    dry_run: boolean;
    db_write_performed: boolean;
    external_mutation_performed: boolean;
    provider_mutation_performed: boolean;
    whop_mutation_performed: boolean;
    production_mutation_performed: boolean;
    send_or_outreach_performed: boolean;
    proposed_tasks: readonly unknown[];
    decision_receipt_paths: readonly string[];
  };
  assert.equal(receipt.dry_run, true);
  assert.equal(receipt.db_write_performed, false);
  assert.equal(receipt.external_mutation_performed, false);
  assert.equal(receipt.provider_mutation_performed, false);
  assert.equal(receipt.whop_mutation_performed, false);
  assert.equal(receipt.production_mutation_performed, false);
  assert.equal(receipt.send_or_outreach_performed, false);
  assert.equal(receipt.proposed_tasks.length, 1);
  assert.equal(receipt.decision_receipt_paths.length, 1);

  const decisionReceipt = JSON.parse(readFileSync(receipt.decision_receipt_paths[0]!, "utf8")) as {
    decision: unknown;
    receipt: unknown;
    external_mutation_performed: boolean;
    provider_mutation_performed: boolean;
    whop_mutation_performed: boolean;
    production_mutation_performed: boolean;
    send_or_outreach_performed: boolean;
  };
  assert.equal(ChannelHeadDecisionSchema.parse(decisionReceipt.decision).decision, "escalate_non_founder_review");
  const parsedDecisionReceipt = AutonomyReceiptSchema.parse(decisionReceipt.receipt);
  assert.equal(parsedDecisionReceipt.external_mutation_performed, false);
  assert.equal(parsedDecisionReceipt.provider_mutation_performed, false);
  assert.equal(parsedDecisionReceipt.whop_mutation_performed, false);
  assert.equal(parsedDecisionReceipt.production_mutation_performed, false);
  assert.equal(parsedDecisionReceipt.send_or_outreach_performed, false);
  assert.equal(decisionReceipt.external_mutation_performed, false);
  assert.equal(decisionReceipt.provider_mutation_performed, false);
  assert.equal(decisionReceipt.whop_mutation_performed, false);
  assert.equal(decisionReceipt.production_mutation_performed, false);
  assert.equal(decisionReceipt.send_or_outreach_performed, false);
});

test("heartbeat no-db-write alias is a zero-DB dry-run", async (t) => {
  const repoRoot = createHeartbeatFixture(t);
  let dbWriteCount = 0;

  const result = await runAgentHeartbeat({
    argv: ["--no-db-write"],
    now: new Date(now),
    repoRoot,
    queryExecutor: async () => {
      dbWriteCount += 1;
      throw new Error("--no-db-write must not reach the DB executor");
    },
    stdout: () => undefined,
  });

  assert.equal(dbWriteCount, 0);
  assert.equal(result.dry_run, true);
  assert.equal(result.db_write_performed, false);
  assert.equal(result.proposed_task_count, 1);
});

test("heartbeat help prints usage and performs zero DB writes", async (t) => {
  const repoRoot = createHeartbeatFixture(t);
  const stdout: string[] = [];
  let dbWriteCount = 0;

  const result = await runAgentHeartbeat({
    argv: ["--help"],
    now: new Date(now),
    repoRoot,
    queryExecutor: async () => {
      dbWriteCount += 1;
      throw new Error("--help must not reach the DB executor");
    },
    stdout: (line) => stdout.push(line),
  });

  assert.equal(dbWriteCount, 0);
  assert.equal(result.dry_run, true);
  assert.equal(result.db_write_performed, false);
  assert.equal(result.agent_count, 0);
  assert.equal(result.heartbeat_count, 0);
  assert.equal(result.task_count, 0);
  assert.equal(result.receipt, "");
  assert.match(stdout.join("\n"), /Usage: node --import tsx src\/scripts\/callscore-agent-heartbeat\.ts/);
  assert.match(stdout.join("\n"), /--dry-run/);
  assert.match(stdout.join("\n"), /--no-db-write/);
});

test("heartbeat unknown flags fail closed before DB writes", async (t) => {
  const repoRoot = createHeartbeatFixture(t);
  let dbWriteCount = 0;

  await assert.rejects(
    runAgentHeartbeat({
      argv: ["--definitely-unknown"],
      now: new Date(now),
      repoRoot,
      queryExecutor: async () => {
        dbWriteCount += 1;
        throw new Error("unknown flags must not reach the DB executor");
      },
      stdout: () => undefined,
    }),
    /Unknown argument: --definitely-unknown/,
  );

  assert.equal(dbWriteCount, 0);
});

test("heartbeat normal mode preserves DB write surfaces", async (t) => {
  const repoRoot = createHeartbeatFixture(t);
  const sqls: string[] = [];

  const result = await runAgentHeartbeat({
    argv: [],
    now: new Date(now),
    repoRoot,
    queryExecutor: async <T,>(sql: string): Promise<T[]> => {
      sqls.push(sql);
      if (sql.includes("WITH existing_open")) {
        return [{ id: "task-1", source: "inserted" }] as T[];
      }
      return [] as T[];
    },
    stdout: () => undefined,
  });

  assert.equal(result.dry_run, false);
  assert.equal(result.db_write_performed, true);
  assert.equal(result.task_count, 1);
  assert.equal(result.new_task_count, 1);
  assert.equal(result.proposed_task_count, 0);
  assert.equal(sqls.length, 4);
  assert.match(sqls[0]!, /INSERT INTO agent_instances/);
  assert.match(sqls[1]!, /INSERT INTO agent_heartbeats/);
  assert.match(sqls[2]!, /WITH existing_open/);
  assert.match(sqls[3]!, /INSERT INTO autonomy_events/);

  const receipt = JSON.parse(readFileSync(result.receipt, "utf8")) as { dry_run: boolean; db_write_performed: boolean };
  assert.equal(receipt.dry_run, false);
  assert.equal(receipt.db_write_performed, true);
});

