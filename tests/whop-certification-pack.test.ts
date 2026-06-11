import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

test("Whop certification pack anchors all commerce-live proof points", () => {
  const doc = read("docs/ops/whop-auto-certification.md");

  for (const required of [
    "https://call-score.com/api/auth/whop/callback",
    "https://call-score.com/checkout/success",
    "https://call-score.com/checkout/cancelled",
    "https://call-score.com/api/whop/webhook",
    "WHOP_CHECKOUT_URL_PRO_MONTHLY",
    "WHOP_CHECKOUT_URL_PRO_ANNUAL",
    "WHOP_CHECKOUT_URL_ALPHA_MONTHLY",
    "WHOP_CHECKOUT_URL_ALPHA_ANNUAL",
    "tests/whop-webhook-route.test.ts",
    "CERTIFY WHOP COMMERCE LIVE: YES",
  ]) {
    assert.match(doc, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(doc, /Forbidden without separate approval:/);
  assert.match(doc, /changing Whop pricing, products, plans, checkout settings, or payment settings/);
  assert.match(doc, /Live Whop dashboard settings are not provider-certified/);
});
