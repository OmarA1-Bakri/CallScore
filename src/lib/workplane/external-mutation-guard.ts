import { createHash } from "node:crypto";

import {
  DEFAULT_OPERATING_MUTATION_FLAGS,
  type MutationFlags,
} from "./operating-graph-schemas";
import {
  ExternalMutationGuardRequestSchema,
  type ExternalMutationBlockerCode,
  type ExternalMutationGuardRequest,
  type ExternalMutationReceipt,
} from "./external-mutation-schemas";

type GuardDecision = {
  readonly allowed: boolean;
  readonly blocker_code?: ExternalMutationBlockerCode;
  readonly provider_call_permitted?: boolean;
  readonly receipt?: ExternalMutationReceipt;
};

type ProviderResponse = Record<string, unknown>;

function normalizeRequest(input: Record<string, unknown>): ExternalMutationGuardRequest {
  return ExternalMutationGuardRequestSchema.parse(input);
}

function normalizedFlags(flags: Partial<MutationFlags> | null | undefined): MutationFlags {
  return { ...DEFAULT_OPERATING_MUTATION_FLAGS, ...(flags ?? {}) };
}

function anyMutationFlag(flags: Partial<MutationFlags> | null | undefined): boolean {
  return Object.values(normalizedFlags(flags)).some(Boolean);
}

function providerSucceeded(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const providerResponse = response as ProviderResponse;
  return providerResponse.ok === true || providerResponse.success === true || providerResponse.status === "ok";
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

function providerExternalObject(response: unknown): { external_url: string | null; external_object_id: string | null } {
  if (!response || typeof response !== "object") {
    return { external_url: null, external_object_id: null };
  }
  const providerResponse = response as ProviderResponse;
  const id = providerResponse.id ?? providerResponse.object_id ?? providerResponse.external_object_id ?? providerResponse.x_restli_id ?? providerResponse.urn ?? providerResponse.videoId ?? providerResponse.youtubeVideoId;
  const url = providerResponse.url ?? providerResponse.external_url ?? providerResponse.publishUrl;
  return {
    external_url: typeof url === "string" && url.trim() ? url : null,
    external_object_id: typeof id === "string" && id.trim() ? id : null,
  };
}

function payloadHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
}

function providerExecutionReceiptId(request: ExternalMutationGuardRequest): string | null {
  return request.provider_execution_receipt_id ?? request.graph_context?.provider_execution_receipt_id ?? null;
}

function receiptId(request: ExternalMutationGuardRequest, status: "ok" | "failed"): string {
  const graphContext = request.graph_context ?? undefined;
  const providerObject = providerExternalObject(request.provider_response);
  const material = stableJson({
    status,
    run: graphContext?.operating_graph_run_id,
    node: graphContext?.graph_node_id,
    goal: graphContext?.goal,
    platform: graphContext?.platform ?? request.platform,
    tool: request.provider_tool,
    object: providerObject,
    parent: request.parent_receipt_id ?? graphContext?.parent_receipt_id,
    children: request.child_receipt_ids,
  });
  return `external-mutation-${createHash("sha256").update(material).digest("hex").slice(0, 16)}`;
}

function platformFromProviderTool(tool: string | null | undefined): string | null {
  if (!tool) return null;
  const prefix = tool.split("_")[0]?.toLowerCase();
  if (prefix === "twitter" || prefix === "x") return "x";
  if (["linkedin", "reddit", "youtube", "gmail", "resend", "whop", "attio", "posthog"].includes(prefix)) return prefix;
  return null;
}

function isProviderMutationIntent(request: ExternalMutationGuardRequest): boolean {
  return Boolean(request.provider_tool || request.requested_action || anyMutationFlag(request.mutation_flags));
}

function missingGraphContextBlocker(request: ExternalMutationGuardRequest): ExternalMutationBlockerCode {
  const platform = request.platform;
  const action = request.requested_action;
  const tool = request.provider_tool ?? "";

  if (platform === "gmail" || platform === "resend" || action === "send_or_outreach") {
    return "non_graph_email_send_blocked";
  }
  if (platform === "whop" || action === "whop_mutation") {
    return "non_graph_whop_mutation_blocked";
  }
  if (platform === "attio" || platform === "posthog") {
    return "non_graph_crm_write_blocked";
  }
  if (platform === "reddit") {
    return "non_graph_reddit_mutation_blocked";
  }
  if (platform === "youtube" || tool.startsWith("YOUTUBE_")) {
    return "non_graph_youtube_mutation_blocked";
  }
  if (action === "publish_owned_public") {
    return "missing_operating_graph_context";
  }
  return "non_graph_external_mutation_blocked";
}

function blocked(blockerCode: ExternalMutationBlockerCode, receipt?: ExternalMutationReceipt): GuardDecision {
  return {
    allowed: false,
    blocker_code: blockerCode,
    provider_call_permitted: false,
    receipt,
  };
}

