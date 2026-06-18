export const LOOP_ENGINEERING_FAILURE_TAXONOMY = [
  "missing_fixture",
  "malformed_artifact",
  "json_valid_rate_below_threshold",
  "schema_pass_rate_below_threshold",
  "parser_errors_present",
  "unreviewed_high_confidence_diff",
  "no_accepted_calls",
  "metric_regression",
  "approval_missing",
  "unsafe_mutation_requested",
  "no_progress",
] as const;

export type LoopEngineeringFailureClass = (typeof LOOP_ENGINEERING_FAILURE_TAXONOMY)[number];

export interface MlIdleImproveReportLike {
  readonly record_type?: string;
  readonly run_id?: string;
  readonly inputs?: Record<string, unknown>;
  readonly metrics?: Record<string, unknown>;
  readonly promotion_gate?: Record<string, unknown>;
  readonly suggestions?: readonly string[];
  readonly next_fixture_targets?: readonly string[];
  readonly production_default_changed?: boolean;
}

export interface ExtractionLoopReceiptInput {
  readonly runId: string;
  readonly generatedAt?: string;
  readonly loopId?: string;
  readonly objective?: string;
  readonly iteration?: number;
  readonly sourceData: readonly string[];
  readonly mlIdleReport: MlIdleImproveReportLike;
  readonly artifacts?: Record<string, unknown>;
}

export interface LoopEngineeringReceipt {
  readonly artifact_type: "LoopReceipt";
  readonly schema_version: "callscore_loop_engineering.v1";
  readonly loop_id: string;
  readonly track: "transcript_extraction";
  readonly target_surface: "extractor";
  readonly objective: string;
  readonly iteration: number;
  readonly mode: "dry_run";
  readonly local_write_only: true;
  readonly source_data: readonly string[];
  readonly contract: Record<string, unknown>;
  readonly metrics_before: null;
  readonly metrics_after: Record<string, unknown>;
  readonly metric_summary: Record<string, unknown>;
  readonly evaluator: Record<string, unknown>;
  readonly promotion_gate: Record<string, unknown>;
  readonly failure_class: LoopEngineeringFailureClass;
  readonly decision: "revise_or_hold" | "needs_approval";
  readonly suggestions: readonly string[];
  readonly next_fixture_targets: readonly string[];
  readonly artifacts: Record<string, unknown>;
  readonly public_action_performed: false;
  readonly external_mutation_performed: false;
  readonly provider_mutation_performed: false;
  readonly whop_mutation_performed: false;
  readonly production_mutation_performed: false;
  readonly production_default_changed: false;
  readonly production_db_writes_allowed: false;
  readonly production_call_writes_allowed: false;
  readonly public_ranking_impact_allowed: false;
  readonly next_safe_action: string;
  readonly created_at: string;
}

function numberMetric(metrics: Record<string, unknown>, key: string): number {
  const value = Number(metrics[key]);
  return Number.isFinite(value) ? value : 0;
}

export function classifyExtractionLoopFailure(report: MlIdleImproveReportLike): LoopEngineeringFailureClass {
  const metrics = report.metrics ?? {};
  const gate = report.promotion_gate ?? {};
  const reasons = Array.isArray(gate.reasons) ? gate.reasons.map(String) : [];

  if (report.production_default_changed === true) return "unsafe_mutation_requested";
  if (reasons.includes("parser_errors_present") || numberMetric(metrics, "parser_error_count") > 0) return "parser_errors_present";
  if (reasons.includes("json_valid_rate_below_95") || numberMetric(metrics, "json_valid_rate") < 0.95) return "json_valid_rate_below_threshold";
  if (reasons.includes("schema_pass_rate_below_95") || numberMetric(metrics, "schema_pass_rate") < 0.95) return "schema_pass_rate_below_threshold";
  if (reasons.includes("unreviewed_high_confidence_shadow_diffs")) return "unreviewed_high_confidence_diff";
  if (numberMetric(metrics, "shadow_records") > 0 && numberMetric(metrics, "accepted_calls") === 0) return "no_accepted_calls";
  if (reasons.includes("manual_or_eval_approval_not_recorded")) return "approval_missing";
  return "no_progress";
}

