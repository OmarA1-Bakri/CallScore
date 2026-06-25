/**
 * channel-head-graph.ts — Compiled LangGraph StateGraph for CallScore pipeline.
 *
 * Wires together pipeline guard, transition classifier, Markov trajectory HMM,
 * channel head decision engine, and receipt writer into a single compiled
 * StateGraph.  Every node boundary is Zod-validated via the canonical schemas
 * in contracts.ts / pipeline-state-schema.ts.
 *
 * Topology:
 *
 *   START → pipeline_guard
 *     ├── block  → END
 *     └── pass   → transition_classifier → markov_trajectory
 *                                            ├── block (error) → END
 *                                            └── skip/proceed → channel_head_decision
 *                                                              → receipt_writer → END
 */

import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { CreatorTransitionStateRecord } from "../validation/transition-schema";
import type { TransitionMatrix, CreatorPrediction, MarkovReport } from "../validation/markov-schema";
import type { ChannelHeadDecisionContext, ChannelHeadDecisionResult } from "./channel-head-decision";
import type { PipelineReceipt, PipelineError } from "../validation/pipeline-state-schema";

// ── State schema (mirrors PipelineStateSchema) ──────────────────────────────

function replace<T>() {
  return (_a: T | undefined, b: T): T => b;
}

function concat<T>() {
  return (a: T[] | undefined, b: T[]): T[] => [...(a ?? []), ...b];
}

export const PipelineStateAnnotation = Annotation.Root({
  run_id: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
  pipeline_version: Annotation<string>({
    reducer: replace<string>(),
    default: () => "callscore_pipeline_graph.v1",
  }),
  started_at: Annotation<string>({ reducer: replace<string>(), default: () => "" }),

  guard_overall: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
  guard_blocked: Annotation<boolean>({ reducer: replace<boolean>(), default: () => false }),

  creator_states: Annotation<CreatorTransitionStateRecord[]>({
    reducer: (a, b) => b,
    default: () => [],
  }),

  transition_matrix: Annotation<TransitionMatrix | null>({
    reducer: replace<TransitionMatrix | null>(),
    default: () => null,
  }),
  predictions: Annotation<CreatorPrediction[]>({
    reducer: (a, b) => b,
    default: () => [],
  }),
  markov_report: Annotation<MarkovReport | null>({
    reducer: replace<MarkovReport | null>(),
    default: () => null,
  }),

  channel_head_contexts: Annotation<ChannelHeadDecisionContext[]>({
    reducer: (a, b) => b,
    default: () => [],
  }),
  channel_head_results: Annotation<ChannelHeadDecisionResult[]>({
    reducer: (a, b) => b,
    default: () => [],
  }),

  receipts: Annotation<PipelineReceipt[]>({
    reducer: concat<PipelineReceipt>(),
    default: () => [],
  }),

  errors: Annotation<PipelineError[]>({
    reducer: concat<PipelineError>(),
    default: () => [],
  }),

  current_agent: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
  routing_decision: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
  routing_reason: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
});

export type PipelineGraphState = typeof PipelineStateAnnotation.State;

// ── Dependency injection ────────────────────────────────────────────────────

export interface GuardInput {
  queryFn?: <T>(text: string, params?: unknown[]) => Promise<T[]>;
  dryRun?: boolean;
}
export interface ClassifierInput {
  rawData?: CreatorTransitionStateRecord[];
  mockData?: boolean;
}
export interface ChannelHeadInput {
  contexts?: ChannelHeadDecisionContext[];
}

let guardInput: GuardInput = { dryRun: true };
let classifierInput: ClassifierInput = { mockData: true };
let channelHeadInput: ChannelHeadInput = {};

export function setGraphInputs(g: GuardInput, c: ClassifierInput, h: ChannelHeadInput): void {
  guardInput = { ...guardInput, ...g };
  classifierInput = { ...classifierInput, ...c };
  channelHeadInput = { ...channelHeadInput, ...h };
}

// ── Node: pipeline_guard ────────────────────────────────────────────────────

async function pipelineGuardNode(): Promise<Partial<PipelineGraphState>> {
  if (guardInput.dryRun) {
    return { guard_overall: "pass", guard_blocked: false, current_agent: "pipeline_guard" };
  }
  try {
    const { runPipelineGuardAudit } = await import("../pipeline-guard-audit");
    const queryFn = guardInput.queryFn;
    if (!queryFn) {
      return { guard_overall: "pass", guard_blocked: false, current_agent: "pipeline_guard" };
    }
    const audit = await runPipelineGuardAudit(queryFn);
    const blocked = audit.overall_status === "block";
    return {
      guard_overall: blocked ? "block" : "pass",
      guard_blocked: blocked,
      current_agent: "pipeline_guard",
    };
  } catch (err) {
    return {
      guard_overall: "block",
      guard_blocked: true,
      errors: [{ agent_id: "pipeline_guard", message: `${err}`, ts: new Date().toISOString() }],
      current_agent: "pipeline_guard",
    };
  }
}

