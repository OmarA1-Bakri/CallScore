import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { evaluateExternalMutationRequest } from "../external-mutation-guard";
import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";

export interface ProviderExecutionResult {
  readonly ok: boolean;
  readonly response: Record<string, unknown>;
  readonly executionReceiptId: string;
  readonly executionReceiptPath: string | null;
  readonly blockerCode?: string;
  readonly error?: string;
  readonly statusCode?: number;
}

export interface ProviderCallPreflightResult {
  readonly ok: boolean;
  readonly blockerCode?: string;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return val;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function payloadHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}


function validateKnownProviderPayload(toolSlug: string, payload: Record<string, unknown>): string | null {
  if (toolSlug === "TWITTER_CREATION_OF_A_POST") {
    const hasText = typeof payload.text === "string" && payload.text.trim().length > 0;
    const hasMedia = Array.isArray(payload.media_media_ids) && payload.media_media_ids.length > 0;
    const hasQuote = typeof payload.quote_tweet_id === "string" && payload.quote_tweet_id.trim().length > 0;
    if (!hasText && !hasMedia && !hasQuote) return "payload_missing";
  }

  if (toolSlug === "TWITTER_FOLLOW_USER") {
    const targetUserId = typeof payload.target_user_id === "string" ? payload.target_user_id.trim() : "";
    if (!/^[0-9]{1,19}$/.test(targetUserId)) return "payload_missing";
  }

  if (toolSlug === "LINKEDIN_CREATE_LINKED_IN_POST") {
    const author = typeof payload.author === "string" ? payload.author.trim() : "";
    const commentary = typeof payload.commentary === "string" ? payload.commentary.trim() : "";
    if (!/^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(author)) return "blocked_auth";
    if (!commentary) return "payload_missing";
    if (commentary.length > 3000) return "payload_too_long";
  }

  if (toolSlug === "LINKEDIN_CREATE_COMMENT_ON_POST") {
    const actor = typeof payload.actor === "string" ? payload.actor.trim() : "";
    const target = typeof payload.target_urn === "string" ? payload.target_urn.trim() : "";
    const object = typeof payload.object === "string" ? payload.object.trim() : "";
    const message = isRecord(payload.message) && typeof payload.message.text === "string" ? payload.message.text.trim() : "";
    if (!/^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(actor)) return "blocked_auth";
    if (!/^urn:li:(share|ugcPost|comment):/.test(target) || !/^urn:li:(share|ugcPost):/.test(object)) return "target_missing";
    if (!message) return "payload_missing";
    if (message.length > 1250) return "payload_too_long";
  }

  return null;
}

function requestedActionFromMutationFamily(family: unknown): "publish_owned_public" | "public_engagement" | "send_or_outreach" | "provider_mutation" | "whop_mutation" {
  switch (family) {
    case "public_publish":
    case "video_publish":
    case "video_update":
      return "publish_owned_public";
    case "public_engagement":
      return "public_engagement";
    case "email_send":
    case "alert_send":
      return "send_or_outreach";
    case "whop_mutation":
      return "whop_mutation";
    default:
      return "provider_mutation";
  }
}

function blockerForHttpStatus(status: number, text: string, toolSlug: string): string {
  const haystack = `${toolSlug}\n${text}`.toLowerCase();
  if (status === 401 || status === 403) return "blocked_auth";
  if (status === 404) return "blocked_provider_missing";
  if (status === 409 || haystack.includes("duplicate") || haystack.includes("already posted")) return "blocked_duplicate_or_cadence";
  if (status === 429 || haystack.includes("rate limit") || haystack.includes("too many requests")) return "blocked_rate_limit";
  if (status >= 400 && haystack.includes("not found")) return "blocked_provider_missing";
  return "provider_call_failed";
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  return isRecord(value) && isRecord(value[key]) ? value[key] as Record<string, unknown> : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const stringValue = safeString(value);
    if (stringValue) return stringValue;
  }
  return null;
}

function firstStringFromArray(value: unknown): string | null {
  return Array.isArray(value) ? firstString(...value) : null;
}

