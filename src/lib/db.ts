import { neon, type NeonQueryFunction, neonConfig } from "@neondatabase/serverless";
import type { Pool } from "pg";

export type DatabaseProvider = "neon" | "postgres";

export const DATABASE_URL_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
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

export interface SqlStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

export type SqlExecutor = (
  sql: string,
  params?: readonly unknown[],
) => Promise<unknown>;

type TransactionCallback<T> = (execute: SqlExecutor) => Promise<T>;

interface TransactionCapableNeonDb {
  transaction<T>(
    callback: (txn: SqlExecutor) => readonly Promise<T>[],
  ): Promise<readonly T[]>;
}

interface PostgresQueryResult {
  readonly rows?: readonly unknown[];
}

interface PostgresClientLike {
  query(sql: string, params?: readonly unknown[]): Promise<PostgresQueryResult>;
  release(): void;
}

interface PostgresPoolLike {
  query(sql: string, params?: readonly unknown[]): Promise<PostgresQueryResult>;
  connect(): Promise<PostgresClientLike>;
}

export interface TransactionOptions {
  readonly provider?: DatabaseProvider;
  readonly env?: DatabaseEnv;
  readonly getNeonDb?: () => unknown;
  readonly getPostgresPool?: () => Promise<PostgresPoolLike>;
  readonly transaction?: <T>(callback: TransactionCallback<T>) => Promise<T>;
}

let providerCache: DatabaseProvider | null = null;
let neonExecutor: QueryExecutor | null = null;
let pgPool: Pool | null = null;
let pgPoolPromise: Promise<Pool> | null = null;

function normalizeProvider(value: string | undefined): DatabaseProvider | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["postgres", "postgresql", "pgsql", "pg"].includes(normalized)) return "postgres";
  if (normalized === "neon") return "neon";
  throw new Error(
    "Invalid DATABASE_PROVIDER. Expected 'neon', 'postgres', 'postgresql', 'pgsql', or 'pg'.",
  );
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

function toMutableParams(params: readonly unknown[] | undefined): unknown[] {
  return params ? [...params] : [];
}

function isTransactionCapableNeonDb(
  db: unknown,
): db is TransactionCapableNeonDb {
  return Boolean(
    db &&
      typeof db === "object" &&
      "transaction" in db &&
      typeof (db as { transaction?: unknown }).transaction === "function",
  );
}

export function resolveDatabaseProvider(
  env: DatabaseEnv = process.env,
): DatabaseProvider {
  const explicit = normalizeProvider(env.DATABASE_PROVIDER ?? env.DB_PROVIDER);
  if (explicit) return explicit;

  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl && isLocalPostgresUrl(databaseUrl)) return "postgres";

  if (!databaseUrl && firstUrl(env, POSTGRES_URL_ENV_KEYS)) return "postgres";

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
    throw new Error(
      `Database connection string is required. Checked: ${DATABASE_URL_ENV_KEYS.join(", ")}`,
    );
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
  const poolPromise = pgPoolPromise as Promise<Pool>;
  return await poolPromise;
}

async function getPostgresPoolLike(): Promise<PostgresPoolLike> {
  const url = resolveDatabaseUrl(process.env, "postgres");
  return await getPgPool(url);
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

export async function withTransaction<T>(
  callback: TransactionCallback<T>,
  options: TransactionOptions = {},
): Promise<T> {
  if (options.transaction) {
    return options.transaction(callback);
  }

  const provider = options.provider ?? resolveDatabaseProvider(options.env);
  if (provider === "postgres") {
    const pool = await (options.getPostgresPool ?? getPostgresPoolLike)();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback((statement, params) =>
        client.query(statement, toMutableParams(params)),
      );
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transactional failure; rollback errors are secondary.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  const db = (options.getNeonDb ?? getDb)();
  if (!isTransactionCapableNeonDb(db)) {
    throw new Error("Database client does not support transaction(callback)");
  }

  const results = await db.transaction((txn) => [
    callback((statement, params) => txn(statement, toMutableParams(params))),
  ]);
  const [result] = results;
  return result as T;
}

export async function executeStatementsInTransaction(
  statements: readonly SqlStatement[],
  options?: TransactionOptions,
): Promise<void> {
  await withTransaction(async (execute) => {
    for (const statement of statements) {
      await execute(statement.sql, statement.params);
    }
  }, options);
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
