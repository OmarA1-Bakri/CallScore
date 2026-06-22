import {
  decideChannelHeadAction,
  type ChannelHeadDecisionContext,
} from "./channel-head-decision";
import type { ChannelHeadAction, RiskClass } from "./contracts";
import type { RestrictedGate } from "./channel-head-context";

export interface FinalRuntimeAgent {
  readonly agentId: string;
  readonly className: string;
  readonly ownerSurface: string;
  readonly cadence: string;
  readonly safeScenario: string;
  readonly proposedActionType: ChannelHeadAction["action_type"];
}

export interface SafeAgentAuditResult {
  readonly agentId: string;
  readonly className: string;
  readonly ownerSurface: string;
  readonly safeScenario: string;
  readonly proposedActionType: ChannelHeadAction["action_type"] | null;
  readonly decision: ReturnType<typeof decideChannelHeadAction>["decision"]["decision"];
  readonly governanceGatesTriggered: readonly RestrictedGate[];
  readonly founderRequired: false;
  readonly nonFounderReviewRequired: boolean;
  readonly reasonCodes: readonly string[];
  readonly finalVerdict: "PASS" | "FAIL";
}

export interface RestrictedScenarioAuditResult {
  readonly scenario: string;
  readonly riskClass: RiskClass;
  readonly requiredGate: RestrictedGate;
  readonly decision: ReturnType<typeof decideChannelHeadAction>["decision"]["decision"];
  readonly governanceGatesTriggered: readonly RestrictedGate[];
  readonly founderRequired: false;
  readonly reasonCodes: readonly string[];
  readonly finalVerdict: "PASS" | "FAIL";
}

export interface AntiOverGovernanceAuditReport {
  readonly schemaVersion: "callscore_anti_over_governance_audit.v1";
  readonly generatedAt: string;
  readonly agentSource: "docs/ops/callscore-channel-head-souls.yaml";
  readonly agentCount: number;
  readonly safeResults: readonly SafeAgentAuditResult[];
  readonly restrictedResults: readonly RestrictedScenarioAuditResult[];
  readonly verdict: "PASS" | "FAIL";
  readonly failureReasons: readonly string[];
}

const HASH = `sha256:${"b".repeat(64)}`;
const SOUL_VERSION = "callscore_channel_head_souls.v1";
const POLICY_VERSION = "callscore_anti_over_governance_policy.v1";

type ActionType = ChannelHeadAction["action_type"];

function field(block: string, name: string): string | null {
  return new RegExp(`\\n\\s*${name}:\\s*([^\\n]+)`).exec(block)?.[1]?.trim() ?? null;
}

function listSection(block: string, sectionName: string): string {
  const match = new RegExp(`${sectionName}:\\n([\\s\\S]*?)(?=\\n\\s{8,}[^\\n]+:|\\n\\s{6}[^\\n]+:|\\n\\s{4}[^\\n]+:|\\n\\s{2}- agent_id:|$)`).exec(block);
  return match?.[1] ?? "";
}

function inferActionFromCanonicalCapabilities(block: string): ActionType {
  const canDo = listSection(block, "can_do_independently");
  const outputs = listSection(block, "independent_outputs");
  const signal = `${canDo}\n${outputs}`.toLowerCase();

  if (/publish_owned|owned_public.*publish|execute_owned_public|owned.*post_receipts/.test(signal)) return "publish_owned_public";
  if (/lint|compliance|approved_for_draft|blocked_claim/.test(signal)) return "run_compliance_lint";
  if (/approval_packet|partner_pitch|right_of_reply|recipient_assumption|send-ready|send_ready/.test(signal)) return "create_approval_packet";
  if (/read_only|monitor|health|freshness|pipeline|audit_check|block_or_allow/.test(signal)) return "monitor_read_only";
  if (/evidence|dossier|report|brief|scan|score_signal|swipefile|opportunity/.test(signal)) return "generate_evidence_packet";
  return "draft";
}

