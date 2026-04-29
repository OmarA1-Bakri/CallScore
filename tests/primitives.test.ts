import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const PRIMITIVES = ["Wordmark", "Hairline", "EditorialSection", "MetaStrip", "Chip"] as const;

test("each primitive exists and exports a default React component", () => {
  for (const name of PRIMITIVES) {
    const path = join(root, `src/components/primitives/${name}.tsx`);
    assert.ok(existsSync(path), `${name}.tsx must exist`);
    const src = readFileSync(path, "utf8");
    assert.match(src, /export default function/, `${name} must export default function`);
  }
});

test("primitives barrel re-exports all five", () => {
  const src = readFileSync(join(root, "src/components/primitives/index.ts"), "utf8");
  for (const name of PRIMITIVES) {
    assert.match(
      src,
      new RegExp(`export\\s*\\{[^}]*default as ${name}[^}]*\\}|from\\s+["']\\.\\/${name}["']`),
      `${name} must be re-exported`,
    );
  }
});

test("Wordmark uses serif font and italic accent", () => {
  const src = readFileSync(join(root, "src/components/primitives/Wordmark.tsx"), "utf8");
  assert.match(src, /font-serif/, "must use spec serif font class");
  assert.match(src, /italic/, "must include italic accent");
  assert.match(src, /text-accent/, "italic accent must be ochre");
});

test("Hairline emits a div with one of the spec hairline tokens", () => {
  const src = readFileSync(join(root, "src/components/primitives/Hairline.tsx"), "utf8");
  assert.match(src, /border-(ink-150|ink-200|ink-250)/);
});
