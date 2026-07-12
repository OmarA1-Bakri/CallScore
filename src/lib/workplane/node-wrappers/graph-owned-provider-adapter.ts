import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

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

export interface ProviderMediaBridgeResult {
  readonly ok: boolean;
  readonly blockerCode?: string;
  readonly error?: string;
  readonly providerExecutionReceiptIds?: readonly string[];
  readonly providerExecutionReceiptPaths?: readonly string[];
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

  if (toolSlug === "TWITTER_POST_DELETE_BY_POST_ID") {
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!/^[0-9]{1,19}$/.test(id)) return "payload_missing";
  }

  if (toolSlug === "LINKEDIN_DELETE_POST") {
    const postUrn = typeof payload.post_urn === "string" ? payload.post_urn.trim() : "";
    if (!/^urn:li:(share|ugcPost):[0-9A-Za-z_-]+$/.test(postUrn)) return "payload_missing";
  }

  if (toolSlug === "DISCORDBOT_CREATE_MESSAGE") {
    const channelId = typeof payload.channel_id === "string" ? payload.channel_id.trim() : "";
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
    const hasComponents = Array.isArray(payload.components) && payload.components.length > 0;
    const hasStickers = Array.isArray(payload.sticker_ids) && payload.sticker_ids.length > 0;
    if (!/^[0-9]{17,20}$/.test(channelId)) return "target_missing";
    if (!content && !hasEmbeds && !hasComponents && !hasStickers) return "payload_missing";
    if (content.length > 2000) return "payload_too_long";
    if (isRecord(payload.allowed_mentions)) {
      const parse = Array.isArray(payload.allowed_mentions.parse) ? payload.allowed_mentions.parse : [];
      const roles = Array.isArray(payload.allowed_mentions.roles) ? payload.allowed_mentions.roles : [];
      const users = Array.isArray(payload.allowed_mentions.users) ? payload.allowed_mentions.users : [];
      if (parse.length > 0 || roles.length > 0 || users.length > 0) return "blocked_platform_permission";
    }
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

  if (toolSlug === "ZOHO_MAIL_MESSAGES_REPLY_TO_EMAIL") {
    const accountId = typeof payload.accountId === "string" ? payload.accountId.trim() : "";
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    const fromAddress = typeof payload.fromAddress === "string" ? payload.fromAddress.trim() : "";
    const toAddress = typeof payload.toAddress === "string" ? payload.toAddress.trim() : "";
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    if (!/^[0-9]{10,30}$/.test(accountId) || !/^[0-9]{10,30}$/.test(messageId)) return "payload_missing";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromAddress) || !toAddress.includes("@")) return "payload_missing";
    if (!content || content.length > 10000) return "payload_missing";
  }

  if (toolSlug === "ZOHO_MAIL_MESSAGES_SEND_EMAIL") {
    const accountId = typeof payload.accountId === "string" ? payload.accountId.trim() : "";
    const fromAddress = typeof payload.fromAddress === "string" ? payload.fromAddress.trim() : "";
    const toAddress = typeof payload.toAddress === "string" ? payload.toAddress.trim() : "";
    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    if (!/^[0-9]{10,30}$/.test(accountId)) return "payload_missing";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromAddress) || !toAddress.includes("@")) return "payload_missing";
    if (!subject || subject.length > 300) return "payload_missing";
    if (!content || content.length > 10000) return "payload_missing";
  }

  if (toolSlug === "WHOP_UPDATE_APP") {
    const allowedFields = new Set(["id", "description", "app_store_description"]);
    if (Object.keys(payload).some((key) => !allowedFields.has(key))) return "forbidden_whop_listing_field";
    const appId = typeof payload.id === "string" ? payload.id.trim() : "";
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    const storeDescription = typeof payload.app_store_description === "string" ? payload.app_store_description.trim() : "";
    if (appId !== "app_cDfDRY1cj8yQJZ") return "whop_listing_target_not_allowed";
    if (!description && !storeDescription) return "payload_missing";
    if (description && (description.length < 20 || description.length > 255)) return "payload_too_long";
    if (storeDescription && (storeDescription.length < 80 || storeDescription.length > 5000)) return "payload_too_long";
  }

  if (toolSlug === "ATTIO_CREATE_NOTE") {
    const parentObject = typeof payload.parent_object === "string" ? payload.parent_object.trim() : "";
    const parentRecordId = typeof payload.parent_record_id === "string" ? payload.parent_record_id.trim() : "";
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    if (!parentObject || !parentRecordId || !title || !content) return "payload_missing";
  }

  if (toolSlug === "ATTIO_ASSERT_PERSON") {
    const values = isRecord(payload.values) ? payload.values : payload;
    const emailAddresses = values.email_addresses;
    const hasEmail = Array.isArray(emailAddresses)
      ? emailAddresses.some((email) => (typeof email === "string" && email.includes("@"))
        || (isRecord(email) && typeof email.email_address === "string" && email.email_address.includes("@")))
      : typeof emailAddresses === "string" && emailAddresses.includes("@");
    const matchingAttribute = typeof payload.matching_attribute === "string" ? payload.matching_attribute.trim() : "";
    if (matchingAttribute !== "email_addresses" || !hasEmail) return "payload_missing";
  }

  return null;
}

