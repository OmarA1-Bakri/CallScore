/** Canonical action authority tiers — the fundamental permission model for agent capabilities. */
export const ActionAuthority = [
  "read_only_observe",
  "internal_enqueue",
  "draft_artifact",
  "internal_state_mutation",
  "owned_public_publish",
  "gated_external_send",
  "hard_gate",
] as const;

export type ActionAuthorityType = (typeof ActionAuthority)[number];

/**
 * Per-class default authorities — used when no explicit agent override exists.
 * Each agent class maps to the authorities its agents typically need.
 */
const CLASS_DEFAULTS: Record<string, ActionAuthorityType[]> = {
  strategist: ["draft_artifact", "owned_public_publish"],
  channel_head: ["draft_artifact", "owned_public_publish"],
  channel_head_gated_send: ["draft_artifact", "gated_external_send"],
  sentinel: ["read_only_observe", "hard_gate"],
  gatekeeper: ["hard_gate"],
  orchestrator: ["read_only_observe"],
  architect: ["read_only_observe"],
  implementer: ["draft_artifact"],
  reviewer: ["read_only_observe"],
  safety: ["hard_gate"],
  trust: ["hard_gate"],
  transcript_shadow: ["read_only_observe", "internal_enqueue"],
  runtime_worker: ["read_only_observe"],
  pipeline_discovery: ["read_only_observe", "internal_enqueue"],
  pipeline_scraper: ["read_only_observe", "internal_enqueue"],
  pipeline_extractor: ["read_only_observe"],
  pipeline_matcher: ["read_only_observe"],
  pipeline_scorer: ["internal_state_mutation"],
  pipeline_consensus: ["internal_state_mutation"],
  pipeline_verifier: ["read_only_observe"],
  pipeline_refresher: ["read_only_observe", "internal_enqueue"],
  pipeline_admission: ["read_only_observe", "internal_enqueue"],
  pipeline_markov: ["read_only_observe"],
  research_head: ["read_only_observe"],
  advisor: ["read_only_observe"],
  mvp: ["draft_artifact"],
  active_miner: ["read_only_observe", "internal_enqueue"],
  system_miner: ["read_only_observe", "hard_gate"],
  growth_hacker: ["draft_artifact", "owned_public_publish"],
  system_guardian: ["hard_gate"],
  agent_coach: ["read_only_observe"],
  // Marketing specialist classes
  social_posting_agent: ["draft_artifact", "owned_public_publish"],
  social_commenting_agent: ["draft_artifact", "gated_external_send"],
  social_image_agent: ["draft_artifact"],
  social_discovery_agent: ["read_only_observe", "internal_enqueue"],
  social_analytics_agent: ["read_only_observe", "internal_state_mutation"],
  cmo_head: ["read_only_observe", "internal_enqueue", "draft_artifact"],
};

/**
 * Explicit agent-to-authority overrides for agents whose authority
 * doesn't match their class default.
 */
const AGENT_OVERRIDES: Record<string, ActionAuthorityType[]> = {
  "callscore-artofwar-strategist": ["draft_artifact", "owned_public_publish"],
  "callscore-whop-commerce-head": ["draft_artifact", "gated_external_send"],
  "callscore-email-partnership-drafts-head": ["draft_artifact", "gated_external_send"],
  "callscore-youtube-head": ["draft_artifact", "owned_public_publish"],
  "callscore-youtube-script-agent": ["draft_artifact"],
  "callscore-youtube-packaging-agent": ["draft_artifact"],
  "callscore-youtube-thumbnail-agent": ["draft_artifact"],
  "callscore-youtube-publishing-agent": ["draft_artifact", "owned_public_publish"],
  "callscore-youtube-commenting-agent": ["draft_artifact", "gated_external_send"],
  "callscore-youtube-analytics-agent": ["read_only_observe", "internal_state_mutation"],
};

/**
 * Infer agent class from an agent ID.
 * Strips prefixes/suffixes and maps known ID patterns to classes.
 */
export function inferClass(agentId: string): string {
  const stripped = agentId.replace(/^callscore-/, "").replace(/-head$/, "").replace(/-agent$/, "").replace(/-worker$/, "");
  const segments = stripped.split("-");

  // Data pipeline
  if (segments[0] === "data" && segments[1] === "pipeline") return "sentinel";

  // Pipeline sub-classes
  if (segments[0] === "pipeline" && segments[1]) {
    return `pipeline_${segments[1]}`;
  }

  // Specialist role detection — segments like x-posting → social_posting_agent
  const specialistRoles: Record<string, string> = {
    posting: "social_posting_agent",
    commenting: "social_commenting_agent",
    image: "social_image_agent",
    profile: "social_discovery_agent",
    analytics: "social_analytics_agent",
  };
  if (segments.length >= 2 && specialistRoles[segments[1]]) {
    return specialistRoles[segments[1]];
  }

  // Known non-pipeline agents
  const knownClasses: Record<string, string> = {
    artofwar: "strategist",
    x: "channel_head",
    linkedin: "channel_head",
    reddit: "channel_head",
    cmo: "cmo_head",
    community: "channel_head",
    whop: "channel_head_gated_send",
    email: "channel_head_gated_send",
    partnership: "channel_head_gated_send",
    opportunity: "research_head",
    compliance: "gatekeeper",
    scorer: "pipeline_scorer",
    markov: "pipeline_markov",
    discoverer: "pipeline_discovery",
    youtube: "pipeline_discovery",
    "youtube-discovery": "pipeline_discovery",
    "gemma-transcript": "transcript_shadow",
    "channel-agent": "runtime_worker",
    "transcript-scraper": "pipeline_scraper",
    "llm-extractor": "pipeline_extractor",
    "price-matcher": "pipeline_matcher",
    consensus: "pipeline_consensus",
    "ml-verifier": "pipeline_verifier",
    "candle-refresher": "pipeline_refresher",
    "candidate-admission": "pipeline_admission",
  };

  return knownClasses[segments.join("-")] ?? knownClasses[segments[0]] ?? segments[0];
}

/**
 * Get default authorities for a given agent class.
 */
export function authoritiesForClass(className: string): ActionAuthorityType[] {
  return CLASS_DEFAULTS[className] ?? [];
}

/**
 * Look up an agent's action authorities.
 * First checks explicit overrides, then falls back to class-based defaults.
 */
export function authorityForAgent(agentId: string): ActionAuthorityType[] {
  if (AGENT_OVERRIDES[agentId]) return AGENT_OVERRIDES[agentId];
  return authoritiesForClass(inferClass(agentId));
}
