import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import config from "../tailwind.config";

const root = join(__dirname, "..");

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    if (/\.(tsx?|css)$/.test(name)) return [full];
    return [];
  });
}

const sourceFiles = walk(join(root, "src"));

test("breakpoints match the spec contract (phone ≤480, tab 481-1024, desk ≥1025)", () => {
  const screens = config.theme?.extend?.screens as Record<string, string>;
  assert.equal(screens.tab, "481px", "tab breakpoint must be 481px (start of tab range)");
  assert.equal(screens.desk, "1025px", "desk breakpoint must be 1025px (start of desk range)");
});
