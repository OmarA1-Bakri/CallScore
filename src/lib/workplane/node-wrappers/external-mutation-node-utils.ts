import {
  DEFAULT_OPERATING_MUTATION_FLAGS,
  type MutationFlags,
} from "../operating-graph-schemas";
import { evaluateExternalMutationRequest, finalizeExternalMutationReceipt } from "../external-mutation-guard";
import { OperatingGraphMutationContextSchema } from "../external-mutation-schemas";
import type {
  ExternalMutationFamilySchema,
  ExternalMutationModeSchema,
  ExternalMutationPlatformSchema,
  OperatingGraphMutationContext,
} from "../external-mutation-schemas";
import type { z } from "zod";

type ExternalMutationPlatform = z.infer<typeof ExternalMutationPlatformSchema>;
type ExternalMutationFamily = z.infer<typeof ExternalMutationFamilySchema>;
type ExternalMutationMode = z.infer<typeof ExternalMutationModeSchema>;

export type GraphOwnedMutationDecision = {
  readonly status: "ok" | "blocked" | "failed";
  readonly blocker_code?: string;
  readonly node_id: string;
  readonly provider_call_permitted: boolean;
  readonly provider_calls: readonly Record<string, unknown>[];
  readonly provider_response?: unknown;
  readonly receipt?: unknown;
  readonly mutation_flags: MutationFlags;
};

