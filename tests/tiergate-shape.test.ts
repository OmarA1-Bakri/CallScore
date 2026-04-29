// tests/tiergate-shape.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(__dirname, "..", "src/components/TierGate.tsx"),
  "utf8",
);

test("no gradients", () => {
  // Match Tailwind color-stop patterns specifically; bare `\b(from|to|via)-`
  // would false-positive on classes like `tracking-`, `auto-`, etc.
  assert.doesNotMatch(src, /\bbg-gradient-/);
  assert.doesNotMatch(
    src,
    /\b(from|to|via)-(black|white|transparent|current|inherit|[a-z]+-\d{2,3})\b/,
  );
});

test("no rounded-xl/full chrome", () => {
  assert.doesNotMatch(src, /\brounded-(xl|2xl|3xl|full)\b/);
});

test("no glow-* utility classes", () => {
  assert.doesNotMatch(src, /\bglow-(gold|purple|silver)\b/);
});

test("uses serif headline and mono CTA", () => {
  assert.match(src, /font-serif/);
  assert.match(src, /font-mono/);
});
