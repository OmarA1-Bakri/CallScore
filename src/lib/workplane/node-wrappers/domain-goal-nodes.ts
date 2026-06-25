import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { buildDataPipelineStageCommands, parseDataPipelineArgs } from "../../../scripts/run-data-pipeline";
import { PipelineDispatchJobTypeSchema, DEFAULT_OPERATING_MUTATION_FLAGS, OperatingGraphStateSchema, type OperatingGraphState } from "../operating-graph-schemas";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { redactCommandOutput } from "../operating-receipts";
import { cmoRevenueGoalLoopNode } from "./cmo-revenue-nodes";
import { sentinelMonitorGoalNode } from "./sentinel-nodes";
import { trustReviewGoalLoopNode } from "./trust-review-nodes";
export { videoGoalLoopNode } from "./video-pipeline-nodes";

const DOMAIN_ARTIFACT_DIR = ".tmp/workflow-receipts/callscore_operating_graph/domain";

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function writeDomainArtifact(nodeId: string, value: unknown): string {
  const path = join(DOMAIN_ARTIFACT_DIR, `${safePart(nodeId)}-${Date.now()}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return path;
}

function configurableObject(config: RunnableConfig): Record<string, unknown> {
  const value = config.configurable;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function countCommands(commandsByStage: Record<string, readonly (readonly string[])[]>): number {
  return Object.values(commandsByStage).reduce((sum, commands) => sum + commands.length, 0);
}

function sanitizeCommand(command: readonly string[]): readonly string[] {
  return command.map((part) => redactCommandOutput(part));
}

export const revenueGoalLoopNode = cmoRevenueGoalLoopNode;

export const dataGoalLoopNode = wrapDirectFunctionNode({
  nodeId: "data_goal_loop",
  domain: "data",
  run: async ({ state }) => {
    const args = parseDataPipelineArgs([
      "--dry-run",
      "--limit-creators", "1",
      "--limit-videos", String(Math.max(1, state.config.maxItems)),
      "--limit-llm-videos", String(Math.max(1, state.config.maxItems)),
      "--limit-price-matches", String(Math.max(1, state.config.maxItems)),
      "--limit-promotions", String(Math.max(1, state.config.maxItems)),
      "--audit-dir", `.tmp/callscore-operating-data/${safePart(state.config.goal)}`,
    ]);
    const commandsByStage = buildDataPipelineStageCommands(args);
    const stages = Object.keys(commandsByStage);
    const artifact = {
      schema_version: "callscore_data_pipeline_node_plan.v1",
      created_at: nowIso(),
      dry_run: true,
      stage_count: stages.length,
      command_count: countCommands(commandsByStage),
      stages,
      command_preview: Object.fromEntries(
        Object.entries(commandsByStage).map(([stage, commands]) => [stage, commands.map(sanitizeCommand)]),
      ),
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
    const artifactPath = writeDomainArtifact("data_goal_loop", artifact);
    return {
      status: "ok",
      summary: `Planned ${stages.length} data pipeline stages as dry-run LangGraph nodes.`,
      artifact_path: artifactPath,
      detail: {
        schema_version: artifact.schema_version,
        data_pipeline_stage_count: stages.length,
        command_count: artifact.command_count,
        stages,
        dry_run_enforced: true,
        executed: false,
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
  },
});

export const workerDispatchGoalLoopNode = wrapDirectFunctionNode({
  nodeId: "worker_dispatch_goal_loop",
  domain: "worker_dispatch",
  run: async ({ state, config }) => {
    const cfg = config?.configurable;
    const c = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg as Record<string, unknown> : {};
    const workerId = c.workerId as string | undefined ?? "default-worker";
    const fixture = c.workerDispatchFixture as Record<string, unknown> | undefined;

    if (state.config.testFixtures && fixture) {
      const job = fixture.pipelineJob as Record<string, unknown> | undefined;
      return {
        status: "ok",
        summary: "Pipeline job completed via graph fixture.",
        detail: {
          dispatch_kind: "pipeline_job",
          job_id: job?.id ?? 101,
          job_type: job?.type ?? "hermes_smoke_test",
          pipeline_job_completed: true,
        },
        mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
      };
    }

    const supportedJobTypes = PipelineDispatchJobTypeSchema.options;
    const artifact = {
      schema_version: "callscore_worker_dispatch_node_plan.v1",
      created_at: nowIso(),
      mode: state.config.mode,
      dry_run: state.config.dryRun,
      bounded_once: true,
      supported_job_types: supportedJobTypes,
      claim_loop_enabled: false,
      note: "Graph node represents one bounded dispatch iteration; the long-running poll loop remains outside node execution.",
    };
    const artifactPath = writeDomainArtifact("worker_dispatch_goal_loop", artifact);
    return {
      status: "ok",
      summary: "Prepared bounded worker dispatch wrapper without claiming jobs.",
      artifact_path: artifactPath,
      detail: {
        schema_version: artifact.schema_version,
        supported_job_type_count: supportedJobTypes.length,
        bounded_once: true,
        claim_loop_enabled: false,
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
  },
});

export const monitoringGoalLoopNode = (async (state: OperatingGraphState, config?: RunnableConfig) => {
  const safeState = OperatingGraphStateSchema.parse(state);
  return sentinelMonitorGoalNode(safeState, config as RunnableConfig) as any;
}) as any;

export const trustGoalLoopNode = async (state: OperatingGraphState, config?: RunnableConfig) => {
  const cfg = config?.configurable;
  const c = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg as Record<string, unknown> : {};
  if (state.config.testFixtures && !state.artifacts.trust_decision_input && typeof c.nonFounderReviewRoot !== "string") {
    const fixtureState = OperatingGraphStateSchema.parse({
      ...state,
      artifacts: {
        ...state.artifacts,
        trust_decision_input: {
          entity_type: "call",
          entity_id: "call-operating-trust-fixture",
          confidence: 0.66,
          evidence_refs: ["artifact:operating-trust-fixture"],
          transcript_available: true,
          evidence_supported: true,
          public_claim_supported: true,
          supported_market: true,
          creator_owned: true,
          audit_only: false,
          source: "operating_graph_fixture",
          now: "2026-06-25T12:00:00.000Z",
        },
      },
    });
    return trustReviewGoalLoopNode(fixtureState, config as RunnableConfig);
  }
  return trustReviewGoalLoopNode(state, config as RunnableConfig);
};

export const alertGoalLoopNode = wrapDirectFunctionNode({
  nodeId: "alert_goal_loop",
  domain: "alerts",
  run: async ({ state }) => {
    const artifact = {
      schema_version: "callscore_alert_distribution_node_plan.v1",
      created_at: nowIso(),
      scan_wrapper: "runAlertScan",
      send_wrapper: "runAlertSend",
      dry_run: state.config.dryRun,
      send_disabled_in_graph_plan: true,
      max_items: state.config.maxItems,
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
    const artifactPath = writeDomainArtifact("alert_goal_loop", artifact);
    return {
      status: "ok",
      summary: "Alert distribution wrappers registered; send execution remains gate-controlled.",
      artifact_path: artifactPath,
      detail: {
        schema_version: artifact.schema_version,
        scan_wrapper: artifact.scan_wrapper,
        send_wrapper: artifact.send_wrapper,
        send_disabled_in_graph_plan: true,
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
  },
});

export const evidenceGoalLoopNode = wrapDirectFunctionNode({
  nodeId: "evidence_goal_loop",
  domain: "evidence_research",
  run: async ({ state }) => {
    const artifact = {
      schema_version: "callscore_evidence_research_node_plan.v1",
      created_at: nowIso(),
      wrappers: [
        "pipeline_guard_audit",
        "transition_schema",
        "markov_schema",
        "workplane_status_snapshot",
        "control_plane_bridge",
      ],
      evidence_hash: sha256({ goal: state.config.goal, wrappers: "evidence_research" }),
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
    const artifactPath = writeDomainArtifact("evidence_goal_loop", artifact);
    return {
      status: "ok",
      summary: "Evidence/research/control-plane bridge wrappers registered.",
      artifact_path: artifactPath,
      detail: {
        schema_version: artifact.schema_version,
        wrapper_count: artifact.wrappers.length,
        evidence_hash: artifact.evidence_hash,
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
  },
});
