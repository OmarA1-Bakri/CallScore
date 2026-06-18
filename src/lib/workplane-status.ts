import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { workplaneSpecsForStatus } from "./workplane-jobs";

export interface CollectorCooldownState {
  readonly state_path: string | null;
  readonly status: "active" | "clear" | "unknown" | "malformed";
  readonly cooldown_until_utc: string | null;
  readonly cooldown_reason: string | null;
  readonly latest_failure_reason: string | null;
  readonly latest_job_id: string | null;
  readonly last_run_utc: string | null;
  readonly last_attempted_count: number | null;
  readonly last_success_count: number | null;
  readonly last_failure_count: number | null;
  readonly last_success_rate: number | null;
  readonly recent_failure_reasons: Record<string, number>;
  readonly checked_at: string;
}

export interface ArtifactSummary {
  readonly path: string | null;
  readonly exists: boolean;
  readonly modified_at: string | null;
  readonly malformed: boolean;
  readonly summary: Record<string, unknown>;
}

export interface WorkplaneDecisionInput {
  readonly unsafeSourceRanks: number;
  readonly apiUnsafeOfficialCount: number;
  readonly collectorCooldown: CollectorCooldownState;
  readonly latestGemmaShadow: ArtifactSummary;
  readonly latestMlEval: ArtifactSummary;
  readonly transcriptBacklogRecent30d: number;
  readonly collectorLastAttemptedCount: number | null;
  readonly collectorLastSuccessCount: number | null;
  readonly latestTranscriptCadencePassed?: boolean;
  readonly latestTranscriptCadenceResult?: string | null;
}

export interface WorkplaneDecision {
  readonly action: string;
  readonly reason: string;
  readonly job_type: string | null;
  readonly allowed: boolean;
}

