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

function hashKey(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
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
