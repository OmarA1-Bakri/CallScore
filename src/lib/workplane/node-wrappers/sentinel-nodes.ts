import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { DEFAULT_MUTATION_FLAGS, type OperatingNodeResult, type OperatingGraphState, type OperatingNodePatch } from "../operating-node-utils";
import { buildInitialOperatingState } from "../callscore-operating-graph";

const SENTINEL_ARTIFACT_DIR = ".tmp/workflow-receipts/callscore_operating_graph/sentinel";

function writeSentinelArtifact(name: string, value: unknown): string {
  const path = join(SENTINEL_ARTIFACT_DIR, `${name}-${Date.now()}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export async function sentinelMonitorGoalNode(
  state: OperatingGraphState | ReturnType<typeof buildInitialOperatingState>,
  _config: RunnableConfig,
): Promise<OperatingNodePatch> {
  const monitoringArtifact = {
    schema_version: "callscore_monitoring_goal_loop_fixture.v1",
    sentinel_schema_version: "callscore_sentinel_run_receipt.v1",
    checks: ["fresh_call_sentinel", "creator_discovery_sentinel", "freshness_check", "cmo_response_monitor", "gemma_capacity_preflight"],
    mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
  };
  const monitoringArtifactPath = writeSentinelArtifact("monitoring-goal-loop", monitoringArtifact);
  const nodeResults: OperatingNodeResult[] = [
    {
      node_id: "fresh_call_sentinel", domain: "monitoring", status: "ok", receipt_id: "sentinel-fc",
      artifact_path: null, blockers: [], warnings: [],
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
      summary: "Fresh call sentinel passed.", detail: { discovered_count: 3, skipped_duplicate_count: 1, skipped_cooldown_count: 1, recommended_count: 1, enqueued_count: 0 },
    },
    {
      node_id: "creator_discovery_sentinel", domain: "monitoring", status: "ok", receipt_id: "sentinel-cd",
      artifact_path: null, blockers: [], warnings: [],
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
      summary: "Creator discovery sentinel passed.", detail: {},
    },
    {
      node_id: "freshness_check", domain: "monitoring", status: "ok", receipt_id: "sentinel-fr",
      artifact_path: null, blockers: [], warnings: [],
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
      summary: "Freshness check passed.", detail: {},
    },
    {
      node_id: "cmo_response_monitor", domain: "monitoring", status: "ok", receipt_id: "sentinel-crm",
      artifact_path: null, blockers: [], warnings: [],
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
      summary: "CMO response monitor passed.", detail: {},
    },
    {
      node_id: "gemma_capacity_preflight", domain: "monitoring", status: "blocked", receipt_id: "sentinel-gemma",
      artifact_path: null, blockers: ["gemma_capacity_fixture_blocked"], warnings: [],
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
      summary: "Gemma capacity preflight blocked.", detail: {},
    },
    {
      node_id: "monitoring_goal_loop", domain: "monitoring", status: "ok", receipt_id: "sentinel-loop",
      artifact_path: monitoringArtifactPath, blockers: [], warnings: [],
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(), duration_ms: 1,
      mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
      summary: "Monitoring goal loop wrapper.",
      detail: { sentinel_schema_version: monitoringArtifact.sentinel_schema_version },
    },
  ];

  return {
    node_results: state.node_results.length > 0 ? [...state.node_results, ...nodeResults] : nodeResults,
    mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
  };
}
