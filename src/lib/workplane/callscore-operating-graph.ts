import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  normalizeOperatingGoalConfig,
  routeOperatingGoalToNode,
  type NormalizedOperatingGoalConfig,
} from "./operating-goals";
import {
  DEFAULT_OPERATING_MUTATION_FLAGS,
  OperatingGraphStateSchema,
  OperatingReceiptSchema,
  OperatingSummarySchema,
  type MutationFlags,
  type OperatingGraphState,
  type OperatingNodeStatus,
  type OperatingNodeResult,
  type OperatingReceipt,
} from "./operating-graph-schemas";
import { mergeMutationFlags, nodeResultToStatePatch, wrapDirectFunctionNode } from "./operating-node-utils";
import { generateOperatingReceiptId, writeOperatingReceipt, buildOperatingReceiptPath, redactOperatingValue, buildOperatingSummaryPath, writeOperatingSummary } from "./operating-receipts";
import { bootContextNode, hardGatePreflightNode } from "./node-wrappers/gating-nodes";
import {
  alertGoalLoopNode,
  dataGoalLoopNode,
  evidenceGoalLoopNode,
  monitoringGoalLoopNode,
  revenueGoalLoopNode,
  trustGoalLoopNode,
  videoGoalLoopNode,
  workerDispatchGoalLoopNode,
} from "./node-wrappers/domain-goal-nodes";
import { createEvidenceResearchGoalNode } from "./node-wrappers/evidence-research-nodes";
import { createWorkerDispatchOnceNode, type WorkerDispatchNodeDeps } from "./node-wrappers/worker-dispatch-nodes";

function replace<T>() {
  return (_left: T | undefined, right: T): T => right;
}

function mergeRecord<T extends Record<string, unknown>>() {
  return (left: T | undefined, right: T): T => ({ ...(left ?? {} as T), ...right });
}

export const OperatingGraphAnnotation = Annotation.Root({
  config: Annotation<OperatingGraphState["config"]>({ reducer: replace<OperatingGraphState["config"]>(), default: () => normalizeOperatingGoalConfig({ goal: "monitor" }) }),
  node_results: Annotation<OperatingNodeResult[]>({ reducer: replace<OperatingNodeResult[]>(), default: () => [] }),
  receipts: Annotation<OperatingReceipt[]>({ reducer: replace<OperatingReceipt[]>(), default: () => [] }),
  blockers: Annotation<string[]>({ reducer: replace<string[]>(), default: () => [] }),
  warnings: Annotation<string[]>({ reducer: replace<string[]>(), default: () => [] }),
  errors: Annotation<string[]>({ reducer: replace<string[]>(), default: () => [] }),
  mutation_flags: Annotation<MutationFlags>({ reducer: (left, right) => mergeMutationFlags(left, right), default: () => ({ ...DEFAULT_OPERATING_MUTATION_FLAGS }) }),
  artifacts: Annotation<Record<string, unknown>>({ reducer: mergeRecord<Record<string, unknown>>(), default: () => ({}) }),
});

export type CallscoreOperatingGraphState = typeof OperatingGraphAnnotation.State;

export function buildInitialOperatingState(input: Partial<NormalizedOperatingGoalConfig> & { goal: NormalizedOperatingGoalConfig["goal"] }): OperatingGraphState {
  return OperatingGraphStateSchema.parse({
    config: normalizeOperatingGoalConfig(input),
    node_results: [],
    receipts: [],
    blockers: [],
    warnings: [],
    errors: [],
    mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
    artifacts: {},
  });
}

function stateHasBlockingPreflight(state: OperatingGraphState): boolean {
  const lastGate = [...state.node_results].reverse().find((result) => result.node_id === "hard_gate_preflight");
  return Boolean(lastGate?.status === "blocked" || state.blockers.length > 0 || state.errors.length > 0);
}

