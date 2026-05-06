import crypto from "crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { query } from "./db";

export interface WebhookRow {
  readonly id: number;
  readonly user_id: string;
  readonly url: string;
  readonly event_types: readonly string[];
  readonly active: boolean;
  readonly created_at: string;
}

export interface CreatedWebhookRow extends WebhookRow {
  readonly secret: string;
}

interface WebhookSecretRow extends CreatedWebhookRow {}

export interface WebhookReveal {
  readonly url: string;
  readonly secret: string;
}

export interface WebhookDeliveryRow {
  readonly id: number;
  readonly webhook_id: number;
  readonly url: string;
  readonly event_type: string;
  readonly status: number | null;
  readonly ok: boolean;
  readonly error: string | null;
  readonly attempts: number;
  readonly created_at: string;
}

interface StoredWebhookDeliveryRow {
  readonly id: number;
  readonly webhook_id: number;
  readonly event_type: string;
  readonly status: number | null;
  readonly ok: boolean;
  readonly error: string | null;
  readonly attempts: number;
  readonly created_at: string;
}

const DEFAULT_EVENTS = ["new_call_digest", "consensus_signal"] as const;
export const WEBHOOK_REVEAL_COOKIE_NAME = "ctr_webhook_reveal";
export const WEBHOOK_DELIVERY_ATTEMPTS = 3;
const WEBHOOK_FETCH_TIMEOUT_MS = 5_000;
const WEBHOOK_MAX_ERROR_BYTES = 2_048;
const ENCRYPTED_WEBHOOK_SECRET_PREFIX = "enc:v1";
const WEBHOOK_SECRET_KEY_ENV_KEYS = [
  "WEBHOOK_SECRET_ENCRYPTION_KEY",
  "SESSION_SECRET",
] as const;

function makeSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashSecretKey(source: string): Buffer {
  return crypto.createHash("sha256").update(source).digest();
}

function getWebhookSecretKey(): Buffer {
  for (const key of WEBHOOK_SECRET_KEY_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return hashSecretKey(value);
    }
  }
  throw new Error(
    `Webhook secret encryption key required. Set ${WEBHOOK_SECRET_KEY_ENV_KEYS.join(" or ")}`,
  );
}

export function encryptWebhookSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getWebhookSecretKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTED_WEBHOOK_SECRET_PREFIX}:${iv.toString("base64url")}:${authTag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptWebhookSecret(storedSecret: string): string {
  if (!storedSecret.startsWith(`${ENCRYPTED_WEBHOOK_SECRET_PREFIX}:`)) {
    return storedSecret;
  }
  const [, , ivText, authTagText, ciphertextText] = storedSecret.split(":");
  if (!ivText || !authTagText || !ciphertextText) {
    throw new Error("Invalid encrypted webhook secret payload");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getWebhookSecretKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createWebhookRevealCookieValue(reveal: WebhookReveal): string {
  return Buffer.from(JSON.stringify(reveal), "utf8").toString("base64url");
}

export function parseWebhookRevealCookieValue(
  value: string | null | undefined,
): WebhookReveal | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<WebhookReveal>;
    if (
      typeof parsed.url !== "string" ||
      typeof parsed.secret !== "string"
    ) {
      return null;
    }
    return { url: parsed.url, secret: parsed.secret };
  } catch {
    return null;
  }
}

export function validateWebhookUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.username !== "" || url.password !== "") return null;
    if (isBlockedWebhookHostname(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => Number(part));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return null;
  }
  return bytes;
}

export function isPrivateWebhookAddress(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) {
    const bytes = parseIpv4(address);
    if (!bytes) return true;
    const [a, b] = bytes;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 ||
      a === 100 && b >= 64 && b <= 127 ||
      a === 192 && b === 0 ||
      a === 198 && (b === 18 || b === 19) ||
      a >= 224
    );
  }
  if (ipVersion === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      return isPrivateWebhookAddress(mapped);
    }
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd")
    );
  }
  return true;
}

function isBlockedWebhookHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "metadata.google.internal" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  return net.isIP(normalized) !== 0 && isPrivateWebhookAddress(normalized);
}

async function assertWebhookUrlIsPublic(urlText: string): Promise<void> {
  const url = new URL(urlText);
  if (isBlockedWebhookHostname(url.hostname)) {
    throw new Error("webhook URL resolves to a blocked host");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((address) => isPrivateWebhookAddress(address.address))
  ) {
    throw new Error("webhook URL resolves to a private or reserved address");
  }
}

export function normalizeWebhookEvents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_EVENTS];
  const events = raw.filter(
    (value): value is string =>
      typeof value === "string" &&
      (DEFAULT_EVENTS as readonly string[]).includes(value),
  );
  return events.length > 0 ? Array.from(new Set(events)) : [...DEFAULT_EVENTS];
}

