import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getRequestAuthContext,
  getSessionFromToken,
  type Session,
} from "../src/lib/auth";

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    userId: "user-123",
    tier: "alpha",
    accessToken: "session-token",
    exp: 1_900_000_000_000,
    ...overrides,
  };
}

function buildRequest({
  authorization = null,
  sessionToken = null,
}: {
  readonly authorization?: string | null;
  readonly sessionToken?: string | null;
}) {
  return {
    headers: {
      get(name: string) {
        return name === "authorization" ? authorization : null;
      },
    },
    cookies: {
      get(name: string) {
        if (name !== SESSION_COOKIE_NAME || !sessionToken) return undefined;
        return { value: sessionToken };
      },
    },
  };
}

test("signed session tokens round-trip cleanly", () => {
  process.env.SESSION_SECRET = "01234567890123456789012345678901";

  const session = buildSession();
  const token = createSessionToken(session);

  assert.deepEqual(getSessionFromToken(token), session);
});

test("request auth falls back to the signed session cookie", () => {
  process.env.SESSION_SECRET = "01234567890123456789012345678901";

  const session = buildSession({ tier: "pro", accessToken: "cookie-token" });
  const token = createSessionToken(session);
  const auth = getRequestAuthContext(buildRequest({ sessionToken: token }));

  assert.deepEqual(auth.session, session);
  assert.equal(auth.accessToken, "cookie-token");
});

test("bearer auth overrides the cookie-backed session", () => {
  process.env.SESSION_SECRET = "01234567890123456789012345678901";

  const token = createSessionToken(buildSession({ accessToken: "cookie-token" }));
  const auth = getRequestAuthContext(
    buildRequest({
      authorization: "Bearer header-token",
      sessionToken: token,
    }),
  );

  assert.equal(auth.accessToken, "header-token");
  assert.equal(auth.session, null);
});
