import crypto from "crypto";
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

function makeSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
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
    url.hash = "";
    return url.toString();
  } catch {
    return null;
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
  const rows = await query<CreatedWebhookRow>(
    `INSERT INTO alpha_webhooks (user_id, url, event_types, secret)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, url, event_types, active, created_at, secret`,
    [userId, url, normalizeWebhookEvents(rawEvents), makeSecret()],
  );
  return rows[0] ?? null;
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

async function deliverToWebhook(
  webhook: WebhookSecretRow,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<WebhookDeliveryRow> {
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
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ctr-event": eventType,
          "x-ctr-signature": signature(webhook.secret, body),
        },
        body,
      });
      status = response.status;
      ok = response.ok;
      error = ok ? null : await response.text().catch(() => response.statusText);
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
