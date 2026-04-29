// Cross-cutting page-level guardrails for Phase 3 page rebuilds.
//
// SCOPE: only the 6 rebuilt routes are covered (Option A allowlist). The
// un-rebuilt routes /feedback, /privacy, /terms, and /creator/[handle]/backtest
// are explicitly OUT OF SCOPE for Phase 3 and intentionally excluded — they
// still carry legacy chrome (rounded-lg, multi-h1, phosphor literals) and
// will be rebuilt in a later phase. Adding them now would block the suite.
//
// When a route is rebuilt, append its page.tsx path to REBUILT_PAGES below
// so it inherits these guardrails automatically.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { read, FORBIDDEN_PHOSPHOR } from "./page-helpers";

const REBUILT_PAGES: readonly string[] = [
  "src/app/page.tsx",
  "src/app/about/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/methodology/page.tsx",
  "src/app/creator/[handle]/page.tsx",
  "src/app/call/[id]/page.tsx",
];

test("no rebuilt page renders B Terminal phosphor colors", () => {
  const offenders: string[] = [];
  for (const rel of REBUILT_PAGES) {
    const src = read(rel);
    for (const re of FORBIDDEN_PHOSPHOR) {
      if (re.test(src)) {
        offenders.push(`${rel}: matches ${re}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `phosphor color literals found:\n${offenders.join("\n")}`,
  );
});

test("no rebuilt page uses rounded-{lg,xl,2xl,full} chrome", () => {
  const offenders: string[] = [];
  const re = /\brounded-(lg|xl|2xl|3xl|full)\b/g;
  for (const rel of REBUILT_PAGES) {
    const src = read(rel);
    const matches = src.match(re);
    if (matches) {
      offenders.push(`${rel}: ${Array.from(new Set(matches)).join(", ")}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `rounded chrome found on rebuilt pages:\n${offenders.join("\n")}`,
  );
});

test("no rebuilt page nests <main> (root layout already provides it)", () => {
  const offenders: string[] = [];
  const re = /<main\b/;
  for (const rel of REBUILT_PAGES) {
    const src = read(rel);
    if (re.test(src)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `nested <main> found in:\n${offenders.join("\n")}`,
  );
});

test("every rebuilt page declares exactly one <h1>", () => {
  const offenders: string[] = [];
  const re = /<h1\b/g;
  for (const rel of REBUILT_PAGES) {
    const src = read(rel);
    const count = (src.match(re) ?? []).length;
    if (count !== 1) {
      offenders.push(`${rel}: found ${count} <h1> tags (expected 1)`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `<h1> count mismatch:\n${offenders.join("\n")}`,
  );
});
