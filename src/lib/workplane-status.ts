import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { workplaneSpecsForStatus } from "./workplane-jobs";

export interface CollectorCooldownState {
  readonly state_path: string | null;
  readonly status: "active" | "clear" | "unknown" | "malformed";
  readonly cooldown_until_utc: string | null;
  readonly cooldown_reason: string | null;
  readonly latest_failure_reason: string | null;
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

export function readCollectorCooldownState(path: string | null, now = new Date()): CollectorCooldownState {
  const checkedAt = now.toISOString();
  if (!path) {
    return {
      state_path: null,
      status: "unknown",
      cooldown_until_utc: null,
      cooldown_reason: null,
      latest_failure_reason: null,
      checked_at: checkedAt,
    };
  }
  if (!existsSync(path)) {
    return {
      state_path: path,
      status: "unknown",
      cooldown_until_utc: null,
      cooldown_reason: null,
      latest_failure_reason: null,
      checked_at: checkedAt,
    };
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
    return {
      state_path: path,
      status: untilMs && untilMs > now.getTime() ? "active" : "clear",
      cooldown_until_utc: until,
      cooldown_reason: typeof json.cooldown_reason === "string" ? json.cooldown_reason : null,
      latest_failure_reason: typeof latestFailure?.reason === "string" ? latestFailure.reason : null,
      checked_at: checkedAt,
    };
  } catch {
    return {
      state_path: path,
      status: "malformed",
      cooldown_until_utc: null,
      cooldown_reason: null,
      latest_failure_reason: null,
      checked_at: checkedAt,
    };
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
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

export function latestGemmaShadowArtifact(root: string | readonly string[] = ["/tmp/callscore-shadow-extractions", ".tmp/shadow-extraction"]): ArtifactSummary {
  const path = latestFile(root, (name) => name.endsWith(".jsonl") && (name.includes("gemma-shadow") || name.includes("shadow")) && !name.includes(".diff"));
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
  const mlGate = (input.latestMlEval.summary.promotion_gate ?? {}) as Record<string, unknown>;
  if (input.latestMlEval.exists && mlGate.eligible_for_write_canary !== true) {
    return { action: "improve_gemma_prompt_and_chunking", reason: "latest ML eval blocks write canary", job_type: "ml_idle_improve", allowed: true };
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
    production_db_writes_allowed: spec.production_db_writes_allowed,
    production_call_writes_allowed: spec.production_call_writes_allowed,
    public_ranking_impact_allowed: spec.public_ranking_impact_allowed,
  }));
}
