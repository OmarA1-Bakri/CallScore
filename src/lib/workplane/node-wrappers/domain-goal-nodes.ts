import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const DEFAULT_CREATOR_GROWTH_SCOUT_COMMAND = "/srv/agents/hermes/scripts/callscore-creator-growth-scout-impl.sh";

type ChildProcessExecution = { stdout: string; stderr: string; exitCode: number | null };

function execFilePromise(command: string, args: readonly string[], options: { cwd: string; timeoutMs: number }): Promise<ChildProcessExecution> {
  return new Promise((resolve) => {
    execFile(command, [...args], { cwd: options.cwd, timeout: options.timeoutMs, maxBuffer: 2_000_000 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout: String(stdout), stderr: String(stderr), exitCode: 0 });
        return;
      }
      const code = typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number"
        ? ((error as NodeJS.ErrnoException & { code?: number }).code ?? 1)
        : 1;
      resolve({ stdout: String(stdout), stderr: String(stderr || error.message), exitCode: code });
    });
  });
}

function configurableRecord(config?: RunnableConfig): Record<string, unknown> {
  const value = config?.configurable;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseCreatorGrowthScoutReceiptPath(stdout: string): string | null {
  const receiptLine = stdout.match(/^Receipt:\s*(.+)$/m)?.[1]?.trim();
  if (receiptLine) return receiptLine;
  return stdout.match(/^receipt=(.+)$/m)?.[1]?.trim() ?? null;
}

function readJsonRecord(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("creator_growth_scout_receipt_not_object");
  return parsed as Record<string, unknown>;
}

function parseLastJsonRecord(stdout: string): Record<string, unknown> {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Continue scanning older lines.
    }
  }
  return {};
}

