import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/checkout/[tier]/route";

const CHECKOUT_ENV_KEY = "WHOP_CHECKOUT_URL_PRO_MONTHLY";
const ALPHA_CHECKOUT_ENV_KEY = "WHOP_CHECKOUT_URL_ALPHA_ANNUAL";
const originalCheckoutUrl = process.env[CHECKOUT_ENV_KEY];
const originalAlphaCheckoutUrl = process.env[ALPHA_CHECKOUT_ENV_KEY];

afterEach(() => {
  if (originalCheckoutUrl === undefined) {
    delete process.env[CHECKOUT_ENV_KEY];
  } else {
    process.env[CHECKOUT_ENV_KEY] = originalCheckoutUrl;
  }
  if (originalAlphaCheckoutUrl === undefined) {
    delete process.env[ALPHA_CHECKOUT_ENV_KEY];
  } else {
    process.env[ALPHA_CHECKOUT_ENV_KEY] = originalAlphaCheckoutUrl;
  }
});

function request(path: string): NextRequest {
  return new NextRequest(`https://example.test${path}`);
}

function params(tier: string): { params: Promise<{ tier: string }> } {
  return { params: Promise.resolve({ tier }) };
}

test("checkout route rejects invalid tiers", async () => {
  const response = await GET(request("/api/checkout/basic"), params("basic"));

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "invalid_tier",
    valid: ["pro", "alpha"],
  });
});

test("checkout route redirects to configured checkout URL", async () => {
  process.env[CHECKOUT_ENV_KEY] = "https://whop.example/checkout/pro-monthly";

  const response = await GET(request("/api/checkout/pro?interval=monthly"), params("pro"));

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://whop.example/checkout/pro-monthly",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("checkout route supports alpha annual checkout URLs", async () => {
  process.env[ALPHA_CHECKOUT_ENV_KEY] = "https://whop.example/checkout/alpha-annual";

  const response = await GET(request("/api/checkout/alpha?interval=annual"), params("alpha"));

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://whop.example/checkout/alpha-annual",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("checkout route redirects to feedback when a valid checkout URL is missing", async () => {
  delete process.env[CHECKOUT_ENV_KEY];

  const response = await GET(request("/api/checkout/pro?interval=monthly"), params("pro"));

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://example.test/feedback?missing=checkout-url-pro-monthly",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("checkout route strips stale Whop checkout session parameters", async () => {
  process.env[CHECKOUT_ENV_KEY] =
    "https://whop.com/checkout/plan_123/?session=ch_expired";

  const response = await GET(request("/api/checkout/pro?interval=monthly"), params("pro"));

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://whop.com/checkout/plan_123/",
  );
});

test("checkout route preserves non-session query parameters", async () => {
  process.env[CHECKOUT_ENV_KEY] =
    "https://whop.com/checkout/plan_123/?session=ch_expired&promo=alpha";

  const response = await GET(request("/api/checkout/pro?interval=monthly"), params("pro"));

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://whop.com/checkout/plan_123/?promo=alpha",
  );
});

test("checkout route does not append unverified return or cancel parameters", async () => {
  process.env[CHECKOUT_ENV_KEY] = "https://whop.com/checkout/plan_123/";

  const response = await GET(request("/api/checkout/pro?interval=monthly"), params("pro"));

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://whop.com/checkout/plan_123/",
  );
});
