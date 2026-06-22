import { createHash } from "node:crypto";
import {
  AutonomyReceiptSchema,
  type AutonomyReceipt,
} from "./contracts";

const REDACTED_SECRET_VALUE = "[REDACTED]";
const SECRET_LIKE_DETAIL_KEY_PATTERN = /(?:^|[_-])(?:api[_-]?key|key|token|access[_-]?token|refresh[_-]?token|secret|client[_-]?secret|password|passwd|private[_-]?key|credential|cookie|authorization|auth[_-]?token|bearer[_-]?token)(?:$|[_-])/i;

export interface BuildAutonomyReceiptOptions {
  readonly secretDetailHandling?: "reject" | "redact";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSecretLikeDetailKey(key: string): boolean {
  return SECRET_LIKE_DETAIL_KEY_PATTERN.test(key.replace(/([a-z0-9])([A-Z])/g, "$1_$2"));
}

function redactSecretLikeDetailValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecretLikeDetailValues(item));
  if (!isPlainRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSecretLikeDetailKey(key) ? REDACTED_SECRET_VALUE : redactSecretLikeDetailValues(nestedValue),
    ]),
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!isPlainRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function parseAutonomyReceipt(value: unknown): AutonomyReceipt {
  return AutonomyReceiptSchema.parse(value);
}

export function buildAutonomyReceipt(value: unknown, options: BuildAutonomyReceiptOptions = {}): AutonomyReceipt {
  if (options.secretDetailHandling !== "redact") return parseAutonomyReceipt(value);
  if (!isPlainRecord(value) || !("detail" in value)) return parseAutonomyReceipt(value);

  return parseAutonomyReceipt({
    ...value,
    detail: redactSecretLikeDetailValues(value.detail),
  });
}

export function hashAutonomyReceipt(value: unknown): string {
  const receipt = parseAutonomyReceipt(value);
  return sha256(JSON.stringify(canonicalize(receipt)));
}
