import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getUserTier } from "../src/lib/whop-access";

const ENV_KEYS = [
  "WHOP_API_KEY",
  "WHOP_API_BASE_URL",
  "WHOP_PRO_PLAN_ID",
  "WHOP_ALPHA_PLAN_ID",
  "WHOP_ELITE_PLAN_ID",
  "WHOP_PRO_PRODUCT_ID",
  "WHOP_ALPHA_PRODUCT_ID",
  "WHOP_ELITE_PRODUCT_ID",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
});

function installAccessFetch(access: Record<string, boolean>) {
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    const resourceId = decodeURIComponent(url.split("/").pop() ?? "");
    return new Response(
      JSON.stringify({
        has_access: Boolean(access[resourceId]),
        access_level: access[resourceId] ? "customer" : "no_access",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return seen;
}

test("getUserTier checks Whop product IDs before legacy plan IDs", async () => {
  process.env.WHOP_API_KEY = "whop_test";
  process.env.WHOP_API_BASE_URL = "https://api.whop.test/api/v1";
  process.env.WHOP_PRO_PRODUCT_ID = "prod_pro";
  process.env.WHOP_PRO_PLAN_ID = "plan_pro_legacy";
  process.env.WHOP_ALPHA_PRODUCT_ID = "prod_alpha";
  process.env.WHOP_ALPHA_PLAN_ID = "plan_alpha_legacy";

  const seen = installAccessFetch({ prod_pro: true });

  assert.equal(await getUserTier(null, "user_test"), "pro");
  assert.deepEqual(
    seen.map((url) => url.replace(/^https:\/\/api\.whop\.test\/api\/v1\/users\/user_test\/access\//, "")),
    ["prod_alpha", "prod_pro"],
  );
});

test("getUserTier returns alpha when product access is granted", async () => {
  process.env.WHOP_API_KEY = "whop_test";
  process.env.WHOP_API_BASE_URL = "https://api.whop.test/api/v1";
  process.env.WHOP_PRO_PRODUCT_ID = "prod_pro";
  process.env.WHOP_ALPHA_PRODUCT_ID = "prod_alpha";

  installAccessFetch({ prod_alpha: true, prod_pro: true });

  assert.equal(await getUserTier(null, "user_test"), "alpha");
});

test("getUserTier keeps legacy plan fallback only when product IDs are absent", async () => {
  process.env.WHOP_API_KEY = "whop_test";
  process.env.WHOP_API_BASE_URL = "https://api.whop.test/api/v1";
  delete process.env.WHOP_PRO_PRODUCT_ID;
  delete process.env.WHOP_ALPHA_PRODUCT_ID;
  delete process.env.WHOP_ELITE_PRODUCT_ID;
  process.env.WHOP_PRO_PLAN_ID = "plan_pro_legacy";
  process.env.WHOP_ALPHA_PLAN_ID = "plan_alpha_legacy";

  const seen = installAccessFetch({ plan_pro_legacy: true });

  assert.equal(await getUserTier(null, "user_test"), "pro");
  assert.deepEqual(
    seen.map((url) => url.replace(/^https:\/\/api\.whop\.test\/api\/v1\/users\/user_test\/access\//, "")),
    ["plan_alpha_legacy", "plan_pro_legacy"],
  );
});

test("getUserTier denies free/no-access users", async () => {
  process.env.WHOP_API_KEY = "whop_test";
  process.env.WHOP_API_BASE_URL = "https://api.whop.test/api/v1";
  process.env.WHOP_PRO_PRODUCT_ID = "prod_pro";
  process.env.WHOP_ALPHA_PRODUCT_ID = "prod_alpha";

  installAccessFetch({});

  assert.equal(await getUserTier(null, "user_test"), "free");
});
