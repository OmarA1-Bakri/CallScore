import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { routeDecision } from "../../autonomy/decision-router";
import type { ChannelHeadActionType, ChannelHeadDecisionContext } from "../../autonomy/channel-head-context";
import { operatingGoalRequiresApproval } from "../operating-goals";
import {
  DEFAULT_OPERATING_MUTATION_FLAGS,
  type OperatingGraphState,
} from "../operating-graph-schemas";
import { wrapDirectFunctionNode, type OperatingNodePatch } from "../operating-node-utils";

function artifactObject(state: OperatingGraphState, key: string): Record<string, unknown> | null {
  const value = state.artifacts[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function configurableObject(config: RunnableConfig): Record<string, unknown> {
  const value = config.configurable;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readJsonObject(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return asObject(parsed);
  } catch {
    return null;
  }
}

function resolveKillSwitch(state: OperatingGraphState, config: RunnableConfig): Record<string, unknown> | null {
  const cfg = configurableObject(config);
  return artifactObject(state, "kill_switch")
    ?? asObject(cfg.killSwitch)
    ?? (typeof cfg.killSwitchPath === "string" ? readJsonObject(cfg.killSwitchPath) : null)
    ?? readJsonObject(join(process.cwd(), "art-of-war", "live", "kill-switch.json"));
}

function resolveWorkplaneStatus(state: OperatingGraphState, config: RunnableConfig): { status: Record<string, unknown> | null; unavailable: boolean; warning: string | null } {
  const cfg = configurableObject(config);
  const explicit = artifactObject(state, "workplane_status") ?? asObject(cfg.workplaneStatus);
  if (explicit) return { status: explicit, unavailable: false, warning: null };
  if (state.config.testFixtures) {
    return { status: { status: "OK", automation_readiness: "CONTROLLED_FULL", autonomous_revenue_status: "NO" }, unavailable: false, warning: null };
  }
  if (cfg.readLiveWorkplaneStatus === true) {
    return { status: null, unavailable: true, warning: "live_workplane_status_not_loaded_in_preflight_node" };
  }
  return { status: null, unavailable: true, warning: null };
}

function resolveHeartbeat(state: OperatingGraphState, config: RunnableConfig): Record<string, unknown> | null {
  const cfg = configurableObject(config);
  const explicit = artifactObject(state, "heartbeat") ?? asObject(cfg.heartbeat);
  if (explicit) return explicit;
  if (state.config.testFixtures) {
    const now = new Date();
    return {
      heartbeat_id: `fixture-heartbeat:${state.config.goal}`,
      fresh: true,
      lease_expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
    };
  }
  return null;
}

function heartbeatBlockers(heartbeat: Record<string, unknown> | null, now = new Date()): string[] {
  if (!heartbeat) return ["heartbeat_missing"];
  const blockers: string[] = [];
  if (!heartbeat.heartbeat_id) blockers.push("heartbeat_missing");
  if (heartbeat.fresh === false) blockers.push("heartbeat_stale");
  const lease = typeof heartbeat.lease_expires_at === "string" ? Date.parse(heartbeat.lease_expires_at) : NaN;
  if (!Number.isFinite(lease)) blockers.push("heartbeat_lease_missing");
  else if (lease <= now.getTime()) blockers.push("heartbeat_lease_expired");
  return blockers;
}

function pipelineFreshnessBlockers(state: OperatingGraphState): string[] {
  const freshness = artifactObject(state, "pipeline_freshness");
  if (!freshness) return [];
  if (freshness.status === "stale" || freshness.fresh === false) return ["pipeline_freshness_stale"];
  if (freshness.status === "cooldown") return ["pipeline_freshness_cooldown"];
  return [];
}

function buildAuthorityContext(input: {
  readonly state: OperatingGraphState;
  readonly authority: Record<string, unknown>;
  readonly workplane: Record<string, unknown> | null;
  readonly killSwitch: Record<string, unknown> | null;
  readonly heartbeat: Record<string, unknown> | null;
}): ChannelHeadDecisionContext {
  const now = new Date().toISOString();
  const agentId = typeof input.authority.agent_id === "string" ? input.authority.agent_id : "unknown-agent";
  const action = typeof input.authority.target_action_type === "string" ? input.authority.target_action_type as ChannelHeadActionType : "monitor_read_only";
  const workplaneStatus = input.workplane?.status === "OK" || input.workplane?.status === "WARN" || input.workplane?.status === "BLOCKED"
    ? input.workplane.status
    : "UNKNOWN";
  return {
    now,
    taskId: `operating-preflight:${input.state.config.goal}:${agentId}`,
    targetActionType: action,
    riskClass: action === "publish_owned_public" ? "safe_owned_public" : "public_claim_risk",
    channelHeadSoul: {
      agentId,
      channelId: typeof input.authority.channel_id === "string" ? input.authority.channel_id : input.state.config.goal,
      soulVersion: "callscore_operating_preflight.v1",
      purpose: "CallScore operating graph hard-gate preflight authority check",
    },
    gtmRegistryState: {
      laneId: typeof input.authority.lane_id === "string" ? input.authority.lane_id : input.state.config.goal,
      currentStatus: typeof input.authority.current_status === "string" ? input.authority.current_status : "ready_public_owned",
      requiredGate: "NONE",
      ownedOrManaged: true,
      zeroSpendRequired: true,
      allowedActions: ["monitor_read_only", "draft", "publish_owned_public"],
      forbiddenActions: ["provider_mutation", "payment_mutation", "whop_customer_mutation", "db_deploy_mutation", "secret_exposure"],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
    workplane: {
      status: workplaneStatus,
      automationReadiness: typeof input.workplane?.automation_readiness === "string" ? input.workplane.automation_readiness : undefined,
      checkedAt: typeof input.workplane?.generatedAt === "string" ? input.workplane.generatedAt : now,
      blockers: Array.isArray(input.workplane?.blockers) ? input.workplane.blockers.map(String) : [],
    },
    recentReceipts: [],
    cooldown: { channelCooldownActive: false, providerErrorCooldownActive: false, duplicatePayloadCooldownActive: false, waitUntil: now },
    mediaGate: { status: "pass", evidenceHash: null, artifactIds: [] },
    originalityGate: { status: "pass", evidenceHash: null },
    qualitySignal: { status: "ambiguous", score: 0.75, verifierSignal: "operating_preflight", evidenceHash: null },
    channelPolicy: { policyVersion: "callscore_operating_preflight.v1", publicClaimsSupported: true, claimBearingAllowed: true, safeOwnedPublicAllowed: true, requiresNonFounderReviewBelowConfidence: 0.5 },
    evidence: { evidenceLevel: "E2", evidenceHash: null, sourceArtifactIds: [] },
    payloadHash: null,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: {
      global_active: input.killSwitch?.global_engaged === true || input.killSwitch?.global_active === true || input.killSwitch?.global === true,
      channel_active: input.killSwitch?.channel_active === true || input.killSwitch?.channel === true,
      agent_paused: input.killSwitch?.agent_paused === true,
      missing_state_blocks_dispatch: true,
    },
    heartbeat: {
      heartbeat_id: typeof input.heartbeat?.heartbeat_id === "string" ? input.heartbeat.heartbeat_id : null,
      fresh: input.heartbeat?.fresh !== false,
      lease_expires_at: typeof input.heartbeat?.lease_expires_at === "string" ? input.heartbeat.lease_expires_at : null,
    },
    publicVerify: { status: "pass", checked_at: now },
  };
}

function authorityBlockers(input: {
  readonly state: OperatingGraphState;
  readonly config: RunnableConfig;
  readonly workplane: Record<string, unknown> | null;
  readonly killSwitch: Record<string, unknown> | null;
  readonly heartbeat: Record<string, unknown> | null;
}): string[] {
  const cfg = configurableObject(input.config);
  const authority = artifactObject(input.state, "authority_check") ?? asObject(cfg.authorityCheck);
  if (!authority) return [];
  const decision = routeDecision(buildAuthorityContext({ state: input.state, authority, workplane: input.workplane, killSwitch: input.killSwitch, heartbeat: input.heartbeat }));
  return decision.decision.decision === "act" ? [] : [...decision.decision.reason_codes];
}

export const bootContextNode = wrapDirectFunctionNode({
  nodeId: "boot_context",
  domain: "gating",
  run: async ({ state }) => ({
    status: "ok",
    summary: `Booted CallScore operating graph for goal=${state.config.goal}`,
    detail: {
      goal: state.config.goal,
      mode: state.config.mode,
      dryRun: state.config.dryRun,
      bounded: state.config.bounded,
      maxItems: state.config.maxItems,
    },
    mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
  }),
});

function missingRuntimeContextIsWarningOnly(state: OperatingGraphState): boolean {
  return state.config.goal === "monitor";
}

export async function hardGatePreflightNode(state: OperatingGraphState, config: RunnableConfig): Promise<OperatingNodePatch> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const killSwitch = resolveKillSwitch(state, config);
  if (killSwitch?.global === true || killSwitch?.global_kill_switch === true || killSwitch?.global_active === true || killSwitch?.global_engaged === true) {
    blockers.push("global_kill_switch_active");
  }
  if (killSwitch?.channel === true || killSwitch?.channel_kill_switch === true || killSwitch?.channel_active === true) {
    blockers.push("channel_kill_switch_active");
  }
  if (killSwitch?.agent_paused === true) {
    blockers.push("agent_paused");
  }

  const workplaneResult = resolveWorkplaneStatus(state, config);
  const workplane = workplaneResult.status;
  if (workplaneResult.warning) warnings.push(workplaneResult.warning);
  if (workplaneResult.unavailable) {
    if (missingRuntimeContextIsWarningOnly(state)) warnings.push("workplane_status_unavailable");
    else blockers.push("workplane_status_unavailable");
  }
  if (workplane?.status === "BLOCKED" || workplane?.automation_readiness === "BLOCKED") {
    blockers.push("workplane_blocked");
  }
  if (workplane?.autonomous_revenue_status === "NO" && state.config.goal === "revenue_now" && !state.config.dryRun) {
    blockers.push("autonomous_revenue_not_live");
  }

  if (operatingGoalRequiresApproval(state.config) && !state.config.approved && !state.config.approvalReceiptId && !state.config.approvedByOperator) {
    blockers.push("approval_missing");
  }

  const heartbeat = resolveHeartbeat(state, config);
  const heartbeatIssues = heartbeatBlockers(heartbeat);
  if (heartbeat === null && missingRuntimeContextIsWarningOnly(state)) warnings.push(...heartbeatIssues);
  else blockers.push(...heartbeatIssues);
  blockers.push(...pipelineFreshnessBlockers(state));
  blockers.push(...authorityBlockers({ state, config, workplane, killSwitch, heartbeat }));

  if (!state.config.bounded) {
    warnings.push("unbounded_goal_requested");
  }

  const node = wrapDirectFunctionNode({
    nodeId: "hard_gate_preflight",
    domain: "gating",
    run: async () => ({
      status: blockers.length > 0 ? "blocked" : "ok",
      summary: blockers.length > 0
        ? `Hard gate preflight blocked: ${blockers.join(", ")}`
        : "Hard gate preflight passed",
      blockers,
      warnings,
      detail: {
        checked: ["kill_switch", "workplane_status", "heartbeat_freshness", "authority_router", "pipeline_freshness", "approval_requirements", "boundedness"],
        kill_switch_loaded: killSwitch !== null,
        workplane_status: workplane ?? null,
        heartbeat_present: heartbeat !== null,
      },
      mutation_flags: DEFAULT_OPERATING_MUTATION_FLAGS,
    }),
  });

  return node(state, config);
}