export async function createWebhook(
  userId: string,
  rawUrl: string,
  rawEvents: unknown,
): Promise<CreatedWebhookRow | null> {
  const url = validateWebhookUrl(rawUrl);
  if (!url) return null;
  const secret = makeSecret();
  const rows = await query<WebhookRow>(
    `INSERT INTO alpha_webhooks (user_id, url, event_types, secret)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, url, event_types, active, created_at`,
    [userId, url, normalizeWebhookEvents(rawEvents), encryptWebhookSecret(secret)],
  );
  return rows[0] ? { ...rows[0], secret } : null;
}

export async function listWebhooks(userId: string): Promise<WebhookRow[]> {
  return query<WebhookRow>(
    `SELECT id, user_id, url, event_types, active, created_at
     FROM alpha_webhooks
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
}

export async function deleteWebhook(userId: string, id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `UPDATE alpha_webhooks
     SET active = FALSE
     WHERE user_id = $1 AND id = $2
     RETURNING id`,
    [userId, id],
  );
  return rows.length > 0;
}

function signature(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function maybeEncryptLegacyWebhookSecret(webhook: WebhookSecretRow): Promise<void> {
  if (webhook.secret.startsWith(`${ENCRYPTED_WEBHOOK_SECRET_PREFIX}:`)) return;
  try {
    await query(
      `UPDATE alpha_webhooks
       SET secret = $1
       WHERE id = $2 AND secret = $3`,
      [encryptWebhookSecret(webhook.secret), webhook.id, webhook.secret],
    );
  } catch {
    // Delivery should not fail just because best-effort lazy migration failed.
  }
}

async function readResponseSnippet(
  response: Response,
  maxBytes = WEBHOOK_MAX_ERROR_BYTES,
): Promise<string> {
  if (!response.body) {
    return response.statusText.slice(0, maxBytes);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - total;
      const chunk = Buffer.from(value.slice(0, remaining));
      chunks.push(chunk);
      total += chunk.length;
      if (value.length > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text || response.statusText;
}

async function deliverToWebhook(
  webhook: WebhookSecretRow,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<WebhookDeliveryRow> {
  const signingSecret = decryptWebhookSecret(webhook.secret);
  void maybeEncryptLegacyWebhookSecret(webhook);
  const body = JSON.stringify({
    type: eventType,
    created_at: new Date().toISOString(),
    data: payload,
  });
  let status: number | null = null;
  let ok = false;
  let error: string | null = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= WEBHOOK_DELIVERY_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      await assertWebhookUrlIsPublic(webhook.url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBHOOK_FETCH_TIMEOUT_MS);
      const response = await fetch(webhook.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-ctr-event": eventType,
          "x-ctr-signature": signature(signingSecret, body),
        },
        body,
      }).finally(() => clearTimeout(timeout));
      status = response.status;
      ok = response.ok;
      error = ok ? null : await readResponseSnippet(response);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (ok) break;
  }

  const rows = await query<StoredWebhookDeliveryRow>(
    `INSERT INTO alpha_webhook_deliveries (webhook_id, event_type, payload, status, ok, error, attempts)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
     RETURNING id, webhook_id, event_type, status, ok, error, attempts, created_at`,
    [webhook.id, eventType, body, status, ok, error, attempts],
  );
  const delivery = rows[0];
  if (!delivery) {
    throw new Error("Failed to persist webhook delivery");
  }
  return {
    ...delivery,
    url: webhook.url,
  };
}

export async function deliverWebhookEvent(
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const webhooks = await query<WebhookSecretRow>(
    `SELECT id, user_id, url, event_types, active, created_at, secret
     FROM alpha_webhooks
     WHERE user_id = $1 AND active = TRUE AND $2 = ANY(event_types)`,
    [userId, eventType],
  );

  await Promise.allSettled(
    webhooks.map((webhook) => deliverToWebhook(webhook, eventType, payload)),
  );
}

export async function deliverWebhookTest(
  userId: string,
  id: number,
): Promise<WebhookDeliveryRow | null> {
  const rows = await query<WebhookSecretRow>(
    `SELECT id, user_id, url, event_types, active, created_at, secret
     FROM alpha_webhooks
     WHERE user_id = $1 AND id = $2 AND active = TRUE
     LIMIT 1`,
    [userId, id],
  );
  const webhook = rows[0];
  if (!webhook) return null;
  return deliverToWebhook(webhook, "test.ping", {
    message: "CallScore webhook test",
    webhook_id: webhook.id,
  });
}

export async function listWebhookDeliveries(
  userId: string,
  limit: number = 20,
): Promise<WebhookDeliveryRow[]> {
  return query<WebhookDeliveryRow>(
    `SELECT
       d.id,
       d.webhook_id,
       w.url,
       d.event_type,
       d.status,
       d.ok,
       d.error,
       d.attempts,
       d.created_at
     FROM alpha_webhook_deliveries d
     JOIN alpha_webhooks w ON w.id = d.webhook_id
     WHERE w.user_id = $1
     ORDER BY d.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
}
