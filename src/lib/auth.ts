import { cookies } from "next/headers";
import crypto from "crypto";
import type { Tier } from "./types";

/* ------------------------------------------------------------------ */
/*  Session shape                                                      */
/* ------------------------------------------------------------------ */

export interface Session {
  readonly userId: string;
  readonly tier: Tier;
  readonly accessToken: string;
  readonly exp: number;
}

const COOKIE_NAME = "ctr_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ------------------------------------------------------------------ */
/*  Signing helpers (HMAC-SHA256)                                      */
/* ------------------------------------------------------------------ */

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return secret;
}

function sign(payload: string): string {
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(payload);
  return hmac.digest("base64url");
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function decode(token: string): Session | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expectedSig = sign(payload);

  // Constant-time comparison
  if (
    signature.length !== expectedSig.length ||
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig),
    )
  ) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    ) as Session;

    // Check expiration
    if (Date.now() > session.exp) return null;

    return session;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function createSession(
  userId: string,
  tier: Tier,
  accessToken: string,
): Promise<void> {
  const session: Session = {
    userId,
    tier,
    accessToken,
    exp: Date.now() + SESSION_TTL_MS,
  };

  const token = encode(session);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    if (!cookie?.value) return null;
    return decode(cookie.value);
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Get the current user's tier. Returns "free" if not logged in.
 * Use this in server components to conditionally render content.
 */
export async function getCurrentTier(): Promise<Tier> {
  const session = await getSession();
  return session?.tier ?? "free";
}
