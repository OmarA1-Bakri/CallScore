import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

const apiContracts = [
  {
    surface: "Header sign-in",
    file: "src/components/Header.tsx",
    literal: "/api/auth/whop",
    route: "src/app/api/auth/whop/route.ts",
  },
  {
    surface: "Header logout",
    file: "src/components/Header.tsx",
    literal: "/api/auth/logout",
    route: "src/app/api/auth/logout/route.ts",
  },
  {
    surface: "Mobile sign-in",
    file: "src/components/MobileMenu.tsx",
    literal: "/api/auth/whop",
    route: "src/app/api/auth/whop/route.ts",
  },
  {
    surface: "Mobile logout",
    file: "src/components/MobileMenu.tsx",
    literal: "/api/auth/logout",
    route: "src/app/api/auth/logout/route.ts",
  },
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
    surface: "Alert settings nav",
    file: "src/components/Header.tsx",
    literal: "/settings/alerts",
    route: "src/app/settings/alerts/page.tsx",
  },
  {
    surface: "API settings nav",
    file: "src/components/Header.tsx",
    literal: "/settings/api",
    route: "src/app/settings/api/page.tsx",
  },
  {
    surface: "CSV export CTA",
    file: "src/app/creator/[handle]/page.tsx",
    literal: "/api/export/calls",
    route: "src/app/api/export/calls/route.ts",
  },
  {
    surface: "API key settings form",
    file: "src/app/settings/api/page.tsx",
    literal: "/api/api-keys",
    route: "src/app/api/api-keys/route.ts",
  },
  {
    surface: "Webhook settings form",
    file: "src/app/settings/webhooks/page.tsx",
    literal: "/api/webhooks",
    route: "src/app/api/webhooks/route.ts",
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
