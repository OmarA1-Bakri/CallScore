import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditDispatchEvent, type PipelineJob } from "@/lib/pipeline";

describe("auditDispatchEvent", () => {
  it("exists and is callable", () => {
    assert.equal(typeof auditDispatchEvent, "function");
  });

  it("is async function", () => {
    const fn = auditDispatchEvent.toString();
    assert.ok(
      fn.startsWith("async") || fn.includes("async "),
      "should be an async function"
    );
  });
});
