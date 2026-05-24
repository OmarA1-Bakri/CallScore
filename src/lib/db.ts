import { neon, NeonQueryFunction, neonConfig } from "@neondatabase/serverless";

// Use built-in WebSocket on Node 20+ (Netlify/AWS Lambda)  
neonConfig.webSocketConstructor = globalThis.WebSocket as typeof WebSocket;

let sql: NeonQueryFunction<false, false> | null = null;

export const DATABASE_URL_ENV_KEYS = [
  "NEON_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
] as const;

type DatabaseEnv = Record<string, string | undefined>;

export function resolveDatabaseUrl(
  env: DatabaseEnv = process.env,
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

  // Use built-in WebSocket for Netlify/AWS Lambda 
  neonConfig.webSocketConstructor = globalThis.WebSocket as typeof WebSocket;

  const url = resolveDatabaseUrl();

  sql = neon(url);
  return sql;
}

const NEON_RETRY_MS = [1_000, 2_000, 5_000, 10_000];
const isRetryableNeonError = (err: unknown): boolean => {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("fetch failed") || msg.includes("etimedout") || msg.includes("econnrefused") || msg.includes("econnreset") || msg.includes("timeout");
  }
  return false;
};

export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = getDb();
  let lastErr: unknown;
  for (let attempt = 0; attempt < NEON_RETRY_MS.length; attempt++) {
    try {
      const result = await db(text, params);
      return result as T[];
    } catch (err) {
      lastErr = err;
      if (!isRetryableNeonError(err)) throw err;
      if (attempt < NEON_RETRY_MS.length - 1) {
        await new Promise((r) => setTimeout(r, NEON_RETRY_MS[attempt]));
      }
    }
  }
  throw lastErr;
}
