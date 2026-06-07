import test from "node:test";
import assert from "node:assert/strict";
import {
  DATABASE_URL_ENV_KEYS,
  resolveDatabaseProvider,
  resolveDatabaseUrl,
  withTransaction,
} from "../src/lib/db";

test("resolveDatabaseUrl prefers canonical pgsql env vars before Neon fallback", () => {
  const resolved = resolveDatabaseUrl({
    NEON_DATABASE_URL: "[REDACTED_DATABASE_URL]",
    DATABASE_URL: "[REDACTED_DATABASE_URL]",
    POSTGRES_URL: "[REDACTED_DATABASE_URL]",
  });

  assert.equal(resolved, "[REDACTED_DATABASE_URL]");
});

test("resolveDatabaseUrl falls back to Postgres-compatible env vars", () => {
  const resolved = resolveDatabaseUrl({
    POSTGRES_URL: "[REDACTED_DATABASE_URL]",
  });

  assert.equal(resolved, "[REDACTED_DATABASE_URL]");
});

test("resolveDatabaseUrl throws a helpful error when no env is set", () => {
  assert.throws(
    () => resolveDatabaseUrl({}),
    new RegExp(DATABASE_URL_ENV_KEYS.join(".*")),
  );
});

test("postgres transaction provider executes without calling Neon getDb", async () => {
  const executed: string[] = [];
  let released = false;
  let neonCalls = 0;

  await withTransaction(
    async (execute) => {
      await execute("DELETE FROM calls WHERE video_id = $1", [42]);
      return "ok";
    },
    {
      provider: "postgres",
      getNeonDb: () => {
        neonCalls += 1;
        throw new Error("Neon getDb must not be called for postgres provider");
      },
      getPostgresPool: async () => ({
        async query(sql: string) {
          executed.push(sql);
          return { rows: [] };
        },
        async connect() {
          return {
            async query(sql: string) {
              executed.push(sql);
              return { rows: [] };
            },
            release() {
              released = true;
            },
          };
        },
      }),
    },
  );

  assert.equal(neonCalls, 0);
  assert.equal(released, true);
  assert.deepEqual(executed, [
    "BEGIN",
    "DELETE FROM calls WHERE video_id = $1",
    "COMMIT",
  ]);
});

test("database provider aliases include HH pgsql", () => {
  assert.equal(resolveDatabaseProvider({ DATABASE_PROVIDER: "pgsql" }), "postgres");
  assert.equal(resolveDatabaseProvider({ DB_PROVIDER: "pg" }), "postgres");
  assert.equal(resolveDatabaseProvider({ DATABASE_PROVIDER: "neon" }), "neon");
});
