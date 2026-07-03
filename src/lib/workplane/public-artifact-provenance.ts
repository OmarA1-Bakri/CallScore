export type CanonicalPublicArtifactSourceType =
  | "agent_generated"
  | "workflow_generated"
  | "fixture"
  | "static_example"
  | "script_generated"
  | "blocked_context_only";

export type CanonicalPublicArtifactDecision = {
  readonly ok: boolean;
  readonly blocker_codes: readonly string[];
  readonly warnings: readonly string[];
};

export type CanonicalPublicArtifactSummary = CanonicalPublicArtifactDecision & {
  readonly canonical_public_artifact: boolean;
  readonly publish_candidate_allowed: boolean;
};

const GENERATED_SOURCE_TYPES = new Set(["agent_generated", "workflow_generated"]);
const NON_PUBLIC_SOURCE_TYPES = new Set(["fixture", "static_example", "script_generated", "blocked_context_only"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPresent(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function add(blockers: string[], code: string): void {
  if (!blockers.includes(code)) blockers.push(code);
}

function artifactRequiresVisualReceipts(artifact: Record<string, unknown>): boolean {
  const channel = asString(artifact.channel).toLowerCase();
  const type = asString(artifact.artifact_type || artifact.type || artifact.publish_unit_type).toLowerCase();
  return channel === "youtube" || /video|short|thumbnail|visual|image|carousel/.test(type);
}

function artifactRequiresTasteReceipts(artifact: Record<string, unknown>): boolean {
  const sourceType = asString(artifact.content_source_type);
  if (!GENERATED_SOURCE_TYPES.has(sourceType)) return false;
  const stage = asString(artifact.artifact_stage || artifact.stage || artifact.status).toLowerCase();
  return artifact.publish_candidate_ready === true
    || artifact.public_ready === true
    || stage === "production_ready"
    || stage === "publish_candidate"
    || stage === "public_ready";
}

export function validateCanonicalPublicArtifact(input: unknown): CanonicalPublicArtifactDecision {
  const artifact = asRecord(input);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const sourceType = asString(artifact.content_source_type);

  if (!GENERATED_SOURCE_TYPES.has(sourceType)) add(blockers, "canonical_agent_generated_artifact_required");
  if (NON_PUBLIC_SOURCE_TYPES.has(sourceType)) add(blockers, "canonical_agent_generated_artifact_required");
  if (artifact.canonical_public_artifact !== true) add(blockers, "canonical_public_artifact_true_required");
  if (artifact.generated_by_designated_workflow !== true) add(blockers, "designated_workflow_generation_required");

  for (const [field, code] of [
    ["workflow_id", "workflow_id_required"],
    ["agent_id", "agent_id_required"],
    ["generation_prompt_hash", "generation_prompt_hash_required"],
    ["generation_model_or_agent_run_id", "generation_model_or_agent_run_id_required"],
    ["shared_memory_read_receipt_id", "shared_memory_read_receipt_required"],
    ["shared_memory_write_receipt_id", "shared_memory_write_receipt_required"],
    ["originality_receipt_id", "originality_receipt_required"],
    ["same_shit_memory_receipt_id", "same_shit_memory_receipt_required"],
    ["role_voice_guidance_receipt_id", "role_voice_guidance_receipt_required"],
    ["quality_gate_receipt_id", "quality_gate_receipt_required"],
  ] as const) {
    if (!isPresent(artifact[field])) add(blockers, code);
  }

  if (!isPresent(artifact.child_run_id) && !isPresent(artifact.graph_node_run_id)) {
    add(blockers, "child_or_graph_node_run_id_required");
  }

  if (artifactRequiresVisualReceipts(artifact)) {
    if (!isPresent(artifact.visual_brief_receipt_id)) add(blockers, "visual_brief_receipt_required");
    if (!isPresent(artifact.visual_qa_receipt_id)) add(blockers, "visual_qa_receipt_required");
    if (!isPresent(artifact.copy_visual_coherence_receipt_id)) add(blockers, "copy_visual_coherence_receipt_required");
  }

  if (artifactRequiresTasteReceipts(artifact)) {
    if (!isPresent(artifact.editorial_angle_receipt_id)) add(blockers, "editorial_angle_receipt_required");
    if (!isPresent(artifact.platform_fit_receipt_id)) add(blockers, "platform_fit_receipt_required");
    if (!isPresent(artifact.taste_brief_receipt_id)) add(blockers, "taste_brief_receipt_required");
    if (!isPresent(artifact.taste_critique_receipt_id)) add(blockers, "taste_critique_receipt_required");
    if (!isPresent(artifact.creative_package_approval_receipt_id)) add(blockers, "creative_package_approval_receipt_required");
  }

  return { ok: blockers.length === 0, blocker_codes: blockers, warnings };
}

export function summarizeCanonicalPublicArtifact(input: unknown): CanonicalPublicArtifactSummary {
  const artifact = asRecord(input);
  const decision = validateCanonicalPublicArtifact(input);
  return {
    ...decision,
    canonical_public_artifact: artifact.canonical_public_artifact === true,
    publish_candidate_allowed: decision.ok && artifactRequiresTasteReceipts(artifact),
  };
}
