import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("/pricing points paid CTAs at valid checkout tiers", () => {
  const pricingPage = readFileSync(
    resolve(process.cwd(), "src/app/pricing/page.tsx"),
    "utf8",
  );

  assert.match(pricingPage, /ctaHref="\/api\/checkout\/pro"/);
  assert.match(pricingPage, /ctaHref="\/api\/checkout\/alpha"/);
  assert.doesNotMatch(pricingPage, /ctaHref="\/api\/checkout\/elite"/);
});
