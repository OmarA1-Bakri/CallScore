import { createHash } from "node:crypto";
import type { JsonValue } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stableJsonStringify(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  if (isPlainObject(value)) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJsonStringify(item as JsonValue)}`).join(",")}}`;
  }
  throw new Error("Unsupported JSON value for stable serialization");
}

export interface ArtifactChecksumInput {
  readonly artifactType: string;
  readonly schemaVersion: string;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly storageUri?: string | null;
  readonly json?: JsonValue | null;
}

export function checksumArtifact(input: ArtifactChecksumInput): string {
  const canonical = stableJsonStringify({
    artifact_type: input.artifactType,
    schema_version: input.schemaVersion,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    storage_uri: input.storageUri ?? null,
    json: input.json ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function assertSha256(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("sha256 must be a lowercase 64-character hex digest");
  return value;
}
