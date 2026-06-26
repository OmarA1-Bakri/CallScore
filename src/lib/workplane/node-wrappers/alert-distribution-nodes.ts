import type { ClaimedAlertRow } from "../../alerts";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_MUTATION_FLAGS } from "../operating-node-utils";

export interface AlertDistributionMailerPayload {
  subject: string;
  text: string;
  html: string;
}

export interface AlertDistributionNodeDeps {
  claimPendingAlerts: (limit: number, hasUsersTable: boolean) => Promise<ClaimedAlertRow[]>;
  sendEmail: (payload: AlertDistributionMailerPayload) => Promise<void>;
  revertClaim: (ids: readonly number[]) => Promise<number>;
  hasUsersTable: () => Promise<boolean>;
}

export function createAlertDistributionNode(deps: AlertDistributionNodeDeps) {
  return wrapDirectFunctionNode({
    nodeId: "alert_goal_loop",
    domain: "alerts",
    run: async ({ state, config }) => {
      const configurable = config?.configurable;
      const cfg = configurable && typeof configurable === "object" && !Array.isArray(configurable)
        ? configurable as Record<string, unknown>
        : {};
      const sendPolicy = cfg.alertDistribution as Record<string, unknown> | undefined;
      const allowSend = sendPolicy?.sendPolicy
        ? (sendPolicy.sendPolicy as Record<string, unknown>).allowSend === true
        : false;

      if (!allowSend || state.config.dryRun) {
        return {
          status: "blocked",
          summary: "Alert send policy not configured.",
          blockers: ["alert_send_policy_missing"],
          detail: { send_allowed: false },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
        };
      }

      const hasApprovalEvidence = Boolean(state.config.approvalReceiptId || state.config.approvedByOperator);
      const approvedForSend = state.config.mode === "approved_publish" && state.config.approved && hasApprovalEvidence;
      if (!approvedForSend) {
        return {
          status: "blocked",
          summary: "Alert send approval evidence is missing.",
          blockers: ["alert_send_approval_missing"],
          detail: {
            send_allowed: false,
            mode: state.config.mode,
            approved: state.config.approved,
            approval_evidence_present: hasApprovalEvidence,
          },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
        };
      }

      const maxItems = state.config.maxItems || 2;
      const hasTable = await deps.hasUsersTable();
      const claimed = await deps.claimPendingAlerts(maxItems, hasTable);
      if (claimed.length === 0) {
        return {
          status: "ok",
          summary: "No pending alerts.",
          detail: { claimed_alert_count: 0 },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
        };
      }

      try {
        const baseUrl = (sendPolicy?.baseUrl as string) ?? "https://call-score.com";
        const creatorNames = Array.from(new Set(claimed.map((r) => r.creator_name)));
        const symbols = Array.from(new Set(claimed.map((r) => r.symbol)));
        const label = creatorNames.length === 1 ? creatorNames[0] ?? "creator" : `${creatorNames.length} creators`;

        await deps.sendEmail({
          subject: `${label} made ${claimed.length} new ${claimed.length === 1 ? "call" : "calls"} - CallScore`,
          text: symbols.join(", "),
          html: `<p>${symbols.join(", ")}</p>`,
        });

        return {
          status: "ok",
          summary: "Alerts sent.",
          detail: { claimed_alert_count: claimed.length, sent_alert_count: claimed.length },
          mutation_flags: {
            ...DEFAULT_MUTATION_FLAGS,
            external_mutation_performed: true,
            send_or_outreach_performed: true,
            db_write_performed: true,
          },
        };
      } catch (err) {
        const ids = claimed.map((r) => r.alert_id);
        await deps.revertClaim(ids);
        return {
          status: "failed",
          summary: "Alert send failed.",
          blockers: [err instanceof Error ? err.message : String(err)],
          detail: { reverted_claim_count: ids.length },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS, external_mutation_performed: true, db_write_performed: true },
        };
      }
    },
  });
}
