import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return walk(f);
    return /\.(tsx?|css)$/.test(n) ? [f] : [];
  });
}

test("no glass-card or glass-card-hover usages remain", () => {
  const offenders: string[] = [];
  for (const file of walk(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    if (/\bglass-card(-hover)?\b/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `glass-card found in:\n${offenders.join("\n")}`);
});

test("no rounded-lg/xl/full chrome on src/components/", () => {
  const offenders: string[] = [];
  const re = /\brounded-(lg|xl|2xl|3xl|full)\b/g;
  for (const file of walk(join(root, "src/components"))) {
    const src = readFileSync(file, "utf8");
    const matches = src.match(re);
    if (matches) offenders.push(`${file}: ${Array.from(new Set(matches)).join(", ")}`);
  }
  assert.deepEqual(offenders, [], `rounded chrome found:\n${offenders.join("\n")}`);
});
