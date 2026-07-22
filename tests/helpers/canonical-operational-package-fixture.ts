import { createHash } from "node:crypto";
import { REQUIRED_CANONICAL_RECEIPT_TYPES } from "../../src/lib/autonomy/canonical-operational-runtime";
import { validCanonicalMediaArtifact } from "./canonical-media-fixture";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? Object.fromEntries(Object.entries(candidate as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
    : candidate);
}

export function canonicalPayloadHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
}

export function validCanonicalOperationalPackage(channel: "x" | "linkedin", payload: unknown) {
  const platform = channel === "x"
    ? { head: "callscore-x-head", media: "callscore-x-image-agent" }
    : { head: "callscore-linkedin-head", media: "callscore-linkedin-image-agent" };
  const createdAt = new Date().toISOString();
  return {
    package_id: `canonical-${channel}-${createHash("sha256").update(`${createdAt}:${stableJson(payload)}`).digest("hex").slice(0, 12)}`,
    channel,
    created_at: createdAt,
    approved_payload_hash: canonicalPayloadHash(payload),
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((schema) => ({
      schema,
      receipt_id: `${schema}:${channel}:${createdAt}`,
      created_at: createdAt,
      agent_id: schema === "callscore.task_router_receipt.v1" || schema === "callscore.tool_inheritance_receipt.v1"
        ? "callscore-orchestrator-head"
        : schema === "platform_fit_receipt.v1"
          ? platform.head
          : schema === "editorial_angle_receipt.v1" || schema === "same_shit_memory_receipt.v1"
            ? "callscore-cmo-head"
            : platform.media,
      decision: "approved",
      evidence_hash: `sha256:${"a".repeat(64)}`,
      blockers: [],
    })),
    media_artifact: validCanonicalMediaArtifact(channel),
  };
}
