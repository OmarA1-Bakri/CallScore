import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";
import { readArtOfWarCampaignContext } from "./art-of-war-nodes";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nestedRecord(parent: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!parent) return null;
  const value = parent[key];
  return isRecord(value) ? value : null;
}

function socialPacketDetail(socialPacket: Record<string, unknown> | null, socialPacketPath: string | null): Record<string, unknown> {
  const visualAsset = nestedRecord(socialPacket, "visual_asset");
  const brandGate = nestedRecord(visualAsset, "brand_gate");
  const policyChecks = nestedRecord(socialPacket, "policy_checks");
  const copyRule = typeof socialPacket?.copy_rule === "string" ? socialPacket.copy_rule : "";
  return {
    social_packet_present: Boolean(socialPacket),
    social_packet_path: socialPacketPath,
    social_packet_ok: socialPacket ? socialPacket.ok === true : null,
    social_packet_schema: typeof socialPacket?.schema === "string" ? socialPacket.schema : null,
    social_packet_visual_required: visualAsset ? visualAsset.required === true : null,
    social_packet_brand_gate_ok: brandGate ? brandGate.ok === true : null,
    social_packet_copy_rule_zero_copy: /ZERO COPY/i.test(copyRule),
    social_packet_policy_no_mutation: policyChecks ? policyChecks.no_mutation === true : null,
  };
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
    const socialPacket = isRecord(cfg.socialPacket) ? cfg.socialPacket : null;
    const socialPacketPath = typeof cfg.socialPacketPath === "string" ? cfg.socialPacketPath : null;
    const socialDetail = socialPacketDetail(socialPacket, socialPacketPath);
    const artOfWarRuntimeRoot = typeof cfg.artOfWarRuntimeRoot === "string" ? cfg.artOfWarRuntimeRoot : undefined;
    const artOfWarContext = readArtOfWarCampaignContext({ runtimeRoot: artOfWarRuntimeRoot });

    if (artOfWarContext.blockers.length > 0) {
      return {
        status: "blocked" as const,
        summary: "Revenue campaign blocked by Art of War campaign/control context.",
        blockers: [...artOfWarContext.blockers],
        warnings: [...artOfWarContext.warnings],
        detail: {
          campaign_id: campaignId,
          art_of_war_context_available: artOfWarContext.available,
          art_of_war_context: artOfWarContext.context,
          art_of_war_blockers: artOfWarContext.blockers,
          art_of_war_warnings: artOfWarContext.warnings,
        },
        mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
      };
    }

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
      art_of_war_context: artOfWarContext.context,
      art_of_war_blockers: [...artOfWarContext.blockers],
      art_of_war_warnings: [...artOfWarContext.warnings],
      social_packet: socialPacket,
      social_packet_path: socialPacketPath,
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
        art_of_war_context_available: artOfWarContext.available,
        art_of_war_kill_switch_engaged: artOfWarContext.context?.kill_switch_engaged ?? null,
        art_of_war_preflight_ok: artOfWarContext.context?.preflight_ok ?? null,
        art_of_war_active_channels: artOfWarContext.context?.active_channels ?? [],
        art_of_war_blockers: [...artOfWarContext.blockers],
        ...socialDetail,
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    };
  },
});
