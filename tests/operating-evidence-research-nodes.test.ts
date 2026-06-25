import * as assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createCallscoreOperatingGraph, buildInitialOperatingState } from "../src/lib/workplane/callscore-operating-graph";
import { normalizeOperatingGoalConfig } from "../src/lib/workplane/operating-goals";
import { DEFAULT_MUTATION_FLAGS, type OperatingGraphState } from "../src/lib/workplane/operating-node-utils";
import {
  createEvidenceResearchGoalNode,
  createStormEvidencePackNode,
} from "../src/lib/workplane/node-wrappers/evidence-research-nodes";

function emptyEvidenceState(): OperatingGraphState {
  return {
    config: normalizeOperatingGoalConfig({ goal: "evidence_research", testFixtures: true }),
    node_results: [],
    blockers: [],
    warnings: [],
    errors: [],
    mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
    receipts: [],
    artifacts: {},
  };
}

function liveGateContext() {
  return {
    workplaneStatus: { status: "OK", automation_readiness: "CONTROLLED_FULL", autonomous_revenue_status: "YES" },
    heartbeat: {
      heartbeat_id: "evidence-test-heartbeat",
      fresh: true,
      lease_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
  };
}

function writeFakeCreatorGrowthScout(root: string): { command: string; markerPath: string; receiptPath: string } {
  const command = join(root, "fake-creator-growth-scout.sh");
  const markerPath = join(root, "invoked.txt");
  const receiptPath = join(root, "creator-growth-scout-receipt.json");
  writeFileSync(command, `#!/usr/bin/env bash
set -euo pipefail
echo invoked > ${JSON.stringify(markerPath)}
cat > ${JSON.stringify(receiptPath)} <<'JSON'
{
  "receipt_id": "creator-growth-scout-test-receipt",
  "created_at": "2026-06-25T12:00:00.000Z",
  "external_mutation_performed": false,
  "provider_spend_performed": false,
  "queries": {
    "hidden_gems_count": 1,
    "recent_promising_count": 2,
    "missing_coverage_count": 3
  },
  "payload_hash": "sha256:test-growth-scout"
}
JSON
echo "# CallScore Creator Growth Scout"
echo "Receipt: ${receiptPath}"
`, { mode: 0o700 });
  chmodSync(command, 0o700);
  return { command, markerPath, receiptPath };
}

test("evidence_research read-live invokes creator growth scout through the operating graph", async () => {
  const root = mkdtempSync(join(tmpdir(), "operating-evidence-live-test-"));
  const fake = writeFakeCreatorGrowthScout(root);
  const graph = createCallscoreOperatingGraph();

  const result = await graph.invoke(
    buildInitialOperatingState({ goal: "evidence_research", mode: "read_live", dryRun: false, maxItems: 1 }),
    {
      configurable: {
        thread_id: "operating-evidence-live-test",
        ...liveGateContext(),
        creatorGrowthScoutCommand: fake.command,
      },
    },
  );

  assert.equal(existsSync(fake.markerPath), true);
  const evidenceNode = result.node_results.find((item) => item.node_id === "evidence_goal_loop");
  assert.equal(evidenceNode?.status, "ok");
  assert.equal(evidenceNode?.receipt_id, "creator-growth-scout-test-receipt");
  assert.equal(evidenceNode?.detail.invoked_implementation, "callscore-creator-growth-scout");
  assert.equal(evidenceNode?.detail.hidden_gems_count, 1);
  assert.equal(evidenceNode?.detail.recent_promising_count, 2);
  assert.equal(evidenceNode?.detail.missing_coverage_count, 3);
  assert.equal(evidenceNode?.artifact_path, fake.receiptPath);
  assert.equal(result.node_results.some((item) => item.receipt_id.startsWith("op-monitor-")), false);
  assert.equal(result.node_results.find((item) => item.node_id === "boot_context")?.receipt_id.startsWith("op-evidence_research-"), true);
  assert.equal(result.node_results.find((item) => item.node_id === "hard_gate_preflight")?.receipt_id.startsWith("op-evidence_research-"), true);
  assert.equal(result.mutation_flags.external_mutation_performed, false);
  assert.equal(result.mutation_flags.db_write_performed, false);
});

test("evidence research goal wraps transition, STORM, ML quality, Markov, and WorkflowRuntime bridge with fixture artifacts", async () => {
  const artifactDir = mkdtempSync(join(tmpdir(), "operating-evidence-test-"));
  const node = createEvidenceResearchGoalNode({ artifactDir });

  const patch = await node(emptyEvidenceState(), { configurable: { thread_id: "evidence-fixture" } });
  const results = patch.node_results ?? [];
  const byId = new Map(results.map((result) => [result.node_id, result]));

  for (const nodeId of [
    "transition_snapshot_report",
    "storm_evidence_pack",
    "ml_verifier_quality_gate",
    "markov_trajectory_report",
    "workflow_runtime_bridge",
  ]) {
    const result = byId.get(nodeId);
    assert.equal(Boolean(result), true, `${nodeId} result missing`);
    assert.equal(result?.status, "ok", `${nodeId} should be ok in fixture mode`);
    assert.ok(result?.artifact_path, `${nodeId} should write an artifact path`);
    assert.equal(existsSync(result!.artifact_path!), true, `${nodeId} artifact should exist`);
  }

  assert.equal(byId.get("ml_verifier_quality_gate")?.detail.audit_only, true);
  assert.equal(byId.get("ml_verifier_quality_gate")?.mutation_flags.db_write_performed, false);
  assert.equal(byId.get("markov_trajectory_report")?.detail.publication_ready, false);
  assert.equal(byId.get("markov_trajectory_report")?.warnings.includes("markov_publication_gated"), true);
  assert.equal(patch.mutation_flags?.external_mutation_performed, false);
  assert.equal(patch.mutation_flags?.db_write_performed, false);
});

test("STORM evidence node blocks claim-bearing output when transition evidence is missing", async () => {
  const node = createStormEvidencePackNode({ artifactDir: mkdtempSync(join(tmpdir(), "operating-storm-test-")) });
  const patch = await node(emptyEvidenceState(), { configurable: { thread_id: "storm-missing-transition" } });
  const result = patch.node_results?.[0];

  assert.equal(result?.status, "blocked");
  assert.equal(result?.blockers.includes("transition_artifact_missing"), true);
  assert.equal(result?.artifact_path, null);
  assert.equal(patch.mutation_flags?.external_mutation_performed, false);
});

test("operating graph routes evidence_research goal to real evidence wrappers", async () => {
  const artifactDir = mkdtempSync(join(tmpdir(), "operating-evidence-graph-test-"));
  const graph = createCallscoreOperatingGraph({ evidenceResearch: { artifactDir } });
  const result = await graph.invoke(
    buildInitialOperatingState({ goal: "evidence_research", testFixtures: true }),
    { configurable: { thread_id: "operating-evidence-graph" } },
  );

  const evidenceNodeIds = result.node_results.map((item) => item.node_id);
  assert.equal(evidenceNodeIds.includes("transition_snapshot_report"), true);
  assert.equal(evidenceNodeIds.includes("storm_evidence_pack"), true);
  assert.equal(evidenceNodeIds.includes("ml_verifier_quality_gate"), true);
  assert.equal(evidenceNodeIds.includes("markov_trajectory_report"), true);
  assert.equal(evidenceNodeIds.includes("workflow_runtime_bridge"), true);
  assert.equal(result.mutation_flags.public_publish_performed, false);

  const storm = result.node_results.find((item) => item.node_id === "storm_evidence_pack");
  const stormArtifact = JSON.parse(readFileSync(storm!.artifact_path!, "utf8")) as Record<string, unknown>;
  assert.equal(stormArtifact.schema_version, "callscore_storm_evidence_fixture.v1");
});
