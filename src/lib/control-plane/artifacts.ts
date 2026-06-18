export const CONTROL_PLANE_ARTIFACT_TYPES = [
  "video_metadata",
  "transcript_raw",
  "transcript_segments",
  "candidate_calls",
  "normalized_calls",
  "validation_report",
  "price_resolution",
  "score_evaluation",
  "publication_decision",
] as const;

export type ControlPlaneArtifactType = (typeof CONTROL_PLANE_ARTIFACT_TYPES)[number];

export const ARTIFACT_LINK_TYPES = [
  "derived_from",
  "evidence_for",
  "validated_by",
  "priced_by",
  "scored_by",
  "publication_decision_for",
] as const;

export type ArtifactLinkType = (typeof ARTIFACT_LINK_TYPES)[number];

export function isControlPlaneArtifactType(value: string): value is ControlPlaneArtifactType {
  return (CONTROL_PLANE_ARTIFACT_TYPES as readonly string[]).includes(value);
}

export function isArtifactLinkType(value: string): value is ArtifactLinkType {
  return (ARTIFACT_LINK_TYPES as readonly string[]).includes(value);
}
