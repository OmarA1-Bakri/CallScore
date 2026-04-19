/**
 * Signed unsubscribe tokens.
 *
 * Emails include a functional unsubscribe link (CAN-SPAM / GDPR). The
 * token is an HMAC-SHA256 over `${userId}:${scope}` using SESSION_SECRET,
 * then the payload and signature are joined with a dot and base64url-
 * encoded so the whole thing is safe to drop in a URL query string.
 *
 * Required env:
 *   - SESSION_SECRET (>= 32 chars) — reused from @/lib/auth
 */
import crypto from "crypto";

const TOKEN_SCOPE = "alerts-unsubscribe";

export interface UnsubscribeTokenPayload {
  readonly userId: string;
  readonly scope: typeof TOKEN_SCOPE;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be at least 32 characters to sign unsubscribe tokens",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * Build a signed unsubscribe token for the given user. The token is
 * `base64url(JSON(payload)).<sig>`. The resulting string is URL-safe.
 */
export function buildUnsubscribeToken(userId: string): string {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("userId is required to build an unsubscribe token");
  }
  const payload: UnsubscribeTokenPayload = {
    userId,
    scope: TOKEN_SCOPE,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

/**
 * Verify a token produced by `buildUnsubscribeToken`. Returns the
 * decoded payload on success, `null` on any failure (bad format, bad
 * signature, wrong scope).
 */
export function verifyUnsubscribeToken(
  token: string,
): UnsubscribeTokenPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(encoded);

  if (signature.length !== expected.length) return null;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8"),
    ) as Partial<UnsubscribeTokenPayload>;
    if (
      typeof parsed.userId !== "string" ||
      parsed.userId.length === 0 ||
      parsed.scope !== TOKEN_SCOPE
    ) {
      return null;
    }
    return { userId: parsed.userId, scope: TOKEN_SCOPE };
  } catch {
    return null;
  }
}

/**
 * Build the full unsubscribe URL for a digest email.
 */
export function buildUnsubscribeUrl(baseUrl: string, userId: string): string {
  const token = buildUnsubscribeToken(userId);
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`;
}
