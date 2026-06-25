/**
 * social-channel-graph.ts — Reusable LangGraph StateGraph for a single social
 * channel (X, LinkedIn, Reddit) in the CMO campaign orchestration layer.
 *
 * Graph topology (parallel fan-out / fan-in):
 *   START ─┬→ analytics_agent ─┐
 *          ├→ profile_discovery_agent ─┤
 *          ├→ image_agent ────────────┤→ channel_head_review → END
 *          ├→ posting_agent ─────────┤
 *          └→ commenting_agent ──────┘
 *
 * Every specialist node calls the existing authority router with its own
 * agent ID.  Input is injected via RunnableConfig.configurable, not
 * module-level mutable state.
 */
import { createHash } from "node:crypto";
import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { routeDecision } from "./decision-router";
import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { SocialChannelConfig } from "./social-channel-config";
import {
  CmoSpecialistReceiptSchema,
  type CmoSpecialistReceipt,
} from "./cmo-campaign-schemas";

// ── Helpers ──

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function replace<T>() {
  return (_a: T | undefined, b: T): T => b;
}

function concat<T>() {
  return (a: T[] | undefined, b: T[]): T[] => [...(a ?? []), ...b];
}

// ── State annotation ──

export const ChannelStateAnnotation = Annotation.Root({
  campaign_id: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
  dry_run: Annotation<boolean>({ reducer: replace<boolean>(), default: () => true }),
  started_at: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
  specialist_receipts: Annotation<CmoSpecialistReceipt[]>({
    reducer: concat<CmoSpecialistReceipt>(),
    default: () => [],
  }),
  channel_review_receipt: Annotation<CmoSpecialistReceipt | null>({
    reducer: replace<CmoSpecialistReceipt | null>(),
    default: () => null,
  }),
  channel_errors: Annotation<string[]>({
    reducer: concat<string>(),
    default: () => [],
  }),
});

export type ChannelGraphState = typeof ChannelStateAnnotation.State;

// ── Context builder ──

