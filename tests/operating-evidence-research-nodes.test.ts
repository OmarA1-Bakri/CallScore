import * as assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
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
