// Cross-cutting page-level guardrails for Phase 3 page rebuilds.
//
// SCOPE: only rebuilt routes are covered (Option A allowlist). The
// un-rebuilt routes /privacy and /terms are explicitly OUT OF SCOPE
// and intentionally excluded. Add routes here as they are rebuilt
// so legacy chrome cannot quietly return.
//
// When a route is rebuilt, append its page.tsx path to REBUILT_PAGES below
// so it inherits these guardrails automatically.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { read, root, FORBIDDEN_PHOSPHOR } from "./page-helpers";

const REBUILT_PAGES: readonly string[] = [
  "src/app/page.tsx",
  "src/app/about/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/alerts/page.tsx",
  "src/app/webhooks/page.tsx",
  "src/app/methodology/page.tsx",
  "src/app/feedback/page.tsx",
  "src/app/creator/[handle]/page.tsx",
  "src/app/creator/[handle]/backtest/page.tsx",
  "src/app/call/[id]/page.tsx",
  "src/app/dashboard/[companyId]/page.tsx",
  "src/app/settings/account/page.tsx",
  "src/app/settings/billing/page.tsx",
  "src/app/settings/notifications/page.tsx",
  "src/app/settings/team/page.tsx",
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

test("rebuilt pages only use 2px inline border radius", () => {
  const offenders: string[] = [];
  const re = /borderRadius:\s*(\d+(?:\.\d+)?)/g;
  for (const rel of REBUILT_PAGES) {
    const src = read(rel);
    let match: RegExpExecArray | null;
    while ((match = re.exec(src)) !== null) {
      if (Number(match[1]) !== 2) {
        offenders.push(`${rel}: borderRadius ${match[1]}`);
      }
    }
    re.lastIndex = 0;
  }
  assert.deepEqual(
    offenders,
    [],
    `non-2px inline border radius found on rebuilt pages:\n${offenders.join("\n")}`,
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
    const usesSettingsShell = src.includes("<SettingsShell");
    const valid = usesSettingsShell ? count === 0 : count === 1;
    if (!valid) {
      offenders.push(`${rel}: found ${count} <h1> tags (expected 1)`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `<h1> count mismatch:\n${offenders.join("\n")}`,
  );
});

test("SettingsShell owns a single shared settings <h1>", () => {
  const src = read("src/components/SettingsShell.tsx");
  const count = (src.match(/<h1\b/g) ?? []).length;
  assert.equal(count, 1, `SettingsShell should declare exactly one <h1>, found ${count}`);
});

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(absolute));
    } else if (/\.(tsx|ts)$/.test(entry)) {
      files.push(absolute);
    }
  }
  return files;
}