function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readJsonObject(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyCollectorState(path: string | null, status: CollectorCooldownState["status"], checkedAt: string): CollectorCooldownState {
  return {
    state_path: path,
    status,
    cooldown_until_utc: null,
    cooldown_reason: null,
    latest_failure_reason: null,
    latest_job_id: null,
    last_run_utc: null,
    last_attempted_count: null,
    last_success_count: null,
    last_failure_count: null,
    last_success_rate: null,
    recent_failure_reasons: {},
    checked_at: checkedAt,
  };
}

export function readCollectorCooldownState(path: string | null, now = new Date()): CollectorCooldownState {
  const checkedAt = now.toISOString();
  if (!path) {
    return emptyCollectorState(null, "unknown", checkedAt);
  }
  if (!existsSync(path)) {
    return emptyCollectorState(path, "unknown", checkedAt);
  }
  try {
    const json = readJsonObject(path);
    const until = typeof json.cooldown_until_utc === "string" ? json.cooldown_until_utc : null;
    const untilMs = parseDate(until);
    const failures = json.video_failures && typeof json.video_failures === "object" && !Array.isArray(json.video_failures)
      ? Object.values(json.video_failures as Record<string, Record<string, unknown>>)
      : [];
    const latestFailure = failures
      .filter((item) => item && typeof item === "object")
      .sort((a, b) => (parseDate(b.failed_at_utc) ?? 0) - (parseDate(a.failed_at_utc) ?? 0))[0];
    const recentReasons = failures.reduce<Record<string, number>>((acc, item) => {
      const reason = typeof item?.reason === "string" && item.reason.trim() ? item.reason : "unknown";
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {});
    const attempted = numberOrNull(json.last_attempted_count);
    const successes = numberOrNull(json.last_success_count);
    const failuresCount = numberOrNull(json.last_failure_count);
    return {
      state_path: path,
      status: untilMs && untilMs > now.getTime() ? "active" : "clear",
      cooldown_until_utc: until,
      cooldown_reason: typeof json.cooldown_reason === "string" ? json.cooldown_reason : null,
      latest_failure_reason: typeof latestFailure?.reason === "string" ? latestFailure.reason : null,
      latest_job_id: typeof json.last_job_id === "string" ? json.last_job_id : null,
      last_run_utc: typeof json.last_run_utc === "string" ? json.last_run_utc : null,
      last_attempted_count: attempted,
      last_success_count: successes,
      last_failure_count: failuresCount,
      last_success_rate: attempted && attempted > 0 && successes !== null ? successes / attempted : null,
      recent_failure_reasons: recentReasons,
      checked_at: checkedAt,
    };
  } catch {
    return emptyCollectorState(path, "malformed", checkedAt);
  }
}

function latestFile(root: string | readonly string[], predicate: (name: string) => boolean): string | null {
  const roots = Array.isArray(root) ? root : [root];
  const files = roots.flatMap((item) => {
    if (!existsSync(item)) return [];
    return readdirSync(item)
      .filter(predicate)
      .map((name) => join(item, name))
      .filter((path) => {
        try { return statSync(path).isFile(); } catch { return false; }
      });
  });
  if (files.length === 0) return null;
  return files.sort((a, b) => {
    const mtimeDelta = statSync(b).mtimeMs - statSync(a).mtimeMs;
    return mtimeDelta || b.localeCompare(a);
  })[0] ?? null;
}

export function latestGemmaShadowArtifact(root: string | readonly string[] = ["/tmp/callscore-shadow-extractions", ".tmp/shadow-extraction"]): ArtifactSummary {
  const path = latestFile(root, (name) => name.endsWith(".jsonl") && (name.includes("gemma") || name.includes("shadow")) && !name.includes(".diff"));
  if (!path) return { path: null, exists: false, modified_at: null, malformed: false, summary: {} };
  try {
    const lines = readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rows = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const errors: Record<string, number> = {};
    let accepted = 0;
    for (const row of rows) {
      accepted += Number(row.accepted_count ?? 0);
      const error = typeof row.error === "string" ? row.error : "none";
      const key = error.includes("timed out") ? "timeout" : error.includes("JSON array") ? "invalid_json" : error;
      errors[key] = (errors[key] ?? 0) + 1;
    }
    return {
      path,
      exists: true,
      modified_at: statSync(path).mtime.toISOString(),
      malformed: false,
      summary: { rows: rows.length, accepted_calls: accepted, errors },
    };
  } catch (error) {
    return { path, exists: true, modified_at: statSync(path).mtime.toISOString(), malformed: true, summary: { error: error instanceof Error ? error.message : String(error) } };
  }
}

export function latestMlEvalArtifact(root: string | readonly string[] = ["/tmp/callscore-shadow-extractions", ".tmp/ml-idle-improve"]): ArtifactSummary {
  const path = latestFile(root, (name) => name.endsWith(".ml-idle-report.json") || /^ml-idle.*\.json$/.test(name));
  if (!path) return { path: null, exists: false, modified_at: null, malformed: false, summary: {} };
  try {
    const json = readJsonObject(path);
    return {
      path,
      exists: true,
      modified_at: statSync(path).mtime.toISOString(),
      malformed: false,
      summary: {
        run_id: json.run_id ?? null,
        metrics: json.metrics ?? {},
        promotion_gate: json.promotion_gate ?? {},
        production_default_changed: json.production_default_changed ?? null,
      },
    };
  } catch (error) {
    return { path, exists: true, modified_at: statSync(path).mtime.toISOString(), malformed: true, summary: { error: error instanceof Error ? error.message : String(error) } };
  }
}


export function latestWorkflowReceipt(workflow: string, repoRoot = process.cwd()): ArtifactSummary {
  const dir = join(repoRoot, ".tmp", "workflow-receipts", workflow);
  const path = latestFile(dir, (name) => name.endsWith(".json"));
  if (!path) return { path: null, exists: false, modified_at: null, malformed: false, summary: {} };
  try {
    const json = readJsonObject(path);
    return {
      path,
      exists: true,
      modified_at: statSync(path).mtime.toISOString(),
      malformed: false,
      summary: {
        run_id: json.run_id ?? null,
        result: json.result ?? null,
        workflow_name: json.workflow_name ?? null,
        blockers: Array.isArray(json.blockers) ? json.blockers : [],
        artifact_path: json.artifact_path ?? json.artifact ?? null,
      },
    };
  } catch (error) {
    return { path, exists: true, modified_at: statSync(path).mtime.toISOString(), malformed: true, summary: { error: error instanceof Error ? error.message : String(error) } };
  }
}

export function latestArtOfWarCampaignReceipt(root: string | readonly string[] = ["/tmp", ".tmp/workplane-jobs"]): ArtifactSummary {
  const path = latestFile(root, (name) => name.endsWith(".json") && name.includes("callscore-art-of-war") && (name.includes("campaign") || name.includes("receipts-proof")));
  if (!path) return { path: null, exists: false, modified_at: null, malformed: false, summary: {} };
  try {
    const json = readJsonObject(path);
    const verifier = json.verifier_result && typeof json.verifier_result === "object"
      ? json.verifier_result as Record<string, unknown>
      : {};
    const persona = json.persona_scorecard && typeof json.persona_scorecard === "object"
      ? json.persona_scorecard as Record<string, unknown>
      : {};
    const gemma = json.gemma_evaluation && typeof json.gemma_evaluation === "object"
      ? json.gemma_evaluation as Record<string, unknown>
      : {};
    return {
      path,
      exists: true,
      modified_at: statSync(path).mtime.toISOString(),
      malformed: false,
      summary: {
        campaign_id: json.campaign_id ?? null,
        iteration: json.iteration ?? null,
        decision: json.decision ?? null,
        failure_class: json.failure_class ?? null,
        next_safe_action: json.next_safe_action ?? null,
        approval_required: json.approval_required ?? null,
        public_action_performed: json.public_action_performed ?? null,
        external_mutation_performed: json.external_mutation_performed ?? null,
        whop_mutation_performed: json.whop_mutation_performed ?? null,
        production_mutation_performed: json.production_mutation_performed ?? null,
        verifier_passed: verifier.passed ?? null,
        persona_passed: persona.passed ?? null,
        gemma_passed: gemma.passed ?? null,
      },
    };
  } catch (error) {
    return { path, exists: true, modified_at: statSync(path).mtime.toISOString(), malformed: true, summary: { error: error instanceof Error ? error.message : String(error) } };
  }
}

export function latestLoopEngineeringReceipt(root: string | readonly string[] = [".tmp/loop-engineering"]): ArtifactSummary {
  const path = latestFile(root, (name) => name.endsWith(".json"));
  if (!path) return { path: null, exists: false, modified_at: null, malformed: false, summary: {} };
  try {
    const json = readJsonObject(path);
    return {
      path,
      exists: true,
      modified_at: statSync(path).mtime.toISOString(),
      malformed: false,
      summary: {
        loop_id: json.loop_id ?? null,
        track: json.track ?? null,
        target_surface: json.target_surface ?? null,
        decision: json.decision ?? null,
        failure_class: json.failure_class ?? null,
        next_safe_action: json.next_safe_action ?? null,
        public_action_performed: json.public_action_performed ?? null,
        external_mutation_performed: json.external_mutation_performed ?? null,
        provider_mutation_performed: json.provider_mutation_performed ?? null,
        whop_mutation_performed: json.whop_mutation_performed ?? null,
        production_mutation_performed: json.production_mutation_performed ?? null,
        production_default_changed: json.production_default_changed ?? null,
      },
    };
  } catch (error) {
    return { path, exists: true, modified_at: statSync(path).mtime.toISOString(), malformed: true, summary: { error: error instanceof Error ? error.message : String(error) } };
  }
}

export function decideNextAutonomousAction(input: WorkplaneDecisionInput): WorkplaneDecision {
  if (input.unsafeSourceRanks > 0 || input.apiUnsafeOfficialCount > 0) {
    return { action: "hold_investigate_public_safety", reason: "unsafe source/ranking state detected", job_type: null, allowed: false };
  }
  if (input.collectorCooldown.status === "active") {
    return { action: "wait_for_collector_cooldown", reason: `collector cooldown active until ${input.collectorCooldown.cooldown_until_utc}`, job_type: "transcript_collect_laptop", allowed: false };
  }
  if (input.collectorCooldown.status === "malformed") {
    return { action: "repair_or_replace_collector_state", reason: "collector cooldown state is malformed", job_type: "transcript_collect_laptop", allowed: false };
  }
  if (input.latestTranscriptCadenceResult?.includes("rate_limited")) {
    return {
      action: "wait_for_laptop_collector_rate_limit_cooldown",
      reason: "latest bounded laptop transcript receipt stopped on provider rate-limit; avoid blind retry and resume with smaller bounded batch after cooldown",
      job_type: "transcript_collect_laptop",
      allowed: false,
    };
  }
  if (!input.latestTranscriptCadencePassed && (input.collectorLastAttemptedCount ?? 0) >= 5 && (input.collectorLastSuccessCount ?? 0) === 0) {
    return {
      action: "repair_transcript_targeting_or_failure_classification",
      reason: "latest bounded laptop batch had zero transcript successes; avoid blind retry and inspect targeting/failure detail",
      job_type: "transcript_collect_laptop",
      allowed: true,
    };
  }
  const mlGate = (input.latestMlEval.summary.promotion_gate ?? {}) as Record<string, unknown>;
  if (input.latestMlEval.exists && mlGate.eligible_for_write_canary !== true) {
    return {
      action: "start_artofwar_internal_growth_intelligence",
      reason: "latest ML eval keeps Gemma in HOLD; data surface is safe, so internal-only growth intelligence can proceed",
      job_type: "artofwar_strategy_brief",
      allowed: true,
    };
  }
  if (!input.latestGemmaShadow.exists) {
    return { action: "run_gemma_shadow_extract_limit_10", reason: "no Gemma shadow artifact found", job_type: "gemma_shadow_extract", allowed: true };
  }
  if (input.transcriptBacklogRecent30d > 0) {
    return { action: "run_laptop_collector_limit_5_if_laptop_cooldown_clear", reason: "recent transcript backlog remains and no active HH-visible cooldown", job_type: "transcript_collect_laptop", allowed: true };
  }
  return { action: "hold_monitor", reason: "no urgent safe autonomous action detected", job_type: null, allowed: true };
}

export function workplaneJobModelForStatus(): readonly Record<string, unknown>[] {
  return workplaneSpecsForStatus().map((spec) => ({
    type: spec.type,
    execution_location: spec.execution_location,
    max_batch_size: spec.max_batch_size,
    concurrency: spec.concurrency,
    timeout_seconds: spec.timeout_seconds,
    retry_policy: spec.retry_policy,
    cooldown_policy: spec.cooldown_policy,
    output_artifact: spec.output_artifact,
    success_criteria: spec.success_criteria,
    failure_classification: spec.failure_classification,
    default_safe_command: spec.default_safe_command,
    production_db_writes_allowed: spec.production_db_writes_allowed,
    production_call_writes_allowed: spec.production_call_writes_allowed,
    public_ranking_impact_allowed: spec.public_ranking_impact_allowed,
  }));
}

export type ReadinessStatus = "READY" | "MONITORED" | "PARTIAL" | "BLOCKED" | "NOT_CONNECTED" | "NEEDS_APPROVAL";

export interface WorkplaneDomainStatus {
  readonly status: ReadinessStatus;
  readonly last_checked_at: string;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
  readonly safe_next_action: string | null;
  readonly risky_actions_blocked: readonly string[];
  readonly required_approvals: readonly string[];
  readonly relevant_commands: readonly string[];
  readonly relevant_jobs: readonly string[];
  readonly dry_run_available: boolean;
  readonly canary_available: boolean;
  readonly production_mutation_allowed: boolean;
}

export interface RootHygieneItem {
  readonly path: string;
  readonly grade: "KEEP" | "KEEP_BUT_CONSOLIDATE" | "REVIEW_LATER" | "DEPRECATE" | "REMOVE_CANDIDATE" | "REMOVE_NOW";
  readonly rationale: string;
}

export function defaultCollectorStatePath(repoRoot = process.cwd()): string {
  return join(repoRoot, ".tmp/laptop-collector/latest-state.json");
}

export function rootHygieneAudit(repoRoot = process.cwd()): { readonly status: ReadinessStatus; readonly items: readonly RootHygieneItem[]; readonly summary: Record<string, number> } {
  const candidates: RootHygieneItem[] = [
    { path: "Dockerfile.hermes.backup.20260608T035330Z", grade: "REVIEW_LATER", rationale: "untracked runtime backup; do not delete without operator approval" },
    { path: "docker-compose.yml.backup.20260608T040349Z", grade: "REVIEW_LATER", rationale: "untracked runtime backup; do not delete without operator approval" },
    { path: "docker-compose.yml.backup.20260608T041836Z", grade: "REVIEW_LATER", rationale: "untracked runtime backup; do not delete without operator approval" },
    { path: "src/lib/db.ts.backup.20260608T035154Z", grade: "REVIEW_LATER", rationale: "untracked runtime backup; do not delete without operator approval" },
    { path: ".new-FE-design/", grade: "KEEP_BUT_CONSOLIDATE", rationale: "tracked design reference artifact; useful but overlaps active app/docs" },
    { path: "callscore-g10-approval-packet/", grade: "KEEP_BUT_CONSOLIDATE", rationale: "tracked historical approval packet; preserve but consider archive/consolidation" },
    { path: ".tmp/", grade: "KEEP", rationale: "ignored runtime/eval artifact location used by workplane jobs" },
    { path: ".next/", grade: "KEEP", rationale: "ignored Next.js build output; not source" },
    { path: ".netlify/", grade: "KEEP", rationale: "ignored Netlify local state; not source" },
    { path: "node_modules/", grade: "KEEP", rationale: "dependency install directory; not source" },
    { path: "docs/plans/", grade: "KEEP", rationale: "canonical plan history and active execution record" },
    { path: "scripts/windows/run-transcript-collector.ps1", grade: "KEEP", rationale: "canonical laptop transcript runner" },
    { path: "src/lib/workplane-jobs.ts", grade: "KEEP", rationale: "canonical workplane job registry" },
    { path: "src/lib/workplane-status.ts", grade: "KEEP", rationale: "canonical machine-readable readiness/status model" },
  ];
  const items = candidates.filter((item) => existsSync(join(repoRoot, item.path.replace(/\/$/, ""))));
  const summary = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.grade] = (acc[item.grade] ?? 0) + 1;
    return acc;
  }, {});
  return { status: "READY", items, summary };
}

