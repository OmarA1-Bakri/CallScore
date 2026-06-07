import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getBillingUrl,
  getCheckoutCancelledUrl,
  getCheckoutSuccessUrl,
  getPublicAppOrigin,
  NETLIFY_FALLBACK_URL,
  PUBLIC_APP_PRODUCTION_URL,
  SITE_URL,
} from "../src/lib/site";

test("public production URL defaults to the customer-facing custom domain", () => {
  assert.equal(SITE_URL, "https://call-score.com");
  assert.equal(PUBLIC_APP_PRODUCTION_URL, "https://call-score.com");
  assert.equal(
    getPublicAppOrigin({ NODE_ENV: "production" }),
    "https://call-score.com",
  );
});

test("development and tests remain local-safe when no public URL is configured", () => {
  assert.equal(getPublicAppOrigin({ NODE_ENV: "test" }), "http://localhost:3000");
  assert.equal(getPublicAppOrigin({ NODE_ENV: "development" }), "http://localhost:3000");
});

test("checkout and billing return targets use call-score.com in production", () => {
  const env = { NODE_ENV: "production" };

  assert.equal(getCheckoutSuccessUrl(env), "https://call-score.com/checkout/success");
  assert.equal(getCheckoutCancelledUrl(env), "https://call-score.com/checkout/cancelled");
  assert.equal(getBillingUrl(env), "https://call-score.com/settings/billing");
});

test("Netlify URL is retained only as fallback/infra constant", () => {
  assert.equal(NETLIFY_FALLBACK_URL, "https://call-score.netlify.app");
});
