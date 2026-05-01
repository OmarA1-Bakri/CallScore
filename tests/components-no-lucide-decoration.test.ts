import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const ALLOWED = new Set([
  "Menu",
  "X",
  "ArrowLeft",
  "ArrowUpRight",
  "ExternalLink",
  "Lock",
  "Crown",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return walk(f);
    return /\.tsx$/.test(n) ? [f] : [];
  });
}

test("only whitelisted lucide-react icons are imported", () => {
  const offenders: string[] = [];
  for (const file of walk(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    const m = src.match(/from\s+["']lucide-react["'][^;]*/g);
    if (!m) continue;
    const importLine = src.match(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/);
    if (!importLine) continue;
    const names = importLine[1]
      .split(",")
      .map((n) => n.trim().split(/\s+as\s+/)[0])
      .filter(Boolean);
    const bad = names.filter((n) => !ALLOWED.has(n));
    if (bad.length) offenders.push(`${file}: ${bad.join(", ")}`);
  }
  assert.deepEqual(offenders, [], `Forbidden lucide icons:\n${offenders.join("\n")}`);
});
