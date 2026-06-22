import type { ChannelHeadAction, ChannelHeadInputSnapshot, RiskClass } from "./contracts";

export type ChannelHeadActionType = ChannelHeadAction["action_type"];
export type RestrictedGate = NonNullable<ChannelHeadAction["restricted_gate_required"]>;
export type EvidenceLevel = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";
export type KillSwitchDecisionState = ChannelHeadInputSnapshot["kill_switch"];
export type HeartbeatDecisionState = ChannelHeadInputSnapshot["heartbeat"];
export type PublicVerifyDecisionState = ChannelHeadInputSnapshot["public_verify"];

export interface ChannelHeadSoulContext {
  readonly agentId: string;
  readonly channelId: string;
  readonly soulVersion: string;
  readonly purpose: string;
}

export interface GtmRegistryDecisionState {
  readonly laneId: string;
  readonly currentStatus: string;
  readonly requiredGate: RestrictedGate | "NONE";
  readonly requiredReceipt?: string;
  readonly ownedOrManaged: boolean;
  readonly zeroSpendRequired: boolean;
  readonly allowedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly rollbackPath?: string;
}

export interface WorkplaneDecisionState {
  readonly status: "OK" | "WARN" | "BLOCKED" | "UNKNOWN";
  readonly automationReadiness?: string;
  readonly checkedAt?: string;
  readonly blockers: readonly string[];
}

export interface CooldownDecisionState {
  readonly channelCooldownActive: boolean;
  readonly providerErrorCooldownActive: boolean;
  readonly duplicatePayloadCooldownActive: boolean;
  readonly waitUntil?: string;
}

export interface MediaGateState {
  readonly status: "pass" | "fail" | "missing" | "unknown";
  readonly evidenceHash: string | null;
  readonly artifactIds: readonly string[];
}

export interface OriginalityGateState {
  readonly status: "pass" | "fail" | "missing" | "unknown";
  readonly evidenceHash: string | null;
}

export interface QualitySignalState {
  readonly status: "pass" | "fail" | "ambiguous" | "unknown";
  readonly score: number;
  readonly verifierSignal: string;
  readonly evidenceHash: string | null;
}

export interface ChannelPolicyState {
  readonly policyVersion: string;
  readonly publicClaimsSupported: boolean;
  readonly claimBearingAllowed: boolean;
  readonly safeOwnedPublicAllowed: boolean;
  readonly requiresNonFounderReviewBelowConfidence: number;
}

export interface EvidenceDecisionState {
  readonly evidenceLevel: EvidenceLevel;
  readonly evidenceHash: string | null;
  readonly sourceArtifactIds: readonly string[];
}

export interface ChannelHeadCapsState {
  readonly channelPostsToday: number;
  readonly maxChannelPostsPerDay: number;
  readonly totalPostsToday: number;
  readonly maxTotalPostsPerDay: number;
}

export interface ChannelHeadDecisionContext {
  readonly now: string;
  readonly taskId: string | null;
  readonly targetActionType: ChannelHeadActionType;
  readonly riskClass: RiskClass;
  readonly channelHeadSoul: ChannelHeadSoulContext;
  readonly gtmRegistryState: GtmRegistryDecisionState;
  readonly workplane: WorkplaneDecisionState;
  readonly recentReceipts: readonly string[];
  readonly cooldown: CooldownDecisionState;
  readonly mediaGate: MediaGateState;
  readonly originalityGate: OriginalityGateState;
  readonly qualitySignal: QualitySignalState;
  readonly channelPolicy: ChannelPolicyState;
  readonly evidence: EvidenceDecisionState;
  readonly payloadHash: string | null;
 readonly caps: ChannelHeadCapsState;
 readonly killSwitch: KillSwitchDecisionState;
 readonly heartbeat: HeartbeatDecisionState;
 readonly publicVerify: PublicVerifyDecisionState;
 }
