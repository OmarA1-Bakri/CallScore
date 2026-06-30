import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadCanonicalAgentIds,
  checkAgentRegistryConsistency,
} from "../../src/lib/canonical-agent-registry";

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

  it("registry consistency: souls vs mapping match", () => {
    const result = checkAgentRegistryConsistency();
    assert.ok(
      result.souls_count >= 51,
      `souls should have >=51 agents, got ${result.souls_count}`
    );
    assert.ok(
      result.mapping_count >= 51,
      `mapping should have >=51 agents, got ${result.mapping_count}`
    );
    assert.equal(
      result.only_in_souls.length,
      0,
      `agents in souls not in mapping: ${result.only_in_souls}`
    );
    assert.equal(
      result.only_in_mapping.length,
      0,
      `agents in mapping not in souls: ${result.only_in_mapping}`
    );
    assert.ok(result.consistent, "souls and mapping should be consistent");
  });
});
