import crypto from "crypto";
import { query } from "./db";

export interface ApiKeyRow {
  readonly id: number;
  readonly user_id: string;
  readonly name: string;
  readonly prefix: string;
  readonly last_used_at: string | null;
  readonly revoked_at: string | null;
  readonly created_at: string;
}

export interface ApiKeyAuth {
  readonly userId: string;
  readonly tier: "alpha";
  readonly apiKeyId: number;
}

export interface ApiKeyRequestRow {
  readonly id: number;
  readonly api_key_id: number;
  readonly key_name: string;
  readonly key_prefix: string;
  readonly method: string;
  readonly path: string;
  readonly created_at: string;
}

export interface ApiKeyReveal {
  readonly name: string;
  readonly prefix: string;
  readonly secret: string;
}

export const API_KEY_REVEAL_COOKIE_NAME = "ctr_api_key_reveal";

function hashKey(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function createApiKeyRevealCookieValue(reveal: ApiKeyReveal): string {
  return Buffer.from(JSON.stringify(reveal), "utf8").toString("base64url");
}

export function parseApiKeyRevealCookieValue(
  value: string | null | undefined,
): ApiKeyReveal | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ApiKeyReveal>;
    if (
      typeof parsed.name !== "string" ||
      typeof parsed.prefix !== "string" ||
      typeof parsed.secret !== "string"
    ) {
      return null;
    }
    return {
      name: parsed.name,
      prefix: parsed.prefix,
      secret: parsed.secret,
    };
  } catch {
    return null;
  }
}

export function generateApiKeySecret(): string {
  return `ctr_alpha_${crypto.randomBytes(32).toString("base64url")}`;
}

export async function createApiKey(
  userId: string,
  name = "Alpha API key",
): Promise<{ readonly secret: string; readonly row: ApiKeyRow }> {
  const secret = generateApiKeySecret();
  const rows = await query<ApiKeyRow>(
    `INSERT INTO alpha_api_keys (user_id, name, prefix, key_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, name, prefix, last_used_at, revoked_at, created_at`,
    [userId, name.slice(0, 80), secret.slice(0, 18), hashKey(secret)],
  );
  if (!rows[0]) throw new Error("Failed to create API key");
  return { secret, row: rows[0] };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRow[]> {
  return query<ApiKeyRow>(
    `SELECT id, user_id, name, prefix, last_used_at, revoked_at, created_at
     FROM alpha_api_keys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
}

export async function revokeApiKey(userId: string, id: number): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `UPDATE alpha_api_keys
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE user_id = $1 AND id = $2
     RETURNING id`,
    [userId, id],
  );
  return rows.length > 0;
}

export async function verifyApiKey(secret: string): Promise<ApiKeyAuth | null> {
  if (!secret.startsWith("ctr_alpha_")) return null;
  const rows = await query<{ id: number; user_id: string }>(
    `UPDATE alpha_api_keys
     SET last_used_at = NOW()
     WHERE key_hash = $1 AND revoked_at IS NULL
     RETURNING id, user_id`,
    [hashKey(secret)],
  );
  const row = rows[0];
  return row ? { userId: row.user_id, tier: "alpha", apiKeyId: row.id } : null;
}

export async function recordApiKeyRequest(
  userId: string,
  apiKeyId: number,
  method: string,
  path: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO alpha_api_key_requests (api_key_id, user_id, method, path)
       VALUES ($1, $2, $3, $4)`,
      [apiKeyId, userId, method.slice(0, 16), path.slice(0, 256)],
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "request log unavailable";
    console.warn("[api-keys.recordApiKeyRequest]", message);
  }
}

export async function listApiKeyRequests(
  userId: string,
  limit: number = 20,
): Promise<ApiKeyRequestRow[]> {
  try {
    return await query<ApiKeyRequestRow>(
      `SELECT
         r.id,
         r.api_key_id,
         k.name AS key_name,
         k.prefix AS key_prefix,
         r.method,
         r.path,
         r.created_at
       FROM alpha_api_key_requests r
       JOIN alpha_api_keys k ON k.id = r.api_key_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "request logs unavailable";
    console.warn("[api-keys.listApiKeyRequests]", message);
    return [];
  }
}
