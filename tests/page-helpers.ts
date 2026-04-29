// Shared helpers for Phase 3 page-rebuild guardrail tests.
// Imported by tests/page-*-shape.test.ts and tests/pages-cross-cutting.test.ts.
//
// IMPORTANT: this file has NO `test()` calls so the npm test glob
// (`tests/**/*.test.ts`) does not match it — `page-helpers.ts` lacks the
// `.test.ts` suffix. Do not add `test()` calls here; if you need helpers
// tested, put them in their own `*.test.ts` file.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const root = join(__dirname, "..");

export function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

// SUPERSEDED B Terminal phosphor-green direction. Plans /about and /pricing
// rebuilds remove these literals; cross-cutting guardrail enforces it.
export const FORBIDDEN_PHOSPHOR: readonly RegExp[] = [
  /#0B0F0E/i,
  /#121815/i,
  /#3FD67A/i,
  /#5B6B63/i,
  /#C8D3CA/i,
];

// Tailwind chrome banned by the editorial spec. Pages must use square or
// 2px-rounded surfaces only.
export const FORBIDDEN_ROUNDED = /\brounded-(lg|xl|2xl|3xl|full)\b/g;

// Gradient stops banned. Tightened to match Tailwind color-stop patterns
// only (avoid false-positives on `auto-`, `tracking-`, etc.).
export const FORBIDDEN_GRADIENT =
  /\bbg-gradient-|\b(from|to|via)-(black|white|transparent|current|inherit|[a-z]+-\d{2,3})\b/g;
