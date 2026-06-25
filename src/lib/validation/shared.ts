import { z } from "zod";

/** ISO 8601 datetime with timezone offset */
export const IsoTimestampSchema = z.string().datetime({ offset: true });

/** SHA-256 hash with `sha256:` prefix */
export const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/** Non-empty trimmed string */
export const NonEmptyStringSchema = z.string().trim().min(1);

/** Number between 0 and 1 inclusive */
export const ZeroToOneSchema = z.number().finite().min(0).max(1);

/** Common db timestamp (string or Date -> string) */
export const DbTimestampSchema = z.union([
  z.string(),
  z.date().transform((v) => v.toISOString()),
]);

/** Coerce DB numbers that come back as strings */
export const NumberFromDb = z.coerce.number();

/** Nullable version of a schema, with undefined -> null preprocess */
function nullWhenMissing(v: unknown): unknown {
  return v === undefined ? null : v;
}
export function nullableSchema<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(nullWhenMissing, schema.nullable());
}