function recordValue(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nestedNumber(source: Record<string, unknown>, key: string): number {
  const queries = source.queries && typeof source.queries === "object" && !Array.isArray(source.queries)
    ? source.queries as Record<string, unknown>
    : {};
  return Number(queries[key] ?? 0);
}


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
  run: async ({ state, config }) => {
    const cfg = configurableRecord(config);
    const refreshDataProducer = typeof cfg.refreshDataProducer === "string" ? cfg.refreshDataProducer : null;
    const refreshDataCommand = typeof cfg.refreshDataCommand === "string" ? cfg.refreshDataCommand : null;
    if (refreshDataProducer && refreshDataCommand && !state.config.dryRun) {
      if (state.config.mode !== "bounded_write") {
        return {
          status: "blocked" as const,
          summary: "Refresh data producer execution requires bounded_write mode.",
          blockers: ["refresh_data_producer_requires_bounded_write"],
          detail: { producer: refreshDataProducer, executed: false },
          mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
        };
      }
      if (!state.config.approved || (!state.config.approvalReceiptId && !state.config.approvedByOperator)) {
        return {
          status: "blocked" as const,
          summary: "Refresh data producer execution requires approval evidence.",
          blockers: ["refresh_data_producer_approval_missing"],
          detail: { producer: refreshDataProducer, executed: false },
          mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
        };
      }

      const commandArgs = stringArray(cfg.refreshDataCommandArgs);
      const timeoutMs = typeof cfg.refreshDataTimeoutMs === "number"
        ? Math.max(1_000, Math.floor(cfg.refreshDataTimeoutMs))
        : 120_000;
      const execution = await execFilePromise(refreshDataCommand, commandArgs, { cwd: process.cwd(), timeoutMs });
      const stdout = redactCommandOutput(execution.stdout);
      const stderr = redactCommandOutput(execution.stderr);
      const parsed = parseLastJsonRecord(stdout);
      const run = recordValue(parsed, "run");
      const job = recordValue(parsed, "job");
      const mutationFlags = { ...DEFAULT_OPERATING_MUTATION_FLAGS, db_write_performed: execution.exitCode === 0 };
      const artifact = {
        schema_version: "callscore_refresh_data_producer_receipt.v1",
        created_at: nowIso(),
        producer: refreshDataProducer,
        command: redactCommandOutput(refreshDataCommand),
        args: commandArgs.map((arg) => redactCommandOutput(arg)),
        exit_code: execution.exitCode,
        stdout_excerpt: stdout.slice(0, 4_000),
        stderr_excerpt: stderr.slice(0, 2_000),
        parsed_output: parsed,
        mutation_flags: mutationFlags,
      };
      const artifactPath = writeDomainArtifact(`data_goal_loop-${refreshDataProducer}`, artifact);
      if (execution.exitCode !== 0) {
        return {
          status: "failed" as const,
          summary: `Refresh data producer ${refreshDataProducer} failed with exit ${execution.exitCode}`,
          blockers: [`refresh_data_producer_exit_${execution.exitCode}`],
          artifact_path: artifactPath,
          detail: {
            producer: refreshDataProducer,
            executed: true,
            exit_code: execution.exitCode,
            stderr_excerpt: stderr.slice(0, 1_000),
          },
          mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
        };
      }

      return {
        status: "ok" as const,
        summary: `Refresh data producer ${refreshDataProducer} executed through the operating graph.`,
        artifact_path: artifactPath,
        detail: {
          schema_version: artifact.schema_version,
          producer: refreshDataProducer,
          executed: true,
          exit_code: execution.exitCode,
          run_id: run.id ?? null,
          run_key: run.run_key ?? null,
          job_id: job.id ?? null,
          job_type: job.type ?? null,
          job_status: job.status ?? null,
          approval_receipt_id: state.config.approvalReceiptId,
          approved_by_operator: state.config.approvedByOperator,
        },
        mutation_flags: mutationFlags,
      };
    }

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
  run: async ({ state, config }) => {
    if (!state.config.testFixtures && !state.config.dryRun) {
      const cfg = configurableRecord(config);
      const command = typeof cfg.creatorGrowthScoutCommand === "string"
        ? cfg.creatorGrowthScoutCommand
        : DEFAULT_CREATOR_GROWTH_SCOUT_COMMAND;
      const args = stringArray(cfg.creatorGrowthScoutArgs);
      const timeoutMs = typeof cfg.creatorGrowthScoutTimeoutMs === "number"
        ? Math.max(1_000, Math.floor(cfg.creatorGrowthScoutTimeoutMs))
        : 120_000;
      const execution = await execFilePromise(command, args, { cwd: process.cwd(), timeoutMs });
      const stdout = redactCommandOutput(execution.stdout);
      const stderr = redactCommandOutput(execution.stderr);
      if (execution.exitCode !== 0) {
        return {
          status: "failed" as const,
          summary: `Creator growth scout failed with exit ${execution.exitCode}`,
          blockers: [`creator_growth_scout_exit_${execution.exitCode}`],
          detail: {
            invoked_implementation: "callscore-creator-growth-scout",
            exit_code: execution.exitCode,
            stderr_excerpt: stderr.slice(0, 2_000),
            stdout_excerpt: stdout.slice(0, 1_000),
          },
          mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
        };
      }

      const receiptPath = parseCreatorGrowthScoutReceiptPath(stdout);
      if (!receiptPath || !existsSync(receiptPath)) {
        return {
          status: "failed" as const,
          summary: "Creator growth scout completed but did not expose a readable receipt path.",
          blockers: ["creator_growth_scout_receipt_missing"],
          detail: {
            invoked_implementation: "callscore-creator-growth-scout",
            exit_code: execution.exitCode,
            stdout_excerpt: stdout.slice(0, 1_000),
          },
          mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
        };
      }

      const scoutReceipt = readJsonRecord(receiptPath);
      const receiptId = typeof scoutReceipt.receipt_id === "string" ? scoutReceipt.receipt_id : undefined;
      return {
        status: "ok" as const,
        receipt_id: receiptId,
        artifact_path: receiptPath,
        summary: "Creator growth scout executed through the operating graph in read-only mode.",
        detail: {
          invoked_implementation: "callscore-creator-growth-scout",
          source_receipt_path: receiptPath,
          source_receipt_id: receiptId ?? null,
          hidden_gems_count: nestedNumber(scoutReceipt, "hidden_gems_count"),
          recent_promising_count: nestedNumber(scoutReceipt, "recent_promising_count"),
          missing_coverage_count: nestedNumber(scoutReceipt, "missing_coverage_count"),
          payload_hash: typeof scoutReceipt.payload_hash === "string" ? scoutReceipt.payload_hash : null,
          external_mutation_performed: scoutReceipt.external_mutation_performed === true,
          provider_spend_performed: scoutReceipt.provider_spend_performed === true,
        },
        mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
      };
    }

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
