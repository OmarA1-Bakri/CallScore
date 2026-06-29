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
import {
  runLinkedInOwnedPublishNode,
  runLinkedInPublicCommentNode,
  runLinkedInPublicReactionNode,
  runRedditCommunityMutationNode,
  runRedditOwnedProfilePublishNode,
  runRedditPublicUpvoteNode,
  runXFollowUserNode,
  runXOwnedPublishNode,
  runXPublicLikeNode,
  runXPublicReplyNode,
  runYoutubePublicLikeNode,
} from "./node-wrappers/social-publish-nodes";
import {
  runYoutubeMetadataUpdateNode,
  runYoutubePublicCommentNode,
  runYoutubeThumbnailUpdateNode,
  runYoutubeVideoPublishNode,
} from "./node-wrappers/video-publish-nodes";
import type { GraphOwnedMutationDecision } from "./node-wrappers/external-mutation-node-utils";
import { validatePublishedReceiptIntegrity } from "./external-mutation-guard";
import { executeGraphOwnedProviderCall, needsProviderCall, preflightGraphOwnedProviderCall } from "./node-wrappers/graph-owned-provider-adapter";

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

export function buildInitialOperatingState(input: Partial<NormalizedOperatingGoalConfig> & { goal: NormalizedOperatingGoalConfig["goal"], artifacts?: Record<string, unknown> }): OperatingGraphState {
  return OperatingGraphStateSchema.parse({
    config: normalizeOperatingGoalConfig(input),
    node_results: [],
    receipts: [],
    blockers: [],
    warnings: [],
    errors: [],
    mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
    artifacts: input.artifacts ?? {},
  });
}

function stateHasBlockingPreflight(state: OperatingGraphState): boolean {
  const lastGate = [...state.node_results].reverse().find((result) => result.node_id === "hard_gate_preflight");
  return Boolean(lastGate?.status === "blocked" || state.blockers.length > 0 || state.errors.length > 0);
}

function routeAfterPreflight(state: OperatingGraphState) {
  const parsed = OperatingGraphStateSchema.parse(state);
  if (stateHasBlockingPreflight(parsed)) return "collect_receipts";
  return "external_mutation_preflight";
}

