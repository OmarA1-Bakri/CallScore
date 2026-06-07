import { neon, NeonQueryFunction, neonConfig } from "@neondatabase/serverless";

// Use built-in WebSocket on Node 20+ (Netlify/AWS Lambda)
neonConfig.webSocketConstructor = globalThis.WebSocket as typeof WebSocket;

let sql: NeonQueryFunction<false, false> | null = null;
let pgPool: PostgresPool | null = null;

export const DATABASE_URL_ENV_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "NEON_DATABASE_URL",
] as const;

export type DatabaseProvider = "neon" | "postgres";

type DatabaseEnv = Record<string, string | undefined>;

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

interface PostgresClient {
  query(sql: string, params?: readonly unknown[]): Promise<PostgresQueryResult>;
  release(): void;
}

interface PostgresPool {
  query(sql: string, params?: readonly unknown[]): Promise<PostgresQueryResult>;
  connect(): Promise<PostgresClient>;
}

export interface TransactionOptions {
  readonly provider?: DatabaseProvider;
  readonly env?: DatabaseEnv;
  readonly getNeonDb?: () => unknown;
  readonly getPostgresPool?: () => Promise<PostgresPool>;
  readonly transaction?: <T>(callback: TransactionCallback<T>) => Promise<T>;
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
  const rawProvider = (env.DATABASE_PROVIDER ?? env.DB_PROVIDER ?? "neon")
    .trim()
    .toLowerCase();
  if (["postgres", "postgresql", "pgsql", "pg"].includes(rawProvider)) {
    return "postgres";
  }
  if (rawProvider === "neon") return "neon";
  throw new Error(
    `Unsupported database provider: ${rawProvider}. Expected neon, postgres, postgresql, pgsql, or pg.`,
  );
}

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

async function createPostgresPool(): Promise<PostgresPool> {
  if (pgPool) return pgPool;

  const pgModule = (await import(/* webpackIgnore: true */ "pg")) as {
    Pool?: new (options: { connectionString: string }) => PostgresPool;
    default?: { Pool?: new (options: { connectionString: string }) => PostgresPool };
  };
  const Pool = pgModule.Pool ?? pgModule.default?.Pool;
  if (!Pool) throw new Error("pg Pool constructor is unavailable");

  pgPool = new Pool({ connectionString: resolveDatabaseUrl() });
  return pgPool;
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
  if (resolveDatabaseProvider() === "postgres") {
    const pool = await createPostgresPool();
    const result = await pool.query(text, params);
    return (result.rows ?? []) as T[];
  }

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

export async function withTransaction<T>(
  callback: TransactionCallback<T>,
  options: TransactionOptions = {},
): Promise<T> {
  if (options.transaction) {
    return options.transaction(callback);
  }

  const provider = options.provider ?? resolveDatabaseProvider(options.env);
  if (provider === "postgres") {
    const pool = await (options.getPostgresPool ?? createPostgresPool)();
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
