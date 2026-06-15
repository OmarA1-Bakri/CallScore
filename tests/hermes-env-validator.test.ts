import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { REQUIRED_KEYS, validateHermesEnv } from "../scripts/validate-hermes-env";

test("canonical Hermes env validator reports key names only", () => {
  const dir = mkdtempSync(join(tmpdir(), "callscore-env-validator-"));
  const envPath = join(dir, ".env.hermes");
  const secret = "super-secret-value-that-must-not-be-reported";
  writeFileSync(
    envPath,
    REQUIRED_KEYS.map((key) => `${key}=${secret}-${key}`).join("\n") + "\n",
    { mode: 0o600 },
  );

  const result = validateHermesEnv(envPath);
  assert.equal(result.status, "OK");
  assert.deepEqual(result.missing, []);
  assert.ok(result.present.includes("DATABASE_URL"));
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("canonical Hermes env validator fails closed when required keys are missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "callscore-env-validator-missing-"));
  const envPath = join(dir, ".env.hermes");
  writeFileSync(envPath, "DATABASE_URL=postgres://redacted\n", { mode: 0o600 });

  const result = validateHermesEnv(envPath);
  assert.equal(result.status, "MISSING");
  assert.ok(result.present.includes("DATABASE_URL"));
  assert.ok(result.missing.includes("COMPOSIO_API_KEY"));
  assert.ok(result.missing.includes("X_API_KEY"));
});
