import {
  REQUIRED_CANONICAL_RECEIPT_TYPES,
  REQUIRED_YOUTUBE_RECEIPT_TYPES,
} from "../../src/lib/autonomy/canonical-operational-runtime";
import { validCanonicalMediaArtifact } from "./canonical-media-fixture";

export function validCanonicalReceipts(options: { readonly youtube?: boolean } = {}) {
  const createdAt = new Date().toISOString();
  const schemas = options.youtube
    ? [...REQUIRED_CANONICAL_RECEIPT_TYPES, ...REQUIRED_YOUTUBE_RECEIPT_TYPES]
    : [...REQUIRED_CANONICAL_RECEIPT_TYPES];
  return schemas.map((schema) => ({
    schema,
    receipt_id: `${schema}:test`,
    created_at: createdAt,
    agent_id: "callscore-canonical-test-agent",
    decision: "approved" as const,
    evidence_hash: `sha256:${"a".repeat(64)}`,
    blockers: [],
  }));
}

export function validCanonicalOperationalPackage(
  channel: "x" | "linkedin" | "reddit" | "youtube",
) {
  const createdAt = new Date().toISOString();
  return {
    package_id: `canonical-package-${channel}-test`,
    channel,
    created_at: createdAt,
    receipts: validCanonicalReceipts({ youtube: channel === "youtube" }),
    media_artifact: validCanonicalMediaArtifact(channel === "linkedin" ? "linkedin" : "x"),
  };
}
