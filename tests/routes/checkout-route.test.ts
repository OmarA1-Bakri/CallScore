import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../src/app/api/checkout/[tier]/route";

const CHECKOUT_ENV_KEY = "WHOP_CHECKOUT_URL_PRO_MONTHLY";
const originalCheckoutUrl = process.env[CHECKOUT_ENV_KEY];

afterEach(() => {
  if (originalCheckoutUrl === undefined) {
    delete process.env[CHECKOUT_ENV_KEY];
  } else {
    process.env[CHECKOUT_ENV_KEY] = originalCheckoutUrl;
  }
});

function request(path: string): NextRequest {
  return new NextRequest(`https://example.test${path}`);
}

test("checkout route rejects invalid tiers", async () => {
  const response = await GET(request("/api/checkout/basic"), {
    params: Promise.resolve({ tier: "basic" }),
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "invalid_tier",
    valid: ["pro", "alpha"],
  });
});

test("checkout route redirects to configured checkout URL", async () => {
  process.env[CHECKOUT_ENV_KEY] = "https://whop.example/checkout/pro-monthly";

  const response = await GET(request("/api/checkout/pro?interval=monthly"), {
    params: Promise.resolve({ tier: "pro" }),
  });

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://whop.example/checkout/pro-monthly",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});
