import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export const CALLSCORE_EXECUTION_MODES = [
  "read_only_verify",
  "draft_ready",
  "live_owned_public",
  "post_publish_closeout",
] as const;

export type CallScoreExecutionMode = (typeof CALLSCORE_EXECUTION_MODES)[number];
export type NormalizedWorkflowStatus = "ready" | "draft_ready" | "published" | "blocked" | "failed" | "needs_review";

export interface OwnedPublicEvidenceInput {
  readonly execution_mode?: CallScoreExecutionMode;
  readonly data_packet?: Record<string, any> | null;
  readonly x?: Record<string, any> | null;
  readonly linkedin?: Record<string, any> | null;
  readonly quality_gate?: Record<string, any> | null;
  readonly visual_asset?: Record<string, any> | null;
  readonly graph_owned_path?: Record<string, any> | null;
  readonly provider_auth_ok?: boolean;
  readonly duplicate_or_cadence_hit?: boolean;
  readonly ceremonial_receipts?: readonly string[];
}

export interface GateClassification {
  readonly status: string;
  readonly normalized_status: NormalizedWorkflowStatus;
  readonly status_reason: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export function resolveCallScoreExecutionMode(value = process.env.CALLSCORE_EXECUTION_MODE): CallScoreExecutionMode {
  return CALLSCORE_EXECUTION_MODES.includes(value as CallScoreExecutionMode)
    ? (value as CallScoreExecutionMode)
    : "read_only_verify";
}

function numberish(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function copyText(channel: Record<string, any> | null | undefined): string {
  if (!channel) return "";
  for (const key of ["exact_copy", "text", "commentary", "body"]) {
    const value = channel[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const draft = channel.draft;
  if (draft && typeof draft.text === "string") return draft.text.trim();
  return "";
}

function growth(channel: Record<string, any> | null | undefined): Record<string, any> {
  return (channel?.growth_mechanics && typeof channel.growth_mechanics === "object") ? channel.growth_mechanics : {};
}

export function visualReady(visual: Record<string, any> | null | undefined): boolean {
  if (!visual) return false;
  if (visual.required === false) return true;
  if (typeof visual.provider_media_id === "string" && visual.provider_media_id.trim()) return true;
  if (Array.isArray(visual.media_media_ids) && visual.media_media_ids.length > 0) return true;
  for (const key of ["local_png_path", "path"] as const) {
    const p = visual[key];
    if (typeof p === "string" && p.trim() && existsSync(p)) return true;
  }
  const b64Path = visual.png_b64_path ?? visual.base64_png_path;
  if (typeof b64Path === "string" && b64Path.trim() && existsSync(b64Path)) {
    try {
      const rawText = readFileSync(b64Path, "utf8").trim();
      const decoded = Buffer.from(rawText.includes(",") ? rawText.split(",").pop() ?? "" : rawText, "base64");
      if (decoded.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    } catch {
      // fall through
    }
  }
  if (visual.png_sha256 && visual.kind && visual.alt_text) return true;
  const artifactPath = visual.exported_image_path ?? visual.image_artifact_path;
  const expectedHash = String(visual.png_sha256 ?? visual.sha256 ?? "").replace(/^sha256:/, "");
  if (typeof artifactPath === "string" && artifactPath.trim() && expectedHash && existsSync(artifactPath)) {
    const actual = createHash("sha256").update(readFileSync(artifactPath)).digest("hex");
    return actual === expectedHash;
  }
  return false;
}

export function normalizeWorkflowStatus(input: {
  readonly status?: string | null;
  readonly graph_status?: string | null;
  readonly quality_gate_ok?: boolean;
  readonly provider_succeeded?: boolean;
  readonly target_url_or_id?: string | null;
  readonly mode?: CallScoreExecutionMode;
  readonly execution_mode?: CallScoreExecutionMode;
  readonly blockers?: readonly string[];
}): { normalized_status: NormalizedWorkflowStatus; status_reason: string } {
  const status = input.status ?? input.graph_status ?? "unknown";
  const mode = input.mode ?? input.execution_mode;
  if (mode === "post_publish_closeout" && input.provider_succeeded && !input.target_url_or_id) {
    return { normalized_status: "needs_review", status_reason: "missing_provider_target_id" };
  }
  if (status === "published_graph_owned" || (input.graph_status === "ok" && mode === "live_owned_public")) {
    return { normalized_status: "published", status_reason: "graph_owned_publish_succeeded" };
  }
  if (status === "blocked_auth") return { normalized_status: "blocked", status_reason: "provider_auth_missing" };
  if (status === "blocked_duplicate_or_cadence") return { normalized_status: "blocked", status_reason: "cadence_or_duplicate_block" };
  if (status === "blocked_quality") return { normalized_status: "blocked", status_reason: "quality_gate_failed" };
  if (status === "blocked_missing_agent_platform_drafts") return { normalized_status: "blocked", status_reason: "missing_platform_drafts" };
  if (status.startsWith("blocked")) return { normalized_status: "blocked", status_reason: status };
  if (status === "failed") return { normalized_status: "failed", status_reason: "failed" };
  if (input.quality_gate_ok === true && (!input.blockers || input.blockers.length === 0)) {
    return { normalized_status: "draft_ready", status_reason: "quality_gate_passed" };
  }
  if (status === "workplane_status_unavailable" || status === "heartbeat_missing") return { normalized_status: "needs_review", status_reason: status };
  return { normalized_status: "needs_review", status_reason: status };
}

const WARNING_ONLY_GRAPH_BLOCKERS = new Set([
  "workplane_status_unavailable",
  "heartbeat_missing",
  "workplane_readiness_blocked_for_unrelated_restricted_lane",
  "autonomous_revenue_not_live_warning_only_for_graph_owned_public_execution",
]);

function splitGraphBlockers(blockers: unknown): { hard: string[]; warnings: string[] } {
  const values = Array.isArray(blockers) ? blockers.map(String) : [];
  return {
    hard: values.filter((b) => !WARNING_ONLY_GRAPH_BLOCKERS.has(b)),
    warnings: values.filter((b) => WARNING_ONLY_GRAPH_BLOCKERS.has(b)),
  };
}

export function classifyOwnedPublicEvidence(input: OwnedPublicEvidenceInput): GateClassification {
  const mode = input.execution_mode ?? "read_only_verify";
  const blockers: string[] = [];
  const warnings: string[] = [];
  const data = input.data_packet ?? {};
  const top = Array.isArray(data.top_creators) ? data.top_creators : [];
  if (!data.source) blockers.push("data_packet_source_missing");
  if (numberish(data.call_count ?? data.total_calls) <= 0) blockers.push("data_packet_call_count_missing");
  if (numberish(data.public_calls ?? data.price_backed_calls) <= 0) blockers.push("data_packet_public_calls_missing");
  if (numberish(data.ranked_creators) <= 0) blockers.push("data_packet_ranked_creators_missing");
  if (top.length === 0) blockers.push("data_packet_top_creators_missing");

  const xText = copyText(input.x);
  const linkedinText = copyText(input.linkedin);
  if (!xText) blockers.push("missing_x_copy");
  if (xText.length > 280 && !input.x?.long_form_allowed) blockers.push("x_copy_over_280_chars");
  if (!linkedinText) blockers.push("missing_linkedin_copy");
  if (xText && linkedinText && xText === linkedinText) blockers.push("linkedin_copy_identical_to_x");
  const xGrowth = growth(input.x);
  const liGrowth = growth(input.linkedin);
  if (!xGrowth.cta && !liGrowth.cta) blockers.push("cta_missing");
  if (!xGrowth.media_plan && !liGrowth.media_plan) blockers.push("media_plan_missing");
  if (!xGrowth.target_entities && !liGrowth.target_entities) warnings.push("target_entities_missing_warning_only");

  if (input.quality_gate?.ok !== true) blockers.push("quality_gate_failed");
  if (!visualReady(input.visual_asset)) blockers.push("visual_package_missing");

  if (mode === "live_owned_public") {
    if (input.provider_auth_ok === false) blockers.push("provider_auth_missing");
    if (input.duplicate_or_cadence_hit) blockers.push("cadence_or_duplicate_block");
    const graph = input.graph_owned_path ?? {};
    const graphSplit = splitGraphBlockers(graph.blockers);
    warnings.push(...graphSplit.warnings.map((b) => `warning_only_graph_blocker:${b}`));
    blockers.push(...graphSplit.hard);
    if (!graph.node_invoked) blockers.push("graph_owned_publish_node_not_invoked");
    if (graph.graph_exit_code !== 0 && graphSplit.hard.length > 0) blockers.push("graph_exit_code_nonzero");
    if (!graph.provider_mutation_performed || !graph.public_publish_performed) blockers.push("graph_provider_public_mutation_not_confirmed");
    if (graph.direct_parent_provider_mutation === true) blockers.push("direct_parent_provider_mutation_forbidden");
  } else {
    if (input.provider_auth_ok === false) warnings.push("provider_auth_missing_live_only");
    if (input.duplicate_or_cadence_hit) warnings.push("cadence_or_duplicate_live_only");
    const graph = input.graph_owned_path ?? {};
    const graphSplit = splitGraphBlockers(graph.blockers);
    warnings.push(...graphSplit.warnings.map((b) => `warning_only_graph_blocker:${b}`));
    blockers.push(...graphSplit.hard);
    if (!graph.preview_available && !graph.node_path && !graph.node_invoked && !graph.mutation_inputs_path) blockers.push("graph_owned_preview_missing");
  }

  const ceremonial = input.ceremonial_receipts ?? [];
  for (const name of ["editorial_angle_receipt.v1", "platform_fit_receipt.v1", "visual_brief_receipt.v1", "visual_qa_receipt.v1", "copy_visual_coherence_receipt.v1", "same_shit_memory_receipt.v1"]) {
    if (!ceremonial.includes(name)) warnings.push(`missing_ceremonial_receipt_alias_accepted:${name}`);
  }

  if (blockers.length > 0) {
    const reason = blockers.includes("provider_auth_missing")
      ? "provider_auth_missing"
      : blockers.includes("cadence_or_duplicate_block")
        ? "cadence_or_duplicate_block"
        : blockers.includes("quality_gate_failed")
          ? "quality_gate_failed"
          : blockers[0];
    return { status: `blocked_${reason}`, normalized_status: "blocked", status_reason: reason, blockers, warnings };
  }
  if (mode === "live_owned_public") {
    return { status: "published_graph_owned", normalized_status: "published", status_reason: "graph_owned_publish_succeeded", blockers, warnings };
  }
  return { status: "draft_ready", normalized_status: "draft_ready", status_reason: "quality_gate_passed", blockers, warnings };
}
