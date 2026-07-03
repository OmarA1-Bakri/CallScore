import { readFileSync } from "node:fs";
import yaml from "js-yaml";

export const EXECUTION_MODES = ["read_only_verify", "draft_ready", "live_owned_public", "post_publish_closeout"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const PUBLIC_ARTIFACT_CHANNELS = ["x", "linkedin", "reddit", "youtube", "community", "whop", "email"] as const;
export type PublicArtifactChannel = (typeof PUBLIC_ARTIFACT_CHANNELS)[number];

export const RESTRICTED_TOOLS = [
  "provider-public-mutation",
  "live-publish",
  "external-send",
  "db-destructive-mutation",
  "deploy-infra-mutation",
  "customer-payment-entitlement-mutation",
  "secret-access",
  "unrestricted-shell-mutation",
] as const;

const COMMON_CHANNEL_HEAD_TOOLS = [
  "task-router",
  "workplane-claim",
  "workplane-update",
  "shared-memory-read",
  "shared-memory-write",
  "inter-agent-message-write",
  "receipt-reader",
  "receipt-writer",
  "artifact-reader",
  "artifact-writer",
  "schema-validator",
  "child-job-launcher",
  "child-job-collector",
  "graph-dry-run-invoker",
] as const;

const COMMON_DRAFT_DELEGABLE_TOOLS = [
  "shared-memory-read",
  "shared-memory-write",
  "source-data-reader",
  "artifact-reader",
  "artifact-writer",
  "schema-validator",
  "originality-check",
  "same-shit-check",
  "platform-fit-check",
  "claim-evidence-checker",
  "visual-brief-reader",
  "visual-proof-object-designer",
  "visual-qa",
  "copy-visual-coherence-check",
  "community-rules-research",
  "transcript-evidence-reader",
  "scorecard-evidence-reader",
  "video-package-assembler",
  "recipient-context-reader",
  "taste-review",
  "compliance-linting",
  "hard-safety-gate",
  "mutation-audit",
  "credential-scan",
] as const;

export const STANDARD_TOOL_CLASSES = {
  core_read_orchestration: [
    "task-router",
    "workplane-claim",
    "workplane-update",
    "agent-registry-read",
    "canonical-agent-audit",
    "receipt-reader",
    "trace-reader",
    "schema-validator",
    "artifact-reader",
    "artifact-writer",
    "prompt-loader",
    "memory-reader",
    "memory-writer",
    "learning-event-writer",
    "child-job-launcher",
    "child-job-collector",
    "graph-dry-run-invoker",
  ],
  creative_generation_skills: [
    "campaign-angle-generation",
    "platform-native-copywriting",
    "thread-structure",
    "long-form-thought-leadership",
    "community-native-response",
    "video-scriptwriting",
    "video-packaging",
    "thumbnail-briefing",
    "visual-proof-object-design",
    "email-partnership-writing",
    "Whop-commerce-copywriting",
    "CTA-design",
    "taste-review",
    "originality-review",
  ],
  evidence_data_skills: [
    "source-data-reading",
    "claim-evidence-mapping",
    "scorecard-reading",
    "timestamped-call-analysis",
    "creator-call-edge-case-analysis",
    "evidence-freshness-check",
    "unscoreable-call-analysis",
  ],
  review_safety_skills: [
    "platform-fit-validation",
    "visual-qa",
    "copy-visual-coherence-review",
    "same-shit-memory-check",
    "trust/claim-review",
    "compliance-linting",
    "hard-safety-gate",
    "mutation-audit",
    "credential-scan",
  ],
  restricted_tools: [...RESTRICTED_TOOLS],
} as const;

export interface AgentToolboxContract {
  readonly agent_id: string;
  readonly canonical_51: true;
  readonly cluster: string;
  readonly surface: string;
  readonly role_type:
    | "supervisor"
    | "router"
    | "worker"
    | "visual_worker"
    | "research_worker"
    | "analytics_worker"
    | "reviewer"
    | "trust"
    | "compliance"
    | "safety"
    | "learning"
    | "data_pipeline"
    | "control";
  readonly current_tools_observed: string[];
  readonly current_skills_observed: string[];
  readonly current_delegable_tools_observed: string[];
  readonly required_tools: string[];
  readonly required_skills: string[];
  readonly delegable_tools_to_children: string[];
  readonly non_delegable_tools: string[];
  readonly may_spawn_child_agents: boolean;
  readonly allowed_child_agents: string[];
  readonly forbidden_child_agents: string[];
  readonly task_router_access: "required" | "allowed" | "forbidden" | "missing";
  readonly workplane_claim_access: "required" | "allowed" | "forbidden" | "missing";
  readonly shared_memory_access: "required" | "allowed" | "forbidden" | "missing";
  readonly artifact_filesystem_access: "required" | "allowed" | "forbidden" | "missing";
  readonly schema_validation_access: "required" | "allowed" | "forbidden" | "missing";
  readonly graph_dry_run_access: "required" | "allowed" | "forbidden" | "missing";
  readonly provider_mutation_access: "forbidden" | "live_owned_public_only" | "unknown";
  readonly public_publish_access: "forbidden" | "live_owned_public_only" | "unknown";
  readonly db_write_access: "forbidden" | "local_sqlite_memory_only" | "unknown";
  readonly status: "complete" | "missing_tools" | "overprivileged" | "underprivileged" | "unknown";
  readonly gaps: string[];
  readonly evidence_paths: string[];
}

interface SoulsConfig {
  agents: Array<{ agent_id: string; class?: string; owner_surface?: string; soul?: unknown; heartbeat?: unknown }>;
}

interface MappingConfig {
  agents: Array<{
    agent_id: string;
    cluster?: string;
    channel_or_surface?: string;
    langgraph_pattern?: string;
    current_declared_role?: string;
    target_upgraded_role?: string;
  }>;
}

function loadSouls(): SoulsConfig {
  const raw = readFileSync(new URL("../../docs/ops/callscore-channel-head-souls.yaml", import.meta.url), "utf8");
  return yaml.load(raw) as SoulsConfig;
}

function loadMapping(): MappingConfig {
  const raw = readFileSync(
    new URL("../../docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(raw) as MappingConfig;
}

export function loadCanonicalAgentIdsForToolbox(): string[] {
  return loadSouls().agents.map((agent) => agent.agent_id);
}

const CANONICAL_AGENT_IDS = new Set(loadCanonicalAgentIdsForToolbox());

export function isCanonicalAgentId(agentId: string): boolean {
  return CANONICAL_AGENT_IDS.has(agentId);
}

export const CHANNEL_HEAD_IDS = [
  "callscore-cmo-head",
  "callscore-x-head",
  "callscore-linkedin-head",
  "callscore-reddit-head",
  "callscore-youtube-head",
  "callscore-community-drops-head",
  "callscore-whop-commerce-head",
  "callscore-email-partnership-drafts-head",
] as const;

export function isCanonicalChannelHead(agentId: string): boolean {
  return (CHANNEL_HEAD_IDS as readonly string[]).includes(agentId) && isCanonicalAgentId(agentId);
}

const REVIEW_CHAIN = ["callscore-reviewer-head", "callscore-trust-head", "callscore-compliance-linter-head", "callscore-safety-head"];

const SOCIAL_CHILD_TOOLS = [
  ...COMMON_DRAFT_DELEGABLE_TOOLS,
  "platform-constraint-checker",
  "thread-structure",
  "long-form-thought-leadership",
  "community-native-response",
];

function channelContract(input: {
  agent_id: string;
  cluster: string;
  surface: string;
  required_tools: string[];
  required_skills: string[];
  allowed_child_agents: string[];
  delegable_tools_to_children?: string[];
  role_type?: AgentToolboxContract["role_type"];
}): AgentToolboxContract {
  return {
    agent_id: input.agent_id,
    canonical_51: true,
    cluster: input.cluster,
    surface: input.surface,
    role_type: input.role_type ?? "supervisor",
    current_tools_observed: [],
    current_skills_observed: [],
    current_delegable_tools_observed: [],
    required_tools: input.required_tools,
    required_skills: input.required_skills,
    delegable_tools_to_children: input.delegable_tools_to_children ?? [...COMMON_DRAFT_DELEGABLE_TOOLS],
    non_delegable_tools: [...RESTRICTED_TOOLS, "unrestricted-shell-mutation"],
    may_spawn_child_agents: true,
    allowed_child_agents: input.allowed_child_agents,
    forbidden_child_agents: [],
    task_router_access: "required",
    workplane_claim_access: "required",
    shared_memory_access: "required",
    artifact_filesystem_access: "required",
    schema_validation_access: "required",
    graph_dry_run_access: "required",
    provider_mutation_access: "forbidden",
    public_publish_access: "forbidden",
    db_write_access: "local_sqlite_memory_only",
    status: "complete",
    gaps: [],
    evidence_paths: [
      "docs/ops/callscore-channel-head-souls.yaml",
      "docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json",
    ],
  };
}

export const CHANNEL_HEAD_TOOLBOX_CONTRACTS: Record<string, AgentToolboxContract> = {
  "callscore-cmo-head": channelContract({
    agent_id: "callscore-cmo-head",
    cluster: "Learning / Control / Trust",
    surface: "cross-channel",
    required_tools: [
      ...COMMON_CHANNEL_HEAD_TOOLS,
      "agent-registry-read",
      "learning-event-writer",
      "inter-agent-message-write",
    ],
    required_skills: [
      "campaign allocation",
      "editorial supervision",
      "taste gate",
      "platform differentiation",
      "cross-channel coherence",
      "forbidden-slop detection",
      "proof-object selection",
      "revision routing",
    ],
    delegable_tools_to_children: [...COMMON_DRAFT_DELEGABLE_TOOLS, "learning-event-writer", "trace-reader"],
    allowed_child_agents: [
      "callscore-artofwar-strategist",
      "callscore-opportunity-research-head",
      "callscore-data-pipeline-sentinel",
      "callscore-x-head",
      "callscore-linkedin-head",
      "callscore-reddit-head",
      "callscore-youtube-head",
      "callscore-community-drops-head",
      "callscore-whop-commerce-head",
      "callscore-email-partnership-drafts-head",
      ...REVIEW_CHAIN,
    ],
  }),
  "callscore-x-head": channelContract({
    agent_id: "callscore-x-head",
    cluster: "X Channel",
    surface: "x",
    required_tools: [...COMMON_CHANNEL_HEAD_TOOLS, "platform-constraint-checker"],
    required_skills: ["X-native routing", "X cadence awareness", "X platform-fit review", "X public-post packaging", "engagement/reply routing", "visual proof-object routing"],
    delegable_tools_to_children: SOCIAL_CHILD_TOOLS,
    allowed_child_agents: [
      "callscore-x-posting-agent",
      "callscore-x-commenting-agent",
      "callscore-x-image-agent",
      "callscore-x-profile-discovery-agent",
      "callscore-x-analytics-agent",
      ...REVIEW_CHAIN,
    ],
  }),
  "callscore-linkedin-head": channelContract({
    agent_id: "callscore-linkedin-head",
    cluster: "LinkedIn Channel",
    surface: "linkedin",
    required_tools: [...COMMON_CHANNEL_HEAD_TOOLS, "platform-constraint-checker"],
    required_skills: ["LinkedIn-native thought leadership", "professional/operator framing", "document/carousel routing", "LinkedIn platform-fit review", "anti-expanded-X-copy check"],
    delegable_tools_to_children: SOCIAL_CHILD_TOOLS,
    allowed_child_agents: [
      "callscore-linkedin-posting-agent",
      "callscore-linkedin-commenting-agent",
      "callscore-linkedin-image-agent",
      "callscore-linkedin-profile-discovery-agent",
      "callscore-linkedin-analytics-agent",
      ...REVIEW_CHAIN,
    ],
  }),
  "callscore-reddit-head": channelContract({
    agent_id: "callscore-reddit-head",
    cluster: "Reddit Channel",
    surface: "reddit",
    required_tools: [...COMMON_CHANNEL_HEAD_TOOLS, "community-rules-research"],
    required_skills: ["Reddit-native tone", "community-rule routing", "owned-profile versus subreddit distinction", "anti-promo review", "discussion-first writing"],
    delegable_tools_to_children: SOCIAL_CHILD_TOOLS,
    allowed_child_agents: [
      "callscore-reddit-posting-agent",
      "callscore-reddit-commenting-agent",
      "callscore-reddit-image-agent",
      "callscore-reddit-profile-discovery-agent",
      "callscore-reddit-analytics-agent",
      ...REVIEW_CHAIN,
    ],
  }),
  "callscore-youtube-head": channelContract({
    agent_id: "callscore-youtube-head",
    cluster: "YouTube Production Cluster",
    surface: "youtube",
    required_tools: [
      ...COMMON_CHANNEL_HEAD_TOOLS,
      "transcript-evidence-reader",
      "scorecard-evidence-reader",
      "video-package-assembler",
    ],
    required_skills: ["YouTube production routing", "video narrative structure", "title/thumbnail/package coordination", "retention-beat review", "publishing package assembly", "YouTube analytics feedback loop"],
    delegable_tools_to_children: [...COMMON_DRAFT_DELEGABLE_TOOLS, "transcript-evidence-reader", "scorecard-evidence-reader", "video-package-assembler"],
    allowed_child_agents: [
      "callscore-youtube-script-agent",
      "callscore-youtube-packaging-agent",
      "callscore-youtube-thumbnail-agent",
      "callscore-youtube-publishing-agent",
      "callscore-youtube-commenting-agent",
      "callscore-youtube-analytics-agent",
    ],
  }),
  "callscore-community-drops-head": channelContract({
    agent_id: "callscore-community-drops-head",
    cluster: "Community",
    surface: "community",
    required_tools: [...COMMON_CHANNEL_HEAD_TOOLS],
    required_skills: ["Telegram-native drops", "Discord-native announcements", "discussion prompt creation", "community reputation protection", "low-promo channel writing", "visual brief ownership when needed"],
    allowed_child_agents: [...REVIEW_CHAIN, "callscore-cmo-head", "callscore-markov-trajectory-head"],
  }),
  "callscore-whop-commerce-head": channelContract({
    agent_id: "callscore-whop-commerce-head",
    cluster: "Whop",
    surface: "whop",
    required_tools: [...COMMON_CHANNEL_HEAD_TOOLS, "claim-evidence-checker"],
    required_skills: ["Whop marketplace copy", "benefit-led positioning", "FAQ writing", "listing packaging", "marketplace asset brief", "customer-claim caution", "commerce conversion review"],
    allowed_child_agents: [...REVIEW_CHAIN, "callscore-cmo-head", "callscore-markov-trajectory-head"],
  }),
  "callscore-email-partnership-drafts-head": channelContract({
    agent_id: "callscore-email-partnership-drafts-head",
    cluster: "Email / Partnerships",
    surface: "email",
    required_tools: [...COMMON_CHANNEL_HEAD_TOOLS, "claim-evidence-checker", "recipient-context-reader"],
    required_skills: ["cold partnership email", "follow-up email", "partner asset packet", "subject/preview line writing", "anti-fake-familiarity check", "concise commercial CTA"],
    allowed_child_agents: [...REVIEW_CHAIN, "callscore-cmo-head", "callscore-markov-trajectory-head"],
  }),
};

function roleTypeFor(agentId: string, klass: string | undefined, pattern: string | undefined): AgentToolboxContract["role_type"] {
  if (agentId.endsWith("-image-agent") || agentId === "callscore-youtube-thumbnail-agent") return "visual_worker";
  if (agentId.includes("analytics")) return "analytics_worker";
  if (agentId.includes("research") || agentId.includes("discovery")) return "research_worker";
  if (agentId.includes("reviewer")) return "reviewer";
  if (agentId.includes("trust")) return "trust";
  if (agentId.includes("compliance")) return "compliance";
  if (agentId.includes("safety")) return "safety";
  if (agentId.includes("markov") || agentId.includes("ml-verifier") || pattern?.includes("prediction")) return "learning";
  if (klass?.startsWith("pipeline_") || agentId.includes("transcript") || agentId.includes("scorer") || agentId.includes("price-matcher") || agentId.includes("candle")) return "data_pipeline";
  if (klass?.includes("channel_head") || agentId.endsWith("-head")) return "supervisor";
  return "worker";
}

function defaultContractFor(agent: MappingConfig["agents"][number]): AgentToolboxContract {
  const role_type = roleTypeFor(agent.agent_id, undefined, agent.langgraph_pattern);
  const observedTools = ["agent-registry-read"];
  const required_tools = role_type === "visual_worker"
    ? ["shared-memory-read", "artifact-reader", "artifact-writer", "schema-validator", "visual-proof-object-designer", "visual-qa"]
    : role_type === "reviewer" || role_type === "trust" || role_type === "compliance" || role_type === "safety"
      ? ["artifact-reader", "receipt-reader", "schema-validator", "mutation-audit", "credential-scan"]
      : role_type === "data_pipeline"
        ? ["source-data-reader", "artifact-writer", "schema-validator", "receipt-writer"]
        : ["shared-memory-read", "artifact-reader", "artifact-writer", "schema-validator", "receipt-writer"];
  const required_skills = role_type === "visual_worker"
    ? ["visual-proof-object-design", "visual-qa", "copy-visual-coherence-review"]
    : role_type === "reviewer" || role_type === "trust" || role_type === "compliance" || role_type === "safety"
      ? ["platform-fit-validation", "trust/claim-review", "compliance-linting", "hard-safety-gate"]
      : role_type === "data_pipeline"
        ? ["source-data-reading", "claim-evidence-mapping", "evidence-freshness-check"]
        : ["source-data-reading", "schema-validation"];

  return {
    agent_id: agent.agent_id,
    canonical_51: true,
    cluster: agent.cluster ?? "unknown",
    surface: agent.channel_or_surface ?? "unknown",
    role_type,
    current_tools_observed: observedTools,
    current_skills_observed: [],
    current_delegable_tools_observed: [],
    required_tools,
    required_skills,
    delegable_tools_to_children: [],
    non_delegable_tools: [...RESTRICTED_TOOLS],
    may_spawn_child_agents: false,
    allowed_child_agents: [],
    forbidden_child_agents: [],
    task_router_access: CHANNEL_HEAD_TOOLBOX_CONTRACTS[agent.agent_id] ? "required" : "allowed",
    workplane_claim_access: CHANNEL_HEAD_TOOLBOX_CONTRACTS[agent.agent_id] ? "required" : "allowed",
    shared_memory_access: "required",
    artifact_filesystem_access: "required",
    schema_validation_access: "required",
    graph_dry_run_access: CHANNEL_HEAD_TOOLBOX_CONTRACTS[agent.agent_id] ? "required" : "allowed",
    provider_mutation_access: "forbidden",
    public_publish_access: "forbidden",
    db_write_access: "local_sqlite_memory_only",
    status: "complete",
    gaps: [],
    evidence_paths: ["docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json"],
  };
}

export function getAgentToolboxContract(agentId: string): AgentToolboxContract | null {
  if (!isCanonicalAgentId(agentId)) return null;
  if (CHANNEL_HEAD_TOOLBOX_CONTRACTS[agentId]) return CHANNEL_HEAD_TOOLBOX_CONTRACTS[agentId];
  const agent = loadMapping().agents.find((entry) => entry.agent_id === agentId);
  return agent ? defaultContractFor(agent) : null;
}

export function buildAgentToolboxMatrix(): AgentToolboxContract[] {
  const mapping = loadMapping();
  return mapping.agents.map((agent) => CHANNEL_HEAD_TOOLBOX_CONTRACTS[agent.agent_id] ?? defaultContractFor(agent));
}

export interface AgentTaskEnvelopeInput {
  readonly task_id: string;
  readonly workflow_id: string;
  readonly parent_agent_id: string;
  readonly target_agent_id: string;
  readonly channel: string;
  readonly artifact_type: string;
  readonly objective: string;
  readonly input_refs: string[];
  readonly memory_query: string;
  readonly required_tools: string[];
  readonly required_skills: string[];
  readonly output_schema: string;
  readonly expected_receipts: string[];
  readonly execution_mode: ExecutionMode;
  readonly parent_wait_policy?: "do_not_wait" | "wait_for_publish" | "wait_for_closeout";
}

export interface AgentTaskEnvelope extends AgentTaskEnvelopeInput {
  readonly schema: "callscore.agent_task_envelope.v1";
  readonly granted_tools: string[];
  readonly forbidden_tools: string[];
  readonly parent_wait_policy: "do_not_wait" | "wait_for_publish" | "wait_for_closeout";
  readonly mutation_allowed: false;
}

export function buildTaskEnvelope(input: AgentTaskEnvelopeInput): AgentTaskEnvelope {
  return {
    schema: "callscore.agent_task_envelope.v1",
    ...input,
    granted_tools: [],
    forbidden_tools: [...RESTRICTED_TOOLS],
    parent_wait_policy: input.parent_wait_policy ?? "do_not_wait",
    mutation_allowed: false,
  };
}

export interface TaskRouterReceipt {
  readonly schema: "callscore.task_router_receipt.v1";
  readonly task_id: string;
  readonly parent_agent_id: string;
  readonly target_agent_id: string;
  readonly route_allowed: boolean;
  readonly tool_grant_allowed: boolean;
  readonly blocked_reason: string | null;
  readonly canonical_parent: boolean;
  readonly canonical_child: boolean;
  readonly granted_tools: string[];
  readonly denied_tools: string[];
  readonly created_at_utc: string;
}

export interface DelegationValidationInput {
  readonly parent_agent_id: string;
  readonly child_agent_id: string;
  readonly requested_tools: string[];
  readonly execution_mode: ExecutionMode;
  readonly artifact_type: string;
  readonly task_id?: string;
}

export interface DelegationValidationResult {
  readonly allowed: boolean;
  readonly blocked_reason: string | null;
  readonly denied_tools: string[];
  readonly routing_receipt: TaskRouterReceipt;
}

function restrictedToolsForMode(mode: ExecutionMode): string[] {
  if (mode === "read_only_verify" || mode === "draft_ready") return [...RESTRICTED_TOOLS];
  if (mode === "live_owned_public") return ["db-destructive-mutation", "deploy-infra-mutation", "customer-payment-entitlement-mutation", "secret-access", "unrestricted-shell-mutation"];
  return ["secret-access", "unrestricted-shell-mutation"];
}

export function validateAgentDelegation(input: DelegationValidationInput): DelegationValidationResult {
  const parentCanonical = isCanonicalAgentId(input.parent_agent_id);
  const childCanonical = isCanonicalAgentId(input.child_agent_id);
  const parent = parentCanonical ? getAgentToolboxContract(input.parent_agent_id) : null;
  const restricted = new Set(restrictedToolsForMode(input.execution_mode));
  const deniedByMode = input.requested_tools.filter((tool) => restricted.has(tool));
  const deniedByGrant = parent ? input.requested_tools.filter((tool) => !parent.delegable_tools_to_children.includes(tool)) : [];
  let blocked_reason: string | null = null;

  if (!parentCanonical) blocked_reason = "non_canonical_parent";
  else if (!childCanonical) blocked_reason = "non_canonical_child";
  else if (!parent) blocked_reason = "missing_parent_toolbox_contract";
  else if (!parent.may_spawn_child_agents) blocked_reason = "parent_may_not_spawn_children";
  else if (!parent.allowed_child_agents.includes(input.child_agent_id)) blocked_reason = "child_not_allowed_for_parent";
  else if (deniedByMode.length > 0) blocked_reason = "restricted_tool_in_mode";
  else if (deniedByGrant.length > 0) blocked_reason = "requested_tool_not_delegable_by_parent";
  else if (input.parent_agent_id === "callscore-youtube-head" && input.child_agent_id === "callscore-youtube-head") blocked_reason = "youtube_cluster_collapse_attempt";

  const denied = Array.from(new Set([...deniedByMode, ...deniedByGrant]));
  const allowed = blocked_reason === null;
  const routing_receipt: TaskRouterReceipt = {
    schema: "callscore.task_router_receipt.v1",
    task_id: input.task_id ?? "task-router-validation",
    parent_agent_id: input.parent_agent_id,
    target_agent_id: input.child_agent_id,
    route_allowed: allowed,
    tool_grant_allowed: allowed,
    blocked_reason,
    canonical_parent: parentCanonical,
    canonical_child: childCanonical,
    granted_tools: allowed ? [...input.requested_tools] : input.requested_tools.filter((tool) => !denied.includes(tool)),
    denied_tools: denied,
    created_at_utc: new Date().toISOString(),
  };
  return { allowed, blocked_reason, denied_tools: denied, routing_receipt };
}

export function validateTaskRouterReceipt(receipt: TaskRouterReceipt | null | undefined): { allowed: boolean; blocked_reason: string | null } {
  if (!receipt) return { allowed: false, blocked_reason: "missing_task_router_receipt" };
  if (receipt.schema !== "callscore.task_router_receipt.v1") return { allowed: false, blocked_reason: "invalid_task_router_receipt_schema" };
  if (!receipt.canonical_parent) return { allowed: false, blocked_reason: "non_canonical_parent" };
  if (!receipt.canonical_child) return { allowed: false, blocked_reason: "non_canonical_child" };
  if (!receipt.route_allowed) return { allowed: false, blocked_reason: receipt.blocked_reason ?? "route_blocked" };
  if (!receipt.tool_grant_allowed) return { allowed: false, blocked_reason: "tool_grant_blocked" };
  return { allowed: true, blocked_reason: null };
}

export interface ToolInheritanceReceiptInput {
  readonly parent_agent_id: string;
  readonly child_agent_id: string;
  readonly workflow_id: string;
  readonly task_id: string;
  readonly execution_mode: ExecutionMode;
  readonly parent_tools_available: string[];
  readonly child_tools_requested: string[];
  readonly skills_required: string[];
  readonly task_router_receipt_id: string | null;
}

export interface ToolInheritanceReceipt {
  readonly schema: "callscore.tool_inheritance_receipt.v1";
  readonly parent_agent_id: string;
  readonly child_agent_id: string;
  readonly workflow_id: string;
  readonly task_id: string;
  readonly execution_mode: ExecutionMode;
  readonly parent_tools_available: string[];
  readonly child_tools_requested: string[];
  readonly child_tools_granted: string[];
  readonly child_tools_denied: string[];
  readonly skills_required: string[];
  readonly skills_confirmed: string[];
  readonly task_router_receipt_id: string | null;
  readonly status: "granted" | "blocked";
  readonly created_at_utc: string;
}

export function buildToolInheritanceReceipt(input: ToolInheritanceReceiptInput): ToolInheritanceReceipt {
  const validation = validateAgentDelegation({
    parent_agent_id: input.parent_agent_id,
    child_agent_id: input.child_agent_id,
    requested_tools: input.child_tools_requested,
    execution_mode: input.execution_mode,
    artifact_type: "tool_inheritance",
    task_id: input.task_id,
  });
  return {
    schema: "callscore.tool_inheritance_receipt.v1",
    parent_agent_id: input.parent_agent_id,
    child_agent_id: input.child_agent_id,
    workflow_id: input.workflow_id,
    task_id: input.task_id,
    execution_mode: input.execution_mode,
    parent_tools_available: [...input.parent_tools_available],
    child_tools_requested: [...input.child_tools_requested],
    child_tools_granted: validation.allowed ? [...input.child_tools_requested] : input.child_tools_requested.filter((tool) => !validation.denied_tools.includes(tool)),
    child_tools_denied: validation.allowed ? [] : validation.denied_tools,
    skills_required: [...input.skills_required],
    skills_confirmed: validation.allowed ? [...input.skills_required] : [],
    task_router_receipt_id: input.task_router_receipt_id,
    status: validation.allowed && Boolean(input.task_router_receipt_id) ? "granted" : "blocked",
    created_at_utc: new Date().toISOString(),
  };
}

export function validateToolInheritanceReceipt(receipt: ToolInheritanceReceipt | null | undefined): { allowed: boolean; blocked_reason: string | null } {
  if (!receipt) return { allowed: false, blocked_reason: "missing_tool_inheritance_receipt" };
  if (receipt.schema !== "callscore.tool_inheritance_receipt.v1") return { allowed: false, blocked_reason: "invalid_tool_inheritance_receipt_schema" };
  if (!receipt.task_router_receipt_id) return { allowed: false, blocked_reason: "missing_task_router_receipt_id" };
  if (receipt.status !== "granted") return { allowed: false, blocked_reason: "tool_inheritance_blocked" };
  return { allowed: true, blocked_reason: null };
}

export interface PublicArtifactCandidateInput {
  readonly channel: PublicArtifactChannel;
  readonly artifact_type: string;
  readonly generated_by_agent_id: string;
  readonly generated_by_parent_harness: boolean;
  readonly task_router_receipt_id: string | null;
  readonly tool_inheritance_receipt: ToolInheritanceReceipt | null;
  readonly receipts: string[];
  readonly public_text: string;
}

export interface PublicArtifactValidationResult {
  readonly canonical_public_artifact: boolean;
  readonly publish_candidate_ready: boolean;
  readonly blocked_reasons: string[];
}

const REQUIRED_PUBLIC_RECEIPTS = [
  "editorial_angle_receipt.v1",
  "platform_fit_receipt.v1",
  "visual_brief_receipt.v1",
  "visual_qa_receipt.v1",
  "copy_visual_coherence_receipt.v1",
  "same_shit_memory_receipt.v1",
];

const REQUIRED_YOUTUBE_RECEIPTS = [
  "youtube_script_receipt.v1",
  "youtube_packaging_receipt.v1",
  "youtube_thumbnail_receipt.v1",
  "youtube_publish_package_receipt.v1",
  "youtube_analytics_receipt.v1",
];

export function validatePublicArtifactCandidate(input: PublicArtifactCandidateInput): PublicArtifactValidationResult {
  const blocked: string[] = [];
  if (!isCanonicalAgentId(input.generated_by_agent_id)) blocked.push("non_canonical_generated_by_agent");
  if (!input.task_router_receipt_id) blocked.push("missing_task_router_receipt");
  const inheritance = validateToolInheritanceReceipt(input.tool_inheritance_receipt);
  if (!inheritance.allowed && inheritance.blocked_reason) blocked.push(inheritance.blocked_reason === "missing_tool_inheritance_receipt" ? "missing_tool_inheritance_receipt" : inheritance.blocked_reason);
  if (input.generated_by_parent_harness) blocked.push(input.artifact_type.includes("visual") ? "parent_harness_generated_media" : "parent_harness_generated_artifact");
  if (input.channel === "x") {
    const xFit = validateXPlatformFit({ text: input.public_text, mode: input.artifact_type === "long_form_thread" ? "long_form_thread" : "owned_post" });
    if (!xFit.allowed) blocked.push(xFit.blocked_reason ?? "x_platform_fit_failed");
  }
  if (input.channel === "youtube") {
    const missingYoutube = REQUIRED_YOUTUBE_RECEIPTS.filter((receipt) => !input.receipts.includes(receipt));
    if (missingYoutube.length > 0) blocked.push("youtube_cluster_incomplete");
  }
  const canonical_public_artifact = blocked.length === 0;
  const missingPublicReceipts = REQUIRED_PUBLIC_RECEIPTS.filter((receipt) => !input.receipts.includes(receipt));
  const publish_candidate_ready = canonical_public_artifact && missingPublicReceipts.length === 0;
  return {
    canonical_public_artifact,
    publish_candidate_ready,
    blocked_reasons: publish_candidate_ready ? [] : [...blocked, ...missingPublicReceipts.map((receipt) => `missing_${receipt}`)],
  };
}

export function validateXPlatformFit(input: { text: string; mode: "owned_post" | "long_form_thread" }): { allowed: boolean; blocked_reason: string | null } {
  if (input.mode === "long_form_thread") return { allowed: true, blocked_reason: null };
  if (input.text.length > 280) return { allowed: false, blocked_reason: "x_post_over_280_chars" };
  return { allowed: true, blocked_reason: null };
}

export const TASK_ROUTER_CONTRACT = {
  schema: "callscore.task_router_contract.v1",
  required_api: {
    routeTask: "route task envelope to canonical agent",
    claimWorkplaneTask: "claim channel/workflow task",
    spawnChildAgent: "launch canonical child agent",
    spawnAsyncChildAgent: "launch async child agent where safe",
    collectChildResult: "collect child receipt/output",
    writeInterAgentMessage: "persist handoff to shared SQLite memory",
    validateDelegation: "check parent may delegate to requested child",
    validateToolGrant: "check parent may grant requested tools",
    emitRoutingReceipt: "write canonical routing receipt",
  },
  implementation_status: "implemented_contract_validator",
} as const;

export const MEDIA_TOOL_CLASSES = {
  image_visual_tools: [
    "visual-proof-object-designer",
    "visual-layout-spec-writer",
    "chart-renderer",
    "svg-renderer",
    "html-visual-renderer",
    "png-rasterizer",
    "image-generator",
    "image-editor",
    "thumbnail-compositor",
    "alt-text-generator",
    "media-metadata-prober",
    "visual-qa",
  ],
  video_tools: [
    "video-script-packager",
    "storyboard-renderer",
    "video-preview-compositor",
    "ffmpeg-encoder",
    "caption/subtitle-generator",
    "voiceover-generator",
    "audio-normalizer",
    "video-metadata-prober",
    "youtube-package-validator",
  ],
  forbidden_parent_harness_tools: [
    "final-image-rendering",
    "final-thumbnail-rendering",
    "final-video-preview-rendering",
    "final-visual-proof-object-creation",
    "final-youtube-video-package-synthesis",
  ],
} as const;

export type MediaType = "image" | "thumbnail" | "carousel" | "document" | "video_preview" | "video_package" | "alt_text";

type MediaToolbox = {
  readonly agent_id: string;
  readonly media_surface: "x" | "linkedin" | "reddit" | "youtube" | "community" | "whop" | "email" | "cross_channel";
  readonly allowed_media_tools: string[];
  readonly required_media_skills: string[];
  readonly may_render_files: boolean;
  readonly may_generate_image_prompt: boolean;
  readonly may_generate_final_image: boolean;
  readonly may_generate_final_video: boolean;
  readonly may_call_provider_media_tool: boolean;
  readonly may_use_local_renderer: boolean;
  readonly may_use_ffmpeg: boolean;
  readonly may_use_browser_screenshot: boolean;
  readonly may_use_svg_renderer: boolean;
  readonly may_use_image_model: "only_if_discovered_and_allowed" | false;
  readonly may_use_tts: "only_if_discovered_and_allowed" | false;
  readonly required_receipts: string[];
  readonly forbidden_actions: string[];
};

const COMMON_IMAGE_MEDIA_RECEIPTS = [
  "callscore.media_task_envelope.v1",
  "callscore.media_tool_inheritance_receipt.v1",
  "visual_brief_receipt.v1",
  "visual_qa_receipt.v1",
  "copy_visual_coherence_receipt.v1",
  "callscore.media_artifact_receipt.v1",
];

export const MEDIA_AGENT_TOOLBOX_MATRIX: Record<string, MediaToolbox> = {
  "callscore-x-image-agent": {
    agent_id: "callscore-x-image-agent",
    media_surface: "x",
    allowed_media_tools: ["visual-proof-object-designer", "visual-layout-spec-writer", "chart-renderer", "svg-renderer", "html-visual-renderer", "png-rasterizer", "image-editor", "alt-text-generator", "media-metadata-prober", "visual-qa"],
    required_media_skills: ["visual-proof-object-design", "visual-layout-spec-writing", "chart-rendering", "visual-qa", "copy-visual-coherence-review"],
    may_render_files: true,
    may_generate_image_prompt: true,
    may_generate_final_image: true,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: true,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: true,
    may_use_image_model: "only_if_discovered_and_allowed",
    may_use_tts: false,
    required_receipts: COMMON_IMAGE_MEDIA_RECEIPTS,
    forbidden_actions: ["provider-public-mutation", "live-publish", "parent-harness-rendering"],
  },
  "callscore-linkedin-image-agent": {
    agent_id: "callscore-linkedin-image-agent",
    media_surface: "linkedin",
    allowed_media_tools: ["document/carousel visual spec", "visual-proof-object-designer", "visual-layout-spec-writer", "chart-renderer", "svg-renderer", "html-visual-renderer", "png-rasterizer", "document-preview-renderer", "image-editor", "alt-text-generator", "media-metadata-prober", "visual-qa"],
    required_media_skills: ["document/carousel visual spec", "visual-proof-object-design", "chart-rendering", "visual-qa", "copy-visual-coherence-review"],
    may_render_files: true,
    may_generate_image_prompt: true,
    may_generate_final_image: true,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: true,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: true,
    may_use_image_model: "only_if_discovered_and_allowed",
    may_use_tts: false,
    required_receipts: COMMON_IMAGE_MEDIA_RECEIPTS,
    forbidden_actions: ["provider-public-mutation", "live-publish", "parent-harness-rendering"],
  },
  "callscore-reddit-image-agent": {
    agent_id: "callscore-reddit-image-agent",
    media_surface: "reddit",
    allowed_media_tools: ["visual-proof-object-designer", "visual-layout-spec-writer", "svg-renderer", "html-visual-renderer", "png-rasterizer", "image-editor", "alt-text-generator", "media-metadata-prober", "visual-qa"],
    required_media_skills: ["optional visual proof object", "image renderer", "alt text", "visual QA"],
    may_render_files: true,
    may_generate_image_prompt: true,
    may_generate_final_image: true,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: true,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: true,
    may_use_image_model: "only_if_discovered_and_allowed",
    may_use_tts: false,
    required_receipts: COMMON_IMAGE_MEDIA_RECEIPTS,
    forbidden_actions: ["provider-public-mutation", "live-publish", "parent-harness-rendering"],
  },
  "callscore-community-drops-head": {
    agent_id: "callscore-community-drops-head",
    media_surface: "community",
    allowed_media_tools: ["lightweight visual brief", "html-visual-renderer", "png-rasterizer", "alt-text-generator", "media-metadata-prober"],
    required_media_skills: ["lightweight visual brief", "community reputation protection"],
    may_render_files: true,
    may_generate_image_prompt: true,
    may_generate_final_image: true,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: true,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: true,
    may_use_image_model: "only_if_discovered_and_allowed",
    may_use_tts: false,
    required_receipts: COMMON_IMAGE_MEDIA_RECEIPTS,
    forbidden_actions: ["external-send", "provider-public-mutation", "invent-community-image-agent"],
  },
  "callscore-whop-commerce-head": {
    agent_id: "callscore-whop-commerce-head",
    media_surface: "whop",
    allowed_media_tools: ["marketplace asset brief", "listing card layout", "html-visual-renderer", "png-rasterizer", "media-metadata-prober", "visual-qa"],
    required_media_skills: ["marketplace asset brief", "listing card layout", "visual QA"],
    may_render_files: true,
    may_generate_image_prompt: true,
    may_generate_final_image: true,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: true,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: true,
    may_use_image_model: "only_if_discovered_and_allowed",
    may_use_tts: false,
    required_receipts: COMMON_IMAGE_MEDIA_RECEIPTS,
    forbidden_actions: ["customer-payment-entitlement-mutation", "provider-public-mutation", "invent-whop-asset-agent"],
  },
  "callscore-email-partnership-drafts-head": {
    agent_id: "callscore-email-partnership-drafts-head",
    media_surface: "email",
    allowed_media_tools: ["partner asset packet brief", "one-pager layout spec", "html-visual-renderer", "document-preview-renderer", "png-rasterizer", "media-metadata-prober"],
    required_media_skills: ["partner asset packet", "one-pager layout spec"],
    may_render_files: true,
    may_generate_image_prompt: true,
    may_generate_final_image: true,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: true,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: true,
    may_use_image_model: "only_if_discovered_and_allowed",
    may_use_tts: false,
    required_receipts: COMMON_IMAGE_MEDIA_RECEIPTS,
    forbidden_actions: ["external-send", "provider-public-mutation", "invent-email-asset-agent"],
  },
  "callscore-youtube-script-agent": {
    agent_id: "callscore-youtube-script-agent",
    media_surface: "youtube",
    allowed_media_tools: ["video-script-packager", "storyboard-renderer", "caption/subtitle-generator"],
    required_media_skills: ["video-scriptwriting", "storyboard specification", "caption text plan"],
    may_render_files: false,
    may_generate_image_prompt: false,
    may_generate_final_image: false,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: false,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: false,
    may_use_image_model: false,
    may_use_tts: false,
    required_receipts: ["youtube_script_receipt.v1"],
    forbidden_actions: ["final-mp4-render", "provider-public-mutation"],
  },
  "callscore-youtube-packaging-agent": {
    agent_id: "callscore-youtube-packaging-agent",
    media_surface: "youtube",
    allowed_media_tools: ["youtube-package-validator", "title-thumbnail-coherence-review"],
    required_media_skills: ["video-packaging", "CTR packaging analysis", "title-thumbnail coherence review"],
    may_render_files: false,
    may_generate_image_prompt: false,
    may_generate_final_image: false,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: false,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: false,
    may_use_image_model: false,
    may_use_tts: false,
    required_receipts: ["youtube_packaging_receipt.v1"],
    forbidden_actions: ["final-image-render", "final-video-render", "provider-public-mutation"],
  },
  "callscore-youtube-thumbnail-agent": {
    agent_id: "callscore-youtube-thumbnail-agent",
    media_surface: "youtube",
    allowed_media_tools: ["thumbnail-compositor", "image-generator", "svg-renderer", "html-visual-renderer", "png-rasterizer", "image-editor", "visual-qa", "media-metadata-prober"],
    required_media_skills: ["thumbnail-briefing", "thumbnail concept generation", "visual-qa", "copy-visual-coherence-review"],
    may_render_files: true,
    may_generate_image_prompt: true,
    may_generate_final_image: true,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: true,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: true,
    may_use_image_model: "only_if_discovered_and_allowed",
    may_use_tts: false,
    required_receipts: ["youtube_thumbnail_receipt.v1", ...COMMON_IMAGE_MEDIA_RECEIPTS],
    forbidden_actions: ["live-upload", "provider-public-mutation", "parent-harness-rendering"],
  },
  "callscore-youtube-publishing-agent": {
    agent_id: "callscore-youtube-publishing-agent",
    media_surface: "youtube",
    allowed_media_tools: ["youtube-package-validator", "video-preview-compositor", "ffmpeg-encoder", "video-metadata-prober", "media-metadata-prober"],
    required_media_skills: ["publishing package assembly", "dry-run metadata package", "video metadata probing"],
    may_render_files: true,
    may_generate_image_prompt: false,
    may_generate_final_image: false,
    may_generate_final_video: true,
    may_call_provider_media_tool: false,
    may_use_local_renderer: true,
    may_use_ffmpeg: true,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: false,
    may_use_image_model: false,
    may_use_tts: "only_if_discovered_and_allowed",
    required_receipts: ["youtube_publish_package_receipt.v1", "callscore.media_tool_inheritance_receipt.v1", "callscore.media_artifact_receipt.v1"],
    forbidden_actions: ["live-upload", "provider-public-mutation"],
  },
  "callscore-youtube-commenting-agent": {
    agent_id: "callscore-youtube-commenting-agent",
    media_surface: "youtube",
    allowed_media_tools: [],
    required_media_skills: ["pinned comment", "community post", "reply examples"],
    may_render_files: false,
    may_generate_image_prompt: false,
    may_generate_final_image: false,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: false,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: false,
    may_use_image_model: false,
    may_use_tts: false,
    required_receipts: ["youtube_commenting_receipt.v1"],
    forbidden_actions: ["image-rendering", "video-rendering", "provider-public-mutation"],
  },
  "callscore-youtube-analytics-agent": {
    agent_id: "callscore-youtube-analytics-agent",
    media_surface: "youtube",
    allowed_media_tools: ["video-metadata-prober"],
    required_media_skills: ["CTR/retention learning hooks", "title/thumbnail feedback"],
    may_render_files: false,
    may_generate_image_prompt: false,
    may_generate_final_image: false,
    may_generate_final_video: false,
    may_call_provider_media_tool: false,
    may_use_local_renderer: false,
    may_use_ffmpeg: false,
    may_use_browser_screenshot: false,
    may_use_svg_renderer: false,
    may_use_image_model: false,
    may_use_tts: false,
    required_receipts: ["youtube_analytics_receipt.v1"],
    forbidden_actions: ["image-rendering", "video-rendering", "provider-public-mutation"],
  },
};

export interface MediaTaskEnvelopeInput {
  readonly task_id: string;
  readonly workflow_id: string;
  readonly parent_agent_id: string;
  readonly target_agent_id: string;
  readonly channel: string;
  readonly media_type: MediaType | string;
  readonly objective: string;
  readonly source_artifact_refs: string[];
  readonly source_evidence_refs: string[];
  readonly copy_context_refs: string[];
  readonly visual_brief_ref: string;
  readonly platform_constraints: { readonly dimensions: string; readonly max_file_size: string; readonly format: string };
  readonly required_tools: string[];
  readonly output_schema: "callscore.media_artifact.v1" | string;
  readonly execution_mode: "read_only_verify" | "draft_ready" | "live_owned_public";
}

export interface MediaTaskEnvelope extends MediaTaskEnvelopeInput {
  readonly schema: "callscore.media_task_envelope.v1";
  readonly granted_tools: string[];
  readonly forbidden_tools: string[];
  readonly mutation_allowed: false;
}

export function buildMediaTaskEnvelope(input: MediaTaskEnvelopeInput): MediaTaskEnvelope {
  return {
    schema: "callscore.media_task_envelope.v1",
    ...input,
    granted_tools: [],
    forbidden_tools: [...RESTRICTED_TOOLS, ...MEDIA_TOOL_CLASSES.forbidden_parent_harness_tools],
    mutation_allowed: false,
  };
}

export interface MediaToolInheritanceReceiptInput {
  readonly task_id: string;
  readonly parent_agent_id: string;
  readonly media_agent_id: string;
  readonly workflow_id: string;
  readonly channel: string;
  readonly media_type: string;
  readonly requested_tools: string[];
  readonly tool_versions: Record<string, string>;
  readonly execution_mode: "read_only_verify" | "draft_ready" | "live_owned_public";
}

export interface MediaToolInheritanceReceipt {
  readonly schema: "callscore.media_tool_inheritance_receipt.v1";
  readonly task_id: string;
  readonly parent_agent_id: string;
  readonly media_agent_id: string;
  readonly workflow_id: string;
  readonly channel: string;
  readonly media_type: string;
  readonly requested_tools: string[];
  readonly granted_tools: string[];
  readonly denied_tools: string[];
  readonly tool_versions: Record<string, string>;
  readonly execution_mode: "read_only_verify" | "draft_ready" | "live_owned_public";
  readonly may_write_artifact_files: boolean;
  readonly provider_public_mutation_allowed: false;
  readonly created_at_utc: string;
  readonly status: "granted" | "blocked";
}

export function buildMediaToolInheritanceReceipt(input: MediaToolInheritanceReceiptInput): MediaToolInheritanceReceipt {
  const toolbox = MEDIA_AGENT_TOOLBOX_MATRIX[input.media_agent_id];
  const restricted = new Set(input.execution_mode === "live_owned_public" ? ["secret-access", "db-destructive-mutation", "deploy-infra-mutation"] : RESTRICTED_TOOLS);
  const denied = input.requested_tools.filter((tool) => restricted.has(tool as any) || !toolbox?.allowed_media_tools.includes(tool));
  return {
    schema: "callscore.media_tool_inheritance_receipt.v1",
    task_id: input.task_id,
    parent_agent_id: input.parent_agent_id,
    media_agent_id: input.media_agent_id,
    workflow_id: input.workflow_id,
    channel: input.channel,
    media_type: input.media_type,
    requested_tools: [...input.requested_tools],
    granted_tools: input.requested_tools.filter((tool) => !denied.includes(tool)),
    denied_tools: denied,
    tool_versions: { ...input.tool_versions },
    execution_mode: input.execution_mode,
    may_write_artifact_files: Boolean(toolbox?.may_render_files),
    provider_public_mutation_allowed: false,
    created_at_utc: new Date().toISOString(),
    status: denied.length === 0 && Boolean(toolbox) ? "granted" : "blocked",
  };
}

export interface MediaArtifactReceipt {
  readonly schema: "callscore.media_artifact_receipt.v1";
  readonly artifact_id: string;
  readonly media_artifact_id: string;
  readonly created_by_agent_id: string;
  readonly channel_head_agent_id: string;
  readonly workflow_id: string;
  readonly media_type: string;
  readonly source_copy_artifact_id: string | null;
  readonly source_visual_brief_id: string | null;
  readonly source_evidence_paths: string[];
  readonly media_task_envelope?: MediaTaskEnvelope | null;
  readonly media_tool_inheritance_receipt?: MediaToolInheritanceReceipt | null;
  readonly tool_inheritance_receipt_id: string | null;
  readonly tools_used: string[];
  readonly renderer_used: string;
  readonly input_spec_path: string;
  readonly output_paths: string[];
  readonly mime_type: string;
  readonly dimensions: { readonly width: number; readonly height: number } | null;
  readonly duration_seconds: number | null;
  readonly codec?: string | null;
  readonly file_size_bytes: number;
  readonly sha256: string;
  readonly alt_text: string;
  readonly visual_qa_receipt_id: string | null;
  readonly copy_visual_coherence_receipt_id: string | null;
  readonly visual_proof_object_present?: boolean;
  readonly youtube_cluster_receipts?: string[];
  readonly hardcoded_runtime_media: boolean;
  readonly parent_harness_rendered: boolean;
  readonly status: "ready" | "failed" | "diagnostic_only";
}

export interface MediaValidationResult {
  readonly canonical_media_valid: boolean;
  readonly publish_candidate_ready: boolean;
  readonly failure_reasons: string[];
}

const MEDIA_OWNER_BY_CHANNEL_TYPE: Record<string, string[]> = {
  "x:image": ["callscore-x-image-agent"],
  "x:thumbnail": ["callscore-x-image-agent"],
  "linkedin:image": ["callscore-linkedin-image-agent"],
  "linkedin:carousel": ["callscore-linkedin-image-agent"],
  "linkedin:document": ["callscore-linkedin-image-agent"],
  "reddit:image": ["callscore-reddit-image-agent"],
  "community:image": ["callscore-community-drops-head"],
  "whop:image": ["callscore-whop-commerce-head"],
  "email:image": ["callscore-email-partnership-drafts-head"],
  "email:document": ["callscore-email-partnership-drafts-head"],
  "youtube:thumbnail": ["callscore-youtube-thumbnail-agent"],
  "youtube:video_preview": ["callscore-youtube-publishing-agent"],
  "youtube:video_package": ["callscore-youtube-publishing-agent"],
};

const VALID_RENDERERS = new Set([
  "visual-proof-object-designer",
  "visual-layout-spec-writer",
  "chart-renderer",
  "svg-renderer",
  "html-visual-renderer",
  "png-rasterizer",
  "image-editor",
  "thumbnail-compositor",
  "media-metadata-prober",
  "video-preview-compositor",
  "ffmpeg-encoder",
  "video-metadata-prober",
  "youtube-package-validator",
  "sharp",
  "ffmpeg",
  "ffprobe",
  "puppeteer",
  "playwright",
]);

const REQUIRED_YOUTUBE_MEDIA_CLUSTER_RECEIPTS = [
  "youtube_script_receipt.v1",
  "youtube_packaging_receipt.v1",
  "youtube_thumbnail_receipt.v1",
  "youtube_publish_package_receipt.v1",
  "youtube_commenting_receipt.v1",
  "youtube_analytics_receipt.v1",
];

export function validateCanonicalMediaArtifact(artifact: Partial<MediaArtifactReceipt>): MediaValidationResult {
  const failures: string[] = [];
  const createdBy = artifact.created_by_agent_id ?? "";
  const mediaType = artifact.media_type ?? "";
  const channel = artifact.channel_head_agent_id === "callscore-youtube-head"
    ? "youtube"
    : artifact.channel_head_agent_id === "callscore-x-head"
      ? "x"
      : artifact.channel_head_agent_id === "callscore-linkedin-head"
        ? "linkedin"
        : artifact.channel_head_agent_id === "callscore-reddit-head"
          ? "reddit"
          : artifact.channel_head_agent_id === "callscore-community-drops-head"
            ? "community"
            : artifact.channel_head_agent_id === "callscore-whop-commerce-head"
              ? "whop"
              : artifact.channel_head_agent_id === "callscore-email-partnership-drafts-head"
                ? "email"
                : artifact.media_task_envelope?.channel ?? MEDIA_AGENT_TOOLBOX_MATRIX[createdBy]?.media_surface ?? "unknown";
  const ownerKey = `${channel}:${mediaType}`;
  const allowedOwners = MEDIA_OWNER_BY_CHANNEL_TYPE[ownerKey];

  if (!createdBy || !isCanonicalAgentId(createdBy)) failures.push("created_by_agent_not_canonical_51");
  if (allowedOwners && !allowedOwners.includes(createdBy)) failures.push("wrong_media_owner");
  if (!artifact.media_tool_inheritance_receipt || artifact.media_tool_inheritance_receipt.schema !== "callscore.media_tool_inheritance_receipt.v1") failures.push("missing_media_tool_inheritance_receipt");
  else if (artifact.media_tool_inheritance_receipt.status !== "granted") failures.push("media_tool_inheritance_blocked");
  if (!artifact.media_task_envelope || artifact.media_task_envelope.schema !== "callscore.media_task_envelope.v1") failures.push("missing_media_task_envelope");
  if (!artifact.source_visual_brief_id) failures.push("missing_visual_brief_receipt");
  if (!artifact.visual_qa_receipt_id) failures.push("missing_visual_qa_receipt");
  if (artifact.source_copy_artifact_id && !artifact.copy_visual_coherence_receipt_id) failures.push("missing_copy_visual_coherence_receipt");
  if (!artifact.output_paths || artifact.output_paths.length === 0) failures.push("missing_output_file_path");
  if (!artifact.sha256 || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) failures.push("missing_sha256");
  if (!artifact.mime_type) failures.push("missing_mime_type");
  if (!artifact.file_size_bytes || artifact.file_size_bytes <= 0) failures.push("missing_file_size_bytes");
  if (!artifact.dimensions || artifact.dimensions.width <= 0 || artifact.dimensions.height <= 0) failures.push("missing_dimensions");
  if (mediaType === "video_preview" || mediaType === "video_package") {
    if (!artifact.duration_seconds || artifact.duration_seconds <= 0) failures.push("missing_video_duration");
    if (!artifact.codec) failures.push("missing_video_codec");
  }
  if (!artifact.renderer_used || !VALID_RENDERERS.has(artifact.renderer_used)) failures.push("invalid_renderer");
  if (artifact.parent_harness_rendered) failures.push("parent_harness_rendered");
  if (artifact.hardcoded_runtime_media) failures.push("hardcoded_runtime_media");
  if (artifact.status !== "ready") failures.push("media_status_not_ready");
  if (artifact.visual_proof_object_present === false && ["image", "thumbnail", "carousel", "document"].includes(mediaType)) failures.push("missing_visual_proof_object");
  if ((artifact.tools_used ?? []).some((tool) => tool === "provider-public-mutation" || tool === "live-publish")) failures.push("provider_public_mutation_forbidden");
  if (channel === "youtube" && (mediaType === "video_package" || mediaType === "video_preview" || mediaType === "thumbnail")) {
    const have = new Set(artifact.youtube_cluster_receipts ?? []);
    const missing = REQUIRED_YOUTUBE_MEDIA_CLUSTER_RECEIPTS.filter((receipt) => !have.has(receipt));
    if (missing.length > 0) failures.push("youtube_cluster_media_receipts_incomplete");
  }
  return {
    canonical_media_valid: failures.length === 0,
    publish_candidate_ready: failures.length === 0,
    failure_reasons: failures,
  };
}