test("inline accent links use persistent underline cues", () => {
  const offenders: string[] = [];
  const re = /text-accent\s+hover:underline|hover:underline\s+underline-offset-4/g;
  for (const absolute of [
    ...collectSourceFiles(join(root, "src/app")),
    ...collectSourceFiles(join(root, "src/components")),
  ]) {
    const rel = relative(root, absolute).replaceAll("\\", "/");
    const src = read(rel);
    const matches = src.match(re);
    if (matches) {
      offenders.push(`${rel}: ${Array.from(new Set(matches)).join(", ")}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `accent links must not rely on hover-only underline:\n${offenders.join("\n")}`,
  );
});

test("backtest creator search preserves selected creators outside the filtered list", () => {
  const src = read("src/app/backtest/page.tsx");
  assert.match(src, /hiddenSelectedIds/);
  assert.match(src, /type="hidden"\s+name="creator"/);
});

test("backtest lab exposes selection summary and URL-based scenario actions", () => {
  const src = read("src/app/backtest/page.tsx");
  assert.match(src, /Selected creators/);
  assert.match(src, /Reset defaults/);
  assert.match(src, /Share scenario URL/);
  assert.match(src, /Export JSON/);
});

test("backtest charts use explicit portfolio and benchmark labels", () => {
  const src = read("src/components/BacktestLabCharts.tsx");
  assert.match(src, /Portfolio equity vs/);
  assert.match(src, /Top creator contribution/);
  assert.match(src, /Monthly edge vs benchmark/);
});

test("home page does not import recharts-backed chart components", () => {
  const src = read("src/app/page.tsx");
  assert.doesNotMatch(src, /BacktestLabCharts|PerformanceChart|recharts/);
});

test("dashboard page keeps the Next 15 async params contract", () => {
  const src = read("src/app/dashboard/[companyId]/page.tsx");
  assert.match(src, /readonly params:\s*Promise<\{\s*readonly companyId: string;\s*\}>;/s);
  assert.match(src, /const \{ companyId \} = await params;/);
});

test("settings pages keep the Next 15 async searchParams contract", () => {
  for (const rel of [
    "src/app/settings/alerts/page.tsx",
    "src/app/settings/webhooks/page.tsx",
  ]) {
    const src = read(rel);
    assert.match(src, /readonly searchParams\?:\s*Promise<\{/);
    assert.match(src, /const searchParams = await searchParamsPromise;/);
  }
});

test("public leaderboard/profile/call pages use live data instead of mock data", () => {
  for (const rel of [
    "src/app/page.tsx",
    "src/app/creator/[handle]/page.tsx",
    "src/app/call/[id]/page.tsx",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /@\/lib\/mock-data|MOCK_/);
    assert.match(src, /@\/lib\/db|findCreatorByHandle/);
  }
});

test("feedback page supports context hinting and minimal evidence-logged success copy", () => {
  const src = read("src/app/feedback/page.tsx");
  assert.match(src, /URLSearchParams/);
  assert.match(src, /searchParams\.get\("context"\)/);
  assert.match(src, /Billing \/ Refund/);
  assert.match(src, /Evidence logged\./);
  assert.doesNotMatch(src, /Reports with source links or page context are checked first/);
});

test("alerts settings uses searchable creator picker instead of raw id add form", () => {
  const src = read("src/app/settings/alerts/page.tsx");
  assert.match(src, /Creator picker/);
  assert.match(src, /name="q"/);
  assert.match(src, /Search name or handle/);
  assert.match(src, /Delivery rules/);
  assert.match(src, /Alert events/);
  assert.match(src, /Anti-consensus preview/);
  assert.match(src, /Recent alert queue/);
  assert.doesNotMatch(src, />\s*Creator id\s*</);
});

test("settings shell exposes shared action slots and plan badge", () => {
  const src = read("src/components/SettingsShell.tsx");
  assert.match(src, /primaryAction/);
  assert.match(src, /secondaryAction/);
  assert.match(src, /Plan <span/);
});

test("Whop dashboard view renders directly instead of redirecting", () => {
  const src = read("src/app/dashboard/[companyId]/page.tsx");
  assert.doesNotMatch(src, /redirect\(/);
  assert.match(src, /Whop dashboard view/);
  assert.match(src, /companyId/);
});

function getLinkBlockForLabel(src = "", label = "") {
  const blocks = Array.from(src.matchAll(/<Link[\s\S]*?<\/Link>/g))
    .map((match) => match[0])
    .filter((block) => new RegExp(`>\\s*${label}\\s*<`).test(block));
  assert.equal(blocks.length, 1, `expected one ${label} public nav link, found ${blocks.length}`);
  return blocks[0];
}

test("desktop public nav sends Alerts and Webhooks to product pages", () => {
  const src = read("src/components/Header.tsx");
  const alerts = getLinkBlockForLabel(src, "ALERTS");
  const webhooks = getLinkBlockForLabel(src, "WEBHOOKS");

  assert.match(alerts, /href="\/alerts"/);
  assert.doesNotMatch(alerts, /href="\/settings\/alerts"/);
  assert.match(webhooks, /href="\/webhooks"/);
  assert.doesNotMatch(webhooks, /href="\/settings\/webhooks"/);
});

test("mobile public nav sends Alerts and Webhooks to product pages", () => {
  const src = read("src/components/MobileMenu.tsx");
  const alerts = getLinkBlockForLabel(src, "ALERTS");
  const webhooks = getLinkBlockForLabel(src, "WEBHOOKS");

  assert.match(alerts, /href="\/alerts"/);
  assert.doesNotMatch(alerts, /href="\/settings\/alerts"/);
  assert.match(webhooks, /href="\/webhooks"/);
  assert.doesNotMatch(webhooks, /href="\/settings\/webhooks"/);
});