function mediaGateRequiresMedia(input: Record<string, unknown>): boolean {
  const gate = input.media_gate;
  if (!isRecord(gate)) return false;
  const visualRequired = gate.visual_required === true || gate.required === true;
  const mediaPlan = typeof gate.media_plan === "string" ? gate.media_plan.trim().toLowerCase() : "";
  return visualRequired || ["image", "visual", "media"].includes(mediaPlan);
}

function providerPayloadHasRequiredMedia(toolSlug: string, payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  if (toolSlug === "TWITTER_CREATION_OF_A_POST") {
    return Array.isArray(payload.media_media_ids)
      && payload.media_media_ids.some((id) => typeof id === "string" && /^[0-9]{1,19}$/.test(id.trim()));
  }
  if (toolSlug === "LINKEDIN_CREATE_LINKED_IN_POST") {
    return Array.isArray(payload.images)
      && payload.images.some((image) => isRecord(image)
        && typeof image.name === "string"
        && image.name.trim().length > 0
        && typeof image.mimetype === "string"
        && /^image\//.test(image.mimetype.trim())
        && typeof image.s3key === "string"
        && image.s3key.trim().length > 0);
  }
  if (toolSlug === "YOUTUBE_UPLOAD_VIDEO") {
    return isRecord(payload.videoFilePath)
      && typeof payload.videoFilePath.name === "string"
      && payload.videoFilePath.name.trim().length > 0
      && payload.videoFilePath.mimetype === "video/mp4"
      && typeof payload.videoFilePath.s3key === "string"
      && payload.videoFilePath.s3key.trim().length > 0;
  }
  return true;
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
  if (status === 402 || haystack.includes("creditsdepleted") || haystack.includes("credits depleted") || haystack.includes("payment required")) return "blocked_rate_limit";
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
  if (mediaGateRequiresMedia(input) && !providerPayloadHasRequiredMedia(providerTool, providerPayload)) {
    return { ok: false, blockerCode: "required_media_missing" };
  }
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

function graphContextRecord(input: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(input.graph_context) ? input.graph_context : null;
}

function mediaGateRecord(input: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(input.media_gate) ? input.media_gate : null;
}

function uploadableFromGate(gate: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = [gate.provider_uploadable, gate.provider_image, gate.composio_uploadable, gate.file_uploadable];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    if (typeof candidate.name === "string" && typeof candidate.mimetype === "string" && typeof candidate.s3key === "string") return candidate;
  }
  return null;
}

function localMediaPathFromGate(gate: Record<string, unknown>): string | null {
  return firstString(gate.local_path, gate.local_media_path, gate.path, gate.media_path, gate.image_path, gate.source_path);
}