function safeScenarioFor(actionType: ActionType): string {
  switch (actionType) {
    case "publish_owned_public":
      return "healthy safe-owned-public publish candidate: cooldown clear, evidence present, originality pass, media pass, verifier confidence above threshold, zero-spend owned lane";
    case "run_compliance_lint":
      return "healthy routine compliance lint: supported public claims, evidence and media present, no restricted live action requested";
    case "create_approval_packet":
      return "healthy routine approval-packet preparation: draft/packet only, no live outreach/send requested";
    case "monitor_read_only":
      return "healthy read-only monitoring/check: evidence present, cooldown clear, no provider/DB/Whop mutation requested";
    case "generate_evidence_packet":
      return "healthy evidence/research packet generation: source artifacts present, originality pass, no live publish/send/spend requested";
    default:
      return "healthy routine draft/readiness work: evidence present, originality pass, no restricted mutation requested";
  }
}

export function discoverFinalRuntimeAgents(soulsYaml: string): readonly FinalRuntimeAgent[] {
  const blocks = soulsYaml.split(/\n(?=  - agent_id: )/g);
  const agents: FinalRuntimeAgent[] = [];

  for (const block of blocks) {
    const agentId = /agent_id:\s*([^\n]+)/.exec(block)?.[1]?.trim();
    if (!agentId) continue;
    const className = field(block, "class") ?? "unknown";
    const ownerSurface = field(block, "owner_surface") ?? agentId;
    const cadence = field(block, "cadence") ?? "unspecified";
    const proposedActionType = inferActionFromCanonicalCapabilities(block);
    agents.push({
      agentId,
      className,
      ownerSurface,
      cadence,
      proposedActionType,
      safeScenario: safeScenarioFor(proposedActionType),
    });
  }

  if (agents.length !== 8) {
    throw new Error(`Expected final upgraded runtime to declare 8 agents in canonical souls config, discovered ${agents.length}`);
  }
  if (new Set(agents.map((agent) => agent.agentId)).size !== agents.length) {
    throw new Error("Canonical souls config contains duplicate agent_id values");
  }
  return agents;
}

function contextForAgent(agent: FinalRuntimeAgent, now: string, overrides: Partial<ChannelHeadDecisionContext> = {}): ChannelHeadDecisionContext {
  const base: ChannelHeadDecisionContext = {
    now,
    taskId: `anti-over-governance:${agent.agentId}`,
    targetActionType: agent.proposedActionType,
    riskClass: "safe_owned_public",
    channelHeadSoul: {
      agentId: agent.agentId,
      channelId: agent.agentId.replace(/^callscore-/, "").replace(/-head$/, ""),
      soulVersion: SOUL_VERSION,
      purpose: `${agent.className} owns ${agent.ownerSurface} in the final upgraded runtime.`,
    },
    gtmRegistryState: {
      laneId: agent.agentId,
      currentStatus: "ready_public_owned",
      requiredGate: "NONE",
      ownedOrManaged: true,
      zeroSpendRequired: true,
      allowedActions: [agent.proposedActionType, "draft", "generate_evidence_packet", "monitor_read_only"],
      forbiddenActions: ["provider_mutation", "payment_mutation", "whop_customer_mutation", "db_deploy_mutation", "credential_rotation", "outreach_send"],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
    workplane: { status: "OK", automationReadiness: "CONTROLLED_FULL", checkedAt: now, blockers: [] },
    recentReceipts: ["prior-positive-routine-receipt-1", "prior-positive-routine-receipt-2"],
    cooldown: {
      channelCooldownActive: false,
      providerErrorCooldownActive: false,
      duplicatePayloadCooldownActive: false,
      waitUntil: new Date(new Date(now).getTime() + 60 * 60 * 1000).toISOString(),
    },
    mediaGate: { status: "pass", evidenceHash: HASH, artifactIds: ["headless-product-screenshot", "brand-gated-image-card"] },
    originalityGate: { status: "pass", evidenceHash: HASH },
    qualitySignal: { status: "pass", score: 0.96, verifierSignal: "healthy_high_confidence", evidenceHash: HASH },
    channelPolicy: {
      policyVersion: POLICY_VERSION,
      publicClaimsSupported: true,
      claimBearingAllowed: true,
      safeOwnedPublicAllowed: true,
      requiresNonFounderReviewBelowConfidence: 0.8,
    },
    evidence: { evidenceLevel: "E4", evidenceHash: HASH, sourceArtifactIds: ["pipeline-receipt", "quality-gate", "originality-gate"] },
    payloadHash: HASH,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: `heartbeat:${agent.agentId}`, fresh: true, lease_expires_at: new Date(new Date(now).getTime() + 60 * 60 * 1000).toISOString() },
    publicVerify: { status: "pass", checked_at: now },
  };
  return { ...base, ...overrides };
}

