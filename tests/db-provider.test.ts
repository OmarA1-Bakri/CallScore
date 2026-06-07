import test from "node:test";
import assert from "node:assert/strict";
import {
  closeDatabasePoolForTests,
  resolveDatabaseProvider,
  resolveDatabaseUrl,
} from "../src/lib/db";

test.afterEach(async () => {
  await closeDatabasePoolForTests();
});

test("DATABASE_PROVIDER=neon selects Neon", () => {
  assert.equal(resolveDatabaseProvider({ DATABASE_PROVIDER: "neon" }), "neon");
});

test("DATABASE_PROVIDER=postgres selects Postgres", () => {
  assert.equal(resolveDatabaseProvider({ DATABASE_PROVIDER: "postgres" }), "postgres");
});

test("postgres provider does not let NEON_DATABASE_URL override DATABASE_URL", () => {
  const env = {
    DATABASE_PROVIDER: "postgres",
    NEON_DATABASE_URL: "postgresql://neon.example.invalid/neondb?sslmode=require",
    DATABASE_URL: "postgresql://localhost:5432/callscore",
  };
  assert.equal(resolveDatabaseProvider(env), "postgres");
  assert.equal(resolveDatabaseUrl(env, "postgres"), env.DATABASE_URL);
});

test("postgres provider fails closed if only NEON_DATABASE_URL is present", () => {
  assert.throws(
    () =>
      resolveDatabaseUrl(
        {
          DATABASE_PROVIDER: "postgres",
          NEON_DATABASE_URL: "postgresql://neon.example.invalid/neondb?sslmode=require",
        },
        "postgres",
      ),
    /Postgres provider requires DATABASE_URL or POSTGRES_URL/,
  );
});

test("absent DATABASE_PROVIDER preserves Neon-compatible default", () => {
  assert.equal(
    resolveDatabaseProvider({
      NEON_DATABASE_URL: "postgresql://example.neon.tech/neondb?sslmode=require",
    }),
    "neon",
  );
});

test("localhost DATABASE_URL resolves to postgres without explicit provider", () => {
  assert.equal(
    resolveDatabaseProvider({
      DATABASE_URL: "postgresql://localhost:5432/callscore",
    }),
    "postgres",
  );
});

test("explicit Neon with non-Neon DATABASE_URL fails closed", () => {
  assert.throws(
    () =>
      resolveDatabaseUrl(
        {
          DATABASE_PROVIDER: "neon",
          DATABASE_URL: "postgresql://localhost:5432/callscore",
        },
        "neon",
      ),
    /Neon-compatible DATABASE_URL/,
  );
});
