import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

const apiContracts = [
  {
    surface: "Feedback form",
    file: "src/app/feedback/page.tsx",
    literal: "/api/feedback",
    route: "src/app/api/feedback/route.ts",
  },
  {
    surface: "Pro checkout CTA",
    file: "src/app/pricing/page.tsx",
    literal: "/api/checkout/pro",
    route: "src/app/api/checkout/[tier]/route.ts",
  },
  {
    surface: "Alpha checkout CTA",
    file: "src/app/pricing/page.tsx",
    literal: "/api/checkout/alpha",
    route: "src/app/api/checkout/[tier]/route.ts",
  },
  {
    surface: "Alert unsubscribe URL",
    file: "src/lib/unsubscribe-token.ts",
    literal: "/api/alerts/unsubscribe",
    route: "src/app/api/alerts/unsubscribe/route.ts",
  },
  {
    surface: "Account settings nav",
    file: "src/components/SettingsShell.tsx",
    literal: "/settings/account",
    route: "src/app/settings/account/page.tsx",
  },
  {
    surface: "Billing settings nav",
    file: "src/components/SettingsShell.tsx",
    literal: "/settings/billing",
    route: "src/app/settings/billing/page.tsx",
  },
  {
    surface: "Alert settings nav",
    file: "src/components/SettingsShell.tsx",
    literal: "/settings/alerts",
    route: "src/app/settings/alerts/page.tsx",
  },
  {
    surface: "API settings nav",
    file: "src/components/SettingsShell.tsx",
    literal: "/settings/api",
    route: "src/app/settings/api/page.tsx",
  },
  {
    surface: "Webhooks settings nav",
    file: "src/components/SettingsShell.tsx",
    literal: "/settings/webhooks",
    route: "src/app/settings/webhooks/page.tsx",
  },
  {
    surface: "CSV export CTA",
    file: "src/app/creator/[handle]/page.tsx",
    literal: "/api/export/calls",
    route: "src/app/api/export/calls/route.ts",
  },
  {
    surface: "API key settings form",
    file: "src/components/ApiKeyManager.tsx",
    literal: "/api/api-keys",
    route: "src/app/api/api-keys/route.ts",
  },
  {
    surface: "Webhook settings form",
    file: "src/components/WebhookManager.tsx",
    literal: "/api/webhooks",
    route: "src/app/api/webhooks/route.ts",
  },
  {
    surface: "Notifications settings nav",
    file: "src/components/SettingsShell.tsx",
    literal: "/settings/notifications",
    route: "src/app/settings/notifications/page.tsx",
  },
  {
    surface: "Team settings nav",
    file: "src/components/SettingsShell.tsx",
    literal: "/settings/team",
    route: "src/app/settings/team/page.tsx",
  },
] as const;

test("frontend API links have matching app routes", () => {
  for (const contract of apiContracts) {
    const source = readFileSync(join(root, contract.file), "utf8");

    assert.ok(
      source.includes(contract.literal),
      `${contract.surface} no longer references ${contract.literal}`,
    );
    assert.ok(
      existsSync(join(root, contract.route)),
      `${contract.surface} points at missing route ${contract.route}`,
    );
  }
});

test("Whop app-visible surfaces do not link to standalone auth routes", () => {
  for (const file of [
    "src/components/Header.tsx",
    "src/components/MobileMenu.tsx",
    "src/app/settings/account/page.tsx",
    "src/app/settings/billing/page.tsx",
    "src/app/settings/alerts/page.tsx",
    "src/app/settings/api/page.tsx",
    "src/app/settings/webhooks/page.tsx",
    "src/app/settings/notifications/page.tsx",
    "src/app/settings/team/page.tsx",
  ]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /\/api\/auth\/whop/, `${file} links to local Whop OAuth`);
    assert.doesNotMatch(source, /\/api\/auth\/logout/, `${file} links to local logout`);
  }
});

test("feedback surface and route stay aligned on evidence fields", () => {
  const pageSource = readFileSync(join(root, "src/app/feedback/page.tsx"), "utf8");
  const routeSource = readFileSync(join(root, "src/app/api/feedback/route.ts"), "utf8");

  assert.ok(pageSource.includes("Billing / Refund"));
  assert.ok(routeSource.includes("Billing / Refund"));
  assert.ok(pageSource.includes("issueType"));
  assert.ok(routeSource.includes("issueType"));
  assert.ok(routeSource.includes("composePersistedMessage"));
});