export interface GraphOwnedMutationNodeOptions {
  readonly input: Record<string, unknown>;
  readonly nodeId: string;
  readonly platform: ExternalMutationPlatform;
  readonly mutationFamily: ExternalMutationFamily;
  readonly mode: ExternalMutationMode;
  readonly requestedAction: "publish_owned_public" | "send_or_outreach" | "provider_mutation" | "whop_mutation";
  readonly missingProviderBlocker: string;
  readonly wrongNodeBlocker: string;
  readonly publicPublish?: boolean;
  readonly sendOrOutreach?: boolean;
  readonly whopMutation?: boolean;
  readonly extraMutationFlags?: Partial<MutationFlags>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function blankFlags(): MutationFlags {
  return { ...DEFAULT_OPERATING_MUTATION_FLAGS };
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

function graphContextFor(options: GraphOwnedMutationNodeOptions): OperatingGraphMutationContext | null {
  const raw = options.input.graph_context;
  if (!isRecord(raw)) return null;
  const parsed = OperatingGraphMutationContextSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function providerExecutionReceiptId(input: Record<string, unknown>, graphContext: OperatingGraphMutationContext | null): string | null {
  if (typeof input.provider_execution_receipt_id === "string" && input.provider_execution_receipt_id.trim()) {
    return input.provider_execution_receipt_id;
  }
  const extra = graphContext as (OperatingGraphMutationContext & { readonly provider_execution_receipt_id?: unknown }) | null;
  return typeof extra?.provider_execution_receipt_id === "string" && extra.provider_execution_receipt_id.trim()
    ? extra.provider_execution_receipt_id
    : null;
}

function approvalReceipt(input: Record<string, unknown>, graphContext: OperatingGraphMutationContext | null): string | null {
  if (hasOwn(input, "approval_receipt_id")) {
    return typeof input.approval_receipt_id === "string" && input.approval_receipt_id.trim()
      ? input.approval_receipt_id
      : null;
  }
  return typeof graphContext?.approval_receipt_id === "string" && graphContext.approval_receipt_id.trim()
    ? graphContext.approval_receipt_id
    : null;
}

function approved(input: Record<string, unknown>, receiptId: string | null): boolean {
  if (typeof input.approved === "boolean") return input.approved;
  return Boolean(receiptId);
}

function blocked(nodeId: string, blockerCode: string, flags: MutationFlags = blankFlags(), receipt?: unknown): GraphOwnedMutationDecision {
  return {
    status: "blocked",
    blocker_code: blockerCode,
    node_id: nodeId,
    provider_call_permitted: false,
    provider_calls: [],
    receipt,
    mutation_flags: flags,
  };
}

function failed(nodeId: string, blockerCode: string, response: unknown, flags: MutationFlags, receipt?: unknown): GraphOwnedMutationDecision {
  return {
    status: "failed",
    blocker_code: blockerCode,
    node_id: nodeId,
    provider_call_permitted: false,
    provider_calls: [],
    provider_response: response,
    receipt,
    mutation_flags: flags,
  };
}

function successFlags(options: GraphOwnedMutationNodeOptions): MutationFlags {
  return {
    ...DEFAULT_OPERATING_MUTATION_FLAGS,
    external_mutation_performed: true,
    provider_mutation_performed: true,
    public_publish_performed: options.publicPublish === true,
    send_or_outreach_performed: options.sendOrOutreach === true,
    whop_mutation_performed: options.whopMutation === true,
    ...(options.extraMutationFlags ?? {}),
  };
}

export function runGraphOwnedMutationNode(options: GraphOwnedMutationNodeOptions): GraphOwnedMutationDecision {
  const rawGraphContext = options.input.graph_context;
  if (isRecord(rawGraphContext) && typeof rawGraphContext.graph_node_id === "string" && rawGraphContext.graph_node_id.trim() && rawGraphContext.graph_node_id !== options.nodeId) {
    return blocked(options.nodeId, options.wrongNodeBlocker);
  }

  const graphContext = graphContextFor(options);
  const receiptId = approvalReceipt(options.input, graphContext);
  const approvalOk = approved(options.input, receiptId);
  const providerTool = typeof options.input.provider_tool === "string" && options.input.provider_tool.trim()
    ? options.input.provider_tool
    : null;

  if (graphContext && graphContext.graph_node_id !== options.nodeId) {
    return blocked(options.nodeId, options.wrongNodeBlocker);
  }

  if (!providerTool) {
    return blocked(options.nodeId, options.missingProviderBlocker);
  }

  const providerPayload = hasOwn(options.input, "provider_payload") ? options.input.provider_payload : options.input.payload;
  if (hasOwn(options.input, "provider_payload") && hasOwn(options.input, "payload") && stableJson(options.input.provider_payload) !== stableJson(options.input.payload)) {
    return blocked(options.nodeId, "approved_payload_hash_mismatch");
  }

  const preflight = evaluateExternalMutationRequest({
    mode: options.mode,
    graph_context: graphContext,
    requested_action: options.requestedAction,
    platform: options.platform,
    provider_tool: providerTool ?? undefined,
    provider_payload: providerPayload,
    approved: approvalOk,
    approval_receipt_id: receiptId,
    mutation_flags: blankFlags(),
  });
  if (!preflight.allowed) {
    return blocked(options.nodeId, preflight.blocker_code ?? options.wrongNodeBlocker, blankFlags(), preflight.receipt);
  }

  const executionReceiptId = providerExecutionReceiptId(options.input, graphContext);
  if (!executionReceiptId) {
    return blocked(options.nodeId, "provider_execution_receipt_required");
  }

  const flags = successFlags(options);
  const finalized = finalizeExternalMutationReceipt({
    mode: options.mode,
    graph_context: graphContext,
    requested_action: options.requestedAction,
    platform: options.platform,
    provider_tool: providerTool,
    approved: approvalOk,
    approval_receipt_id: receiptId,
    provider_response: options.input.provider_response,
    provider_payload: providerPayload,
    mutation_flags: flags,
    provider_execution_receipt_id: executionReceiptId,
    child_receipt_ids: [executionReceiptId],
  });

  if (!finalized.allowed) {
    return failed(
      options.nodeId,
      finalized.blocker_code ?? "provider_success_required_before_mutation_flags",
      options.input.provider_response,
      blankFlags(),
      finalized.receipt,
    );
  }

  return {
    status: "ok",
    node_id: options.nodeId,
    provider_call_permitted: true,
    provider_calls: [{ tool: providerTool, payload: providerPayload ?? null }],
    provider_response: options.input.provider_response,
    receipt: finalized.receipt,
    mutation_flags: flags,
  };
}
