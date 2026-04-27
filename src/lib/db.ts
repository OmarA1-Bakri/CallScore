import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

export const DATABASE_URL_ENV_KEYS = [
  "NEON_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
] as const;

export function resolveDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  for (const key of DATABASE_URL_ENV_KEYS) {
    const value = env[key];
    if (value && value.trim().length > 0) {
      return value;
    }
  }

  throw new Error(
    `Database connection string is required. Checked: ${DATABASE_URL_ENV_KEYS.join(", ")}`,
  );
}

export function getDb(): NeonQueryFunction<false, false> {
  if (sql) return sql;

  const url = resolveDatabaseUrl();

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
