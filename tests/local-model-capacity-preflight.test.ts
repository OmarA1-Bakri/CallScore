import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGemmaCapacityPreflight } from "../src/scripts/gemma-capacity-preflight";

const QWEN3_MODEL = "qwen3:4b-instruct-2507-q4_K_M";

test("capacity preflight defaults to the canonical Qwen3 local-model contract", async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "callscore-local-model-capacity-"));
  const originalFetch = globalThis.fetch;
  let requestedModel: unknown = null;

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requestedModel = body.model;
    return new Response(JSON.stringify({ message: { content: "[]" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const receipt = await runGemmaCapacityPreflight({
      repoRoot,
      createdAt: "2026-07-22T00:00:00.000Z",
    });

    assert.equal(requestedModel, QWEN3_MODEL);
    assert.equal(receipt.model, QWEN3_MODEL);
    assert.equal(receipt.workflow_name, "local_model_capacity_preflight");
    assert.equal(receipt.schema_version, "callscore.local_model_capacity_preflight.v1");
    assert.doesNotMatch(receipt.next_safe_action, /Gemma4|Qwen2[._-]?5|qwen25/i);
    assert.match(receipt.artifact_path, /local_model_capacity_preflight/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
