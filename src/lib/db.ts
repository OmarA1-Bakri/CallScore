import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (sql) return sql;

  const url = process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new Error("NEON_DATABASE_URL environment variable is required");
  }

  sql = neon(url);
  return sql;
}

export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = getDb();
  const result = await db(text, params);
  return result as T[];
}
