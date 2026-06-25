import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { DEFAULT_MUTATION_FLAGS, nodeResultToStatePatch, type OperatingNodeResult, type OperatingGraphState, type OperatingNodePatch } from "../operating-node-utils";
import { buildInitialOperatingState } from "../callscore-operating-graph";
import { redactCommandOutput } from "../operating-receipts";

const SENTINEL_ARTIFACT_DIR = ".tmp/workflow-receipts/callscore_operating_graph/sentinel";

function writeSentinelArtifact(name: string, value: unknown): string {
  const path = join(SENTINEL_ARTIFACT_DIR, `${name}-${Date.now()}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return path;
}

function configurableObject(config: RunnableConfig): Record<string, unknown> {
  const value = config?.configurable;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readJsonObject(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return parseJsonObject(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function execFilePromise(command: string, args: readonly string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(command, [...args], { cwd: process.cwd(), timeout: timeoutMs, maxBuffer: 2_000_000 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout: String(stdout), stderr: String(stderr), exitCode: 0 });
        return;
      }
      const code = typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number"
        ? Number((error as NodeJS.ErrnoException & { code?: number }).code)
        : 1;
      resolve({ stdout: String(stdout), stderr: String(stderr || error.message), exitCode: code });
    });
  });
}

async function runControlPlaneCanaryNode(state: OperatingGraphState, config: RunnableConfig): Promise<OperatingNodePatch> {
  const startedAt = Date.now();
  const cfg = configurableObject(config);
  const command = Array.isArray(cfg.monitorCanaryCommand)
    ? cfg.monitorCanaryCommand.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [process.execPath, "--import", "tsx", "src/scripts/run-control-plane-canary.ts"];
  const receiptDir = typeof cfg.monitorCanaryReceiptDir === "string"
    ? cfg.monitorCanaryReceiptDir
    : join(SENTINEL_ARTIFACT_DIR, "control-plane-canary");
  mkdirSync(receiptDir, { recursive: true });
  const receiptPath = join(receiptDir, `control-plane-canary-${Date.now()}.json`);
  const timeoutMs = typeof cfg.monitorCanaryTimeoutMs === "number" && cfg.monitorCanaryTimeoutMs > 0 ? cfg.monitorCanaryTimeoutMs : 300_000;
  const [bin, ...baseArgs] = command.length > 0 ? command : [process.execPath, "--import", "tsx", "src/scripts/run-control-plane-canary.ts"];
  const args = [...baseArgs, "--receipt-out", receiptPath];
  const execution = await execFilePromise(bin, args, timeoutMs);
  const stdout = redactCommandOutput(execution.stdout);
  const stderr = redactCommandOutput(execution.stderr);
  const stdoutJson = parseJsonObject(stdout.trim().split("\n").filter(Boolean).at(-1) ?? "");
  const receipt = readJsonObject(receiptPath);
  const workflowStatus = typeof receipt?.workflow_status === "string"
    ? receipt.workflow_status
    : typeof stdoutJson?.workflow_status === "string"
      ? stdoutJson.workflow_status
      : null;
  const ok = execution.exitCode === 0 && (workflowStatus == null || workflowStatus === "completed");
  const artifact = {
    schema_version: "callscore_monitoring_control_plane_canary_receipt.v1",
    created_at: new Date().toISOString(),
    invoked_implementation: "run-control-plane-canary",
    command: [bin, ...args].map((part) => redactCommandOutput(part)),
    exit_code: execution.exitCode,
    stdout,
    stderr,
    receipt_path: receiptPath,
    receipt,
    stdout_json: stdoutJson,
    workflow_status: workflowStatus,
    mutation_scope: receipt?.mutation_scope ?? null,
    final_business_tables_mutated: receipt?.final_business_tables_mutated ?? null,
  };
  const artifactPath = writeSentinelArtifact("control-plane-canary", artifact);
  const result: OperatingNodeResult = {
    node_id: "monitoring_goal_loop",
    domain: "monitoring",
    status: ok ? "ok" : "failed",
    receipt_id: typeof receipt?.workflow_run_id === "string" ? receipt.workflow_run_id : `monitor-canary-${Date.now()}`,
    artifact_path: artifactPath,
    blockers: ok ? [] : [stderr || `control_plane_canary_exit_${execution.exitCode}`],
    warnings: [],
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Math.max(0, Date.now() - startedAt),
    mutation_flags: {
      ...DEFAULT_MUTATION_FLAGS,
      db_write_performed: ok,
      external_mutation_performed: false,
      provider_mutation_performed: false,
      public_publish_performed: false,
      production_mutation_performed: false,
    },
    summary: ok ? "Control-plane canary executed through operating graph." : "Control-plane canary failed through operating graph.",
    detail: {
      invoked_implementation: "run-control-plane-canary",
      receipt_path: receiptPath,
      workflow_status: workflowStatus,
      exit_code: execution.exitCode,
      final_business_tables_mutated: receipt?.final_business_tables_mutated ?? null,
    },
  };
  return nodeResultToStatePatch(result, state);
}

export async function sentinelMonitorGoalNode(
  state: OperatingGraphState | ReturnType<typeof buildInitialOperatingState>,
  config: RunnableConfig,
): Promise<OperatingNodePatch> {
  if (!state.config.testFixtures && !state.config.dryRun) {
    return runControlPlaneCanaryNode(state as OperatingGraphState, config);
  }

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
