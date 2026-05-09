import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  captureException,
  flushMonitoring,
  initMonitoring,
  resetMonitoringForTests,
  setMonitoringClientForTests,
} from "../src/lib/monitoring";

const originalDsn = process.env.SENTRY_DSN;

beforeEach(() => {
  resetMonitoringForTests();
});

afterEach(() => {
  resetMonitoringForTests();
  if (originalDsn === undefined) {
    delete process.env.SENTRY_DSN;
  } else {
    process.env.SENTRY_DSN = originalDsn;
  }
});

test("monitoring helpers initialize Sentry when SENTRY_DSN is configured", async () => {
  process.env.SENTRY_DSN = "https://public@example.com/1";
  setMonitoringClientForTests({
    init() {},
    captureException() {
      return "event-id";
    },
    async flush() {
      return true;
    },
  });

  assert.equal(await initMonitoring({ serviceName: "test" }), true);
  assert.equal(await captureException(new Error("boom"), { serviceName: "test" }), "event-id");
  assert.equal(await flushMonitoring(), true);
});

test("monitoring helpers are no-ops without SENTRY_DSN", async () => {
  delete process.env.SENTRY_DSN;

  assert.equal(await initMonitoring({ serviceName: "test" }), false);
  assert.equal(await captureException(new Error("boom"), { serviceName: "test" }), undefined);
  assert.equal(await flushMonitoring(), true);
});
