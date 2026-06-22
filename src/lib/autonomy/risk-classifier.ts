import type { RiskClass } from "./contracts";
import type { ChannelHeadDecisionContext, RestrictedGate } from "./channel-head-context";

export type ChannelHeadActionRisk = "low" | "restricted";

export interface ChannelHeadRiskClassification {
  readonly action_risk: ChannelHeadActionRisk;
  readonly gate_required: RestrictedGate | null;
  readonly reason_codes: readonly string[];
}

function gateForRiskClass(riskClass: RiskClass): RestrictedGate | null {
  switch (riskClass) {
    case "restricted_provider":
    case "restricted_db_deploy":
      return "PRODUCTION_GATE";
    case "restricted_financial":
      return "FINANCIAL_GATE";
    case "restricted_credentials":
      return "SECRET_GATE";
    case "restricted_outreach":
      return "SEND_GATE";
    case "public_claim_risk":
      return "PUBLISH_GATE";
    case "safe_owned_public":
      return null;
  }
}

function reasonForGate(riskClass: RiskClass, gate: RestrictedGate): string {
  if (riskClass === "restricted_provider") return "restricted_provider_requires_production_gate";
  if (riskClass === "restricted_db_deploy") return "restricted_db_deploy_requires_production_gate";
  if (riskClass === "restricted_financial") return "restricted_financial_requires_financial_gate";
  if (riskClass === "restricted_credentials") return "restricted_credentials_requires_secret_gate";
  if (riskClass === "restricted_outreach") return "restricted_outreach_requires_send_gate";
  if (riskClass === "public_claim_risk") return "public_claim_risk_requires_publish_gate";
  return `registry_requires_${gate.toLowerCase()}`;
}

export function classifyChannelHeadRisk(context: Pick<ChannelHeadDecisionContext, "riskClass" | "gtmRegistryState">): ChannelHeadRiskClassification {
  const riskGate = gateForRiskClass(context.riskClass);
  const gate = riskGate ?? (context.gtmRegistryState.requiredGate === "NONE" ? null : context.gtmRegistryState.requiredGate);
  if (!gate) {
    return {
      action_risk: "low",
      gate_required: null,
      reason_codes: ["action_risk_low"],
    };
  }
  return {
    action_risk: "restricted",
    gate_required: gate,
    reason_codes: [reasonForGate(context.riskClass, gate)],
  };
}
