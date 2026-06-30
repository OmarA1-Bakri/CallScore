import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadCanonicalAgentIds } from "../../src/lib/canonical-agent-registry";

describe("canonical-agent-registry", () => {
  it("loads 51 canonical agent IDs from souls YAML", () => {
    const agents = loadCanonicalAgentIds();
    assert.ok(Array.isArray(agents), "should return an array");
    assert.equal(agents.length, 51, "should have 51 agents");
    assert.ok(
      agents.every((a) => typeof a === "string" && a.startsWith("callscore-")),
      "all should start with callscore-"
    );
    assert.ok(
      agents.includes("callscore-artofwar-strategist"),
      "should contain known agent"
    );
  });
});
