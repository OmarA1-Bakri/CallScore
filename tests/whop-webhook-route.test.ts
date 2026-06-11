import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/whop/webhook/route";

const originalWebhookKey = process.env.WHOP_WEBHOOK_KEY;

afterEach(() => {
  if (originalWebhookKey === undefined) delete process.env.WHOP_WEBHOOK_KEY;
  else process.env.WHOP_WEBHOOK_KEY = originalWebhookKey;
});

function request(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://call-score.com/api/whop/webhook", {
    method: "POST",
    body,
    headers,
  });
}

test("Whop webhook rejects unsigned events when a signing key is configured", async () => {
  process.env.WHOP_WEBHOOK_KEY = "unit-test-whop-webhook-secret";

  const response = await POST(request(JSON.stringify({ type: "membership.went_valid" })));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_signature" });
});

test("Whop webhook accepts signed JSON events without mutating entitlement state", async () => {
  const secret = "unit-test-whop-webhook-secret";
  const body = JSON.stringify({
    type: "membership.went_valid",
    data: { user_id: "user_123", product_id: "prod_pro" },
  });
  process.env.WHOP_WEBHOOK_KEY = secret;
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  const response = await POST(
    request(body, {
      "x-whop-signature": `sha256=${signature}`,
      "content-type": "application/json",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("Whop webhook rejects invalid JSON before acknowledging events", async () => {
  delete process.env.WHOP_WEBHOOK_KEY;

  const response = await POST(request("{not-json"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_json" });
});
