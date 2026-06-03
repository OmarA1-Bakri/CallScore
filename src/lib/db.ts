import { neon, type NeonQueryFunction, neonConfig } from "@neondatabase/serverless";
import type { Pool } from "pg";

export type DatabaseProvider = "neon" | "postgres";

export const DATABASE_URL_ENV_KEYS = [
  "NEON_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
] as const;

const POSTGRES_URL_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
] as const;

const NEON_URL_ENV_KEYS = ["NEON_DATABASE_URL", "DATABASE_URL"] as const;

type DatabaseEnv = Record<string, string | undefined>;
type QueryExecutor = <T>(text: string, params?: unknown[]) => Promise<T[]>;

let providerCache: DatabaseProvider | null = null;
let neonExecutor: QueryExecutor | null = null;
let pgPool: Pool | null = null;
let pgPoolPromise: Promise<Pool> | null = null;

function normalizeProvider(value: string | undefined): DatabaseProvider | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "neon" || normalized === "postgres") return normalized;
  throw new Error("Invalid DATABASE_PROVIDER. Expected 'neon' or 'postgres'.");
}

function isLocalPostgresUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("[::1]") ||
    lower.includes("/var/run/postgresql") ||
    lower.includes("host=/var/run/postgresql")
  );
}

function isNeonCompatibleUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".neon.tech") || lower.includes("neondb_owner") || lower.includes("sslmode=require");
}

function firstUrl(env: DatabaseEnv, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim().length > 0) return value.trim();
  }
  return null;
}

export function resolveDatabaseProvider(
  env: DatabaseEnv = process.env,
): DatabaseProvider {
  const explicit = normalizeProvider(env.DATABASE_PROVIDER);
  if (explicit) return explicit;

  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl && isLocalPostgresUrl(databaseUrl)) return "postgres";

  // Backward compatibility: existing production/runtime defaults to Neon.
  return "neon";
}

export function resolveDatabaseUrl(
  env: DatabaseEnv = process.env,
  provider: DatabaseProvider = resolveDatabaseProvider(env),
): string {
  if (provider === "postgres") {
    const url = firstUrl(env, POSTGRES_URL_ENV_KEYS);
    if (!url) {
      throw new Error(
        "Postgres provider requires DATABASE_URL or POSTGRES_URL. NEON_DATABASE_URL is intentionally ignored.",
      );
    }
    return url;
  }

  const url = firstUrl(env, NEON_URL_ENV_KEYS);
  if (!url) {
    throw new Error("Neon provider requires NEON_DATABASE_URL or DATABASE_URL.");
  }

  if (env.DATABASE_PROVIDER === "neon" && env.DATABASE_URL && !env.NEON_DATABASE_URL && !isNeonCompatibleUrl(url)) {
    throw new Error("DATABASE_PROVIDER=neon requires a Neon-compatible DATABASE_URL when NEON_DATABASE_URL is absent.");
  }

  return url;
}

function createNeonExecutor(url: string): QueryExecutor {
  neonConfig.webSocketConstructor = globalThis.WebSocket as typeof WebSocket;
  const sql: NeonQueryFunction<false, false> = neon(url);
  return async <T>(text: string, params: unknown[] = []) => {
    const rows = await sql(text, params);
    return rows as T[];
  };
}

async function getPgPool(url: string): Promise<Pool> {
  if (pgPool) return pgPool;
  if (!pgPoolPromise) {
    pgPoolPromise = (0, eval)("import('pg')").then((mod: typeof import("pg")) => {
      const PoolCtor = mod.Pool;
      const pool = new PoolCtor({ connectionString: url, max: 5 });
      pgPool = pool;
      return pool;
    });
  }
  return await pgPoolPromise!;
}

export function getDb(): NeonQueryFunction<false, false> {
  const provider = resolveDatabaseProvider();
  if (provider !== "neon") {
    throw new Error("getDb() is Neon-only. Use query<T>(text, params) for provider-portable access.");
  }

  const url = resolveDatabaseUrl(process.env, "neon");
  neonConfig.webSocketConstructor = globalThis.WebSocket as typeof WebSocket;
  return neon(url);
}

const RETRY_MS = [1_000, 2_000, 5_000, 10_000];
const isRetryableDatabaseError = (err: unknown): boolean => {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("fetch failed") ||
      msg.includes("etimedout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("timeout")
    );
  }
  return false;
};

function getNeonQueryExecutor(): QueryExecutor {
  const url = resolveDatabaseUrl(process.env, "neon");
  if (!neonExecutor || providerCache !== "neon") {
    neonExecutor = createNeonExecutor(url);
  }
  providerCache = "neon";
  return neonExecutor;
}

export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const provider = resolveDatabaseProvider();
  const url = resolveDatabaseUrl(process.env, provider);
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY_MS.length; attempt++) {
    try {
      if (provider === "postgres") {
        const pool = await getPgPool(url);
        const result = await pool.query(text, params);
        return result.rows as T[];
      }
      return await getNeonQueryExecutor()<T>(text, params);
    } catch (err) {
      lastErr = err;
      if (!isRetryableDatabaseError(err)) throw err;
      if (attempt < RETRY_MS.length - 1) {
        await new Promise((r) => setTimeout(r, RETRY_MS[attempt]));
      }
    }
  }
  throw lastErr;
}

export async function closeDatabasePoolForTests(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
    pgPoolPromise = null;
  }
  neonExecutor = null;
  providerCache = null;
}
