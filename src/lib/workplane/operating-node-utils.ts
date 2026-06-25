import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { OperatingDomain } from "./operating-goals";
import {
  MutationFlagsSchema,
  OperatingGraphStateSchema,
  OperatingNodeResultSchema,
  type MutationFlags,
  type OperatingGraphState,
  type OperatingNodeResult,
} from "./operating-graph-schemas";
import { generateOperatingReceiptId, redactCommandOutput } from "./operating-receipts";

export type { OperatingGraphState, OperatingNodeResult };

export const DEFAULT_MUTATION_FLAGS: MutationFlags = MutationFlagsSchema.parse({});

export type OperatingNodePatch = Partial<OperatingGraphState>;

export interface DirectFunctionNodeOptions {
  readonly nodeId: string;
  readonly domain: OperatingDomain;
  readonly run: (input: {
    state: OperatingGraphState;
    config: RunnableConfig;
  }) => Promise<Partial<Pick<OperatingNodeResult, "status" | "summary" | "detail" | "blockers" | "warnings" | "artifact_path" | "receipt_id" | "mutation_flags">>>;
}

export interface ChildProcessNodeOptions {
  readonly nodeId: string;
  readonly domain: OperatingDomain;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly artifactDir?: string;
  readonly timeoutMs?: number;
}

export type OperatingNodeWrapper = (state: OperatingGraphState, config: RunnableConfig) => Promise<OperatingNodePatch>;

export function mergeMutationFlags(...items: Array<Partial<MutationFlags> | null | undefined>): MutationFlags {
  const merged: MutationFlags = { ...DEFAULT_MUTATION_FLAGS };
  for (const item of items) {
    if (!item) continue;
    const parsed = MutationFlagsSchema.partial().parse(item);
    for (const key of Object.keys(merged) as Array<keyof MutationFlags>) {
      merged[key] = Boolean(merged[key] || parsed[key]);
    }
  }
  return MutationFlagsSchema.parse(merged);
}

export function nodeResultToStatePatch(result: OperatingNodeResult, state: OperatingGraphState): OperatingNodePatch {
  const parsed = OperatingNodeResultSchema.parse(result);
  return {
    node_results: [...(state.node_results ?? []), parsed],
    blockers: [...(state.blockers ?? []), ...parsed.blockers],
    warnings: [...(state.warnings ?? []), ...parsed.warnings],
    errors: parsed.status === "failed" ? [...(state.errors ?? []), ...parsed.blockers] : [...(state.errors ?? [])],
    mutation_flags: mergeMutationFlags(state.mutation_flags, parsed.mutation_flags),
  };
}

function makeResult(input: {
  readonly nodeId: string;
  readonly domain: OperatingDomain;
  readonly status: OperatingNodeResult["status"];
  readonly startedAtMs: number;
  readonly summary: string;
  readonly blockers?: readonly string[];
  readonly warnings?: readonly string[];
  readonly artifactPath?: string | null;
  readonly receiptId?: string;
  readonly mutationFlags?: Partial<MutationFlags>;
  readonly detail?: Record<string, unknown>;
}): OperatingNodeResult {
  const finished = Date.now();
  return OperatingNodeResultSchema.parse({
    node_id: input.nodeId,
    domain: input.domain,
    status: input.status,
    receipt_id: input.receiptId ?? generateOperatingReceiptId("monitor", input.nodeId),
    artifact_path: input.artifactPath ?? null,
    blockers: [...(input.blockers ?? [])],
    warnings: [...(input.warnings ?? [])],
    started_at: new Date(input.startedAtMs).toISOString(),
    finished_at: new Date(finished).toISOString(),
    duration_ms: Math.max(0, finished - input.startedAtMs),
    mutation_flags: mergeMutationFlags(input.mutationFlags),
    summary: input.summary,
    detail: input.detail ?? {},
  });
}

export function wrapDirectFunctionNode(options: DirectFunctionNodeOptions): OperatingNodeWrapper {
  return async (state, config) => {
    const parsedState = OperatingGraphStateSchema.parse(state);
    const startedAtMs = Date.now();
    try {
      const output = await options.run({ state: parsedState, config });
      const result = makeResult({
        nodeId: options.nodeId,
        domain: options.domain,
        status: output.status ?? "ok",
        startedAtMs,
        summary: output.summary ?? `${options.nodeId} completed`,
        blockers: output.blockers,
        warnings: output.warnings,
        artifactPath: output.artifact_path ?? undefined,
        receiptId: output.receipt_id,
        mutationFlags: output.mutation_flags,
        detail: output.detail,
      });
      return nodeResultToStatePatch(result, parsedState);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = makeResult({
        nodeId: options.nodeId,
        domain: options.domain,
        status: "failed",
        startedAtMs,
        summary: `${options.nodeId} failed: ${message}`,
        blockers: [message],
        detail: { error: message },
      });
      return nodeResultToStatePatch(result, parsedState);
    }
  };
}

function execFilePromise(command: string, args: readonly string[], options: { cwd: string; timeoutMs: number }): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
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

export function wrapChildProcessNode(options: ChildProcessNodeOptions): OperatingNodeWrapper {
  return async (state) => {
    const parsedState = OperatingGraphStateSchema.parse(state);
    const startedAtMs = Date.now();
    const args = options.args ?? [];
    const artifactDir = options.artifactDir ?? ".tmp/workflow-receipts/callscore_operating_graph/child-process";
    mkdirSync(artifactDir, { recursive: true });
    const artifactPath = join(artifactDir, `${options.nodeId}-${startedAtMs}.json`);

    const execution = await execFilePromise(options.command, args, { cwd: options.cwd, timeoutMs: options.timeoutMs ?? 60_000 });
    const stdout = redactCommandOutput(execution.stdout);
    const stderr = redactCommandOutput(execution.stderr);
    writeFileSync(artifactPath, `${JSON.stringify({
      node_id: options.nodeId,
      command: options.command,
      args,
      cwd: options.cwd,
      exit_code: execution.exitCode,
      stdout,
      stderr,
      started_at: new Date(startedAtMs).toISOString(),
      finished_at: new Date().toISOString(),
    }, null, 2)}\n`);

    const ok = execution.exitCode === 0;
    const result = makeResult({
      nodeId: options.nodeId,
      domain: options.domain,
      status: ok ? "ok" : "failed",
      startedAtMs,
      summary: ok ? `${options.nodeId} command completed` : `${options.nodeId} command failed with exit ${execution.exitCode}`,
      blockers: ok ? [] : [stderr || `exit_${execution.exitCode}`],
      warnings: [],
      artifactPath,
      detail: { exit_code: execution.exitCode, command: options.command, args },
    });
    return nodeResultToStatePatch(result, parsedState);
  };
}
