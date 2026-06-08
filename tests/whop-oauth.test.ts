import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/auth/whop/route";
import {
  getWhopOAuthBaseUrl,
  getWhopOAuthCallbackUrl,
} from "../src/lib/whop-oauth";

const originalWhopOAuthBaseUrl = process.env.WHOP_OAUTH_BASE_URL;
const originalNextPublicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
const originalWhopClientId = process.env.WHOP_CLIENT_ID;

afterEach(() => {
  if (originalWhopOAuthBaseUrl === undefined) delete process.env.WHOP_OAUTH_BASE_URL;
  else process.env.WHOP_OAUTH_BASE_URL = originalWhopOAuthBaseUrl;

  if (originalNextPublicBaseUrl === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
  else process.env.NEXT_PUBLIC_BASE_URL = originalNextPublicBaseUrl;

  if (originalWhopClientId === undefined) delete process.env.WHOP_CLIENT_ID;
  else process.env.WHOP_CLIENT_ID = originalWhopClientId;
});

test("Whop OAuth production callback defaults to canonical apex URL", () => {
  const env = {
    NODE_ENV: "production",
    NEXT_PUBLIC_BASE_URL: "https://www.call-score.com",
  };

  assert.equal(getWhopOAuthBaseUrl(env), "https://call-score.com");
  assert.equal(
    getWhopOAuthCallbackUrl(env),
    "https://call-score.com/api/auth/whop/callback",
  );
});

test("Whop OAuth route redirects non-canonical production hosts before setting state", async () => {
  process.env.WHOP_OAUTH_BASE_URL = "https://call-score.com";

  const response = await GET(
    new NextRequest("https://www.call-score.com/api/auth/whop"),
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://call-score.com/api/auth/whop",
  );
});

test("Whop OAuth route emits canonical callback when public base URL is custom domain", async () => {
  process.env.WHOP_OAUTH_BASE_URL = "https://call-score.com";
  process.env.NEXT_PUBLIC_BASE_URL = "https://www.call-score.com";
  process.env.WHOP_CLIENT_ID = "app_test";

  const response = await GET(
    new NextRequest("https://call-score.com/api/auth/whop"),
  );
  const location = response.headers.get("location");
  assert.ok(location);

  const params = new URL(location).searchParams;
  assert.equal(
    params.get("redirect_uri"),
    "https://call-score.com/api/auth/whop/callback",
  );
});


test("Whop OAuth route accepts canonical host even when request origin protocol differs", async () => {
  process.env.WHOP_OAUTH_BASE_URL = "https://call-score.com";
  process.env.WHOP_CLIENT_ID = "app_test";

  const response = await GET(
    new NextRequest("http://call-score.com/api/auth/whop"),
  );
  const location = response.headers.get("location");
  assert.ok(location);
  assert.match(location, /^https:\/\/whop\.com\/oauth\?/);

  const params = new URL(location).searchParams;
  assert.equal(
    params.get("redirect_uri"),
    "https://call-score.com/api/auth/whop/callback",
  );
});


test("Whop OAuth route trusts canonical Host header behind Netlify", async () => {
  process.env.WHOP_OAUTH_BASE_URL = "https://call-score.com";
  process.env.WHOP_CLIENT_ID = "app_test";

  const response = await GET(
    new NextRequest("http://internal.netlify/api/auth/whop", {
      headers: { host: "call-score.com" },
    }),
  );
  const location = response.headers.get("location");
  assert.ok(location);
  assert.match(location, /^https:\/\/whop\.com\/oauth\?/);

  const params = new URL(location).searchParams;
  assert.equal(
    params.get("redirect_uri"),
    "https://call-score.com/api/auth/whop/callback",
  );
});
