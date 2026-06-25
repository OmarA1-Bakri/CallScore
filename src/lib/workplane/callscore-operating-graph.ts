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
  type MutationFlags,
  type OperatingGraphState,
  type OperatingNodeResult,
  type OperatingReceipt,
} from "./operating-graph-schemas";
import { mergeMutationFlags, nodeResultToStatePatch, wrapDirectFunctionNode } from "./operating-node-utils";
import { generateOperatingReceiptId, makeNoMutationReceipt, writeOperatingReceipt, buildOperatingReceiptPath } from "./operating-receipts";
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

export async function collectReceiptsNode(state: OperatingGraphState): Promise<Partial<OperatingGraphState>> {
  const parsed = OperatingGraphStateSchema.parse(state);
  const receiptId = generateOperatingReceiptId(parsed.config.goal, "collect_receipts");
  const receipt = makeNoMutationReceipt({
    receiptId,
    goal: parsed.config.goal,
    domain: "control_plane",
    nodeResults: parsed.node_results,
    artifactPaths: parsed.node_results.flatMap((item) => item.artifact_path ? [item.artifact_path] : []),
    note: parsed.blockers.length > 0 ? `Blocked: ${parsed.blockers.join(", ")}` : "No rollback required; no mutation performed.",
  });
  const artifactPath = buildOperatingReceiptPath({ receiptId });
  writeOperatingReceipt({ path: artifactPath, receipt });

  const result: OperatingNodeResult = {
    node_id: "collect_receipts",
    domain: "control_plane",
    status: "ok",
    receipt_id: receiptId,
    artifact_path: artifactPath,
    blockers: [],
    warnings: [],
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: 0,
    mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
    summary: `Collected ${parsed.node_results.length} operating node result(s).`,
    detail: { child_receipt_ids: parsed.node_results.map((item) => item.receipt_id) },
  };

  const patch = nodeResultToStatePatch(result, parsed);
  return {
    ...patch,
    receipts: [...parsed.receipts, receipt],
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
      node_count: state.node_results.length,
      receipt_count: state.receipts.length,
    },
    mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
  }),
});

export function createCallscoreOperatingGraph(options?: { evidenceResearch?: { artifactDir: string } }) {
  const evidenceNode = options?.evidenceResearch
    ? createEvidenceResearchGoalNode(options.evidenceResearch)
    : evidenceGoalLoopNode;

  const builder = new StateGraph(OperatingGraphAnnotation)
    .addNode("boot_context", bootContextNode)
    .addNode("hard_gate_preflight", hardGatePreflightNode)
    .addNode("revenue_goal_loop", revenueGoalLoopNode)
    .addNode("data_goal_loop", dataGoalLoopNode)
    .addNode("worker_dispatch_goal_loop", workerDispatchGoalLoopNode)
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
