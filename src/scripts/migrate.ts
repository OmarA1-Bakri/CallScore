import * as fs from "fs";
import * as path from "path";
import { getDb } from "../lib/db";

type MigrationFile = {
  label: string;
  filePath: string;
};

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

export function stripSqlCommentLines(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function readDollarQuoteTag(sql: string, offset: number): string | null {
  const match = sql.slice(offset).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  return match?.[0] ?? null;
}

export function splitSqlStatements(sql: string): string[] {
  const source = stripSqlCommentLines(sql);
  const statements: string[] = [];
  let current = "";
  let index = 0;
  let dollarQuoteTag: string | null = null;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (index < source.length) {
    if (dollarQuoteTag) {
      if (source.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length;
        dollarQuoteTag = null;
        continue;
      }
      current += source[index];
      index += 1;
      continue;
    }

    const char = source[index];

    if (inSingleQuote) {
      current += char;
      if (char === "'" && source[index + 1] === "'") {
        current += source[index + 1];
        index += 2;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      index += 1;
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"' && source[index + 1] === '"') {
        current += source[index + 1];
        index += 2;
        continue;
      }
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    if (char === "$") {
      const tag = readDollarQuoteTag(source, index);
      if (tag) {
        current += tag;
        index += tag.length;
        dollarQuoteTag = tag;
        continue;
      }
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      index += 1;
      continue;
    }

    if (char === ";") {
      const stmt = current.trim();
      if (stmt.length > 0) statements.push(stmt);
      current = "";
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  const finalStatement = current.trim();
  if (finalStatement.length > 0) statements.push(finalStatement);

  return statements;
}

export function getMigrationFiles(root: string): MigrationFile[] {
  const schemaPath = path.join(root, "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema.sql not found at ${schemaPath}`);
  }

  const migrationsDir = path.join(root, "migrations");
  const numberedMigrations = fs.existsSync(migrationsDir)
    ? fs
        .readdirSync(migrationsDir)
        .filter((fileName) => /^\d+-.+\.sql$/.test(fileName))
        .sort((a, b) => a.localeCompare(b))
        .map((fileName) => ({
          label: `migrations/${fileName}`,
          filePath: path.join(migrationsDir, fileName),
        }))
    : [];

  return [
    {
      label: "schema.sql",
      filePath: schemaPath,
    },
    ...numberedMigrations,
  ];
}

async function main(): Promise<void> {
  loadEnv();

  const root = path.resolve(__dirname, "../..");
  let migrationFiles: MigrationFile[];
  try {
    migrationFiles = getMigrationFiles(root);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${timestamp()}] ERROR: ${msg}`);
    process.exit(1);
  }

  const db = getDb();

  const filesWithStatements = migrationFiles.map((file) => ({
    ...file,
    statements: splitSqlStatements(fs.readFileSync(file.filePath, "utf-8")),
  }));

  const statementCount = filesWithStatements.reduce(
    (sum, file) => sum + file.statements.length,
    0,
  );

  console.log(
    `[${timestamp()}] Starting migration with ${statementCount} statements across ${filesWithStatements.length} files...`,
  );

  let success = 0;
  let failed = 0;

  for (const file of filesWithStatements) {
    console.log(`[${timestamp()}] Applying ${file.label}...`);
    for (const statement of file.statements) {
      const preview = statement.replace(/\s+/g, " ").slice(0, 80);
      try {
        await db(`${statement};`);
        success++;
        console.log(`[${timestamp()}] OK: ${file.label}: ${preview}...`);
      } catch (error: unknown) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[${timestamp()}] FAIL: ${file.label}: ${preview}...`);
        console.error(`  -> ${msg}`);
      }
    }
  }

  console.log(`[${timestamp()}] Migration complete: ${success} succeeded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${new Date().toISOString()}] Fatal error:`, err);
    process.exit(1);
  });
}
