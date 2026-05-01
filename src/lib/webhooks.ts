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

interface WebhookSecretRow extends WebhookRow {
  readonly secret: string;
}

const DEFAULT_EVENTS = ["new_call_digest", "consensus_signal"] as const;

function makeSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function validateUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeEvents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_EVENTS];
  const events = raw.filter((v): v is string => typeof v === "string" && (DEFAULT_EVENTS as readonly string[]).includes(v));
  return events.length > 0 ? Array.from(new Set(events)) : [...DEFAULT_EVENTS];
}

export async function createWebhook(
  userId: string,
  rawUrl: string,
  rawEvents: unknown,
): Promise<WebhookRow | null> {
  const url = validateUrl(rawUrl);
  if (!url) return null;
  const rows = await query<WebhookRow>(
    `INSERT INTO alpha_webhooks (user_id, url, event_types, secret)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, url, event_types, active, created_at`,
    [userId, url, normalizeEvents(rawEvents), makeSecret()],
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
  const body = JSON.stringify({ type: eventType, created_at: new Date().toISOString(), data: payload });

  await Promise.allSettled(
    webhooks.map(async (webhook) => {
      let status: number | null = null;
      let ok = false;
      let error: string | null = null;
      let attempts = 0;
      for (let attempt = 1; attempt <= 3; attempt++) {
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

      await query(
        `INSERT INTO alpha_webhook_deliveries (webhook_id, event_type, payload, status, ok, error, attempts)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
        [webhook.id, eventType, body, status, ok, error, attempts],
      );
    }),
  );
}