function normalizeProviderResponse(
  toolSlug: string,
  body: Record<string, unknown>,
  statusOk: boolean,
  headers?: Headers,
): Record<string, unknown> {
  const data = nestedRecord(body, "data") ?? body;
  const innerData = nestedRecord(data, "data") ?? data;
  const restliId = headers?.get("x-restli-id") ?? headers?.get("x-linkedin-id") ?? null;
  const id = firstString(
    innerData.id,
    data.id,
    body.id,
    firstStringFromArray(innerData.edit_history_tweet_ids),
    firstStringFromArray(data.edit_history_tweet_ids),
    restliId,
  );
  const urn = firstString(innerData.urn, data.urn, body.urn, innerData.x_restli_id, data.x_restli_id, body.x_restli_id, restliId);
  const url = firstString(innerData.url, data.url, body.url, innerData.external_url, data.external_url, body.external_url, innerData.publishUrl, data.publishUrl, body.publishUrl);

  const normalized: Record<string, unknown> = {
    ...body,
    ok: statusOk,
    success: statusOk ? true : undefined,
  };

  if (id && !normalized.id) normalized.id = id;
  if (urn && !normalized.x_restli_id) normalized.x_restli_id = urn;
  if (url && !normalized.url) normalized.url = url;

  if (statusOk && toolSlug === "TWITTER_CREATION_OF_A_POST" && id && !normalized.url) {
    const handle = (process.env.CALLSCORE_X_HANDLE ?? process.env.X_USERNAME ?? "0marbakri").replace(/^@/, "");
    normalized.url = `https://x.com/${handle}/status/${id}`;
  }

  return normalized;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (/token|secret|authorization|cookie|api[_-]?key|password/i.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redact(val);
    }
  }
  return redacted;
}

function receiptDir(): string {
  const root = process.env.CALLSCORE_APP_DIR || process.cwd() || "/opt/crypto-tuber-ranked";
  const dir = join(root, ".tmp", "workflow-receipts", "provider_execution");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeProviderExecutionReceipt(input: {
  readonly executionReceiptId: string;
  readonly toolSlug: string;
  readonly payload: Record<string, unknown>;
  readonly ok: boolean;
  readonly response: Record<string, unknown>;
  readonly blockerCode?: string;
  readonly statusCode?: number;
  readonly error?: string;
}): string | null {
  try {
    const path = join(receiptDir(), `${input.executionReceiptId}.json`);
    writeFileSync(path, `${stableJson({
      schema: "callscore.graph_owned_provider_execution_receipt.v1",
      created_at_utc: new Date().toISOString(),
      receipt_id: input.executionReceiptId,
      provider_action_name: input.toolSlug,
      payload_hash: payloadHash(input.payload),
      ok: input.ok,
      blocker_code: input.blockerCode ?? null,
      status_code: input.statusCode ?? null,
      error: input.error ?? null,
      provider_response_summary: redact(input.response),
    })}\n`, { mode: 0o600 });
    return path;
  } catch {
    return null;
  }
}

export function providerExecutionReceiptId(toolSlug: string, payload: unknown): string {
  const material = stableJson({ tool: toolSlug, payload });
  return `provider-exec-${createHash("sha256").update(material).digest("hex").slice(0, 16)}`;
}

export function needsProviderCall(input: Record<string, unknown>): boolean {
  const tool = input.provider_tool;
  const payload = input.provider_payload;
  const hasResponse = input.provider_response !== undefined;
  return typeof tool === "string" && tool.trim().length > 0 && isRecord(payload) && Object.keys(payload).length > 0 && !hasResponse;
}

export function preflightGraphOwnedProviderCall(nodeId: string, input: Record<string, unknown>): ProviderCallPreflightResult {
  const graphContext = isRecord(input.graph_context) ? input.graph_context : null;
  const providerTool = safeString(input.provider_tool);
  const providerPayload = input.provider_payload;

  if (!graphContext) return { ok: false, blockerCode: "missing_operating_graph_context" };
  if (safeString(graphContext.graph_node_id) !== nodeId) return { ok: false, blockerCode: "non_graph_publish_blocked" };
  if (!providerTool) return { ok: false, blockerCode: "blocked_provider_missing" };
  if (!isRecord(providerPayload) || Object.keys(providerPayload).length === 0) return { ok: false, blockerCode: "payload_missing" };
  const providerPayloadBlocker = validateKnownProviderPayload(providerTool, providerPayload);
  if (providerPayloadBlocker) return { ok: false, blockerCode: providerPayloadBlocker };
  if (hasOwn(input, "payload") && stableJson(input.payload) !== stableJson(providerPayload)) {
    return { ok: false, blockerCode: "approved_payload_hash_mismatch" };
  }

  const decision = evaluateExternalMutationRequest({
    mode: input.mode ?? "live_owned_public",
    graph_context: graphContext,
    requested_action: requestedActionFromMutationFamily(graphContext.mutation_family),
    platform: graphContext.platform,
    provider_tool: providerTool,
    provider_payload: providerPayload,
    target_url_or_id: input.target_url_or_id,
    approved: input.approved,
    approval_receipt_id: input.approval_receipt_id,
    mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
  });

  return decision.allowed
    ? { ok: true }
    : { ok: false, blockerCode: decision.blocker_code ?? "non_graph_external_mutation_blocked" };
}


function parseMcpJson(text: string): Record<string, unknown> {
  const candidates = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  candidates.push(text.trim());

  for (const candidate of candidates) {
    if (!candidate || candidate === "[DONE]") continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }

  return { raw: text };
}

function providerBodyFromMcpResult(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) return { result };
  const content = result.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!isRecord(item) || typeof item.text !== "string") continue;
      try {
        const parsed = JSON.parse(item.text) as unknown;
        if (isRecord(parsed)) return parsed;
      } catch {
        return { text: item.text };
      }
    }
  }
  return result;
}