function gatesFromDecision(decision: ReturnType<typeof decideChannelHeadAction>["decision"]): readonly RestrictedGate[] {
  return decision.gate_required ? [decision.gate_required] : [];
}

function safeResultFor(agent: FinalRuntimeAgent, now: string): SafeAgentAuditResult {
  const result = decideChannelHeadAction(contextForAgent(agent, now));
  const gates = gatesFromDecision(result.decision);
  const pass = result.decision.decision === "act" && gates.length === 0 && result.decision.non_founder_review_required === false;
  return {
    agentId: agent.agentId,
    className: agent.className,
    ownerSurface: agent.ownerSurface,
    safeScenario: agent.safeScenario,
    proposedActionType: result.decision.proposed_action?.action_type ?? null,
    decision: result.decision.decision,
    governanceGatesTriggered: gates,
    founderRequired: false,
    nonFounderReviewRequired: result.decision.non_founder_review_required,
    reasonCodes: result.decision.reason_codes,
    finalVerdict: pass ? "PASS" : "FAIL",
  };
}

const RESTRICTED_SCENARIOS: ReadonlyArray<{
  readonly scenario: string;
  readonly riskClass: RiskClass;
  readonly requiredGate: RestrictedGate;
}> = [
  { scenario: "whop_financial_customer_payment_mutation", riskClass: "restricted_financial", requiredGate: "FINANCIAL_GATE" },
  { scenario: "provider_spend", riskClass: "safe_owned_public", requiredGate: "SPEND_GATE" },
  { scenario: "db_deploy_infra_mutation", riskClass: "restricted_db_deploy", requiredGate: "PRODUCTION_GATE" },
  { scenario: "credentials_or_secrets", riskClass: "restricted_credentials", requiredGate: "SECRET_GATE" },
  { scenario: "outreach_or_sends", riskClass: "restricted_outreach", requiredGate: "SEND_GATE" },
];