function mimetypeFromGateOrPath(gate: Record<string, unknown>, localPath: string): string {
  const explicit = firstString(gate.mimetype, gate.mime_type, gate.media_type);
  if (explicit && /^(image|video|audio)\//.test(explicit)) return explicit;
  const lower = localPath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function stringFieldDeep(value: unknown, keys: readonly string[]): string | null {
  if (typeof value === "string") {
    try {
      return stringFieldDeep(JSON.parse(value) as unknown, keys);
    } catch {
      for (const key of keys) {
        const marker = `"${key}"`;
        const markerIndex = value.indexOf(marker);
        if (markerIndex < 0) continue;
        const colonIndex = value.indexOf(":", markerIndex + marker.length);
        const openingQuote = colonIndex >= 0 ? value.indexOf('"', colonIndex + 1) : -1;
        const closingQuote = openingQuote >= 0 ? value.indexOf('"', openingQuote + 1) : -1;
        if (openingQuote >= 0 && closingQuote > openingQuote + 1) return value.slice(openingQuote + 1, closingQuote);
      }
      const referenceMatch = value.match(/Reference S3 Key \(s3key\):\s*([^\s]+)/i);
      return referenceMatch?.[1] ?? null;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = stringFieldDeep(item, keys);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const candidate of Object.values(value)) {
    const found = stringFieldDeep(candidate, keys);
    if (found) return found;
  }
  return null;
}

export function extractComposioS3Key(value: unknown): string | null {
  return stringFieldDeep(value, ["s3key", "s3_key"]);
}

async function stageLocalFileViaGraphOwnedWorkbench(input: {
  readonly localPath: string;
  readonly mimetype: string;
  readonly toolSlug: string;
}): Promise<{ ok: true; uploadable: Record<string, unknown> } | { ok: false; blockerCode: string; error?: string }> {
  const name = basename(input.localPath);
  const encoded = readFileSync(input.localPath).toString("base64");
  const remotePath = `/mnt/files/graph-owned-media/${name}`;
  const code = [
    "import base64, json, os",
    `remote_path = ${JSON.stringify(remotePath)}`,
    "os.makedirs(os.path.dirname(remote_path), exist_ok=True)",
    `open(remote_path, 'wb').write(base64.b64decode(${JSON.stringify(encoded)}))`,
    "result, error = upload_local_file(remote_path)",
    "print(json.dumps({'ok': not bool(error), 'error': error or None, 'upload': result or {}}))",
  ].join("\n");
  const result = await executeGraphOwnedProviderCall("COMPOSIO_REMOTE_WORKBENCH", {
    code_to_execute: code,
    thought: "Stage one graph-owned CallScore media artifact for a gated owned-public provider action.",
    current_step: "GRAPH_OWNED_MEDIA_STAGING",
    current_step_metric: "1/1 media artifact",
  });
  if (!result.ok) return { ok: false, blockerCode: result.blockerCode ?? "provider_media_bridge_failed", error: result.error };
  const key = extractComposioS3Key(result.response);
  if (!key) return { ok: false, blockerCode: "provider_media_bridge_failed", error: "Composio workbench upload succeeded without s3key" };
  return { ok: true, uploadable: { name, mimetype: input.mimetype, s3key: key } };
}

async function stageLocalFileForComposio(input: {
  readonly localPath: string;
  readonly mimetype: string;
  readonly toolSlug: string;
  readonly toolkitSlug: string;
}): Promise<{ ok: true; uploadable: Record<string, unknown> } | { ok: false; blockerCode: string; error?: string }> {
  if (!existsSync(input.localPath)) return { ok: false, blockerCode: "provider_media_bridge_missing", error: `local media not found: ${input.localPath}` };
  const name = basename(input.localPath);
  if (process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE === "1") {
    return { ok: true, uploadable: { name, mimetype: input.mimetype, s3key: `test/${input.toolSlug}/${name}` } };
  }
  const apiKey = process.env.COMPOSIO_FILE_UPLOAD_API_KEY ?? process.env.COMPOSIO_API_KEY;
  if (!apiKey) return { ok: false, blockerCode: "blocked_auth", error: "Composio file-upload API key missing for graph-owned media bridge" };
  const content = readFileSync(input.localPath);
  const md5 = createHash("md5").update(content).digest("hex");
  const request = await fetch("https://backend.composio.dev/api/v3.1/files/upload/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      toolkit_slug: input.toolkitSlug,
      tool_slug: input.toolSlug,
      filename: name,
      mimetype: input.mimetype,
      md5,
    }),
  });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!request.ok) {
    const blockerCode = blockerForHttpStatus(request.status, JSON.stringify(body), input.toolSlug);
    if (blockerCode === "blocked_auth") {
      return stageLocalFileViaGraphOwnedWorkbench(input);
    }
    return { ok: false, blockerCode, error: JSON.stringify(body).slice(0, 500) };
  }
  const data = nestedRecord(body, "data") ?? body;
  const uploadUrl = firstString(data.new_presigned_url, data.newPresignedUrl, body.new_presigned_url, body.newPresignedUrl);
  const key = firstString(data.key, body.key, data.s3key, body.s3key);
  const storageBackend = nestedRecord(data, "metadata")?.storage_backend ?? nestedRecord(body, "metadata")?.storage_backend;
  if (!uploadUrl || !key) return { ok: false, blockerCode: "provider_media_bridge_failed", error: JSON.stringify(body).slice(0, 500) };
  const uploadHeaders: Record<string, string> = { "Content-Type": input.mimetype };
  if (storageBackend === "azure_blob_storage") uploadHeaders["x-ms-blob-type"] = "BlockBlob";
  const upload = await fetch(uploadUrl, { method: "PUT", headers: uploadHeaders, body: content });
  if (!upload.ok) return { ok: false, blockerCode: blockerForHttpStatus(upload.status, await upload.text(), input.toolSlug), error: `file upload failed ${upload.status}` };
  return { ok: true, uploadable: { name, mimetype: input.mimetype, s3key: key } };
}

