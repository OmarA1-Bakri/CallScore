import test from "node:test";
import assert from "node:assert/strict";
import { DATABASE_URL_ENV_KEYS, resolveDatabaseUrl } from "../src/lib/db";

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
