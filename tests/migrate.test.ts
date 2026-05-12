import { test } from "node:test";
import { strict as assert } from "node:assert";
import { fileURLToPath, URL } from "node:url";
import { normalize, relative } from "node:path";
import { getMigrationFiles, splitSqlStatements } from "../src/scripts/migrate";

const root = fileURLToPath(new URL("..", import.meta.url));

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
    normalize("migrations/010-pipeline-heartbeats.sql"),
    normalize("migrations/011-candle-daily-closes.sql"),
    normalize("migrations/012-video-transcript-status.sql"),
    normalize("migrations/013-llm-gold-examples.sql"),
    normalize("migrations/014-ml-promotion-audit.sql"),
    normalize("migrations/015-candles-symbol-open-time.sql"),
    normalize("migrations/016-ml-verifier-missing-evidence.sql"),
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

test("SQL splitter keeps dollar-quoted blocks intact", () => {
  const statements = splitSqlStatements(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'example_check') THEN
        ALTER TABLE example ADD CONSTRAINT example_check CHECK (status IN ('ready', 'failed'));
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_example_status ON example(status);
  `);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /^DO \$\$/);
  assert.match(statements[0], /ALTER TABLE example ADD CONSTRAINT example_check/);
  assert.match(statements[0], /END \$\$$/);
  assert.equal(statements[1], "CREATE INDEX IF NOT EXISTS idx_example_status ON example(status)");
});

test("SQL splitter does not split semicolons inside quoted strings", () => {
  const statements = splitSqlStatements(`
    INSERT INTO example(message) VALUES ('first;second');
    SELECT "semi;colon" FROM example;
  `);

  assert.deepEqual(statements, [
    "INSERT INTO example(message) VALUES ('first;second')",
    'SELECT "semi;colon" FROM example',
  ]);
});