async function uploadableOrStageFromGate(gate: Record<string, unknown>, input: { readonly uploadToolSlug: string; readonly toolkitSlug: string }): Promise<{ ok: true; uploadable: Record<string, unknown> } | { ok: false; blockerCode: string; error?: string }> {
  const uploadable = uploadableFromGate(gate);
  if (uploadable) return { ok: true, uploadable };
  const localPath = localMediaPathFromGate(gate);
  if (!localPath) return { ok: false, blockerCode: "provider_media_bridge_missing" };
  return stageLocalFileForComposio({
    localPath,
    mimetype: mimetypeFromGateOrPath(gate, localPath),
    toolSlug: input.uploadToolSlug,
    toolkitSlug: input.toolkitSlug,
  });
}

function providerMediaIdsFromGate(gate: Record<string, unknown>): string[] {
  const raw = Array.isArray(gate.provider_media_ids) ? gate.provider_media_ids : Array.isArray(gate.media_media_ids) ? gate.media_media_ids : [];
  return raw.filter((id): id is string => typeof id === "string" && /^[0-9]{1,19}$/.test(id.trim()));
}

function extractProviderMediaId(response: Record<string, unknown>): string | null {
  const data = nestedRecord(response, "data") ?? response;
  const innerData = nestedRecord(data, "data") ?? data;
  return firstString(innerData.id, innerData.media_id_string, innerData.media_id, data.id, data.media_id_string, data.media_id, response.id, response.media_id_string, response.media_id);
}

function mutateProviderPayload(input: Record<string, unknown>, nextPayload: Record<string, unknown>): void {
  input.provider_payload = nextPayload;
  if (hasOwn(input, "payload")) input.payload = nextPayload;
  const graphContext = graphContextRecord(input);
  if (graphContext) graphContext.approved_payload_hash = payloadHash(nextPayload);
}

function appendChildProviderReceipt(input: Record<string, unknown>, receiptId: string, receiptPath: string | null): void {
  const childIds = Array.isArray(input.child_receipt_ids) ? input.child_receipt_ids.filter((item): item is string => typeof item === "string") : [];
  input.child_receipt_ids = [...new Set([...childIds, receiptId])];
  const paths = Array.isArray(input.provider_execution_receipt_paths) ? input.provider_execution_receipt_paths.filter((item): item is string => typeof item === "string") : [];
  if (receiptPath) input.provider_execution_receipt_paths = [...new Set([...paths, receiptPath])];
}

