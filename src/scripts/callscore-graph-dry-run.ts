/**
 * callscore-graph-dry-run.ts — Exercise the compiled LangGraph StateGraph
 * with synthetic data.  Validates the full graph topology: guard → classifier
 * → markov → decision → receipt.
 *
 * Usage:
 *   npx tsx src/scripts/callscore-graph-dry-run.ts
 *
 * Or import { runGraphDryRun } from "./callscore-graph-dry-run";
 */

import { createCallScoreGraph, setGraphInputs } from "../lib/autonomy/channel-head-graph";
import type { ChannelHeadDecisionContext } from "../lib/autonomy/channel-head-decision";
import { createHash } from "node:crypto";
import { loadCanonicalAgentIds } from "../lib/canonical-agent-registry";

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** Synthetic context for one channel head — mimics what buildHeartbeatDecisionArtifacts produces. */
function sampleContext(agentId: string, channelId: string): ChannelHeadDecisionContext {
  const now = new Date().toISOString();
  return {
    now,
    taskId: `task-${agentId}`,
    targetActionType: "monitor_read_only",
    riskClass: "safe_owned_public",
    channelHeadSoul: {
      agentId,
      channelId,
      soulVersion: "callscore_channel_head_souls.v1",
      purpose: `Test purpose for ${agentId}`,
    },
    gtmRegistryState: {
      laneId: channelId,
      currentStatus: "ready_public_owned",
      requiredGate: "NONE",
      ownedOrManaged: true,
      zeroSpendRequired: true,
      allowedActions: ["monitor_read_only", "draft", "publish_owned_public"],
      forbiddenActions: ["provider_mutation", "payment_mutation", "whop_customer_mutation", "db_deploy_mutation", "secret_exposure"],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
    workplane: { status: "OK", automationReadiness: "CONTROLLED_FULL", blockers: [] },
    recentReceipts: [],
    cooldown: { channelCooldownActive: false, providerErrorCooldownActive: false, duplicatePayloadCooldownActive: false, waitUntil: now },
    mediaGate: { status: "pass", evidenceHash: sha256(`media-${agentId}`), artifactIds: ["test-artifact"] },
    originalityGate: { status: "pass", evidenceHash: sha256(`originality-${agentId}`) },
    qualitySignal: { status: "ambiguous", score: 0.75, verifierSignal: "test", evidenceHash: sha256(`quality-${agentId}`) },
    channelPolicy: {
      policyVersion: "test.v1",
      publicClaimsSupported: true,
      claimBearingAllowed: true,
      safeOwnedPublicAllowed: true,
      requiresNonFounderReviewBelowConfidence: 0.8,
    },
    evidence: { evidenceLevel: "E2", evidenceHash: sha256(`evidence-${agentId}`), sourceArtifactIds: ["test-soul", "test-registry"] },
    payloadHash: sha256(`payload-${agentId}`),
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: `heartbeat:${agentId}`, fresh: true, lease_expires_at: now },
    publicVerify: { status: "pass", checked_at: now },
  };
}

/** Agent IDs loaded from the canonical 51-agent souls registry. */
const AGENT_IDS = loadCanonicalAgentIds();

export async function runGraphDryRun(): Promise<{ ok: boolean; summary: string; graphResult: unknown }> {
  const contexts = AGENT_IDS.map((id) => {
    const channel = id.includes("artofwar") ? "art_of_war"
      : id.includes("x-writer") || id.includes("linkedin") ? "owned_social"
      : id.includes("community") ? "owned_community"
      : id.includes("whop") ? "whop_commerce"
      : id.includes("email") ? "email_partnership_drafts"
      : id.includes("opportunity") ? "opportunity_research"
      : id.includes("compliance") ? "compliance"
      : id.includes("data-pipeline") ? "data_pipeline"
      : "general";
    return sampleContext(id, channel);
  });

  setGraphInputs(
    { dryRun: true },
    { mockData: true },
    { contexts },
  );

  const graph = createCallScoreGraph();

  console.error(`Invoking graph with ${AGENT_IDS.length} channel head contexts...`);

  const result = await graph.invoke({
    run_id: `dry-run-${Date.now()}`,
    started_at: new Date().toISOString(),
  });

  const guardStatus = result.guard_overall ?? "unknown";
  const receipts = result.receipts ?? [];
  const errors = result.errors ?? [];
  const decisions = result.channel_head_results ?? [];
  const markovPredictions = result.predictions ?? [];

  const summary = `Dry run complete.
  Guard:         ${guardStatus}
  Agents:        ${AGENT_IDS.length}
  Decisions:     ${decisions.length}
  Receipts:      ${receipts.length}
  Errors:        ${errors.length}
  Markov preds:  ${markovPredictions.length}
  Graph trace:   pipeline_guard → transition_classifier → markov_trajectory → channel_head_decision → receipt_writer`;

  return { ok: errors.length === 0, summary, graphResult: result };
}

// ── CLI entrypoint ─────────────────────────────────────────

async function main(): Promise<void> {
  const { ok, summary, graphResult } = await runGraphDryRun();
  const result = graphResult as typeof import("../lib/autonomy/channel-head-graph").PipelineStateAnnotation.State;
  const decisions = result.channel_head_results ?? [];
  const errors = result.errors ?? [];

  console.log(JSON.stringify({
    ok,
    summary,
    agent_count: decisions.length,
    decision_types: decisions.map((d) => d?.decision?.decision).filter(Boolean),
    receipts_written: (result.receipts ?? []).length,
    errors: errors.map((e) => e?.message),
    routing: {
      guard_status: result.guard_overall,
      markov_readiness: result.markov_report?.readiness ?? null,
      routing_decision: result.routing_decision,
    },
  }, null, 2));

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Dry run failed:", err);
  process.exit(1);
});
