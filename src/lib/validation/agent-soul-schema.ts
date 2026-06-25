/**
 * Agent soul schema — validates the soul definitions from
 * callscore-channel-head-souls.yaml.
 *
 * This ensures every agent in the system has a valid identity,
 * bounded authority, memory policy, and heartbeat contract.
 * Use it to validate souls at load time rather than trusting
 * YAML parsing alone.
 */
import { z } from "zod";
import { NonEmptyStringSchema, ZeroToOneSchema } from "./shared";

// ── Enums ─────────────────────────────────────────────────

export const AgentClassSchema = z.enum([
  "strategist",
  "channel_head",
  "channel_head_gated_send",
  "gatekeeper",
  "sentinel",
  "research_head",
  "orchestrator",
  "architect",
  "implementer",
  "reviewer",
  "safety",
  "trust",
  "transcript_shadow",
  "runtime_worker",
  "pipeline_discovery",
  "pipeline_scraper",
  "pipeline_extractor",
  "pipeline_matcher",
  "pipeline_scorer",
  "pipeline_consensus",
  "pipeline_verifier",
  "pipeline_refresher",
  "pipeline_admission",
  "pipeline_markov",
]);

export const CadenceSchema = z.enum([
  "continuous_poll",
  "per_task_plus_daily",
  "hourly_light_daily_deep",
  "daily_plus_event_driven",
  "every_asset_plus_daily_queue_audit",
  "event_driven",
  "daily_pulse",
  "scheduled",
]);

export const RiskPostureSchema = z.enum([
  "owned_public_allowed_if_Class_A",
  "fail_closed_gatekeeper",
  "fail_closed_control_plane",
  "draft_only_send_fail_closed",
  "draft_first_financial_fail_closed",
  "read_only_research",
  "operational_fail_closed_for_claims",
  "simplify_without_breaking_runtime",
  "test_first_minimum_diff",
  "trust_but_verify",
  "fast_but_not_reckless",
  "evidence_before_claims",
  "shadow_until_promoted",
  "observe_first",
  "discover_but_dont_over_enqueue",
  "scrape_but_validate_first",
  "extract_with_confidence_gate",
  "match_only_with_fresh_candles",
  "score_only_on_sufficient_data",
  "consensus_only_where_convergent",
  "verify_dont_promote",
  "refresh_before_match_always",
  "admit_only_after_eligibility_check",
  "predict_only_after_backtest",
]);

// ── Memory policy ──────────────────────────────────────────

export const MemoryTtlSchema = z.object({
  raw_search_results: z.string().optional(),
  rejected_candidates: z.string().optional(),
  raw_errors: z.string().optional(),
  transcript_previews: z.string().optional(),
  extraction_error_log: z.string().optional(),
  raw_model_outputs: z.string().optional(),
  old_low_score_raw_signals: z.string().optional(),
  raw_metric_snapshots: z.string().optional(),
  raw_recipient_data: z.string().optional(),
  raw_prompt_output: z.string().optional(),
  provider_error_log: z.string().optional(),
  match_error_log: z.string().optional(),
  missing_candle_requests: z.string().optional(),
  score_computation_log: z.string().optional(),
  run_metrics: z.string().optional(),
  per_model_raw_outputs: z.string().optional(),
  divergence_reports: z.string().optional(),
  gap_reports: z.string().optional(),
  provider_health: z.string().optional(),
  raw_transition_matrices: z.string().optional(),
  prediction_backtests: z.string().optional(),
  vram_monitoring: z.string().optional(),
  candidate_evaluations: z.string().optional(),
  raw_exclusion_checks: z.string().optional(),
  creator_discovery: z.string().optional(),
  old_high_volatility_raw_data: z.string().optional(),
}).partial();

export const MemoryPolicySchema = z.object({
  remembers: z.array(NonEmptyStringSchema).default([]),
  ttl: MemoryTtlSchema.optional(),
  never_store: z.array(NonEmptyStringSchema).default([]),
}).strict();

// ── Bounded authority ──────────────────────────────────────

export const BoundedAuthoritySchema = z.object({
  can_do_independently: z.array(NonEmptyStringSchema).default([]),
  gated_actions: z.array(NonEmptyStringSchema).default([]),
  forbidden_actions: z.array(NonEmptyStringSchema).default([]),
}).strict();

// ── Heartbeat ──────────────────────────────────────────────

export const HeartbeatSchema = z.object({
  cadence: CadenceSchema.or(z.string()),
  triggers: z.array(NonEmptyStringSchema).min(1),
  reads: z.array(NonEmptyStringSchema).default([]),
  independent_outputs: z.array(NonEmptyStringSchema).default([]),
  stop_conditions: z.array(NonEmptyStringSchema).default([]),
}).strict();

// ── Soul ───────────────────────────────────────────────────

export const SoulSchema = z.object({
  identity: NonEmptyStringSchema,
  mission: NonEmptyStringSchema,
  taste: z.array(NonEmptyStringSchema).min(1),
  bounded_authority: BoundedAuthoritySchema,
  memory_policy: MemoryPolicySchema,
  risk_posture: RiskPostureSchema.or(z.string()),
}).strict();

// ── Full agent definition ──────────────────────────────────

export const AgentSoulSchema = z.object({
  agent_id: NonEmptyStringSchema,
  class: AgentClassSchema.or(z.string()),
  owner_surface: NonEmptyStringSchema,
  persistent: z.union([z.boolean(), z.enum(["true", "scheduled"])]),
  soul: SoulSchema,
  heartbeat: HeartbeatSchema,
}).strict();

export const ChannelHeadSoulsSchema = z.object({
  schema_version: NonEmptyStringSchema,
  generated_at: z.string().datetime(),
  mode_target: NonEmptyStringSchema,
  shared_constraints: z.object({
    allowed_without_operator_approval: z.array(NonEmptyStringSchema).default([]),
    still_gated: z.array(NonEmptyStringSchema).default([]),
    hard_caps_initial: z.object({
      max_autonomous_posts_per_channel_per_day: z.number().int().positive().default(1),
      max_total_autonomous_public_posts_per_day: z.number().int().positive().default(3),
      max_external_mutations_in_flight: z.number().int().nonnegative().default(1),
      provider_error_cooldown_hours: z.number().int().positive().default(24),
    }).strict(),
    global_stop_conditions: z.array(NonEmptyStringSchema).default([]),
  }).strict(),
  heartbeat_packet_required_fields: z.array(NonEmptyStringSchema).default([]),
  agents: z.array(AgentSoulSchema),
}).strict();

// ── Type exports ───────────────────────────────────────────

export type AgentClass = z.infer<typeof AgentClassSchema>;
export type Soul = z.infer<typeof SoulSchema>;
export type AgentSoul = z.infer<typeof AgentSoulSchema>;
export type ChannelHeadSouls = z.infer<typeof ChannelHeadSoulsSchema>;
export type Heartbeat = z.infer<typeof HeartbeatSchema>;
export type BoundedAuthority = z.infer<typeof BoundedAuthoritySchema>;
export type MemoryPolicy = z.infer<typeof MemoryPolicySchema>;