function receiptBase(
  request: ExternalMutationGuardRequest,
  status: "ok" | "failed",
  blockerCode?: ExternalMutationBlockerCode,
): Omit<ExternalMutationReceipt, "provider_mutation_performed" | "public_publish_performed" | "public_engagement_performed" | "external_url" | "external_object_id" | "provider_response"> {
  const graphContext = request.graph_context ?? undefined;
  return {
    receipt_id: receiptId(request, status),
    status,
    blocker_code: blockerCode,
    goal: graphContext?.goal ?? null,
    platform: graphContext?.platform ?? request.platform ?? null,
    acting_agent_id: graphContext?.acting_agent_id ?? null,
    authority: graphContext?.authority ?? null,
    approval_receipt_id: request.approval_receipt_id ?? graphContext?.approval_receipt_id ?? null,
    evidence_receipt_id: graphContext?.evidence_receipt_id ?? null,
    originality_receipt_id: graphContext?.originality_receipt_id ?? null,
    approved_payload_hash: graphContext?.approved_payload_hash ?? null,
    dry_run: graphContext?.dry_run ?? null,
    provider_tool: request.provider_tool ?? null,
    provider_execution_receipt_id: providerExecutionReceiptId(request),
    operating_graph_run_id: graphContext?.operating_graph_run_id ?? null,
    graph_node_id: graphContext?.graph_node_id ?? null,
    parent_receipt_id: request.parent_receipt_id ?? graphContext?.parent_receipt_id ?? request.approval_receipt_id ?? graphContext?.approval_receipt_id ?? null,
    child_receipt_ids: request.child_receipt_ids,
  };
}

function failedReceipt(
  request: ExternalMutationGuardRequest,
  blockerCode: ExternalMutationBlockerCode | undefined,
): ExternalMutationReceipt {
  const providerObject = providerExternalObject(request.provider_response);
  return {
    ...receiptBase(request, "failed", blockerCode),
    provider_mutation_performed: false,
    public_publish_performed: false,
    public_engagement_performed: false,
    external_url: providerObject.external_url,
    external_object_id: providerObject.external_object_id,
    provider_response: request.provider_response,
  };
}

function okReceipt(request: ExternalMutationGuardRequest): ExternalMutationReceipt {
  const flags = normalizedFlags(request.mutation_flags);
  const providerObject = providerExternalObject(request.provider_response);
  return {
    ...receiptBase(request, "ok"),
    provider_mutation_performed: flags.provider_mutation_performed,
    public_publish_performed: flags.public_publish_performed,
    public_engagement_performed: Boolean(flags.public_engagement_performed),
    external_url: providerObject.external_url,
    external_object_id: providerObject.external_object_id,
    provider_response: request.provider_response,
  };
}

function validateGraphRoute(request: ExternalMutationGuardRequest): ExternalMutationBlockerCode | null {
  const graphContext = request.graph_context;
  if (!graphContext) return missingGraphContextBlocker(request);

  if (request.platform && request.platform !== graphContext.platform) {
    return "graph_context_platform_mismatch";
  }

  const providerToolPlatform = platformFromProviderTool(request.provider_tool);
  if (providerToolPlatform && providerToolPlatform !== graphContext.platform) {
    return "provider_tool_platform_mismatch";
  }

  return null;
}

export function evaluateExternalMutationRequest(input: Record<string, unknown>): GuardDecision {
  const request = normalizeRequest(input);
  const flags = normalizedFlags(request.mutation_flags);
  const mode = request.mode ?? "bounded_write";

  if (isProviderMutationIntent(request) && mode !== "approved_publish" && mode !== "live_owned_public" && mode !== "bounded_write") {
    return blocked(mode === "draft_only" ? "draft_only_external_mutation_blocked" : "non_graph_external_mutation_blocked");
  }

  const routeBlocker = validateGraphRoute(request);
  if (routeBlocker) return blocked(routeBlocker);

  if (isProviderMutationIntent(request) && request.provider_payload !== undefined && (request.provider_payload === null || (typeof request.provider_payload === "object" && Object.keys(request.provider_payload as Record<string, unknown>).length === 0))) {
    return blocked("payload_missing");
  }

  if ((request.requested_action === "public_engagement" || request.graph_context?.mutation_family === "public_engagement") && !request.target_url_or_id) {
    return blocked("target_missing");
  }

  const providerObject = providerExternalObject(request.provider_response);
  const hasProviderObject = Boolean(providerObject.external_object_id || providerObject.external_url);
  if (hasProviderObject && !anyMutationFlag(flags)) {
    return blocked("external_object_id_without_mutation_flag");
  }

  if (anyMutationFlag(flags) && !request.provider_response) {
    return blocked("provider_success_required_before_mutation_flags", failedReceipt(request, "provider_success_required_before_mutation_flags"));
  }

  if (anyMutationFlag(flags) && request.provider_response && !providerSucceeded(request.provider_response)) {
    return blocked("provider_success_required_before_mutation_flags", failedReceipt(request, "provider_success_required_before_mutation_flags"));
  }

  if ((request.mode === "approved_publish" || request.mode === "bounded_write") && (!request.approved || !request.approval_receipt_id)) {
    return blocked("approval_missing");
  }

  const graphContext = request.graph_context;
  if (!graphContext) return blocked(missingGraphContextBlocker(request));

  if (mode === "approved_publish" && (graphContext.mutation_family === "public_publish" || graphContext.mutation_family === "video_publish")
    && (!graphContext.evidence_receipt_id || !graphContext.originality_receipt_id)) {
    return blocked("evidence_originality_receipts_required");
  }

  if (request.provider_payload !== undefined && graphContext.approved_payload_hash !== payloadHash(request.provider_payload)) {
    return blocked("approved_payload_hash_mismatch");
  }

  return {
    allowed: true,
    provider_call_permitted: true,
    receipt: okReceipt(request),
  };
}