test("mutable API inputs use Zod safeParse validation", () => {
  const feedbackRoute = readFileSync(join(root, "src/app/api/feedback/route.ts"), "utf8");
  const backtestRoute = readFileSync(join(root, "src/app/api/backtest/route.ts"), "utf8");

  assert.match(feedbackRoute, /from ["']zod["']/);
  assert.match(feedbackRoute, /feedbackPayloadSchema\.safeParse/);
  assert.match(backtestRoute, /from ["']zod["']/);
  assert.match(backtestRoute, /portfolioQuerySchema\.safeParse/);
});

test("user-specific API routes opt out of shared caching", () => {
  for (const route of [
    "src/app/api/auth/session/route.ts",
    "src/app/api/api-keys/route.ts",
    "src/app/api/webhooks/route.ts",
    "src/app/api/alerts/list/route.ts",
    "src/app/api/alerts/watch/route.ts",
  ]) {
    const source = readFileSync(join(root, route), "utf8");
    assert.match(source, /force-dynamic|noStoreHeaders|cache-control": "no-store"|withNoStore/);
  }
});

const leaderboardMetaFields = [
  "total",
  "period",
  "period_token",
  "display_window_label",
  "min_public_scored_calls",
  "low_n_warning_calls",
  "sample_floor_label",
  "window_days",
  "window_start",
  "window_end",
  "latest_public_call_date",
  "freshness_notes",
  "gated_periods",
  "data_maturity_note",
] as const;

function assertLeaderboardMetadataContract(source: string): void {
  assert.match(source, /meta:\s*\{/);
  for (const field of leaderboardMetaFields) {
    assert.match(source, new RegExp(`${field}\\s*:`), `missing leaderboard meta.${field}`);
  }
  assert.match(source, /getLeaderboardSampleThreshold\(period\)/);
}

test("public leaderboard API route preserves post-PR24/PR25 metadata while excluding legacy polluted creators", () => {
  const source = readFileSync(join(root, "src/app/api/leaderboard/route.ts"), "utf8");
  assert.match(source, /data:\s*\{/);
  assert.match(source, /leaderboard/);
  assert.match(source, /updated_at/);
  assertLeaderboardMetadataContract(source);
  assert.match(source, /getLegacyCreatorExclusionSql\("c"\)/);
  assert.match(source, /AND \$\{legacyCreatorExclusionSql\}/);
});

test("v1 leaderboard API route preserves post-PR24/PR25 metadata while excluding legacy polluted creators", () => {
  const source = readFileSync(join(root, "src/app/api/v1/leaderboard/route.ts"), "utf8");
  assert.match(source, /data:\s*rows/);
  assertLeaderboardMetadataContract(source);
  assert.match(source, /getLegacyCreatorExclusionSql\("c"\)/);
  assert.match(source, /AND \$\{legacyCreatorExclusionSql\}/);
});

test("legacy Altcoin Daily exclusion remains wired to buyer-facing leaderboard routes", () => {
  const overrides = readFileSync(join(root, "src/lib/legacy-creator-overrides.ts"), "utf8");
  const publicRoute = readFileSync(join(root, "src/app/api/leaderboard/route.ts"), "utf8");
  const v1Route = readFileSync(join(root, "src/app/api/v1/leaderboard/route.ts"), "utf8");
  assert.match(overrides, /@AltcoinDaily/);
  assert.match(overrides, /excluded_pending_review/);
  for (const source of [publicRoute, v1Route]) {
    assertLeaderboardMetadataContract(source);
    assert.match(source, /getLegacyCreatorExclusionSql\("c"\)/);
    assert.match(source, /AND \$\{legacyCreatorExclusionSql\}/);
  }
});

test("leaderboard threshold helper remains available for route metadata and period-aware floors", () => {
  const source = readFileSync(join(root, "src/lib/leaderboard-eligibility.ts"), "utf8");
  assert.match(source, /export function getLeaderboardSampleThreshold/);
  assert.match(source, /min_public_scored_calls/);
  assert.match(source, /low_n_warning_calls/);
  assert.match(source, /sample_floor_label/);
});

test("public leaderboard API display ranks are sequential after public filtering", () => {
  const source = readFileSync(join(root, "src/app/api/leaderboard/route.ts"), "utf8");
  assert.match(source, /const rank = index \+ 1;/);
  assert.doesNotMatch(source, /const rank = row\.accuracy_rank \?\? index \+ 1;/);
});
