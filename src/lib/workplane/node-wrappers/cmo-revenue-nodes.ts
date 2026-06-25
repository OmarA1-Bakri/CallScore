import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";

const SAFE_CHANNELS = ["x", "linkedin", "reddit"] as const;
const REVENUE_ARTIFACT_DIR = ".tmp/workflow-receipts/callscore_operating_graph/revenue";

function nowIso(): string {
  return new Date().toISOString();
}

function writeRevenueArtifact(campaignId: string, value: unknown): string {
  const path = join(REVENUE_ARTIFACT_DIR, `revenue-review-${campaignId}-${Date.now()}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export const cmoRevenueGoalLoopNode = wrapDirectFunctionNode({
  nodeId: "revenue_goal_loop",
  domain: "revenue",
  run: async ({ state, config }) => {
    const configurable = config?.configurable;
    const cfg = configurable && typeof configurable === "object" && !Array.isArray(configurable)
      ? configurable as Record<string, unknown>
      : {};
    const campaignId = state.config.campaignId ?? `campaign-${state.config.goal}`;
    const approvedLive = !state.config.dryRun && state.config.mode === "approved_publish";
    const providerProof = cfg.providerPublicationProof;

    if (approvedLive && !providerProof) {
      return {
        status: "blocked" as const,
        summary: "Revenue publish blocked: provider proof/readback path missing.",
        blockers: ["provider_proof_missing"],
        detail: {
          campaign_id: campaignId,
          required_next: "provider adapter must provide publication proof/readback",
        },
        mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
      };
    }

    const campaignReceipt = {
      schema_version: "callscore_cmo_campaign_receipt.v1",
      receipt_id: `campaign-rec-${campaignId}`,
      campaign_id: campaignId,
      created_at: nowIso(),
      dry_run: true,
      channels_processed: [...SAFE_CHANNELS],
      external_mutation_performed: false,
      provider_mutation_performed: false,
      whop_mutation_performed: false,
      production_mutation_performed: false,
      send_or_outreach_performed: false,
      summary: "Wrapper-first CMO campaign dry-run packet.",
    };
    const packet = {
      schema_version: "callscore_cmo_revenue_review_packet.v1",
      created_at: nowIso(),
      channel_publish_readiness: SAFE_CHANNELS.map((channel) => ({ channel, ready: true, mode: "dry_run" })),
      cmo_campaign_receipt: campaignReceipt,
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
    const artifactPath = writeRevenueArtifact(campaignId, packet);

    return {
      status: "ok" as const,
      summary: "CMO revenue review packet created without mutation.",
      artifact_path: artifactPath,
      detail: {
        review_packet_schema_version: packet.schema_version,
        campaign_receipt_id: campaignReceipt.receipt_id,
        channel_publish_readiness_count: packet.channel_publish_readiness.length,
        channel_count: SAFE_CHANNELS.length,
        provider_proof_present: Boolean(providerProof),
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
  },
});
