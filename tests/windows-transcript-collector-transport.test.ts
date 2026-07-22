import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Windows transcript collector never shadows PowerShell automatic $args and forwards transport arguments", () => {
  const source = readFileSync(resolve(process.cwd(), "scripts", "windows", "run-transcript-collector.ps1"), "utf8");
  assert.doesNotMatch(source, /\[string\[\]\]\$Args\b/i);
  assert.match(source, /function Invoke-TransportCommand\(\[string\]\$Program, \[string\[\]\]\$ProgramArgs\)/);
  assert.match(source, /-- \$Program @ProgramArgs/);
  assert.equal(source.includes('$normalizedPath = $Path.Replace("\\", "/")'), true);
  assert.match(source, /wslpath -a \$normalizedPath/);
});