function unwrapMultiExecuteResponse(body: Record<string, unknown>, toolSlug: string): { body: Record<string, unknown>; ok: boolean | null; error: string | null } {
  const data = nestedRecord(body, "data") ?? body;
  const results = Array.isArray(data.results) ? data.results.filter(isRecord) : [];
  const result = results.find((item) => item.tool_slug === toolSlug) ?? results[0];
  if (!result) return { body, ok: null, error: null };
  const response = isRecord(result.response) ? result.response : result;
  const successful = typeof response.successful === "boolean" ? response.successful : typeof result.successful === "boolean" ? result.successful : null;
  const error = firstString(response.error, response.message, result.error, result.message);
  return { body: response, ok: successful, error };
}

function blockerForProviderMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("reply to this conversation is not allowed") || lower.includes("quoting this post is not allowed") || lower.includes("not allowed because you have not been mentioned")) return "blocked_platform_permission";
  if (lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("invalid api key") || lower.includes("auth")) return "blocked_auth";
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "blocked_rate_limit";
  if (lower.includes("duplicate") || lower.includes("already")) return "blocked_duplicate_or_cadence";
  if (lower.includes("not found") || lower.includes("unknown tool")) return "blocked_provider_missing";
  return "provider_call_failed";
}

export async function executeGraphOwnedProviderCall(toolSlug: string, payload: Record<string, unknown>): Promise<ProviderExecutionResult> {
  const consumerKey = process.env.COMPOSIO_MCP_CONSUMER_API_KEY ?? process.env.COMPOSIO_API_KEY;
  const mcpUrl = process.env.COMPOSIO_MCP_URL ?? "https://connect.composio.dev/mcp";
  const executionReceiptId = providerExecutionReceiptId(toolSlug, payload);
  const connectedAccountId = toolSlug.startsWith("TWITTER_")
    ? process.env.COMPOSIO_TWITTER_CONNECTED_ACCOUNT_ID
    : toolSlug.startsWith("LINKEDIN_")
      ? process.env.COMPOSIO_LINKEDIN_CONNECTED_ACCOUNT_ID
      : undefined;

  if (!consumerKey) {
    const response = { ok: false, error: "Composio MCP consumer key not set in graph-owned node context" };
    const executionReceiptPath = writeProviderExecutionReceipt({
      executionReceiptId,
      toolSlug,
      payload,
      ok: false,
      response,
      blockerCode: "blocked_auth",
      error: "Composio MCP consumer key not set",
    });
    return { ok: false, response, executionReceiptId, executionReceiptPath, blockerCode: "blocked_auth", error: "Composio MCP consumer key not set" };
  }

  try {
    let rpcId = 1;
    let sessionId: string | null = null;
    const protocolVersion = process.env.MCP_PROTOCOL_VERSION ?? "2025-03-26";

    const postRpc = async (body: Record<string, unknown>) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": protocolVersion,
        ["X-" + "CONSUMER-API-KEY"]: consumerKey,
      };
      if (sessionId) headers["MCP-Session-Id"] = sessionId;
      const response = await fetch(mcpUrl, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await response.text();
      const nextSessionId = response.headers.get("mcp-session-id");
      if (nextSessionId) sessionId = nextSessionId;
      return { response, text, body: parseMcpJson(text) };
    };

    const init = await postRpc({
      jsonrpc: "2.0",
      id: rpcId++,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "callscore-graph-owned-provider", version: "1.0.0" },
      },
    });
    if (!init.response.ok) {
      const blockerCode = blockerForHttpStatus(init.response.status, init.text, toolSlug);
      const providerResponse = { ok: false, error: init.body };
      const executionReceiptPath = writeProviderExecutionReceipt({ executionReceiptId, toolSlug, payload, ok: false, response: providerResponse, blockerCode, statusCode: init.response.status, error: `Composio MCP initialize failed ${init.response.status}` });
      return { ok: false, response: providerResponse, executionReceiptId, executionReceiptPath, blockerCode, statusCode: init.response.status, error: `Composio MCP initialize failed ${init.response.status}: ${init.text.slice(0, 500)}` };
    }

    await postRpc({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

    const listed = await postRpc({ jsonrpc: "2.0", id: rpcId++, method: "tools/list", params: {} });
    const listedResult = isRecord(listed.body.result) ? listed.body.result : {};
    const listedTools = Array.isArray(listedResult.tools) ? listedResult.tools : [];
    const availableToolNames = listedTools
      .filter(isRecord)
      .map((tool) => typeof tool.name === "string" ? tool.name : "")
      .filter(Boolean);
    const directToolName = availableToolNames.find((name) => name === toolSlug)
      ?? availableToolNames.find((name) => name.toUpperCase() === toolSlug.toUpperCase())
      ?? null;
    const multiExecuteToolName = availableToolNames.find((name) => name === "COMPOSIO_MULTI_EXECUTE_TOOL") ?? null;
    const selectedToolName = directToolName ?? multiExecuteToolName;

    if (!selectedToolName) {
      const response = { ok: false, error: `MCP tool ${toolSlug} not found`, mcp_tool_count: availableToolNames.length, mcp_tool_names: availableToolNames.slice(0, 120) };
      const executionReceiptPath = writeProviderExecutionReceipt({ executionReceiptId, toolSlug, payload, ok: false, response, blockerCode: "blocked_provider_missing", statusCode: listed.response.status, error: `Composio MCP tool ${toolSlug} not found` });
      return { ok: false, response, executionReceiptId, executionReceiptPath, blockerCode: "blocked_provider_missing", statusCode: listed.response.status, error: `Composio MCP tool ${toolSlug} not found` };
    }

    const providerToolItem: Record<string, unknown> = { tool_slug: toolSlug, arguments: payload };
    if (connectedAccountId) providerToolItem.account = connectedAccountId;
    const mcpArguments = selectedToolName === multiExecuteToolName
      ? {
          tools: [providerToolItem],
          thought: "Execute one graph-owned provider action from a validated operating-graph node.",
          sync_response_to_workbench: false,
          current_step: "GRAPH_OWNED_PROVIDER_EXECUTION",
          current_step_metric: "1/1 provider action",
        }
      : payload;

    const call = await postRpc({
      jsonrpc: "2.0",
      id: rpcId++,
      method: "tools/call",
      params: { name: selectedToolName, arguments: mcpArguments },
    });

    const rpcError = isRecord(call.body.error) ? call.body.error : undefined;
    const rpcResult = call.body.result;
    const rawBody = rpcError ? { error: rpcError } : providerBodyFromMcpResult(rpcResult);
    const unwrapped = selectedToolName === multiExecuteToolName ? unwrapMultiExecuteResponse(rawBody, toolSlug) : { body: rawBody, ok: null, error: null };
    const body = unwrapped.body;
    const mcpResultIsError = isRecord(rpcResult) && rpcResult.isError === true;
    const innerFailed = unwrapped.ok === false;
    const ok = call.response.ok && !rpcError && !mcpResultIsError && !innerFailed;
    const errorMessage = rpcError ? JSON.stringify(rpcError) : mcpResultIsError || innerFailed ? (unwrapped.error ?? JSON.stringify(body)) : call.text;
    const normalizedResponse = normalizeProviderResponse(toolSlug, body, ok, call.response.headers);
    if (ok && toolSlug === "TWITTER_FOLLOW_USER" && typeof payload.target_user_id === "string") {
      normalizedResponse.id = normalizedResponse.id ?? payload.target_user_id;
      normalizedResponse.external_object_id = normalizedResponse.external_object_id ?? payload.target_user_id;
      normalizedResponse.url = normalizedResponse.url ?? `https://x.com/i/user/${payload.target_user_id}`;
    }
    const blockerCode = ok ? undefined : call.response.ok ? blockerForProviderMessage(errorMessage) : blockerForHttpStatus(call.response.status, call.text, toolSlug);
    const executionReceiptPath = writeProviderExecutionReceipt({ executionReceiptId, toolSlug, payload, ok, response: normalizedResponse, blockerCode, statusCode: call.response.status, error: ok ? undefined : `Composio MCP ${toolSlug} failed ${call.response.status}` });

    return { ok, response: normalizedResponse, executionReceiptId, executionReceiptPath, blockerCode, statusCode: call.response.status, error: ok ? undefined : `Composio MCP ${toolSlug} failed ${call.response.status}: ${errorMessage.slice(0, 500)}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response = { ok: false, error: message };
    const executionReceiptPath = writeProviderExecutionReceipt({ executionReceiptId, toolSlug, payload, ok: false, response, blockerCode: "provider_call_failed", error: message });
    return { ok: false, response, executionReceiptId, executionReceiptPath, blockerCode: "provider_call_failed", error: message };
  }
}
