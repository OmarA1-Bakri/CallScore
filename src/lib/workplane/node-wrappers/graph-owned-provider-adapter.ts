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

  if (toolSlug === "LINKEDIN_CREATE_LINKED_IN_POST") {
    const author = typeof payload.author === "string" ? payload.author.trim() : "";
    const commentary = typeof payload.commentary === "string" ? payload.commentary.trim() : "";
    if (!/^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(author)) return "blocked_auth";
    if (!commentary) return "payload_missing";
    if (commentary.length > 3000) return "payload_too_long";
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

export async function executeGraphOwnedProviderCall(toolSlug: string, payload: Record<string, unknown>): Promise<ProviderExecutionResult> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const baseUrl = process.env.COMPOSIO_API_BASE_URL ?? "https://backend.composio.dev/api/v3.1";
  const executionReceiptId = providerExecutionReceiptId(toolSlug, payload);
  const connectedAccountId = toolSlug.startsWith("TWITTER_")
    ? process.env.COMPOSIO_TWITTER_CONNECTED_ACCOUNT_ID
    : toolSlug.startsWith("LINKEDIN_")
      ? process.env.COMPOSIO_LINKEDIN_CONNECTED_ACCOUNT_ID
      : undefined;

  if (!apiKey) {
    const response = { ok: false, error: "COMPOSIO_API_KEY not set in graph-owned node context" };
    const executionReceiptPath = writeProviderExecutionReceipt({
      executionReceiptId,
      toolSlug,
      payload,
      ok: false,
      response,
      blockerCode: "blocked_auth",
      error: "COMPOSIO_API_KEY not set",
    });
    return { ok: false, response, executionReceiptId, executionReceiptPath, blockerCode: "blocked_auth", error: "COMPOSIO_API_KEY not set" };
  }

  try {
    const requestBody: Record<string, unknown> = {
      arguments: payload,
      version: process.env.COMPOSIO_TOOLKIT_VERSION ?? "latest",
    };
    if (connectedAccountId) requestBody.connected_account_id = connectedAccountId;

    const endpoint = `${baseUrl}/tools/execute/${encodeURIComponent(toolSlug)}`;
    const authHeaderName = process.env.COMPOSIO_API_KEY_HEADER
      ?? (apiKey.startsWith("ak_") ? "x-org-api-key" : "x-api-key");
    const doFetch = async (headerName: string) => fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [headerName]: apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    let response = await doFetch(authHeaderName);
    let text = await response.text();
    if (response.status === 401 && authHeaderName !== "x-org-api-key") {
      const retry = await doFetch("x-org-api-key");
      const retryText = await retry.text();
      if (retry.ok || retry.status !== 401) {
        response = retry;
        text = retryText;
      }
    }
    let body: Record<string, unknown> = { raw: text };
    try {
      const parsed = JSON.parse(text) as unknown;
      if (isRecord(parsed)) body = parsed;
    } catch {
      // Keep raw response text.
    }

    const normalizedResponse = normalizeProviderResponse(toolSlug, body, response.ok, response.headers);
    const blockerCode = response.ok ? undefined : blockerForHttpStatus(response.status, text, toolSlug);
    const executionReceiptPath = writeProviderExecutionReceipt({
      executionReceiptId,
      toolSlug,
      payload,
      ok: response.ok,
      response: normalizedResponse,
      blockerCode,
      statusCode: response.status,
      error: response.ok ? undefined : `Composio ${toolSlug} failed ${response.status}`,
    });

    return {
      ok: response.ok,
      response: normalizedResponse,
      executionReceiptId,
      executionReceiptPath,
      blockerCode,
      statusCode: response.status,
      error: response.ok ? undefined : `Composio ${toolSlug} failed ${response.status}: ${text.slice(0, 500)}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response = { ok: false, error: message };
    const executionReceiptPath = writeProviderExecutionReceipt({
      executionReceiptId,
      toolSlug,
      payload,
      ok: false,
      response,
      blockerCode: "provider_call_failed",
      error: message,
    });
    return { ok: false, response, executionReceiptId, executionReceiptPath, blockerCode: "provider_call_failed", error: message };
  }
}
