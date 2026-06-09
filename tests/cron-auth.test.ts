import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { verifyCronSecret } from "../src/lib/cron";

const originalCronSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
});

function request(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new NextRequest("https://example.test/api/cron/candles/enqueue", { headers });
}

test("verifyCronSecret accepts a bearer token when the server env has surrounding whitespace", () => {
  process.env.CRON_SECRET = "\n cron-secret-value \n";

  assert.equal(verifyCronSecret(request("Bearer cron-secret-value")), true);
});

test("verifyCronSecret does not trim the incoming bearer token", () => {
  process.env.CRON_SECRET = "\n cron-secret-value \n";

  assert.equal(verifyCronSecret(request("Bearer cron-secret-value ")), false);
});

test("verifyCronSecret rejects an incorrect bearer token", () => {
  process.env.CRON_SECRET = "cron-secret-value\n";

  assert.equal(verifyCronSecret(request("Bearer wrong-cron-secret-value")), false);
});

test("verifyCronSecret rejects requests when CRON_SECRET is missing", () => {
  delete process.env.CRON_SECRET;

  assert.equal(verifyCronSecret(request("Bearer cron-secret-value")), false);
});

test("verifyCronSecret rejects requests when CRON_SECRET is blank after normalization", () => {
  process.env.CRON_SECRET = " \n\t ";

  assert.equal(verifyCronSecret(request("Bearer cron-secret-value")), false);
});

test("verifyCronSecret rejects malformed authorization headers", () => {
  process.env.CRON_SECRET = "cron-secret-value\n";

  assert.equal(verifyCronSecret(request("Basic cron-secret-value")), false);
});
