import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { captureException, flushMonitoring, initMonitoring } from "../src/lib/monitoring";

const originalDsn = process.env.SENTRY_DSN;

afterEach(() => {
  if (originalDsn === undefined) {
    delete process.env.SENTRY_DSN;
  } else {
    process.env.SENTRY_DSN = originalDsn;
  }
});

test("monitoring helpers are no-ops without SENTRY_DSN", async () => {
  delete process.env.SENTRY_DSN;

  assert.equal(await initMonitoring({ serviceName: "test" }), false);
  assert.equal(await captureException(new Error("boom"), { serviceName: "test" }), undefined);
  assert.equal(await flushMonitoring(), true);
});
