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

export const SESSION_COOKIE_NAME = "ctr_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface HeaderStoreLike {
  get(name: string): string | null;
}

interface CookieValueLike {
  readonly value: string;
}

interface CookieStoreLike {
  get(name: string): CookieValueLike | undefined;
}

export interface RequestAuthContext {
  readonly accessToken: string | null;
  readonly session: Session | null;
}

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

export function createSessionToken(session: Session): string {
  return encode(session);
}

export function getSessionFromToken(
  token: string | null | undefined,
): Session | null {
  if (!token) return null;
  return decode(token);
}

export function getRequestAuthContext(request: {
  readonly headers: HeaderStoreLike;
  readonly cookies: CookieStoreLike;
}): RequestAuthContext {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return {
      accessToken: authHeader.slice(7),
      session: null,
    };
  }

  const session = getSessionFromToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  return {
    accessToken: session?.accessToken ?? null,
    session,
  };
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

  const token = createSessionToken(session);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
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
    return getSessionFromToken(
      cookieStore.get(SESSION_COOKIE_NAME)?.value,
    );
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Get the current user's tier. Returns "free" if not logged in.
 * Use this in server components to conditionally render content.
 */
export async function getCurrentTier(): Promise<Tier> {
  const session = await getSession();
  return session?.tier ?? "free";
}