export type PublishedReceiptIntegrityDecision = {
  readonly ok: boolean;
  readonly blocker_code?: "parent_provider_mutation_not_graph_owned";
};

function isExternalMutationClaim(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return receipt.provider_action_performed === true
    || receipt.public_post_published === true
    || receipt.external_mutation_performed === true
    || receipt.public_publish_performed === true;
}

function childReceiptHasGraphOwnedProof(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  const response = receipt.provider_response;
  const object = providerExternalObject(response);
  return receipt.status === "ok"
    && typeof receipt.operating_graph_run_id === "string" && receipt.operating_graph_run_id.trim().length > 0
    && typeof receipt.graph_node_id === "string" && receipt.graph_node_id.trim().length > 0
    && typeof receipt.provider_tool === "string" && receipt.provider_tool.trim().length > 0
    && typeof receipt.provider_execution_receipt_id === "string" && receipt.provider_execution_receipt_id.trim().length > 0
    && typeof receipt.approved_payload_hash === "string" && /^sha256:[a-f0-9]{64}$/.test(receipt.approved_payload_hash)
    && response !== undefined
    && Boolean(object.external_object_id || object.external_url);
}

export function validatePublishedReceiptIntegrity(receipt: Record<string, unknown>): PublishedReceiptIntegrityDecision {
  if (!isExternalMutationClaim(receipt)) return { ok: true };
  if (childReceiptHasGraphOwnedProof(receipt)) return { ok: true };
  const providerProof = receipt.provider_proof;
  if (providerProof && typeof providerProof === "object" && !Array.isArray(providerProof)) {
    const tool = String((providerProof as Record<string, unknown>).tool ?? "");
    if (/mcp_composio_COMPOSIO_MULTI_EXECUTE_TOOL/i.test(tool)) {
      return { ok: false, blocker_code: "parent_provider_mutation_not_graph_owned" };
    }
  }
  const children = Array.isArray(receipt.child_external_mutation_receipts)
    ? receipt.child_external_mutation_receipts
    : Array.isArray(receipt.external_mutation_receipts)
      ? receipt.external_mutation_receipts
      : [];
  return children.some(childReceiptHasGraphOwnedProof)
    ? { ok: true }
    : { ok: false, blocker_code: "parent_provider_mutation_not_graph_owned" };
}

export function finalizeExternalMutationReceipt(input: Record<string, unknown>): GuardDecision {
  const request = normalizeRequest(input);
  const preflight = evaluateExternalMutationRequest(input);
  if (!preflight.allowed) {
    if (request.provider_response && !providerSucceeded(request.provider_response)) {
      return {
        ...preflight,
        receipt: failedReceipt(request, preflight.blocker_code),
      };
    }
    return preflight;
  }

  if (!providerSucceeded(request.provider_response)) {
    return blocked("provider_success_required_before_mutation_flags", failedReceipt(request, "provider_success_required_before_mutation_flags"));
  }

  if (!providerExecutionReceiptId(request)) {
    return blocked("provider_execution_receipt_required", failedReceipt(request, "provider_execution_receipt_required"));
  }

  const executionReceiptId = providerExecutionReceiptId(request);
  if (!executionReceiptId || !request.child_receipt_ids.includes(executionReceiptId)) {
    return blocked("provider_execution_receipt_required", failedReceipt(request, "provider_execution_receipt_required"));
  }

  const providerObject = providerExternalObject(request.provider_response);
  if ((request.graph_context?.mutation_family === "public_publish" || request.graph_context?.mutation_family === "public_engagement" || request.graph_context?.mutation_family === "video_publish")
    && !providerObject.external_object_id && !providerObject.external_url) {
    return blocked("provider_external_object_required", failedReceipt(request, "provider_external_object_required"));
  }

  return {
    allowed: true,
    provider_call_permitted: true,
    receipt: okReceipt({
      ...request,
      child_receipt_ids: request.child_receipt_ids.includes(executionReceiptId) ? request.child_receipt_ids : [...request.child_receipt_ids, executionReceiptId],
      mutation_flags: {
        ...normalizedFlags(request.mutation_flags),
        external_mutation_performed: true,
        provider_mutation_performed: true,
        public_publish_performed: request.graph_context?.mutation_family === "public_publish" || request.graph_context?.mutation_family === "video_publish",
        public_engagement_performed: request.graph_context?.mutation_family === "public_engagement",
      },
    }),
  };
}