export async function bridgeGraphOwnedProviderMedia(input: Record<string, unknown>): Promise<ProviderMediaBridgeResult> {
  if (!mediaGateRequiresMedia(input)) return { ok: true };
  const providerTool = safeString(input.provider_tool);
  const providerPayload = isRecord(input.provider_payload) ? input.provider_payload : null;
  if (!providerTool || !providerPayload) return { ok: false, blockerCode: "payload_missing" };
  if (providerPayloadHasRequiredMedia(providerTool, providerPayload)) return { ok: true };

  const gate = mediaGateRecord(input);
  if (!gate) return { ok: false, blockerCode: "provider_media_bridge_missing" };

  if (providerTool === "TWITTER_CREATION_OF_A_POST") {
    const mediaIds = providerMediaIdsFromGate(gate);
    if (mediaIds.length > 0) {
      mutateProviderPayload(input, { ...providerPayload, media_media_ids: mediaIds });
      return { ok: true };
    }
    const staged = await uploadableOrStageFromGate(gate, { uploadToolSlug: "TWITTER_UPLOAD_MEDIA", toolkitSlug: "twitter" });
    if (staged.ok !== true) return { ok: false, blockerCode: staged.blockerCode, error: staged.error };
    const uploadPayload = {
      media: staged.uploadable,
      media_type: typeof staged.uploadable.mimetype === "string" ? staged.uploadable.mimetype : "image/png",
      media_category: "tweet_image",
    };
    const uploadResult = await executeGraphOwnedProviderCall("TWITTER_UPLOAD_MEDIA", uploadPayload);
    appendChildProviderReceipt(input, uploadResult.executionReceiptId, uploadResult.executionReceiptPath);
    if (!uploadResult.ok) return { ok: false, blockerCode: uploadResult.blockerCode ?? "provider_media_bridge_failed", providerExecutionReceiptIds: [uploadResult.executionReceiptId], providerExecutionReceiptPaths: uploadResult.executionReceiptPath ? [uploadResult.executionReceiptPath] : [] };
    const mediaId = extractProviderMediaId(uploadResult.response);
    if (!mediaId) return { ok: false, blockerCode: "provider_media_bridge_missing", providerExecutionReceiptIds: [uploadResult.executionReceiptId], providerExecutionReceiptPaths: uploadResult.executionReceiptPath ? [uploadResult.executionReceiptPath] : [] };
    mutateProviderPayload(input, { ...providerPayload, media_media_ids: [mediaId] });
    return { ok: true, providerExecutionReceiptIds: [uploadResult.executionReceiptId], providerExecutionReceiptPaths: uploadResult.executionReceiptPath ? [uploadResult.executionReceiptPath] : [] };
  }

  if (providerTool === "LINKEDIN_CREATE_LINKED_IN_POST") {
    const staged = await uploadableOrStageFromGate(gate, { uploadToolSlug: "LINKEDIN_CREATE_LINKED_IN_POST", toolkitSlug: "linkedin" });
    if (staged.ok !== true) return { ok: false, blockerCode: staged.blockerCode, error: staged.error };
    mutateProviderPayload(input, { ...providerPayload, images: [staged.uploadable] });
    return { ok: true };
  }

  if (providerTool === "YOUTUBE_UPLOAD_VIDEO") {
    const staged = await uploadableOrStageFromGate(gate, { uploadToolSlug: "YOUTUBE_UPLOAD_VIDEO", toolkitSlug: "youtube" });
    if (staged.ok !== true) return { ok: false, blockerCode: staged.blockerCode, error: staged.error };
    mutateProviderPayload(input, { ...providerPayload, videoFilePath: staged.uploadable });
    return { ok: true };
  }

  return { ok: true };
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
  if (lower.includes("creditsdepleted") || lower.includes("credits depleted") || lower.includes("payment required")) return "blocked_rate_limit";
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "blocked_rate_limit";
  if (lower.includes("duplicate") || lower.includes("already")) return "blocked_duplicate_or_cadence";
  if (lower.includes("not found") || lower.includes("unknown tool")) return "blocked_provider_missing";
  return "provider_call_failed";
}