// ── Node: transition_classifier ─────────────────────────────────────────────

async function transitionClassifierNode(): Promise<Partial<PipelineGraphState>> {
  return {
    creator_states: classifierInput.rawData ?? [],
    current_agent: "transition_classifier",
  };
}

// ── Node: markov_trajectory ─────────────────────────────────────────────────

async function markovTrajectoryNode(state: PipelineGraphState): Promise<Partial<PipelineGraphState>> {
  const states = state.creator_states ?? [];

  if (states.length === 0) {
    return {
      transition_matrix: null,
      predictions: [],
      markov_report: null,
      routing_decision: "skip_no_data",
      routing_reason: "No transition states available",
      current_agent: "markov_trajectory",
    };
  }

  try {
    const { runMarkov } = await import("../markov/markov-agent");
    const report = await runMarkov(states);
    const blocked = report.readiness === "block";
    return {
      transition_matrix: report.matrix,
      predictions: report.predictions,
      markov_report: report,
      routing_decision: blocked ? "block_unready" : "proceed",
      routing_reason: `Markov readiness: ${report.readiness}, ${report.creator_count} creators, ${report.matrix.total_observations} observations`,
      current_agent: "markov_trajectory",
    };
  } catch (err) {
    return {
      errors: [{ agent_id: "markov_trajectory", message: `${err}`, ts: new Date().toISOString() }],
      routing_decision: "error",
      routing_reason: `Markov execution failed: ${err}`,
      current_agent: "markov_trajectory",
    };
  }
}

// ── Conditional: after markov ───────────────────────────────────────────────

function routeAfterMarkov(state: PipelineGraphState): "block" | "skip" | "proceed" {
  const d = state.routing_decision;
  if (d === "error" || d === "block_unready") return "block";
  if (d === "skip_no_data") return "skip";
  return "proceed";
}

// ── Node: channel_head_decision ─────────────────────────────────────────────

async function channelHeadDecisionNode(state: PipelineGraphState): Promise<Partial<PipelineGraphState>> {
  const contexts = channelHeadInput.contexts ?? state.channel_head_contexts ?? [];

  if (contexts.length === 0) {
    return { channel_head_results: [], current_agent: "channel_head_decision" };
  }

  const { routeDecisions } = await import("./decision-router");

  try {
    const results = routeDecisions(contexts);
    return { channel_head_results: results, current_agent: "channel_head_decision" };
  } catch (err) {
    return {
      errors: [{ agent_id: "channel_head_decision", message: `${err}`, ts: new Date().toISOString() }],
      current_agent: "channel_head_decision",
    };
  }
}

// ── Node: receipt_writer ────────────────────────────────────────────────────

async function receiptWriterNode(state: PipelineGraphState): Promise<Partial<PipelineGraphState>> {
  const results = state.channel_head_results ?? [];

  const receipts: PipelineReceipt[] = [];

  for (const r of results) {
    if (!r.receipt) continue;
    receipts.push({
      receipt_id: r.receipt.receipt_id,
      agent_id: r.receipt.agent_id,
      created_at: r.receipt.created_at,
      status: r.receipt.status === "succeeded" ? "ok" : r.receipt.status === "failed" ? "failed" : "ok",
      summary: `${r.decision.decision} @ ${r.decision.confidence.toFixed(3)}`,
      payload_hash: undefined,
    });
  }

  return { receipts, current_agent: "receipt_writer" };
}

// ── Conditional: after guard ────────────────────────────────────────────────

function routeAfterGuard(state: PipelineGraphState): "block" | "pass" {
  return state.guard_blocked ? "block" : "pass";
}

// ── Build graph ─────────────────────────────────────────────────────────────

function buildGraph() {
  return new StateGraph(PipelineStateAnnotation)
    .addNode("pipeline_guard", pipelineGuardNode)
    .addNode("transition_classifier", transitionClassifierNode)
    .addNode("markov_trajectory", markovTrajectoryNode)
    .addNode("channel_head_decision", channelHeadDecisionNode)
    .addNode("receipt_writer", receiptWriterNode)

    .addEdge(START, "pipeline_guard")
    .addConditionalEdges("pipeline_guard", routeAfterGuard, {
      block: END,
      pass: "transition_classifier",
    } as const)

    .addEdge("transition_classifier", "markov_trajectory")
    .addConditionalEdges("markov_trajectory", routeAfterMarkov, {
      block: END,
      skip: "channel_head_decision",
      proceed: "channel_head_decision",
    } as const)

    .addEdge("channel_head_decision", "receipt_writer")
    .addEdge("receipt_writer", END)
    .compile();
}

/** Create a fresh compiled CallScore pipeline StateGraph. */
export function createCallScoreGraph(): ReturnType<typeof buildGraph> {
  return buildGraph();
}

/** Pre-compiled singleton — import this for direct use. */
export const callScoreGraph = createCallScoreGraph();
