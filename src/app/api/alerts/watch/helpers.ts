/**
 * Helpers for the /api/alerts/watch route. Lives in a sibling file
 * (not route.ts) because Next.js restricts route.ts exports to the
 * recognized HTTP handler names only.
 */

const POSITIVE_INT_PATTERN = /^[1-9]\d*$/;

/**
 * Strict positive-integer parser. Accepts numbers or strings that round-
 * trip through `String(Number(...))` cleanly. Rejects `"7abc"`, `"1e3"`,
 * `"  7"`, `"7.5"`, `"07"`, `"0"`, negatives, NaN, and non-finite values.
 */
export function parseCreatorId(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1) return null;
    return value;
  }
  if (typeof value !== "string") return null;
  if (!POSITIVE_INT_PATTERN.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  // Round-trip guard (defence in depth against exponent/precision edge cases).
  if (String(n) !== value) return null;
  return n;
}

/**
 * Postgres SQLSTATE 23503 = foreign_key_violation. Detects the case
 * where a caller supplied a creatorId that does not exist.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23503") return true;
  // Neon serverless surfaces errors as Error with .message containing the
  // SQLSTATE; match defensively.
  if (error instanceof Error && /23503|foreign key/i.test(error.message)) {
    return true;
  }
  return false;
}
