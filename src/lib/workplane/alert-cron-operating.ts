import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

const CLI_TIMEOUT_MS = 60_000;

type AlertCronSource = "scan" | "send";

type CliSummary = {
  readonly status?: unknown;
  readonly blockers?: unknown;
  readonly warnings?: unknown;
  readonly mutation_flags?: unknown;
  readonly latest_receipt_path?: unknown;
  readonly latest_summary_path?: unknown;
};

type OperatingSummary = {
  readonly child_receipt_ids?: unknown;
  readonly blockers_by_domain?: unknown;
};

export interface AlertCronOperatingInput {
  readonly source: AlertCronSource;
  readonly maxItems: number;
  readonly requestedWindowHours?: number;
  readonly signal?: AbortSignal;
}

export interface AlertCronOperatingResult {
  readonly ok: boolean;
  readonly source: AlertCronSource;
  readonly graph_status: "ok" | "blocked" | "failed";
  readonly direct_execution_performed: false;
  readonly direct_scan_or_send_disabled: true;
  readonly graph_fail_closed: boolean;
  readonly alert_loop_reached: boolean;
  readonly send_disabled_in_graph_plan: boolean;
  readonly latest_receipt_path: string | null;
  readonly latest_summary_path: string | null;
  readonly mutation_flags: Record<string, boolean>;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly max_items: number;
  readonly requested_window_hours?: number;
}

interface CliExecution {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("Alert operating graph aborted", "AbortError");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mutationFlags(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, flag]) => [key, Boolean(flag)]),
  );
}

function parseJsonRecord(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return {};
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }
}

function readOperatingSummary(path: string | null): OperatingSummary {
  if (!path) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as OperatingSummary : {};
  } catch {
    return {};
  }
}

function alertLoopReached(summary: OperatingSummary): boolean {
  const receiptIds = stringArray(summary.child_receipt_ids);
  if (receiptIds.some((id) => id.includes("alert_goal_loop"))) return true;
  const blockersByDomain = summary.blockers_by_domain;
  return Boolean(
    blockersByDomain
      && typeof blockersByDomain === "object"
      && !Array.isArray(blockersByDomain)
      && Object.prototype.hasOwnProperty.call(blockersByDomain, "alerts"),
  );
}

function runOperatingGoalCli(args: readonly string[], signal: AbortSignal | undefined): Promise<CliExecution> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [...args],
      { cwd: process.cwd(), timeout: CLI_TIMEOUT_MS, maxBuffer: 2_000_000 },
      (error, stdout, stderr) => {
        const maybeCode = error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number"
          ? (error as NodeJS.ErrnoException & { code: number }).code
          : 0;
        resolve({ stdout: String(stdout), stderr: String(stderr || (error instanceof Error ? error.message : "")), exitCode: error ? maybeCode || 1 : 0 });
      },
    );
    if (signal) {
      signal.addEventListener("abort", () => child.kill(), { once: true });
    }
  });
}

export async function runAlertsOperatingGraph(input: AlertCronOperatingInput): Promise<AlertCronOperatingResult> {
  throwIfAborted(input.signal);
  const maxItems = Number.isFinite(input.maxItems) && input.maxItems > 0 ? Math.floor(input.maxItems) : 1;
  const execution = await runOperatingGoalCli([
    "--import",
    "tsx",
    "src/scripts/callscore-operating-goal.ts",
    "--goal", "alerts",
    "--dry-run",
    "--max-items", String(maxItems),
  ], input.signal);
  throwIfAborted(input.signal);

  const summary = parseJsonRecord(execution.stdout) as CliSummary;
  const status = summary.status === "ok" || summary.status === "blocked" || summary.status === "failed"
    ? summary.status
    : execution.exitCode === 0 ? "blocked" : "failed";
  const latestSummaryPath = stringOrNull(summary.latest_summary_path);
  const operatingSummary = readOperatingSummary(latestSummaryPath);
  const reachedAlertLoop = alertLoopReached(operatingSummary);
  const blockers = stringArray(summary.blockers);
  const warnings = [
    ...stringArray(summary.warnings),
    ...(execution.stderr.trim() ? [`stderr:${execution.stderr.trim().slice(0, 300)}`] : []),
  ];

  return {
    ok: status === "ok",
    source: input.source,
    graph_status: status,
    direct_execution_performed: false,
    direct_scan_or_send_disabled: true,
    graph_fail_closed: status !== "ok",
    alert_loop_reached: reachedAlertLoop,
    send_disabled_in_graph_plan: status !== "ok" || !reachedAlertLoop,
    latest_receipt_path: stringOrNull(summary.latest_receipt_path),
    latest_summary_path: latestSummaryPath,
    mutation_flags: mutationFlags(summary.mutation_flags),
    blockers,
    warnings,
    max_items: maxItems,
    ...(input.requestedWindowHours !== undefined ? { requested_window_hours: input.requestedWindowHours } : {}),
  };
}
