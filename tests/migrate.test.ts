import { test } from "node:test";
import { strict as assert } from "node:assert";
import { join, normalize, relative } from "node:path";
import { getMigrationFiles, splitSqlStatements } from "../src/scripts/migrate";

const root = join(__dirname, "..");

test("migration plan applies schema then numbered migrations in order", () => {
  const labels = getMigrationFiles(root).map((file) => normalize(relative(root, file.filePath)));

  assert.deepEqual(labels, [
    "schema.sql",
    normalize("migrations/001-watchlists.sql"),
    normalize("migrations/002-call-revisions.sql"),
    normalize("migrations/003-call-revisions-revised-id.sql"),
    normalize("migrations/004-alert-unsubscribes.sql"),
    normalize("migrations/005-alpha-platform.sql"),
    normalize("migrations/006-autonomous-ml-pipeline.sql"),
    normalize("migrations/007-product-surface-observability.sql"),
    normalize("migrations/008-candles-guardrails.sql"),
    normalize("migrations/009-validate-candles-open-time.sql"),
  ]);
});

test("SQL splitter ignores standalone comments and keeps statements", () => {
  const statements = splitSqlStatements(`
    -- comment
    CREATE TABLE IF NOT EXISTS example (id SERIAL PRIMARY KEY);

    -- another comment
    CREATE INDEX IF NOT EXISTS idx_example_id ON example(id);
  `);

  assert.deepEqual(statements, [
    "CREATE TABLE IF NOT EXISTS example (id SERIAL PRIMARY KEY)",
    "CREATE INDEX IF NOT EXISTS idx_example_id ON example(id)",
  ]);
});
