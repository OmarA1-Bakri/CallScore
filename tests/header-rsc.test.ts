import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const headerSrc = readFileSync(join(root, "src/components/Header.tsx"), "utf8");
const mobileMenuSrc = readFileSync(
  join(root, "src/components/MobileMenu.tsx"),
  "utf8",
);

test("Header.tsx is a Server Component (no `use client` directive)", () => {
  assert.doesNotMatch(
    headerSrc,
    /^\s*["']use client["']/m,
    "Header must be a Server Component",
  );
});

test("Header.tsx reads session server-side, not via fetch + useEffect", () => {
  assert.doesNotMatch(headerSrc, /useEffect/);
  assert.doesNotMatch(headerSrc, /fetch\(["']\/api\/auth\/session["']/);
  // Either via @/lib/auth (existing helper) or directly via next/headers.
  assert.match(
    headerSrc,
    /from\s+["']@\/lib\/auth["']|from\s+["']next\/headers["']/,
    "Header must read session server-side via @/lib/auth or next/headers",
  );
});

test("MobileMenu.tsx is the client island", () => {
  assert.match(mobileMenuSrc, /^\s*["']use client["']/m);
});

test("header auth redirects use canonical masthead typography", () => {
  assert.match(headerSrc, />\s*SIGN IN\s*</);
  assert.match(headerSrc, />\s*GET ACCESS\s*</);
  assert.doesNotMatch(headerSrc, />\s*Sign In\s*</);
  assert.doesNotMatch(headerSrc, />\s*Get Access\s*</);
  assert.doesNotMatch(headerSrc, /\bh-24\b/);
  assert.doesNotMatch(headerSrc, /bg-accent\s/);
});

test("mobile menu redirect labels match canonical masthead labels", () => {
  assert.match(mobileMenuSrc, />\s*SIGN IN\s*</);
  assert.match(mobileMenuSrc, />\s*GET ACCESS\s*</);
  assert.doesNotMatch(mobileMenuSrc, />\s*Sign In\s*</);
  assert.doesNotMatch(mobileMenuSrc, />\s*Get Access\s*</);
});