function routeAfterPreflight(state: OperatingGraphState) {
  const parsed = OperatingGraphStateSchema.parse(state);
  if (stateHasBlockingPreflight(parsed)) return "collect_receipts";
  return routeOperatingGoalToNode(parsed.config.goal);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function groupMessagesByDomain(
  results: readonly OperatingNodeResult[],
  key: "blockers" | "warnings",
  stateMessages: readonly string[] = [],
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  const seenFromNodes = new Set<string>();
  for (const result of results) {
    const messages = uniqueStrings(result[key]);
    if (messages.length === 0) continue;
    grouped[result.domain] = uniqueStrings([...(grouped[result.domain] ?? []), ...messages]);
    messages.forEach((message) => seenFromNodes.add(message));
  }

  const unassigned = uniqueStrings(stateMessages.filter((message) => !seenFromNodes.has(message)));
  if (unassigned.length > 0) {
    grouped.control_plane = uniqueStrings([...(grouped.control_plane ?? []), ...unassigned]);
  }
  return grouped;
}

function countNodeStatuses(results: readonly OperatingNodeResult[]): Record<string, number> {
  return results.reduce<Record<string, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
}

function mutationFlagsDiffer(left: MutationFlags, right: MutationFlags): string[] {
  return (Object.keys(DEFAULT_OPERATING_MUTATION_FLAGS) as Array<keyof MutationFlags>)
    .filter((key) => Boolean(left[key]) !== Boolean(right[key]))
    .map((key) => String(key));
}

function hasAmbiguousMutationValue(value: unknown, keyPath = ""): boolean {
  if (Array.isArray(value)) return value.some((item, index) => hasAmbiguousMutationValue(item, `${keyPath}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, inner]) => {
      const nextPath = keyPath ? `${keyPath}.${key}` : key;
      return hasAmbiguousMutationValue(inner, nextPath);
    });
  }
  if (typeof value !== "string") return false;
  const mutationLikeKey = /(mutation|side[_ -]?effect|write|publish|send|provider)/i.test(keyPath);
  const ambiguousValue = /(unknown|ambiguous|uncertain|unverified|maybe|possibly)/i.test(value);
  return mutationLikeKey && ambiguousValue;
}

function auditMutationAmbiguity(results: readonly OperatingNodeResult[]): string[] {
  return results.flatMap((result) => {
    if (result.status !== "ok") return [];
    if (!hasAmbiguousMutationValue(result.detail)) return [];
    return [`mutation_status_ambiguous:${result.node_id}`];
  });
}

function computeCollectStatus(input: {
  readonly auditBlockers: readonly string[];
  readonly errors: readonly string[];
  readonly blockers: readonly string[];
  readonly results: readonly OperatingNodeResult[];
}): OperatingNodeStatus {
  if (input.auditBlockers.length > 0 || input.errors.length > 0 || input.results.some((result) => result.status === "failed")) return "failed";
  if (input.blockers.length > 0 || input.results.some((result) => result.status === "blocked")) return "blocked";
  return "ok";
}

export async function collectReceiptsNode(state: OperatingGraphState): Promise<Partial<OperatingGraphState>> {
  const parsed = OperatingGraphStateSchema.parse(state);
  const childReceiptIds = uniqueStrings([
    ...parsed.receipts.map((receipt) => receipt.receipt_id),
    ...parsed.node_results.map((result) => result.receipt_id),
  ]);
  const artifactPaths = uniqueStrings([
    ...parsed.receipts.flatMap((receipt) => receipt.artifact_paths.filter((path): path is string => Boolean(path))),
    ...parsed.node_results.flatMap((item) => item.artifact_path ? [item.artifact_path] : []),
  ]);
  const childMutationFlags = mergeMutationFlags(
    ...parsed.receipts.map((receipt) => receipt.mutation_flags),
    ...parsed.node_results.map((result) => result.mutation_flags),
  );
  const stateMutationFlags = mergeMutationFlags(parsed.mutation_flags);
  const mismatchKeys = mutationFlagsDiffer(childMutationFlags, stateMutationFlags);
  const auditBlockers = [
    ...mismatchKeys.map((key) => `mutation_flags_inconsistent:${key}`),
    ...auditMutationAmbiguity(parsed.node_results),
  ];
  const status = computeCollectStatus({
    auditBlockers,
    errors: parsed.errors,
    blockers: parsed.blockers,
    results: parsed.node_results,
  });
  const blockersByDomain = groupMessagesByDomain(parsed.node_results, "blockers", parsed.blockers);
  if (auditBlockers.length > 0) {
    blockersByDomain.control_plane = uniqueStrings([...(blockersByDomain.control_plane ?? []), ...auditBlockers]);
  }
  const warningsByDomain = groupMessagesByDomain(parsed.node_results, "warnings", parsed.warnings);
  const summary = OperatingSummarySchema.parse({
    schema_version: "callscore_operating_summary.v1",
    goal: parsed.config.goal,
    status,
    child_receipt_ids: childReceiptIds,
    mutation_flags: childMutationFlags,
    blockers_by_domain: blockersByDomain,
    warnings_by_domain: warningsByDomain,
    node_status_counts: countNodeStatuses(parsed.node_results),
    node_count: parsed.node_results.length,
    receipt_count: parsed.receipts.length,
    artifact_paths: artifactPaths,
    audit_blockers: auditBlockers,
    secret_redaction_applied: true,
    created_at: new Date().toISOString(),
  });
  const receiptId = generateOperatingReceiptId(parsed.config.goal, "collect_receipts");
  const summaryArtifactPath = buildOperatingSummaryPath({ receiptId });
  writeOperatingSummary({ path: summaryArtifactPath, summary });
  const receipt = OperatingReceiptSchema.parse(redactOperatingValue({
    receipt_id: receiptId,
    goal: parsed.config.goal,
    domain: "control_plane",
    parent_receipt_ids: childReceiptIds,
    node_results: parsed.node_results,
    mutation_flags: childMutationFlags,
    approval_receipt_id: parsed.config.approvalReceiptId,
    rollback_or_recovery_note: status === "ok"
      ? "No rollback required; aggregate receipt audit found no blockers."
      : `Fail-closed receipt audit status=${status}; resolve blockers before any downstream mutation claim.`,
    artifact_paths: uniqueStrings([...artifactPaths, summaryArtifactPath]),
    created_at: summary.created_at,
  }));
  const artifactPath = buildOperatingReceiptPath({ receiptId });
  writeOperatingReceipt({ path: artifactPath, receipt });

  const result: OperatingNodeResult = {
    node_id: "collect_receipts",
    domain: "control_plane",
    status,
    receipt_id: receiptId,
    artifact_path: artifactPath,
    blockers: auditBlockers,
    warnings: [],
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: 0,
    mutation_flags: childMutationFlags,
    summary: status === "ok"
      ? `Collected ${parsed.node_results.length} operating node result(s).`
      : `Collected ${parsed.node_results.length} operating node result(s) with status=${status}.`,
    detail: { ...summary, summary_artifact_path: summaryArtifactPath },
  };

  const patch = nodeResultToStatePatch(result, parsed);
  return {
    ...patch,
    receipts: [...parsed.receipts, receipt],
    artifacts: {
      ...parsed.artifacts,
      operating_summary: summary,
      operating_summary_path: summaryArtifactPath,
    },
  };
}

export const operatingSummaryNode = wrapDirectFunctionNode({
  nodeId: "operating_summary",
  domain: "control_plane",
  run: async ({ state }) => ({
    status: state.blockers.length > 0 ? "blocked" : "ok",
    summary: state.blockers.length > 0
      ? `Operating graph blocked: ${state.blockers.join(", ")}`
      : `Operating graph completed goal=${state.config.goal}`,
    blockers: [],
    detail: {
      goal: state.config.goal,
      blockers: state.blockers,
      blockers_by_domain: (state.artifacts.operating_summary as { blockers_by_domain?: unknown } | undefined)?.blockers_by_domain ?? {},
      node_count: state.node_results.length,
      receipt_count: state.receipts.length,
      child_receipt_ids: (state.artifacts.operating_summary as { child_receipt_ids?: unknown } | undefined)?.child_receipt_ids ?? [],
      summary_artifact_path: state.artifacts.operating_summary_path ?? null,
    },
    mutation_flags: state.mutation_flags,
  }),
});

export interface CallscoreOperatingGraphOptions {
  readonly evidenceResearch?: { artifactDir: string };
  readonly workerDispatch?: WorkerDispatchNodeDeps;
}

export function createCallscoreOperatingGraph(options?: CallscoreOperatingGraphOptions) {
  const evidenceNode = options?.evidenceResearch
    ? createEvidenceResearchGoalNode(options.evidenceResearch)
    : evidenceGoalLoopNode;
  const workerDispatchNode = options?.workerDispatch
    ? createWorkerDispatchOnceNode(options.workerDispatch)
    : workerDispatchGoalLoopNode;

  const builder = new StateGraph(OperatingGraphAnnotation)
    .addNode("boot_context", bootContextNode)
    .addNode("hard_gate_preflight", hardGatePreflightNode)
    .addNode("revenue_goal_loop", revenueGoalLoopNode)
    .addNode("data_goal_loop", dataGoalLoopNode)
    .addNode("worker_dispatch_goal_loop", workerDispatchNode)
    .addNode("video_goal_loop", videoGoalLoopNode)
    .addNode("monitoring_goal_loop", monitoringGoalLoopNode)
    .addNode("trust_goal_loop", trustGoalLoopNode)
    .addNode("alert_goal_loop", alertGoalLoopNode)
    .addNode("evidence_goal_loop", evidenceNode)
    .addNode("collect_receipts", collectReceiptsNode)
    .addNode("operating_summary", operatingSummaryNode)
    .addEdge(START, "boot_context")
    .addEdge("boot_context", "hard_gate_preflight")
    .addConditionalEdges("hard_gate_preflight", routeAfterPreflight, {
      revenue_goal_loop: "revenue_goal_loop",
      data_goal_loop: "data_goal_loop",
      worker_dispatch_goal_loop: "worker_dispatch_goal_loop",
      video_goal_loop: "video_goal_loop",
      monitoring_goal_loop: "monitoring_goal_loop",
      trust_goal_loop: "trust_goal_loop",
      alert_goal_loop: "alert_goal_loop",
      evidence_goal_loop: "evidence_goal_loop",
      collect_receipts: "collect_receipts",
    });

  for (const node of [
    "revenue_goal_loop",
    "data_goal_loop",
    "worker_dispatch_goal_loop",
    "video_goal_loop",
    "monitoring_goal_loop",
    "trust_goal_loop",
    "alert_goal_loop",
    "evidence_goal_loop",
  ] as const) {
    builder.addEdge(node, "collect_receipts");
  }

  return builder
    .addEdge("collect_receipts", "operating_summary")
    .addEdge("operating_summary", END)
    .compile();
}

export async function invokeCallscoreOperatingGraph(input: Partial<NormalizedOperatingGoalConfig> & { goal: NormalizedOperatingGoalConfig["goal"] }, config?: RunnableConfig): Promise<OperatingGraphState> {
  const graph = createCallscoreOperatingGraph();
  const result = await graph.invoke(buildInitialOperatingState(input), config);
  return OperatingGraphStateSchema.parse(result);
}