function buildDecisionContext(
  agentId: string,
  channel: string,
  campaignId: string,
): ChannelHeadDecisionContext {
  const now = new Date().toISOString();
  return {
    now,
    taskId: `cmo-${campaignId}-${agentId}`,
    targetActionType: "monitor_read_only",
    riskClass: "safe_owned_public",
    channelHeadSoul: {
      agentId,
      channelId: channel,
      soulVersion: "callscore_channel_head_souls.v1",
      purpose: `CMO campaign specialist: ${agentId}`,
    },
    gtmRegistryState: {
      laneId: channel,
      currentStatus: "ready_public_owned",
      requiredGate: "NONE",
      ownedOrManaged: true,
      zeroSpendRequired: true,
      allowedActions: ["monitor_read_only", "draft", "publish_owned_public"],
      forbiddenActions: [
        "provider_mutation",
        "payment_mutation",
        "whop_customer_mutation",
        "db_deploy_mutation",
        "secret_exposure",
      ],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
    workplane: { status: "OK", automationReadiness: "CONTROLLED_FULL", blockers: [] },
    recentReceipts: [],
    cooldown: {
      channelCooldownActive: false,
      providerErrorCooldownActive: false,
      duplicatePayloadCooldownActive: false,
      waitUntil: now,
    },
    mediaGate: {
      status: "pass",
      evidenceHash: sha256(`media-${agentId}`),
      artifactIds: ["cmo-campaign-artifact"],
    },
    originalityGate: {
      status: "pass",
      evidenceHash: sha256(`originality-${agentId}`),
    },
    qualitySignal: {
      status: "ambiguous",
      score: 0.85,
      verifierSignal: "cmo-campaign-dry-run",
      evidenceHash: sha256(`quality-${agentId}`),
    },
    channelPolicy: {
      policyVersion: "cmo-campaign-dry-run.v1",
      publicClaimsSupported: true,
      claimBearingAllowed: true,
      safeOwnedPublicAllowed: true,
      requiresNonFounderReviewBelowConfidence: 0.5,
    },
    evidence: {
      evidenceLevel: "E2",
      evidenceHash: sha256(`evidence-${agentId}`),
      sourceArtifactIds: ["cmo-campaign-input"],
    },
    payloadHash: sha256(`payload-${campaignId}-${agentId}`),
    caps: {
      channelPostsToday: 0,
      maxChannelPostsPerDay: 3,
      totalPostsToday: 0,
      maxTotalPostsPerDay: 10,
    },
    killSwitch: {
      global_active: false,
      channel_active: false,
      agent_paused: false,
      missing_state_blocks_dispatch: false,
    },
    heartbeat: {
      heartbeat_id: `heartbeat:cmo:${agentId}:${campaignId}`,
      fresh: true,
      lease_expires_at: now,
    },
    publicVerify: {
      status: "pass",
      checked_at: now,
    },
  };
}

// ── Specialist node factory ──

function createSpecialistNode(agentIdKey: keyof SocialChannelConfig) {
  return async (
    state: ChannelGraphState,
    config?: RunnableConfig,
  ): Promise<Partial<ChannelGraphState>> => {
    const channelConfig = (config?.configurable as Record<string, unknown> | undefined)
      ?.channelConfig as SocialChannelConfig | undefined;
    const campaignId =
      ((config?.configurable as Record<string, unknown> | undefined)
        ?.campaignId as string) ?? state.campaign_id;

    if (!channelConfig) {
      return {
        channel_errors: ["Missing channelConfig in RunnableConfig.configurable"],
      };
    }

    const agentId = channelConfig[agentIdKey] as string;
    if (!agentId) {
      return { channel_errors: [`Missing agent ID for key ${String(agentIdKey)}`] };
    }

    const context = buildDecisionContext(agentId, channelConfig.channel, campaignId);
    const result = routeDecision(context);

    const specialistReceipt: CmoSpecialistReceipt = {
      schema_version: "callscore_cmo_specialist_receipt.v1",
      receipt_id: result.receipt.receipt_id,
      created_at: result.receipt.created_at,
      campaign_id: campaignId,
      channel: channelConfig.channel,
      agent_id: agentId,
      authority: result.decision.reason_codes[0] ?? "unknown",
      decision: result.decision.decision,
      dry_run: true as const,
      external_mutation_performed: false as const,
      send_or_outreach_performed: false as const,
      provider_mutation_performed: false as const,
      whop_mutation_performed: false as const,
      production_mutation_performed: false as const,
      parent_receipt_ids: result.receipt.parent_receipt_ids,
      detail: {
        decision_id: result.decision.decision_id,
        reason_codes: result.decision.reason_codes,
        risk_class: result.decision.risk_class,
      },
    };

    // Runtime boundary validation
    CmoSpecialistReceiptSchema.parse(specialistReceipt);

    return { specialist_receipts: [specialistReceipt] };
  };
}

// ── Channel head review node (fan-in) ──

async function channelHeadReviewNode(
  state: ChannelGraphState,
  config?: RunnableConfig,
): Promise<Partial<ChannelGraphState>> {
  const channelConfig = (config?.configurable as Record<string, unknown> | undefined)
    ?.channelConfig as SocialChannelConfig | undefined;
  const campaignId =
    ((config?.configurable as Record<string, unknown> | undefined)
      ?.campaignId as string) ?? state.campaign_id;

  if (!channelConfig) {
    return {
      channel_errors: ["Missing channelConfig in RunnableConfig.configurable"],
    };
  }

  const specialistIds = state.specialist_receipts.map((r) => r.receipt_id);
  const now = new Date().toISOString();

  const context = buildDecisionContext(
    channelConfig.channelHeadAgentId,
    channelConfig.channel,
    campaignId,
  );
  const headResult = routeDecision(context);

  const reviewReceipt: CmoSpecialistReceipt = {
    schema_version: "callscore_cmo_specialist_receipt.v1",
    receipt_id: `crr-${campaignId}-${channelConfig.channel}-${now}`,
    created_at: now,
    campaign_id: campaignId,
    channel: channelConfig.channel,
    agent_id: channelConfig.channelHeadAgentId,
    authority: "channel_head_review",
    decision: headResult.decision.decision,
    dry_run: true as const,
    external_mutation_performed: false as const,
    send_or_outreach_performed: false as const,
    provider_mutation_performed: false as const,
    whop_mutation_performed: false as const,
    production_mutation_performed: false as const,
    parent_receipt_ids: specialistIds,
    detail: {
      specialist_count: state.specialist_receipts.length,
      specialist_receipt_ids: specialistIds,
      channel_head_decision_id: headResult.decision.decision_id,
      channel_head_decision: headResult.decision.decision,
      channel_head_reason_codes: headResult.decision.reason_codes,
    },
  };

  CmoSpecialistReceiptSchema.parse(reviewReceipt);

  return { channel_review_receipt: reviewReceipt };
}

// ── Graph factory ──

export function createSocialChannelGraph() {
  return new StateGraph(ChannelStateAnnotation)
    .addNode("analytics_agent", createSpecialistNode("analyticsAgentId"))
    .addNode("profile_discovery_agent", createSpecialistNode("profileDiscoveryAgentId"))
    .addNode("image_agent", createSpecialistNode("imageAgentId"))
    .addNode("posting_agent", createSpecialistNode("postingAgentId"))
    .addNode("commenting_agent", createSpecialistNode("commentingAgentId"))
    .addNode("channel_head_review", channelHeadReviewNode)
    // Fan-out: all 5 specialists run in parallel from START
    .addEdge(START, "analytics_agent")
    .addEdge(START, "profile_discovery_agent")
    .addEdge(START, "image_agent")
    .addEdge(START, "posting_agent")
    .addEdge(START, "commenting_agent")
    // Fan-in: all specialists route to channel head review
    .addEdge("analytics_agent", "channel_head_review")
    .addEdge("profile_discovery_agent", "channel_head_review")
    .addEdge("image_agent", "channel_head_review")
    .addEdge("posting_agent", "channel_head_review")
    .addEdge("commenting_agent", "channel_head_review")
    .addEdge("channel_head_review", END)
    .compile();
}