function graphMutationInputs(state: OperatingGraphState): Record<string, unknown> {
  const raw = state.artifacts.graph_mutation_inputs;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function hasGraphMutationInput(state: OperatingGraphState, nodeId: string): boolean {
  const value = graphMutationInputs(state)[nodeId];
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nodeAlreadyRan(state: OperatingGraphState, nodeId: string): boolean {
  return state.node_results.some((result) => result.node_id === nodeId);
}

function routeAfterExternalMutationPreflight(state: OperatingGraphState) {
  const parsed = OperatingGraphStateSchema.parse(state);
  if (stateHasBlockingPreflight(parsed)) return "collect_receipts";
  if (parsed.config.mode === "live_owned_public") {
    for (const nodeId of [
      "x_owned_publish_node",
      "linkedin_owned_publish_node",
      "x_public_reply_node",
      "x_follow_user_node",
      "linkedin_public_comment_node",
      "linkedin_public_reaction_node",
      "reddit_owned_publish_node",
      "reddit_public_comment_node",
      "youtube_public_comment_node",
      "x_public_like_node",
      "reddit_public_upvote_node",
      "youtube_public_like_node",
    ] as const) {
      if (hasGraphMutationInput(parsed, nodeId) && !nodeAlreadyRan(parsed, nodeId)) return nodeId;
    }
  }
  return routeOperatingGoalToNode(parsed.config.goal);
}

function routeAfterXOwnedPublish(state: OperatingGraphState) {
  const parsed = OperatingGraphStateSchema.parse(state);
  if (stateHasBlockingPreflight(parsed)) return "collect_receipts";
  if (hasGraphMutationInput(parsed, "linkedin_owned_publish_node") && !nodeAlreadyRan(parsed, "linkedin_owned_publish_node")) return "linkedin_owned_publish_node";
  return "collect_receipts";
}

function routeAfterLinkedInOwnedPublish(state: OperatingGraphState) {
  const parsed = OperatingGraphStateSchema.parse(state);
  if (stateHasBlockingPreflight(parsed)) return "collect_receipts";
  if (hasGraphMutationInput(parsed, "x_owned_publish_node") && !nodeAlreadyRan(parsed, "x_owned_publish_node")) return "x_owned_publish_node";
  return "collect_receipts";
}

export const externalMutationPreflightNode = wrapDirectFunctionNode({
  nodeId: "external_mutation_preflight",
  domain: "gating",
  run: async ({ state }) => {
    const cfg = state.config;
    const mutationMode = cfg.mode === "approved_publish" || cfg.mode === "bounded_write";
    if (mutationMode && !cfg.approvalReceiptId && !cfg.approvedByOperator) {
      return {
        status: "blocked" as const,
        summary: `External mutation mode=${cfg.mode} requires graph approval evidence before goal lane execution.`,
        blockers: ["external_mutation_approval_missing"],
        detail: { goal: cfg.goal, mode: cfg.mode, graph_owned_provider_nodes_required: true },
        mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
      };
    }

    return {
      status: "ok" as const,
      summary: `External mutation preflight passed for goal=${cfg.goal} mode=${cfg.mode}; provider mutations remain graph-node-only.`,
      blockers: [],
      detail: {
        goal: cfg.goal,
        mode: cfg.mode,
        provider_mutation_allowed_outside_graph: false,
        graph_owned_mutation_nodes: [
          "x_owned_publish_node",
          "x_public_reply_node",
          "x_follow_user_node",
          "linkedin_owned_publish_node",
          "linkedin_public_comment_node",
          "reddit_owned_publish_node",
          "reddit_public_comment_node",
          "youtube_publish_node",
          "youtube_public_comment_node",
          "youtube_thumbnail_update_node",
          "youtube_metadata_update_node",
          "gmail_send_node",
          "resend_alert_send_node",
          "whop_mutation_node",
          "attio_write_node",
          "posthog_write_node",
        ],
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
  },
});

function graphOwnedMutationPlaceholderNode(nodeId: string) {
  return wrapDirectFunctionNode({
    nodeId,
    domain: "gating",
    run: async () => ({
      status: "blocked" as const,
      summary: `${nodeId} is registered in the operating graph and must be reached only by an explicit approved mutation edge.`,
      blockers: ["graph_mutation_node_not_routed"],
      detail: { node_id: nodeId, provider_mutation_allowed_outside_graph: false },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function graphMutationInputFor(state: OperatingGraphState, nodeId: string): Record<string, unknown> {
  const keyed = isRecord(state.artifacts.graph_mutation_inputs)
    ? state.artifacts.graph_mutation_inputs[nodeId]
    : undefined;
  if (isRecord(keyed)) return keyed;
  const generic = state.artifacts.external_mutation_input;
  return isRecord(generic) ? generic : {};
}

function graphOwnedMutationWrapperNode(nodeId: string, runner: (input: Record<string, unknown>) => GraphOwnedMutationDecision) {
  return wrapDirectFunctionNode({
    nodeId,
    domain: "gating",
    run: async ({ state }) => {
      const input = graphMutationInputFor(state, nodeId);

      // ── Graph-owned provider execution ──
      // Provider calls may happen only after the same graph guard proves that
      // this node has valid graph context, payload hash, platform, and action.
      if (needsProviderCall(input)) {
        if (state.config.dryRun) {
          return {
            status: "blocked" as const,
            summary: `${nodeId} did not call provider: draft_only_external_mutation_blocked.`,
            blockers: ["draft_only_external_mutation_blocked"],
            detail: {
              node_id: nodeId,
              provider_call_permitted: false,
              provider_calls: [],
              provider_response: null,
              receipt: null,
              blocker_code: "draft_only_external_mutation_blocked",
            },
            mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
          };
        }

        const preflight = preflightGraphOwnedProviderCall(nodeId, input);
        if (!preflight.ok) {
          return {
            status: "blocked" as const,
            summary: `${nodeId} did not call provider: ${preflight.blockerCode ?? "graph_preflight_failed"}.`,
            blockers: [preflight.blockerCode ?? "graph_preflight_failed"],
            detail: {
              node_id: nodeId,
              provider_call_permitted: false,
              provider_calls: [],
              provider_response: null,
              receipt: null,
              blocker_code: preflight.blockerCode ?? "graph_preflight_failed",
            },
            mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
          };
        }

        const tool = input["provider_tool"] as string;
        const payload = input["provider_payload"] as Record<string, unknown>;
        const result = await executeGraphOwnedProviderCall(tool, payload);
        input["provider_response"] = result.response;
        input["provider_execution_receipt_id"] = result.executionReceiptId;
        input["provider_execution_receipt_path"] = result.executionReceiptPath;
        input["child_receipt_ids"] = [
          ...(Array.isArray(input["child_receipt_ids"])
            ? (input["child_receipt_ids"] as string[])
            : []),
          result.executionReceiptId,
        ];

        if (!result.ok) {
          return {
            status: "blocked" as const,
            summary: `${nodeId} provider call blocked: ${result.blockerCode ?? "provider_call_failed"}.`,
            blockers: [result.blockerCode ?? "provider_call_failed"],
            detail: {
              node_id: nodeId,
              provider_call_permitted: true,
              provider_calls: [{ tool, payload }],
              provider_response: result.response,
              provider_execution_receipt_id: result.executionReceiptId,
              provider_execution_receipt_path: result.executionReceiptPath,
              receipt: null,
              blocker_code: result.blockerCode ?? "provider_call_failed",
            },
            mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
          };
        }
      }

      const decision = runner(input);
      const blocker = decision.blocker_code ? [decision.blocker_code] : [];
      return {
        status: decision.status,
        summary: decision.status === "ok"
          ? `${nodeId} completed graph-owned provider mutation.`
          : `${nodeId} did not call provider: ${decision.blocker_code ?? decision.status}.`,
        blockers: decision.status === "ok" ? [] : blocker,
        detail: {
          node_id: nodeId,
          provider_call_permitted: decision.provider_call_permitted,
          provider_calls: decision.provider_calls,
          provider_response: decision.provider_response ?? null,
          receipt: decision.receipt ?? null,
          blocker_code: decision.blocker_code ?? null,
        },
        mutation_flags: decision.mutation_flags,
      };
    },
  });
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

function auditPublishedReceiptIntegrity(input: {
  readonly receipts: readonly OperatingReceipt[];
  readonly results: readonly OperatingNodeResult[];
}): string[] {
  const candidates: Record<string, unknown>[] = [];
  for (const result of input.results) {
    if (isRecord(result.detail.receipt)) candidates.push(result.detail.receipt);
    if (isRecord(result.detail)) candidates.push(result.detail);
  }
  for (const receipt of input.receipts) candidates.push(receipt as unknown as Record<string, unknown>);
  return candidates.flatMap((candidate) => {
    const verdict = validatePublishedReceiptIntegrity(candidate);
    return verdict.ok ? [] : [verdict.blocker_code ?? "parent_provider_mutation_not_graph_owned"];
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
    ...auditPublishedReceiptIntegrity({ receipts: parsed.receipts, results: parsed.node_results }),
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

  // Build human-readable summary from aggregated node results
  const nodeStatusSummary = (() => {
    const blockParts: string[] = [];
    const blockedNodes = parsed.node_results.filter((r) => r.status === "blocked");
    for (const bn of blockedNodes) {
      const bl = bn.blockers ?? [];
      if (bl.length > 0) {
        blockParts.push(`${bn.node_id}:\`${bl.join(", ")}\``);
      }
    }
    const blockedNodeCount = blockedNodes.length;
    const okNodeCount = parsed.node_results.filter((r) => r.status === "ok").length;
    const parts: string[] = [];
    if (status === "ok") {
      parts.push(`All ${parsed.node_results.length} node(s) passed (${okNodeCount} ok).`);
    } else {
      parts.push(`Status=${status}: ${okNodeCount} ok, ${blockedNodeCount} blocked.`);
    }
    if (blockParts.length > 0) {
      parts.push("Blockers: " + blockParts.join("; "));
    }
    if (auditBlockers.length > 0) {
      parts.push("Audit: " + auditBlockers.join(", "));
    }
    return parts.join(" ");
  })();

  const summary = OperatingSummarySchema.parse({
    schema_version: "callscore_operating_summary.v1",
    goal: parsed.config.goal,
    status,
    child_receipt_ids: childReceiptIds,
    summary: nodeStatusSummary,
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
    .addNode("external_mutation_preflight", externalMutationPreflightNode)
    .addNode("x_owned_publish_node", graphOwnedMutationWrapperNode("x_owned_publish_node", runXOwnedPublishNode))
    .addNode("x_public_reply_node", graphOwnedMutationWrapperNode("x_public_reply_node", runXPublicReplyNode))
    .addNode("x_follow_user_node", graphOwnedMutationWrapperNode("x_follow_user_node", runXFollowUserNode))
    .addNode("linkedin_owned_publish_node", graphOwnedMutationWrapperNode("linkedin_owned_publish_node", runLinkedInOwnedPublishNode))
    .addNode("linkedin_public_comment_node", graphOwnedMutationWrapperNode("linkedin_public_comment_node", runLinkedInPublicCommentNode))
    .addNode("reddit_owned_publish_node", graphOwnedMutationWrapperNode("reddit_owned_publish_node", runRedditOwnedProfilePublishNode))
    .addNode("reddit_public_comment_node", graphOwnedMutationWrapperNode("reddit_public_comment_node", runRedditCommunityMutationNode))
    .addNode("youtube_publish_node", graphOwnedMutationWrapperNode("youtube_publish_node", runYoutubeVideoPublishNode))
    .addNode("youtube_public_comment_node", graphOwnedMutationWrapperNode("youtube_public_comment_node", runYoutubePublicCommentNode))
    .addNode("x_public_like_node", graphOwnedMutationWrapperNode("x_public_like_node", runXPublicLikeNode))
    .addNode("linkedin_public_reaction_node", graphOwnedMutationWrapperNode("linkedin_public_reaction_node", runLinkedInPublicReactionNode))
    .addNode("reddit_public_upvote_node", graphOwnedMutationWrapperNode("reddit_public_upvote_node", runRedditPublicUpvoteNode))
    .addNode("youtube_public_like_node", graphOwnedMutationWrapperNode("youtube_public_like_node", runYoutubePublicLikeNode))
    .addNode("youtube_thumbnail_update_node", graphOwnedMutationWrapperNode("youtube_thumbnail_update_node", runYoutubeThumbnailUpdateNode))
    .addNode("youtube_metadata_update_node", graphOwnedMutationWrapperNode("youtube_metadata_update_node", runYoutubeMetadataUpdateNode))
    .addNode("gmail_send_node", graphOwnedMutationPlaceholderNode("gmail_send_node"))
    .addNode("resend_alert_send_node", graphOwnedMutationPlaceholderNode("resend_alert_send_node"))
    .addNode("whop_mutation_node", graphOwnedMutationPlaceholderNode("whop_mutation_node"))
    .addNode("attio_write_node", graphOwnedMutationPlaceholderNode("attio_write_node"))
    .addNode("posthog_write_node", graphOwnedMutationPlaceholderNode("posthog_write_node"))
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
      external_mutation_preflight: "external_mutation_preflight",
    })
    .addConditionalEdges("external_mutation_preflight", routeAfterExternalMutationPreflight, {
      revenue_goal_loop: "revenue_goal_loop",
      data_goal_loop: "data_goal_loop",
      worker_dispatch_goal_loop: "worker_dispatch_goal_loop",
      video_goal_loop: "video_goal_loop",
      monitoring_goal_loop: "monitoring_goal_loop",
      trust_goal_loop: "trust_goal_loop",
      alert_goal_loop: "alert_goal_loop",
      evidence_goal_loop: "evidence_goal_loop",
      x_owned_publish_node: "x_owned_publish_node",
      x_public_reply_node: "x_public_reply_node",
      x_follow_user_node: "x_follow_user_node",
      linkedin_owned_publish_node: "linkedin_owned_publish_node",
      linkedin_public_comment_node: "linkedin_public_comment_node",
      reddit_owned_publish_node: "reddit_owned_publish_node",
      reddit_public_comment_node: "reddit_public_comment_node",
      youtube_publish_node: "youtube_publish_node",
      youtube_public_comment_node: "youtube_public_comment_node",
      youtube_thumbnail_update_node: "youtube_thumbnail_update_node",
      youtube_metadata_update_node: "youtube_metadata_update_node",
      x_public_like_node: "x_public_like_node",
      linkedin_public_reaction_node: "linkedin_public_reaction_node",
      reddit_public_upvote_node: "reddit_public_upvote_node",
      youtube_public_like_node: "youtube_public_like_node",
      gmail_send_node: "gmail_send_node",
      resend_alert_send_node: "resend_alert_send_node",
      whop_mutation_node: "whop_mutation_node",
      attio_write_node: "attio_write_node",
      posthog_write_node: "posthog_write_node",
      collect_receipts: "collect_receipts",
    });

  builder
    .addConditionalEdges("x_owned_publish_node", routeAfterXOwnedPublish, {
      linkedin_owned_publish_node: "linkedin_owned_publish_node",
      collect_receipts: "collect_receipts",
    })
    .addConditionalEdges("linkedin_owned_publish_node", routeAfterLinkedInOwnedPublish, {
      x_owned_publish_node: "x_owned_publish_node",
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
    "x_public_reply_node",
    "x_follow_user_node",
    "linkedin_public_comment_node",
    "reddit_owned_publish_node",
    "reddit_public_comment_node",
    "youtube_publish_node",
    "youtube_public_comment_node",
    "youtube_thumbnail_update_node",
    "youtube_metadata_update_node",
    "x_public_like_node",
    "linkedin_public_reaction_node",
    "reddit_public_upvote_node",
    "youtube_public_like_node",
    "gmail_send_node",
    "resend_alert_send_node",
    "whop_mutation_node",
    "attio_write_node",
    "posthog_write_node",
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