function existsEvidence(path: string, label: string): string | null {
  return existsSync(path) ? `${label}: ${path}` : null;
}

function domain(input: Omit<WorkplaneDomainStatus, "last_checked_at" | "production_mutation_allowed"> & { readonly production_mutation_allowed?: boolean }, now: string): WorkplaneDomainStatus {
  return {
    last_checked_at: now,
    production_mutation_allowed: input.production_mutation_allowed ?? false,
    ...input,
  };
}

export function externalReadinessSnapshot(repoRoot = process.cwd(), now = new Date().toISOString()): Record<string, WorkplaneDomainStatus> {
  const whopPath = "/srv/whop-auto";
  const automationPath = "/srv/agents/repos/Claude_Code_Automations";
  const artOfWarPath = join(automationPath, "art-of-war");
  const workplanePath = join(automationPath, "workplane");
  const whopEvidence = [existsEvidence(whopPath, "repo"), existsEvidence(join(whopPath, "plugin/agent_workflows/whop_auto"), "plugin"), existsEvidence(join(repoRoot, "docs/ops/whop-auto-certification.md"), "CallScore certification doc")].filter(Boolean) as string[];
  const artEvidence = [existsEvidence(automationPath, "automation repo"), existsEvidence(join(automationPath, "scripts/art_of_war.py"), "dry-run CLI"), existsEvidence(artOfWarPath, "state/artifacts")].filter(Boolean) as string[];
  const claudeEvidence = [existsEvidence(automationPath, "repo"), existsEvidence(workplanePath, "workplane package"), existsEvidence(join(workplanePath, "package.json"), "workplane package.json")].filter(Boolean) as string[];
  const composioInventory = latestWorkflowReceipt("composio_app_inventory", repoRoot);

  return {
    whop_auto: domain({
      status: whopEvidence.length >= 2 ? "MONITORED" : "NOT_CONNECTED",
      evidence: [...whopEvidence, "zero-dollar/token-discount checkout proof recorded; dangerous mutations remain fail-closed"],
      blockers: whopEvidence.length >= 2 ? [] : ["Whop-auto repo not found"],
      safe_next_action: "run whop_provider_health / whop_plan_inventory_check read-only jobs",
      risky_actions_blocked: ["pricing changes", "plan/product/payment mutation", "live entitlement mutation"],
      required_approvals: ["live provider/customer mutation"],
      relevant_commands: ["npm run workplane:status"],
      relevant_jobs: ["whop_provider_health", "whop_plan_inventory_check", "whop_entitlement_sync_dry_run", "whop_webhook_replay_safe", "whop_customer_status_check", "whop_activation_review"],
      dry_run_available: true,
      canary_available: true,
    }, now),
    art_of_war: domain({
      status: artEvidence.length >= 2 ? "MONITORED" : "NOT_CONNECTED",
      evidence: [...artEvidence, "campaign_loop_contract=planned_in_master_plan", "persona/dry-run/Gemma verifier jobs=report_only", "owned-channel public GTM is READY_PUBLIC_OWNED when safe; persona/dry-run/Gemma verifier jobs are quality controls"],
      blockers: [],
      safe_next_action: "run daily owned-channel GTM loop: Art of War draft/select, persona quality check, publish safe owned canary, receipt, and monitor",
      risky_actions_blocked: ["email/DM/outreach send", "non-owned public posting", "ad spend", "aggressive scraping", "restricted claims"],
      required_approvals: ["email/DM/outreach send", "non-owned public posting", "spend", "restricted claims"],
      relevant_commands: ["python scripts/art_of_war.py report --dry-run"],
      relevant_jobs: [
        "artofwar_strategy_brief",
        "artofwar_content_queue_dry_run",
        "artofwar_campaign_plan_generate",
        "artofwar_audience_research_dry_run",
        "artofwar_outreach_queue_prepare",
        "artofwar_publish_approval_review",
        "artofwar_spend_approval_review",
        "artofwar_campaign_preflight",
        "artofwar_campaign_iteration",
        "artofwar_campaign_verify",
        "artofwar_campaign_persona_test",
        "artofwar_campaign_dry_run",
        "artofwar_campaign_gemma_eval",
        "artofwar_campaign_receipt",
        "artofwar_campaign_dossier",
        "artofwar_campaign_approval_review",
      ],
      dry_run_available: artEvidence.length >= 2,
      canary_available: artEvidence.length >= 2,
    }, now),
    claude_code_automations: domain({
      status: claudeEvidence.length >= 2 ? "MONITORED" : "NOT_CONNECTED",
      evidence: claudeEvidence,
      blockers: [],
      safe_next_action: "run automation_health_check and automation_registry_refresh report-only jobs",
      risky_actions_blocked: ["provider mutation", "non-owned public action", "restricted public claim", "spend", "destructive automation"],
      required_approvals: ["provider/non-owned-public/restricted-claim/spend/destructive activation"],
      relevant_commands: ["cd /srv/agents/repos/Claude_Code_Automations/workplane && npm run status"],
      relevant_jobs: ["automation_registry_refresh", "automation_dry_run", "automation_health_check", "automation_activation_review"],
      dry_run_available: claudeEvidence.length >= 2,
      canary_available: claudeEvidence.length >= 2,
    }, now),
    composio_mcp: domain({
      status: composioInventory.exists && !composioInventory.malformed ? "MONITORED" : "NOT_CONNECTED",
      evidence: [
        composioInventory.path ? `latest_composio_app_inventory_receipt=${composioInventory.path}` : "latest_composio_app_inventory_receipt=missing",
        "read-only Composio inventory is non-core; owned public organic posts may execute when registry row is READY_PUBLIC_OWNED; writes/sends/restricted actions remain gated",
      ],
      blockers: composioInventory.exists && !composioInventory.malformed ? [] : ["Composio inventory receipt missing"],
      safe_next_action: "use Composio read-only inventory before any CRM/email/social/analytics action",
      risky_actions_blocked: ["email send", "DM/outreach", "non-owned social post", "CRM mutation", "paid provider action"],
      required_approvals: ["email/DM/outreach", "non-owned public post", "provider mutation", "paid action"],
      relevant_commands: ["codex mcp list", "codex mcp get composio --json"],
      relevant_jobs: ["automation_health_check"],
      dry_run_available: true,
      canary_available: true,
    }, now),
  };
}

