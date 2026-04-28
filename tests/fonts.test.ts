import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const fontsTs = readFileSync(join(root, "src/app/fonts.ts"), "utf8");
const layoutTsx = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("fonts.ts declares the three editorial faces", () => {
  assert.match(fontsTs, /Source_Serif_4/);
  assert.match(fontsTs, /Inter_Tight/);
  assert.match(fontsTs, /JetBrains_Mono/);
  assert.match(fontsTs, /variable:\s*"--font-serif"/);
  assert.match(fontsTs, /variable:\s*"--font-sans"/);
  assert.match(fontsTs, /variable:\s*"--font-mono"/);
});

test("layout.tsx applies the font CSS variables on <html>", () => {
  assert.match(layoutTsx, /from\s+["']\.\/fonts["']/);
  assert.match(layoutTsx, /serif\.variable/);
  assert.match(layoutTsx, /sans\.variable/);
  assert.match(layoutTsx, /mono\.variable/);
});

test("globals.css references next/font CSS variables, not raw font literals", () => {
  // The --font-serif/--font-sans/--font-mono CSS vars defined in globals.css
  // must reference the next/font variables (which arrive as --font-serif etc.
  // from layout.tsx's <html className=...>) — never the raw "Source Serif 4"
  // literal, which would prevent next/font from kicking in.
  assert.doesNotMatch(globalsCss, /"Source Serif 4"/);
  assert.doesNotMatch(globalsCss, /"Inter Tight"/);
  assert.doesNotMatch(globalsCss, /"JetBrains Mono"/);
});
