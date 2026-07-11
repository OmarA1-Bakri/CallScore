import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CALLSCORE_FUNNEL_EVENTS,
  analyticsDataset,
  capturePostHogEvent,
  parseAnalyticsProperties,
  postHogClientConfig,
} from "../src/lib/conversion-analytics";

const read = (path: string) => readFileSync(path, "utf8");

test("conversion funnel event registry is stable and complete", () => {
  assert.deepEqual(CALLSCORE_FUNNEL_EVENTS, [
    "landing_view",
    "leaderboard_view",
    "pricing_view",
    "checkout_started",
    "checkout_completed",
    "checkout_cancelled",
    "entitlement_activated",
    "paid_feature_used",
  ]);
});

test("PostHog client config fails closed without a project token", () => {
  assert.equal(postHogClientConfig({}), null);
  assert.deepEqual(
    postHogClientConfig({
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com/",
    }),
    {
      token: "phc_test",
      host: "https://eu.i.posthog.com",
    },
  );
});

test("analytics dataset serializes and parses bounded scalar properties", () => {
  const attrs = analyticsDataset("checkout_started", {
    tier: "pro",
    price: 19,
    annual: false,
    ignored: { nested: true },
  });
  assert.equal(attrs["data-analytics-event"], "checkout_started");
  assert.deepEqual(parseAnalyticsProperties(attrs["data-analytics-properties"]), {
    tier: "pro",
    price: 19,
    annual: false,
  });
  assert.deepEqual(parseAnalyticsProperties("not-json"), {});
});

test("PostHog ingestion emits a bounded event payload", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const response = await capturePostHogEvent(
    { token: "phc_test", host: "https://eu.i.posthog.com" },
    "checkout_started",
    "visitor-1",
    { tier: "pro", price: 19 },
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ status: "Ok" }), { status: 200 });
    },
  );
  assert.equal(response, true);
  assert.equal(calls[0]?.url, "https://eu.i.posthog.com/i/v0/e/");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    api_key: "phc_test",
    event: "checkout_started",
    properties: { distinct_id: "visitor-1", tier: "pro", price: 19 },
  });
});

test("client instrumentation is mounted and tracks delegated funnel interactions and views", () => {
  const source = read("src/instrumentation-client.ts");
  const bootstrap = read("src/components/ConversionAnalyticsBootstrap.tsx");
  const layout = read("src/app/layout.tsx");
  assert.match(bootstrap, /"use client"/);
  assert.match(bootstrap, /import "@\/instrumentation-client"/);
  assert.match(layout, /ConversionAnalyticsBootstrap/);
  assert.match(layout, /<ConversionAnalyticsBootstrap \/>/);
  assert.match(source, /capturePostHogEvent/);
  assert.match(source, /data-analytics-event/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /addEventListener\("click"/);
});

test("operating graph owns PostHog provider mutations through the real guarded wrapper", () => {
  const graph = read("src/lib/workplane/callscore-operating-graph.ts");
  assert.match(graph, /import \{ runPostHogWriteNode \} from "\.\/node-wrappers\/crm-analytics-nodes"/);
  assert.match(graph, /mode === "bounded_write"[\s\S]*\["posthog_write_node"\]/);
  assert.match(graph, /addNode\("posthog_write_node", graphOwnedMutationWrapperNode\("posthog_write_node", runPostHogWriteNode\)\)/);
});

test("pricing and checkout handoff pages emit funnel events", () => {
  const pricing = read("src/app/pricing/page.tsx");
  const success = read("src/app/checkout/success/page.tsx");
  const cancelled = read("src/app/checkout/cancelled/page.tsx");
  assert.match(pricing, /analyticsDataset\("pricing_view"/);
  assert.match(pricing, /analyticsDataset\("checkout_started", \{ tier: "pro"/);
  assert.match(pricing, /analyticsDataset\("checkout_started", \{ tier: "alpha"/);
  assert.match(success, /getCurrentTier/);
  assert.match(success, /tier !== "free"/);
  assert.match(success, /accessActive \? analyticsDataset\("checkout_completed"/);
  assert.match(cancelled, /analyticsDataset\("checkout_cancelled"/);
});
