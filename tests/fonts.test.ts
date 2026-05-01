import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const fontsTs = readFileSync(join(root, "src/app/fonts.ts"), "utf8");
const layoutTsx = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("fonts.ts declares local CSS variable class hooks", () => {
  assert.doesNotMatch(fontsTs, /next\/font\/google/);
  assert.match(fontsTs, /variable:\s*"font-serif-vars"/);
  assert.match(fontsTs, /variable:\s*"font-sans-vars"/);
  assert.match(fontsTs, /variable:\s*"font-mono-vars"/);
});

test("layout.tsx applies the font CSS variables on <html>", () => {
  assert.match(layoutTsx, /from\s+["']\.\/fonts["']/);
  assert.match(layoutTsx, /serif\.variable/);
  assert.match(layoutTsx, /sans\.variable/);
  assert.match(layoutTsx, /mono\.variable/);
});

test("globals.css defines local font stacks without Google font literals", () => {
  assert.match(globalsCss, /\.font-serif-vars/);
  assert.match(globalsCss, /\.font-sans-vars/);
  assert.match(globalsCss, /\.font-mono-vars/);
  assert.doesNotMatch(globalsCss, /"Source Serif 4"/);
  assert.doesNotMatch(globalsCss, /"Inter Tight"/);
  assert.doesNotMatch(globalsCss, /"JetBrains Mono"/);
});
