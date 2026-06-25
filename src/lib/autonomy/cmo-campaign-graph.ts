/**
 * cmo-campaign-graph.ts — CMO campaign LangGraph orchestration layer.
 *
 * Invokes three social channel graphs (X, LinkedIn, Reddit) in parallel,
 * collects all specialist and channel receipts, and produces a single
 * CMO campaign receipt.
 *
 * Graph topology:
 *   START ─┬→ x_channel_graph ─┐
 *          ├→ linkedin_channel_graph ─┤→ cmo_review_summary → END
 *          └→ reddit_channel_graph ──┘
 *
 * All graph input is injected via RunnableConfig.configurable (not
 * module-level mutable state).
 */
import { createHash } from "node:crypto";
import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { createSocialChannelGraph } from "./social-channel-graph";
import { CHANNEL_CONFIGS, type SocialChannelConfig } from "./social-channel-config";
import {
  CmoCampaignReceiptSchema,
  CmoChannelReviewReceiptSchema,
  CmoSpecialistReceiptSchema,
  type CmoCampaignReceipt,
  type CmoChannelReviewReceipt,
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

// ── CMO Campaign State ──

interface ChannelGraphOutput {
  specialist_receipts: CmoSpecialistReceipt[];
  channel_review_receipt: CmoSpecialistReceipt | null;
  channel_errors: string[];
}

const ChannelOutputAnnotation = Annotation<ChannelGraphOutput>({
  reducer: replace<ChannelGraphOutput>(),
  default: () => ({ specialist_receipts: [], channel_review_receipt: null, channel_errors: [] }),
});

export const CmoCampaignStateAnnotation = Annotation.Root({
  campaign_id: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
  dry_run: Annotation<boolean>({ reducer: replace<boolean>(), default: () => true }),
  started_at: Annotation<string>({ reducer: replace<string>(), default: () => "" }),
  x_channel: ChannelOutputAnnotation,
  linkedin_channel: ChannelOutputAnnotation,
  reddit_channel: ChannelOutputAnnotation,
  cmo_campaign_receipt: Annotation<CmoCampaignReceipt | null>({
    reducer: replace<CmoCampaignReceipt | null>(),
    default: () => null,
  }),
  channel_receipts: Annotation<CmoChannelReviewReceipt[]>({
    reducer: replace<CmoChannelReviewReceipt[]>(),
    default: () => [],
  }),
  channel_specialist_receipts: Annotation<Record<string, CmoSpecialistReceipt[]>>({
    reducer: replace<Record<string, CmoSpecialistReceipt[]>>(),
    default: () => ({}),
  }),
  channel_errors: Annotation<string[]>({
    reducer: concat<string>(),
    default: () => [],
  }),
});

export type CmoCampaignState = typeof CmoCampaignStateAnnotation.State;

// ── Channel graph node factory ──

function createChannelGraphNode(
  channelName: string,
  channelConfig: SocialChannelConfig,
) {
  return async (
    _state: CmoCampaignState,
    config?: RunnableConfig,
  ): Promise<Partial<CmoCampaignState>> => {
    const campaignId =
      ((config?.configurable as Record<string, unknown> | undefined)
        ?.campaignId as string) ?? _state.campaign_id;

    const channelOverrides =
      (config?.configurable as Record<string, unknown> | undefined)
        ?.channelOverrides as Record<string, Partial<SocialChannelConfig>> | undefined;

    // Apply any overrides
    let resolvedConfig = channelConfig;
    if (channelOverrides?.[channelName]) {
      resolvedConfig = { ...channelConfig, ...channelOverrides[channelName] };
    }

    // Build the channel graph
    const channelGraph = createSocialChannelGraph();

    try {
      const channelResult = await channelGraph.invoke(
        {
          campaign_id: campaignId,
          dry_run: true,
          started_at: new Date().toISOString(),
        },
        {
          configurable: {
            channelConfig: resolvedConfig,
            campaignId,
          },
        },
      );

      // Validate and convert specialist receipts
      const specialistReceipts = channelResult.specialist_receipts.map((r) =>
        CmoSpecialistReceiptSchema.parse(r),
      );

      // Validate and convert channel review receipt
      let channelReviewReceipt: CmoSpecialistReceipt | null = null;
      if (channelResult.channel_review_receipt) {
        channelReviewReceipt = CmoSpecialistReceiptSchema.parse(
          channelResult.channel_review_receipt,
        );
      }

      // Convert channel review to channel review receipt schema
      let channelReview: CmoChannelReviewReceipt | null = null;
      if (channelReviewReceipt) {
        const review = {
          schema_version: "callscore_cmo_channel_review_receipt.v1" as const,
          receipt_id: `crr-${campaignId}-${channelName}`,
          created_at: channelReviewReceipt.created_at,
          campaign_id: campaignId,
          channel: channelName,
          channel_head_agent_id: channelReviewReceipt.agent_id,
          specialist_receipt_ids: specialistReceipts.map((r) => r.receipt_id),
          decision_count: specialistReceipts.length,
          dry_run: true as const,
          external_mutation_performed: false as const,
          send_or_outreach_performed: false as const,
          provider_mutation_performed: false as const,
          whop_mutation_performed: false as const,
          production_mutation_performed: false as const,
          parent_receipt_ids: [],
          summary: `Channel ${channelName} review: ${specialistReceipts.length} specialist decisions processed.`,
          detail: {
            specialist_jobs: specialistReceipts.map((r) => `${r.agent_id}:${r.decision}`),
            channel_head_decision: channelReviewReceipt.decision,
          },
        };
        channelReview = CmoChannelReviewReceiptSchema.parse(review);
      }

      // Collect all errors
      const allErrors = [
        ...(channelResult.channel_errors ?? []),
      ];

      return {
        [`${channelName}_channel`]: {
          specialist_receipts: specialistReceipts,
          channel_review_receipt: channelReviewReceipt,
          channel_errors: allErrors,
        } as ChannelGraphOutput,
        channel_errors: allErrors,
      } as Partial<CmoCampaignState>;
    } catch (err) {
      return {
        [`${channelName}_channel`]: {
          specialist_receipts: [],
          channel_review_receipt: null,
          channel_errors: [`${channelName} channel graph error: ${err}`],
        } as ChannelGraphOutput,
        channel_errors: [`${channelName} channel graph error: ${err}`],
      } as Partial<CmoCampaignState>;
    }
  };
}

// ── CMO review summary node ──

async function cmoReviewSummaryNode(
  state: CmoCampaignState,
  config?: RunnableConfig,
): Promise<Partial<CmoCampaignState>> {
  const campaignId =
    ((config?.configurable as Record<string, unknown> | undefined)?.campaignId as string) ??
    state.campaign_id;

  // Collect all channel review receipts
  const allChannelReceipts: CmoChannelReviewReceipt[] = [];
  const allSpecialistReceipts: Record<string, CmoSpecialistReceipt[]> = {};

  for (const channel of ["x", "linkedin", "reddit"]) {
    const channelOutput = state[`${channel}_channel` as keyof CmoCampaignState] as
      | ChannelGraphOutput
      | undefined;
    if (!channelOutput) continue;

    const reviews = channelOutput.channel_review_receipt;
    const specialists = channelOutput.specialist_receipts ?? [];
    const errors = channelOutput.channel_errors ?? [];

    if (reviews) {
      const review: CmoChannelReviewReceipt = CmoChannelReviewReceiptSchema.parse({
        schema_version: "callscore_cmo_channel_review_receipt.v1",
        receipt_id: `crr-${campaignId}-${channel}`,
        created_at: reviews.created_at,
        campaign_id: campaignId,
        channel,
        channel_head_agent_id: reviews.agent_id,
        specialist_receipt_ids: specialists.map((r) => r.receipt_id),
        decision_count: specialists.length,
        dry_run: true as const,
        external_mutation_performed: false as const,
        send_or_outreach_performed: false as const,
        provider_mutation_performed: false as const,
        whop_mutation_performed: false as const,
        production_mutation_performed: false as const,
        parent_receipt_ids: [],
        summary: `Channel ${channel} review: ${specialists.length} specialist decisions processed.`,
        detail: {
          specialist_jobs: specialists.map((r) => `${r.agent_id}:${r.decision}`),
          channel_head_decision: reviews.decision,
          errors,
        },
      });
      allChannelReceipts.push(review);
    }

    allSpecialistReceipts[channel] = [
      ...specialists,
      ...(reviews ? [reviews] : []),
    ];
  }

  const totalDecisions = Object.values(allSpecialistReceipts).reduce(
    (sum, recs) => sum + recs.length,
    0,
  );

  const now = new Date().toISOString();
  const cmoReceipt: CmoCampaignReceipt = {
    schema_version: "callscore_cmo_campaign_receipt.v1",
    receipt_id: `campaign-rec-${campaignId}`,
    created_at: now,
    campaign_id: campaignId,
    cmo_agent_id: "callscore-cmo-head",
    channel_review_receipt_ids: allChannelReceipts.map((r) => r.receipt_id),
    total_specialist_decisions: totalDecisions,
    dry_run: true as const,
    external_mutation_performed: false as const,
    send_or_outreach_performed: false as const,
    provider_mutation_performed: false as const,
    whop_mutation_performed: false as const,
    production_mutation_performed: false as const,
    parent_receipt_ids: [],
    summary: `Campaign ${campaignId}: ${totalDecisions} specialist decisions across ${allChannelReceipts.length} channels.`,
    detail: {
      channels_processed: allChannelReceipts.map((r) => r.channel),
      channel_count: allChannelReceipts.length,
      total_specialist_decisions: totalDecisions,
    },
  };

  CmoCampaignReceiptSchema.parse(cmoReceipt);

  return {
    cmo_campaign_receipt: cmoReceipt,
    channel_receipts: allChannelReceipts,
    channel_specialist_receipts: allSpecialistReceipts,
  };
}

// ── Graph factory ──

export function createCmoCampaignGraph() {
  return new StateGraph(CmoCampaignStateAnnotation)
    .addNode(
      "x_channel_graph",
      createChannelGraphNode("x", CHANNEL_CONFIGS.x),
    )
    .addNode(
      "linkedin_channel_graph",
      createChannelGraphNode("linkedin", CHANNEL_CONFIGS.linkedin),
    )
    .addNode(
      "reddit_channel_graph",
      createChannelGraphNode("reddit", CHANNEL_CONFIGS.reddit),
    )
    .addNode("cmo_review_summary", cmoReviewSummaryNode)
    // Fan-out: all 3 channel graphs run in parallel from START
    .addEdge(START, "x_channel_graph")
    .addEdge(START, "linkedin_channel_graph")
    .addEdge(START, "reddit_channel_graph")
    // Fan-in: all channel graphs route to CMO review
    .addEdge("x_channel_graph", "cmo_review_summary")
    .addEdge("linkedin_channel_graph", "cmo_review_summary")
    .addEdge("reddit_channel_graph", "cmo_review_summary")
    .addEdge("cmo_review_summary", END)
    .compile();
}
