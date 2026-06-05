import test from "node:test";
import assert from "node:assert/strict";
import { DATABASE_URL_ENV_KEYS, resolveDatabaseUrl } from "../src/lib/db";

test("resolveDatabaseUrl prefers canonical pgsql env vars before Neon fallback", () => {
  const resolved = resolveDatabaseUrl({
    NEON_DATABASE_URL: "postgres://neon-primary",
    DATABASE_URL: "postgres://database-url",
    POSTGRES_URL: "postgres://postgres-url",
  });

  assert.equal(resolved, "postgres://database-url");
});

test("resolveDatabaseUrl falls back to Postgres-compatible env vars", () => {
  const resolved = resolveDatabaseUrl({
    POSTGRES_URL: "postgres://postgres-url",
  });

  assert.equal(resolved, "postgres://postgres-url");
});

test("resolveDatabaseUrl throws a helpful error when no env is set", () => {
  assert.throws(
    () => resolveDatabaseUrl({}),
    new RegExp(DATABASE_URL_ENV_KEYS.join(".*")),
  );
});