async function executeWhopListingAppUpdate(
  toolSlug: string,
  payload: Record<string, unknown>,
  executionReceiptId: string,
): Promise<ProviderExecutionResult> {
  const validationBlocker = validateKnownProviderPayload(toolSlug, payload);
  if (validationBlocker) {
    const response = { ok: false, error: validationBlocker };
    const executionReceiptPath = writeProviderExecutionReceipt({
      executionReceiptId,
      toolSlug,
      payload,
      ok: false,
      response,
      blockerCode: validationBlocker,
      error: validationBlocker,
    });
    return { ok: false, response, executionReceiptId, executionReceiptPath, blockerCode: validationBlocker, error: validationBlocker };
  }

  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) {
    const response = { ok: false, error: "Whop API key not set in graph-owned node context" };
    const executionReceiptPath = writeProviderExecutionReceipt({
      executionReceiptId,
      toolSlug,
      payload,
      ok: false,
      response,
      blockerCode: "blocked_auth",
      error: "Whop API key not set",
    });
    return { ok: false, response, executionReceiptId, executionReceiptPath, blockerCode: "blocked_auth", error: "Whop API key not set" };
  }

  const appId = String(payload.id);
  const body = {
    ...(typeof payload.description === "string" ? { description: payload.description.trim() } : {}),
    ...(typeof payload.app_store_description === "string" ? { app_store_description: payload.app_store_description.trim() } : {}),
  };

  try {
    const response = await fetch(`https://api.whop.com/api/v1/apps/${encodeURIComponent(appId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Api-Version-Date": "2026-07-01",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: Record<string, unknown>;
    try {
      const candidate = JSON.parse(text) as unknown;
      parsed = isRecord(candidate) ? candidate : { raw: text };
    } catch {
      parsed = { raw: text };
    }
    const ok = response.ok && !isRecord(parsed.error);
    const blockerCode = ok ? undefined : blockerForHttpStatus(response.status, text, toolSlug);
    const normalized = normalizeProviderResponse(toolSlug, parsed, ok, response.headers);
    const executionReceiptPath = writeProviderExecutionReceipt({
      executionReceiptId,
      toolSlug,
      payload,
      ok,
      response: normalized,
      blockerCode,
      error: ok ? undefined : text.slice(0, 500),
      statusCode: response.status,
    });
    return {
      ok,
      response: normalized,
      executionReceiptId,
      executionReceiptPath,
      blockerCode,
      error: ok ? undefined : text.slice(0, 500),
      statusCode: response.status,
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

export async function executeGraphOwnedProviderCall(toolSlug: string, payload: Record<string, unknown>): Promise<ProviderExecutionResult> {
  const executionReceiptId = providerExecutionReceiptId(toolSlug, payload);
  if (process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE === "1") {
    const mocked = process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
    const parsed = mocked ? JSON.parse(mocked) as Record<string, unknown> : {};
    const response = (isRecord(parsed[toolSlug]) ? parsed[toolSlug] : { ok: false, error: `missing mock for ${toolSlug}` }) as Record<string, unknown>;
    const ok = response.ok === true || response.success === true;
    const blockerCode = ok ? undefined : blockerForProviderMessage(firstString(response.error, response.message) ?? `missing mock for ${toolSlug}`);
    const executionReceiptPath = writeProviderExecutionReceipt({ executionReceiptId, toolSlug, payload, ok, response: normalizeProviderResponse(toolSlug, response, ok), blockerCode, error: ok ? undefined : JSON.stringify(response).slice(0, 500) });
    return { ok, response: normalizeProviderResponse(toolSlug, response, ok), executionReceiptId, executionReceiptPath, blockerCode, error: ok ? undefined : JSON.stringify(response).slice(0, 500) };
  }

  if (toolSlug === "WHOP_UPDATE_APP") {
    return executeWhopListingAppUpdate(toolSlug, payload, executionReceiptId);
  }

  const consumerKey = process.env.COMPOSIO_MCP_CONSUMER_API_KEY ?? process.env.COMPOSIO_API_KEY;
  const mcpUrl = process.env.COMPOSIO_MCP_URL ?? "https://connect.composio.dev/mcp";
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
    // Meta tools such as COMPOSIO_REMOTE_WORKBENCH must be invoked directly.
    // App tools prefer multi-execute so connected-account binding remains explicit.
    const isComposioMetaTool = toolSlug.startsWith("COMPOSIO_");
    const selectedToolName = isComposioMetaTool ? directToolName : (multiExecuteToolName ?? directToolName);

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
    if (ok && toolSlug === "TWITTER_POST_DELETE_BY_POST_ID" && typeof payload.id === "string") {
      const handle = (process.env.CALLSCORE_X_HANDLE ?? process.env.X_USERNAME ?? "0marbakri").replace(/^@/, "");
      normalizedResponse.id = normalizedResponse.id ?? payload.id;
      normalizedResponse.external_object_id = normalizedResponse.external_object_id ?? payload.id;
      normalizedResponse.url = normalizedResponse.url ?? `https://x.com/${handle}/status/${payload.id}`;
    }
    if (ok && toolSlug === "LINKEDIN_DELETE_POST" && typeof payload.post_urn === "string") {
      normalizedResponse.id = normalizedResponse.id ?? payload.post_urn;
      normalizedResponse.external_object_id = normalizedResponse.external_object_id ?? payload.post_urn;
      normalizedResponse.x_restli_id = normalizedResponse.x_restli_id ?? payload.post_urn;
      normalizedResponse.url = normalizedResponse.url ?? `https://www.linkedin.com/feed/update/${payload.post_urn}/`;
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
