import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { retryWithBackoff } from "@/lib/pipeline/retry";

describe("retryWithBackoff", () => {
  it("succeeds on first attempt", async () => {
    const result = await retryWithBackoff(async () => "ok", { baseDelayMs: 1 });
    assert.equal(result, "ok");
  });

  it("retries on transient failure and succeeds", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) throw new Error("fail");
      return "ok";
    };
    const result = await retryWithBackoff(fn, { baseDelayMs: 1 });
    assert.equal(result, "ok");
    assert.equal(calls, 2);
  });

  it("fails after maxAttempts", async () => {
    await assert.rejects(
      () =>
        retryWithBackoff(async () => {
          throw new Error("persistent");
        }, { maxAttempts: 2, baseDelayMs: 1 }),
      /persistent/
    );
  });
});
