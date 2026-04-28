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

test("tailwind config does not declare a `brand` color block", () => {
  const colors = config.theme?.extend?.colors as Record<string, unknown>;
  assert.equal(
    colors.brand,
    undefined,
    "tailwind.config.ts must not re-export `brand` aliases — use spec tokens directly",
  );
});

test("no `brand-*` Tailwind aliases remain in src/", () => {
  // Match only the legacy alias names defined in tailwind.config.ts to avoid
  // matching English "brand-new" in code comments.
  const aliases = [
    "gold-dim",
    "card-hover",
    "gold",
    "green",
    "red",
    "dark",
    "card",
    "border",
    "muted",
    "accent",
  ];
  const re = new RegExp(`\\bbrand-(${aliases.join("|")})\\b`, "g");
  const offenders: string[] = [];
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf8");
    const matches = content.match(re);
    if (matches) offenders.push(`${file}: ${Array.from(new Set(matches)).join(", ")}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `Found legacy brand-* aliases:\n${offenders.join("\n")}`,
  );
});
