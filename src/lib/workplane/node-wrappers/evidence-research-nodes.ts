import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { DEFAULT_MUTATION_FLAGS, type OperatingNodePatch, type OperatingNodeResult } from "../operating-node-utils";
import { buildInitialOperatingState } from "../callscore-operating-graph";

function writeFixture(dir: string, name: string, data: Record<string, unknown>): string {
  const path = join(dir, `${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ schema_version: `callscore_${name}_fixture.v1`, ...data }, null, 2) + "\n", { mode: 0o600 });
  return path;
}

export function createEvidenceResearchGoalNode(options: { artifactDir: string }) {
  return async (
    _state?: ReturnType<typeof buildInitialOperatingState>,
    _config?: RunnableConfig,
  ): Promise<OperatingNodePatch> => {
    const nodeResults: OperatingNodeResult[] = [
      {
        node_id: "transition_snapshot_report", domain: "evidence_research", status: "ok", receipt_id: "ev-trs",
        artifact_path: writeFixture(options.artifactDir, "transition-snapshot", { evidence_hash: "sha256:fixture-transition" }),
        blockers: [], warnings: [],
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
        mutation_flags: { ...DEFAULT_MUTATION_FLAGS }, summary: "Transition snapshot fixture.", detail: {},
      },
      {
        node_id: "storm_evidence_pack", domain: "evidence_research", status: "ok", receipt_id: "ev-storm",
        artifact_path: writeFixture(options.artifactDir, "storm-pack", { evidence_hash: "sha256:fixture-storm", schema_version: "callscore_storm_evidence_fixture.v1" }),
        blockers: [], warnings: [],
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
        mutation_flags: { ...DEFAULT_MUTATION_FLAGS }, summary: "STORM evidence pack fixture.", detail: { evidence_hash: "sha256:fixture" },
      },
      {
        node_id: "ml_verifier_quality_gate", domain: "evidence_research", status: "ok", receipt_id: "ev-mlq",
        artifact_path: writeFixture(options.artifactDir, "ml-quality", { audit_only: true }),
        blockers: [], warnings: [],
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
        mutation_flags: { ...DEFAULT_MUTATION_FLAGS, db_write_performed: false }, summary: "ML verifier quality gate.", detail: { audit_only: true },
      },
      {
        node_id: "markov_trajectory_report", domain: "evidence_research", status: "ok", receipt_id: "ev-markov",
        artifact_path: writeFixture(options.artifactDir, "markov-report", { publication_ready: false }),
        blockers: [], warnings: ["markov_publication_gated"],
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
        mutation_flags: { ...DEFAULT_MUTATION_FLAGS }, summary: "Markov trajectory report.", detail: { publication_ready: false },
      },
      {
        node_id: "workflow_runtime_bridge", domain: "evidence_research", status: "ok", receipt_id: "ev-wrb",
        artifact_path: writeFixture(options.artifactDir, "bridge-report", { workflow_status: "completed" }),
        blockers: [], warnings: [],
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
        mutation_flags: { ...DEFAULT_MUTATION_FLAGS }, summary: "WorkflowRuntime bridge fixture.", detail: {},
      },
    ];

    return {
      node_results: nodeResults,
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
    };
  };
}

export function createStormEvidencePackNode(_options: { artifactDir: string }) {
  return async (
    _state?: ReturnType<typeof buildInitialOperatingState>,
    _config?: RunnableConfig,
  ): Promise<OperatingNodePatch> => {
    return {
      node_results: [{
        node_id: "storm_evidence_pack", domain: "evidence_research", status: "blocked", receipt_id: "ev-storm-block",
        artifact_path: null, blockers: ["transition_artifact_missing"], warnings: [],
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
        mutation_flags: { ...DEFAULT_MUTATION_FLAGS }, summary: "STORM evidence blocked: transition missing.", detail: { audit_only: true },
      }],
      blockers: ["transition_artifact_missing"],
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
    };
  };
}
