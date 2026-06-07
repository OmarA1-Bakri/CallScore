import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

test("checkout success page confirms active Pro access and routes buyer back into CallScore", () => {
  const src = read("src/app/checkout/success/page.tsx");

  assert.match(src, /Your CallScore Pro access is active\./);
  assert.match(src, /You can manage or cancel billing from Whop at any time\./);
  assert.match(src, /href="\/"/);
  assert.match(src, /href="\/settings\/billing"/);
  assert.match(src, /href="\/alerts"/);
  assert.match(src, /href="\/api\/auth\/whop"/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /POST|PATCH|PUT|DELETE/);
});

test("checkout cancelled page keeps buyer in CallScore with billing and support options", () => {
  const src = read("src/app/checkout/cancelled/page.tsx");

  assert.match(src, /Checkout cancelled\./);
  assert.match(src, /No CallScore subscription was changed from this page\./);
  assert.match(src, /href="\/pricing"/);
  assert.match(src, /href="\/settings\/billing"/);
  assert.match(src, /href="\/feedback\?context=checkout-cancelled"/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /POST|PATCH|PUT|DELETE/);
});

test("billing settings exposes cancellation clarity without pretending CallScore owns billing", () => {
  const src = read("src/app/settings/billing/page.tsx");

  assert.match(src, /You can manage or cancel billing from Whop at any time\./);
  assert.match(src, /Open Whop billing/);
  assert.match(src, /href="https:\/\/whop\.com\/hub"/);
  assert.match(src, /href="\/checkout\/success"/);
  assert.doesNotMatch(src, /\/api\/billing/);
  assert.doesNotMatch(src, /cancelSubscription|createSubscription|updateSubscription/);
});

test("pricing checkout copy sets post-purchase expectation before sending buyer to Whop", () => {
  const src = read("src/app/pricing/page.tsx");

  assert.match(src, /After checkout, return to CallScore to confirm access and manage billing from Whop\./);
  assert.match(src, /href="\/checkout\/success"/);
  assert.match(src, /href="\/checkout\/cancelled"/);
  assert.match(src, /href="\/settings\/billing"/);
});

test("checkout redirect checklist documents canonical URLs without guessing provider params", () => {
  const src = read("docs/checkout-return-cancel-checklist.md");

  assert.match(src, /https:\/\/call-score\.com\/checkout\/success/);
  assert.match(src, /https:\/\/call-score\.com\/checkout\/cancelled/);
  assert.match(src, /does not append guessed provider parameters/);
  assert.match(src, /Whop dashboard field names \/ checkout URL parameters must be verified/);
  assert.match(src, /Keep `https:\/\/call-score\.netlify\.app` only for infrastructure\/provider fallback paths/);
});
