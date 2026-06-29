import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { routeDecision } from "../src/lib/autonomy/decision-router";
import { authorityForAgent } from "../src/lib/autonomy/action-authority";
import { AutonomyReceiptSchema, ChannelHeadDecisionSchema } from "../src/lib/autonomy/contracts";
import type { ChannelHeadDecisionContext } from "../src/lib/autonomy/channel-head-context";
import { ChannelHeadSoulsSchema } from "../src/lib/validation/agent-soul-schema";

const soulsPath = join(process.cwd(), "docs/ops/callscore-channel-head-souls.yaml");
const now = "2026-06-24T20:00:00.000Z";
const later = "2026-06-24T21:00:00.000Z";
const hash = `sha256:${"c".repeat(64)}`;

interface LiveSoulAgent {
  readonly agent_id: string;
  readonly class?: string;
  readonly owner_surface?: string;
}

interface LiveSoulsYaml {
  readonly agents?: readonly LiveSoulAgent[];
}

function loadSoulsYaml(): unknown {
  const script = [
    "import json, sys, yaml",
    "with open(sys.argv[1], 'r', encoding='utf-8') as fh:",
    "    data = yaml.safe_load(fh)",
    "print(json.dumps(data))",
  ].join("\n");
  const output = execFileSync("python3", ["-c", script, soulsPath], { encoding: "utf8" });
  return JSON.parse(output) as unknown;
}

function loadLiveSoulAgents(): readonly LiveSoulAgent[] {
  const data = loadSoulsYaml() as LiveSoulsYaml;
  assert.ok(Array.isArray(data.agents), "canonical souls YAML must contain an agents array");
  return data.agents;
}

function decisionContextFor(agent: LiveSoulAgent): ChannelHeadDecisionContext {
  return {
    now,
    taskId: `canonical-soul:${agent.agent_id}`,
    targetActionType: "draft",
    riskClass: "safe_owned_public",
    channelHeadSoul: {
      agentId: agent.agent_id,
      channelId: "canonical_soul_coverage",
      soulVersion: "callscore_channel_head_souls.v1",
      purpose: `${agent.class ?? "unknown"} owns ${agent.owner_surface ?? agent.agent_id}`,
    },
    gtmRegistryState: {
      laneId: "canonical_soul_coverage",
      currentStatus: "ready_public_owned",
      requiredGate: "NONE",
      ownedOrManaged: true,
      zeroSpendRequired: true,
      allowedActions: ["draft", "monitor_read_only", "publish_owned_public", "create_approval_packet"],
      forbiddenActions: [],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
    workplane: { status: "OK", automationReadiness: "CONTROLLED_FULL", blockers: [] },
    recentReceipts: [],
    cooldown: {
      channelCooldownActive: false,
      providerErrorCooldownActive: false,
      duplicatePayloadCooldownActive: false,
      waitUntil: later,
    },
    mediaGate: { status: "pass", evidenceHash: hash, artifactIds: ["canonical-soul-coverage"] },
    originalityGate: { status: "pass", evidenceHash: hash },
    qualitySignal: { status: "pass", score: 0.92, verifierSignal: "canonical_soul_coverage", evidenceHash: hash },
    channelPolicy: {
      policyVersion: "canonical-soul-coverage.v1",
      publicClaimsSupported: true,
      claimBearingAllowed: true,
      safeOwnedPublicAllowed: true,
      requiresNonFounderReviewBelowConfidence: 0.8,
    },
    evidence: { evidenceLevel: "E3", evidenceHash: hash, sourceArtifactIds: ["canonical-soul-coverage"] },
    payloadHash: hash,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: `heartbeat:${agent.agent_id}`, fresh: true, lease_expires_at: later },
    publicVerify: { status: "pass", checked_at: now },
  };
}

test("canonical channel-head souls YAML satisfies its Zod schema", () => {
  const parsed = ChannelHeadSoulsSchema.safeParse(loadSoulsYaml());
  assert.equal(
    parsed.success,
    true,
    parsed.success ? "schema valid" : JSON.stringify(parsed.error.issues.slice(0, 12), null, 2),
  );
  if (parsed.success) {
    assert.equal(parsed.data.agents.length, 51);
    assert.equal(new Set(parsed.data.agents.map((agent) => agent.agent_id)).size, 51);
  }
});

test("every live canonical soul resolves at least one action authority", () => {
  const missingAuthority = loadLiveSoulAgents()
    .filter((agent) => authorityForAgent(agent.agent_id).length === 0)
    .map((agent) => `${agent.agent_id} (${agent.class ?? "missing_class"})`);

  assert.deepEqual(missingAuthority, [], "live souls without authority mappings must be fixed before autonomous dispatch");
});

test("every live canonical soul routes through decision router without unknown-agent fail-closed", () => {
  const unknownAgentRoutes: string[] = [];

  for (const agent of loadLiveSoulAgents()) {
    const result = routeDecision(decisionContextFor(agent));
    assert.doesNotThrow(() => ChannelHeadDecisionSchema.parse(result.decision), `${agent.agent_id} decision is schema-valid`);
    assert.doesNotThrow(() => AutonomyReceiptSchema.parse(result.receipt), `${agent.agent_id} receipt is schema-valid`);
    if (result.decision.reason_codes.includes("unknown_agent_not_authorized")) {
      unknownAgentRoutes.push(`${agent.agent_id} (${agent.class ?? "missing_class"})`);
    }
  }

  assert.deepEqual(unknownAgentRoutes, [], "live souls must not route as unknown/unauthorized agents");
});