export function buildExtractionLoopReceipt(input: ExtractionLoopReceiptInput): LoopEngineeringReceipt {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const metrics = input.mlIdleReport.metrics ?? {};
  const promotionGate = input.mlIdleReport.promotion_gate ?? {};
  const failureClass = classifyExtractionLoopFailure(input.mlIdleReport);
  const decision = failureClass === "approval_missing" ? "needs_approval" : "revise_or_hold";

  return {
    artifact_type: "LoopReceipt",
    schema_version: "callscore_loop_engineering.v1",

    loop_id: input.loopId ?? "callscore_extraction_precision_loop",
    track: "transcript_extraction",
    target_surface: "extractor",
    objective: input.objective ?? "Improve CallScore extraction precision while keeping promotion gated.",
    iteration: input.iteration ?? 1,
    mode: "dry_run",
    local_write_only: true,
    source_data: input.sourceData,
    contract: {
      artifact_type: "LoopContract",
      allowed_mutations: ["local .tmp artifact writes only"],
      forbidden_mutations: [
        "external visible operation",
        "commerce state write",
        "durable data write",
        "extractor default switch",
        "ranking impact",
        "credential-state change",
        "billable operation",
      ],
      allowed_outputs: ["ML idle improvement report", "LoopReceipt", "promotion review recommendation"],
      denied_outputs: ["promotion", "external operation", "provider write"],
      metric: {
        primary: "promotion_gate.eligible_for_write_canary",
        precision_bias: "false positives and unsupported quote errors are trust failures",
        direction: "higher",
      },
      verifier_stack: [
        "fixture/eval artifact parse",
        "JSON validity gate",
        "schema compliance gate",
        "parser error gate",
        "promotion approval gate",
        "safety invariant gate",
      ],
      approval_policy: {
        private_iteration_allowed: true,
        production_promotion_allowed_without_approval: false,
        required_before_promotion: ["clean metrics", "reviewed diff", "explicit operator approval", "promotion receipt"],
      },
      stop_conditions: ["same_failure_class_repeats_3_times", "unsafe_mutation_requested", "approval_missing_for_promotion"],
    },
    metrics_before: null,
    metrics_after: metrics,
    metric_summary: {
      json_valid_rate: numberMetric(metrics, "json_valid_rate"),
      schema_pass_rate: numberMetric(metrics, "schema_pass_rate"),
      parser_error_count: numberMetric(metrics, "parser_error_count"),
      accepted_calls: numberMetric(metrics, "accepted_calls"),
      eligible_for_write_canary: promotionGate.eligible_for_write_canary === true,
    },
    evaluator: {
      reused_primitives: ["buildMlIdleImproveReport", "ml_idle_improvement_report", "existing eval artifacts"],
      duplicated_eval_harness: false,
      production_default_changed: false,
    },
    promotion_gate: promotionGate,
    failure_class: failureClass,
    decision,
    suggestions: input.mlIdleReport.suggestions ?? [],
    next_fixture_targets: input.mlIdleReport.next_fixture_targets ?? [],
    artifacts: input.artifacts ?? {},
    public_action_performed: false,
    external_mutation_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    production_default_changed: false,
    production_db_writes_allowed: false,
    production_call_writes_allowed: false,
    public_ranking_impact_allowed: false,
    next_safe_action: decision === "needs_approval"
      ? "Create extraction_promotion_review with exact approval evidence before any write canary or extractor default change."
      : "Add or revise dry-run fixtures/prompt controls, rerun loop_engineering_eval, and keep promotion blocked.",
    created_at: generatedAt,
  };
}