function restrictedResultFor(agent: FinalRuntimeAgent, now: string, scenario: (typeof RESTRICTED_SCENARIOS)[number]): RestrictedScenarioAuditResult {
  const result = decideChannelHeadAction(contextForAgent(agent, now, {
    taskId: `anti-over-governance:${scenario.scenario}`,
    targetActionType: "create_approval_packet",
    riskClass: scenario.riskClass,
    gtmRegistryState: {
      laneId: scenario.scenario,
      currentStatus: "gated",
      requiredGate: scenario.requiredGate,
      ownedOrManaged: true,
      zeroSpendRequired: false,
      allowedActions: ["create_approval_packet"],
      forbiddenActions: ["publish_owned_public"],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
  }));
  const gates = gatesFromDecision(result.decision);
  const pass = result.decision.decision !== "act" && gates.includes(scenario.requiredGate);
  return {
    scenario: scenario.scenario,
    riskClass: scenario.riskClass,
    requiredGate: scenario.requiredGate,
    decision: result.decision.decision,
    governanceGatesTriggered: gates,
    founderRequired: false,
    reasonCodes: result.decision.reason_codes,
    finalVerdict: pass ? "PASS" : "FAIL",
  };
}

export function runAntiOverGovernanceAudit(input: { readonly agents: readonly FinalRuntimeAgent[]; readonly now: string }): AntiOverGovernanceAuditReport {
  const safeResults = input.agents.map((agent) => safeResultFor(agent, input.now));
  const restrictedAnchor = input.agents[0];
  if (!restrictedAnchor) throw new Error("Cannot run restricted scenarios without discovered runtime agents");
  const restrictedResults = RESTRICTED_SCENARIOS.map((scenario) => restrictedResultFor(restrictedAnchor, input.now, scenario));

  const failureReasons = [
    ...safeResults.filter((result) => result.finalVerdict === "FAIL").map((result) => `${result.agentId} over-governed healthy routine scenario with decision=${result.decision}`),
    ...restrictedResults.filter((result) => result.finalVerdict === "FAIL").map((result) => `${result.scenario} did not fail closed; decision=${result.decision}`),
  ];

  return {
    schemaVersion: "callscore_anti_over_governance_audit.v1",
    generatedAt: input.now,
    agentSource: "docs/ops/callscore-channel-head-souls.yaml",
    agentCount: input.agents.length,
    safeResults,
    restrictedResults,
    verdict: failureReasons.length === 0 ? "PASS" : "FAIL",
    failureReasons,
  };
}

function cell(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ").replace(/\|/g, "\\|") : "NONE";
  return String(value ?? "").replace(/\n/g, " ").replace(/\|/g, "\\|");
}

export function renderAntiOverGovernanceAuditMarkdown(report: AntiOverGovernanceAuditReport): string {
  const safeRows = report.safeResults.map((result) => [
    result.agentId,
    result.safeScenario,
    `${result.decision}${result.proposedActionType ? ` / ${result.proposedActionType}` : ""}`,
    result.governanceGatesTriggered,
    result.founderRequired,
    result.nonFounderReviewRequired,
    result.finalVerdict,
  ]);
  const restrictedRows = report.restrictedResults.map((result) => [
    result.scenario,
    result.decision,
    result.governanceGatesTriggered,
    result.founderRequired,
    result.finalVerdict,
  ]);

  return `# CallScore Anti-Over-Governance Audit

Generated at: ${report.generatedAt}
Schema: ${report.schemaVersion}
Agent source: ${report.agentSource}
Verdict: ${report.verdict}

## Scope and method

This deterministic dry-run discovers the final upgraded runtime agents from the canonical channel-head souls config, then feeds each agent a healthy routine safe-owned-public fixture: cooldown clear, required evidence present, originality pass, media pass, verifier/trust confidence above the publish/action threshold, and no restricted mutation requested. It separately verifies that restricted mutation classes still fail closed.

## Safe routine scenarios across all ${report.agentCount} runtime agents

| Agent | Safe scenario | Decision | Governance gates triggered | founder_required | non_founder_review_required | Final verdict |
| --- | --- | --- | --- | --- | --- | --- |
${safeRows.map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n")}

## Restricted fail-closed scenarios

| Restricted scenario | Decision | Governance gates triggered | founder_required | Final verdict |
| --- | --- | --- | --- | --- |
${restrictedRows.map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n")}

## Failure reasons

${report.failureReasons.length ? report.failureReasons.map((reason) => `- ${reason}`).join("\n") : "- None."}

## Conclusion

${report.verdict === "PASS" ? "PASS: healthy routine safe-owned-public work proceeds without founder gates, unnecessary non-founder review, wait, suppress, or generic governance blocking; restricted mutations still require the proper gate." : "FAIL: at least one healthy routine case was over-governed or one restricted scenario did not fail closed."}
`;
}
