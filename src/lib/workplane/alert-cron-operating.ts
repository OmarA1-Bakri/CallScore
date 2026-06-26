import { randomUUID } from "node:crypto";

import { buildInitialOperatingState, createCallscoreOperatingGraph } from "./callscore-operating-graph";

type AlertCronSource = "scan" | "send";

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

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("Alert operating graph aborted", "AbortError");
}

export async function runAlertsOperatingGraph(input: AlertCronOperatingInput): Promise<AlertCronOperatingResult> {
  throwIfAborted(input.signal);
  const maxItems = Number.isFinite(input.maxItems) && input.maxItems > 0 ? Math.floor(input.maxItems) : 1;
  const graph = createCallscoreOperatingGraph();
  const result = await graph.invoke(
    buildInitialOperatingState({ goal: "alerts", mode: "dry_run", dryRun: true, maxItems }),
    {
      configurable: {
        thread_id: `netlify-alerts-${input.source}-${randomUUID()}`,
        alertCronSource: input.source,
        requestedWindowHours: input.requestedWindowHours,
      },
    },
  );
  throwIfAborted(input.signal);

  const collect = result.node_results.find((item) => item.node_id === "collect_receipts");
  const alertLoop = result.node_results.find((item) => item.node_id === "alert_goal_loop");
  const failed = result.errors.length > 0 || result.node_results.some((item) => item.status === "failed");
  const blocked = result.blockers.length > 0 || result.node_results.some((item) => item.status === "blocked");
  const graphStatus: AlertCronOperatingResult["graph_status"] = failed ? "failed" : blocked ? "blocked" : "ok";

  return {
    ok: graphStatus === "ok",
    source: input.source,
    graph_status: graphStatus,
    direct_execution_performed: false,
    direct_scan_or_send_disabled: true,
    graph_fail_closed: graphStatus !== "ok",
    alert_loop_reached: Boolean(alertLoop),
    send_disabled_in_graph_plan: alertLoop?.detail?.send_disabled_in_graph_plan === true || graphStatus !== "ok",
    latest_receipt_path: collect?.artifact_path ?? null,
    latest_summary_path: typeof result.artifacts.operating_summary_path === "string" ? result.artifacts.operating_summary_path : null,
    mutation_flags: result.mutation_flags,
    blockers: result.blockers,
    warnings: result.warnings,
    max_items: maxItems,
    ...(input.requestedWindowHours !== undefined ? { requested_window_hours: input.requestedWindowHours } : {}),
  };
}