export function buildReadinessDomains(input: {
  readonly repoRoot?: string;
  readonly unsafeSourceRanks: number;
  readonly apiUnsafeOfficialCount: number;
  readonly collectorCooldown: CollectorCooldownState;
  readonly latestGemmaShadow: ArtifactSummary;
  readonly latestMlEval: ArtifactSummary;
  readonly transcriptBacklogRecent30d: number;
  readonly dailyPipelineActive: boolean;
  readonly nextAction: WorkplaneDecision;
  readonly now?: Date;
}): Record<string, WorkplaneDomainStatus> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const now = (input.now ?? new Date()).toISOString();
  const rootAudit = rootHygieneAudit(repoRoot);
  const shadowMetrics = input.latestGemmaShadow.summary;
  const mlGate = (input.latestMlEval.summary.promotion_gate ?? {}) as Record<string, unknown>;
  const external = externalReadinessSnapshot(repoRoot, now);
  const latestLoopEngineering = latestLoopEngineeringReceipt(join(repoRoot, ".tmp", "loop-engineering"));
  const publicSafe = input.unsafeSourceRanks === 0 && input.apiUnsafeOfficialCount === 0;
  const transcriptCadenceReceipt = latestWorkflowReceipt("transcript_laptop_cadence", repoRoot);
  const transcriptCadencePassed = transcriptCadenceReceipt.exists
    && !transcriptCadenceReceipt.malformed
    && transcriptCadenceReceipt.summary.result === "passed";
  const gemmaWriteCanaryReceipt = latestWorkflowReceipt("gemma_write_canary", repoRoot);
  const gemmaWriteCanaryPassed = gemmaWriteCanaryReceipt.exists
    && !gemmaWriteCanaryReceipt.malformed
    && gemmaWriteCanaryReceipt.summary.result === "passed";
  const pipelineScoreCanaryReceipt = latestWorkflowReceipt("pipeline_score_canary", repoRoot);
  const pipelineScoreCanaryPassed = pipelineScoreCanaryReceipt.exists
    && !pipelineScoreCanaryReceipt.malformed
    && pipelineScoreCanaryReceipt.summary.result === "passed";
  const gemmaShadowSampleReceipt = latestWorkflowReceipt("gemma_shadow_sample", repoRoot);
  const gemmaDiffClassificationReceipt = latestWorkflowReceipt("gemma_diff_classification", repoRoot);
  const gemmaShadowSamplePassed = gemmaShadowSampleReceipt.exists
    && !gemmaShadowSampleReceipt.malformed
    && gemmaShadowSampleReceipt.summary.result === "passed";
  const shadowErrorSummary = (shadowMetrics.errors && typeof shadowMetrics.errors === "object" && !Array.isArray(shadowMetrics.errors))
    ? shadowMetrics.errors as Record<string, unknown>
    : {};
  const shadowHasOnlyNonErrors = Object.entries(shadowErrorSummary).every(([key, value]) => key === "none" || Number(value) === 0);
  const gemmaShadowArtifactPassed = input.latestGemmaShadow.exists
    && !input.latestGemmaShadow.malformed
    && Number(shadowMetrics.rows ?? 0) > 0
    && shadowHasOnlyNonErrors;
  const gemmaShadowCanaryPassed = gemmaShadowSamplePassed || gemmaShadowArtifactPassed;
  const gemmaDiffClassified = gemmaDiffClassificationReceipt.exists
    && !gemmaDiffClassificationReceipt.malformed
    && gemmaDiffClassificationReceipt.summary.result === "passed";
  const transcriptCadenceRateLimited = transcriptCadenceReceipt.exists
    && !transcriptCadenceReceipt.malformed
    && typeof transcriptCadenceReceipt.summary.result === "string"
    && transcriptCadenceReceipt.summary.result.includes("rate_limited");

  return {
    root_hygiene: domain({
      status: rootAudit.status,
      evidence: [`graded_items=${rootAudit.items.length}`, `summary=${JSON.stringify(rootAudit.summary)}`],
      blockers: [],
      safe_next_action: "review KEEP_BUT_CONSOLIDATE items after activation",
      risky_actions_blocked: ["delete untracked runtime backups without approval"],
      required_approvals: ["untracked backup deletion"],
      relevant_commands: ["git clean -nd", "npm run hygiene:secrets"],
      relevant_jobs: [],
      dry_run_available: true,
      canary_available: false,
    }, now),
    callscore_pipeline: domain({
      status: publicSafe ? (pipelineScoreCanaryPassed ? "MONITORED" : "PARTIAL") : "BLOCKED",
      evidence: [
        `unsafeSourceRanks=${input.unsafeSourceRanks}`,
        `apiUnsafeOfficial=${input.apiUnsafeOfficialCount}`,
        `dailyPipelineActive=${input.dailyPipelineActive}`,
        transcriptCadenceReceipt.path ? `latest_transcript_cadence_receipt=${transcriptCadenceReceipt.path}` : "latest_transcript_cadence_receipt=missing",
        gemmaWriteCanaryReceipt.path ? `latest_gemma_write_canary_receipt=${gemmaWriteCanaryReceipt.path}` : "latest_gemma_write_canary_receipt=missing",
        pipelineScoreCanaryReceipt.path ? `latest_pipeline_score_canary_receipt=${pipelineScoreCanaryReceipt.path}` : "latest_pipeline_score_canary_receipt=missing",
      ],
      blockers: publicSafe
        ? (pipelineScoreCanaryPassed
          ? []
          : (gemmaWriteCanaryPassed
            ? ["bounded transcript cadence and one-video Gemma write canary passed; dedicated bounded scoring canary remains missing"]
            : (transcriptCadencePassed ? ["bounded transcript cadence passed; downstream extraction produced no accepted fresh calls yet"] : ["transcript freshness remains rate-limit controlled"])))
        : ["public safety violation detected"],
      safe_next_action: pipelineScoreCanaryPassed
        ? "monitor bounded laptop cadence and reduce audit backlog without blocking core production readiness"
        : (gemmaWriteCanaryPassed
          ? "implement dedicated bounded scoring canary or run explicit full recompute only with approval"
          : (transcriptCadencePassed ? "continue bounded laptop cadence and review fresh transcript extraction settings" : input.nextAction.action)),
      risky_actions_blocked: ["unbounded transcript collection", "Gemma production writes", "creator_stats mutation from shadow output"],
      required_approvals: ["production extractor default change"],
      relevant_commands: ["npm run freshness:check", "npm run workplane:status"],
      relevant_jobs: ["transcript_collect_laptop", "gemma_shadow_extract", "ml_idle_improve"],
      dry_run_available: true,
      canary_available: true,
    }, now),
    transcript_collector: domain({
      status: input.collectorCooldown.status === "malformed"
        ? "BLOCKED"
        : (transcriptCadencePassed ? "READY" : (transcriptCadenceRateLimited ? "MONITORED" : "PARTIAL")),
      evidence: [
        `cooldown=${input.collectorCooldown.status}`,
        `state=${input.collectorCooldown.state_path ?? "unknown"}`,
        `backlog_recent30d=${input.transcriptBacklogRecent30d}`,
        `last_job_id=${input.collectorCooldown.latest_job_id ?? "unknown"}`,
        `last_attempted=${input.collectorCooldown.last_attempted_count ?? "unknown"}`,
        `last_success=${input.collectorCooldown.last_success_count ?? "unknown"}`,
        `last_failure=${input.collectorCooldown.last_failure_count ?? "unknown"}`,
        `last_success_rate=${input.collectorCooldown.last_success_rate ?? "unknown"}`,
        `recent_failure_reasons=${JSON.stringify(input.collectorCooldown.recent_failure_reasons)}`,
        transcriptCadenceReceipt.path ? `latest_cadence_receipt=${transcriptCadenceReceipt.path}` : "latest_cadence_receipt=missing",
        transcriptCadenceReceipt.modified_at ? `latest_cadence_checked_at=${transcriptCadenceReceipt.modified_at}` : "latest_cadence_checked_at=unknown",
      ],
      blockers: input.collectorCooldown.status === "active"
        ? [`cooldown_until=${input.collectorCooldown.cooldown_until_utc}`]
        : (transcriptCadencePassed || transcriptCadenceRateLimited
          ? []
          : ((input.collectorCooldown.last_attempted_count ?? 0) >= 5 && (input.collectorCooldown.last_success_count ?? 0) === 0
            ? ["latest HH-visible laptop state had 0 transcript successes; use latest transcript_laptop_cadence receipt before retrying"]
            : [])),
      safe_next_action: input.collectorCooldown.status === "active"
        ? "wait_for_collector_cooldown"
        : (transcriptCadencePassed
          ? "continue bounded laptop collector cadence limit 5 and downstream extraction review"
          : (transcriptCadenceRateLimited
            ? "wait for laptop provider cooldown, then resume bounded limit-5 cadence"
            : ((input.collectorCooldown.last_attempted_count ?? 0) >= 5 && (input.collectorCooldown.last_success_count ?? 0) === 0
            ? "run canonical laptop collector via Tailscale rather than HH-only fallback"
            : "claim transcript_collect_laptop limit 5 from laptop runner"))),
      risky_actions_blocked: ["25-video batch without explicit gate", "cookie transfer to HH", "retry hammering after 429"],
      required_approvals: ["large transcript batch >5"],
      relevant_commands: ["scripts/windows/run-transcript-collector.ps1 -Workplane -Limit 5 -Write"],
      relevant_jobs: ["transcript_collect_laptop", "transcript_ingest_result"],
      dry_run_available: true,
      canary_available: true,
    }, now),
    gemma_shadow_extraction: domain({
      status: gemmaShadowCanaryPassed ? "READY" : "PARTIAL",
      evidence: [
        `latest_shadow_exists=${input.latestGemmaShadow.exists}`,
        `shadow_summary=${JSON.stringify(shadowMetrics)}`,
        gemmaShadowSampleReceipt.path ? `latest_gemma_shadow_sample_receipt=${gemmaShadowSampleReceipt.path}` : "latest_gemma_shadow_sample_receipt=missing",
      ],
      blockers: gemmaShadowCanaryPassed ? [] : ["latest real-transcript run timed out/invalid; not canary eligible"],
      safe_next_action: gemmaShadowCanaryPassed
        ? "review bounded shadow diff; keep promotion/write approval-gated"
        : "run bounded gemma_shadow_extract after prompt/chunk controls",
      risky_actions_blocked: ["Gemma production call writes", "public ranking impact"],
      required_approvals: ["write-canary promotion"],
      relevant_commands: ["npm run shadow:extract", "npm run shadow:diff"],
      relevant_jobs: ["gemma_shadow_extract", "extraction_promotion_review"],
      dry_run_available: true,
      canary_available: gemmaShadowCanaryPassed,
    }, now),
    ml_improvement_loop: domain({
      status: gemmaDiffClassified ? "MONITORED" : "PARTIAL",
      evidence: [`latest_ml_eval_exists=${input.latestMlEval.exists}`, `eligible_for_write_canary=${mlGate.eligible_for_write_canary === true}`, gemmaDiffClassificationReceipt.path ? `latest_gemma_diff_classification_receipt=${gemmaDiffClassificationReceipt.path}` : "latest_gemma_diff_classification_receipt=missing"],
      blockers: gemmaDiffClassified || mlGate.eligible_for_write_canary === true ? [] : ["quality gates hold write canary"],
      safe_next_action: "run ml_idle_improve and add fixtures/chunking recommendations",
      risky_actions_blocked: ["auto-promotion", "methodology change without review"],
      required_approvals: ["promotion to write-canary", "production default change"],
      relevant_commands: ["npm run ml:idle-improve"],
      relevant_jobs: ["ml_extraction_eval", "ml_idle_improve", "extraction_promotion_review"],
      dry_run_available: true,
      canary_available: false,
    }, now),
    loop_engineering_kernel: domain({
      status: "MONITORED",
      evidence: [
        existsEvidence(join(repoRoot, "docs/ops/callscore-loop-engineering-contract.md"), "contract doc") ?? "contract doc missing",
        existsEvidence(join(repoRoot, "docs/ops/callscore-loop-failure-taxonomy.md"), "failure taxonomy doc") ?? "failure taxonomy doc missing",
        latestLoopEngineering.path ? `latest_loop_receipt=${latestLoopEngineering.path}` : "latest_loop_receipt=missing",
        "loop_engineering_eval reuses ML idle/eval primitives and writes local LoopReceipt only",
      ],
      blockers: [],
      safe_next_action: latestLoopEngineering.exists
        ? "review latest LoopReceipt and keep any promotion behind extraction_promotion_review approval"
        : "run loop_engineering_eval dry-run against extraction fixtures; write LoopReceipt; do not promote production default",
      risky_actions_blocked: ["live surface action", "provider mutation", "Whop mutation", "production DB write", "production extractor promotion", "billable operation", "secret change"],
      required_approvals: ["production extractor promotion", "provider/Whop/DB/deploy mutation", "public/send/spend action"],
      relevant_commands: ["npm run ml:idle-improve", "npm run workplane:status"],
      relevant_jobs: ["loop_engineering_eval", "ml_extraction_eval", "ml_idle_improve", "extraction_promotion_review"],
      dry_run_available: true,
      canary_available: false,
    }, now),
    hermes_worker: domain({
      status: "MONITORED",
      evidence: ["HH-side workplane jobs represented", "laptop-only jobs intentionally excluded from Hermes worker claim set", "external laptop runner is canonical design, not a mechanism blocker"],
      blockers: [],
      safe_next_action: "dispatch HH-side report/dry-run jobs; laptop runner claims transcript_collect_laptop",
      risky_actions_blocked: ["laptop cookie execution on HH"],
      required_approvals: [],
      relevant_commands: ["npm run pipeline:worker:once", "npm run workplane:laptop-job -- claim"],
      relevant_jobs: workplaneSpecsForStatus().map((spec) => spec.type),
      dry_run_available: true,
      canary_available: true,
    }, now),
    provider_integrations: domain({
      status: publicSafe ? "MONITORED" : "BLOCKED",
      evidence: ["Whop public code proof remains certified", "provider/spend mutation gates encoded; owned public organic GTM can execute under READY_PUBLIC_OWNED", "mutation approval gates are non-core until a mutation is requested"],
      blockers: [],
      safe_next_action: "run read-only provider health jobs",
      risky_actions_blocked: ["Whop pricing/payment/product mutation", "Cloudflare/DNS/tunnel changes"],
      required_approvals: ["provider mutation", "infrastructure mutation"],
      relevant_commands: ["npm run workplane:status"],
      relevant_jobs: ["whop_provider_health", "whop_plan_inventory_check"],
      dry_run_available: true,
      canary_available: true,
    }, now),
    activation_gates: domain({
      status: "MONITORED",
      evidence: ["owned public organic GTM encoded as READY_PUBLIC_OWNED", "restricted send/spend/provider/financial/DB/deploy/infra actions remain fail-closed"],
      blockers: [],
      safe_next_action: "run owned public GTM canary through Art of War, registry, execution receipt, and read-only monitoring",
      risky_actions_blocked: ["email/DM/outreach", "non-owned public posting", "restricted public claims", "spend", "provider mutation", "production extractor switch"],
      required_approvals: ["email/DM/outreach", "non-owned public posting", "restricted public claims", "spend", "provider mutation", "production default change"],
      relevant_commands: ["npm run workplane:status"],
      relevant_jobs: ["artofwar_publish_approval_review", "artofwar_spend_approval_review", "whop_activation_review", "automation_activation_review"],
      dry_run_available: true,
      canary_available: false,
    }, now),
    ...external,
  };
}
