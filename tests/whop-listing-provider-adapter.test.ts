import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  executeGraphOwnedProviderCall,
  preflightGraphOwnedProviderCall,
} from "../src/lib/workplane/node-wrappers/graph-owned-provider-adapter";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

function approvedInput(payload: Record<string, unknown>) {
  return {
    mode: "approved_publish",
    approved: true,
    approval_receipt_id: "approval-whop-listing-001",
    provider_tool: "WHOP_UPDATE_APP",
    provider_payload: payload,
    graph_context: {
      operating_graph_run_id: "graph-run-whop-listing-001",
      graph_node_id: "whop_listing_update_node",
      goal: "revenue_now",
      platform: "whop",
      mutation_family: "whop_mutation",
      acting_agent_id: "callscore-whop-head",
      authority: "hard_gate",
      approval_receipt_id: "approval-whop-listing-001",
      approved_payload_hash: `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`,
      dry_run: false,
      parent_receipt_id: "approval-whop-listing-001",
    },
  };
}

test("Whop listing preflight allows only app copy fields", () => {
  const valid = {
    id: "app_cDfDRY1cj8yQJZ",
    description: "Verified crypto creator rankings based on public market-call evidence.",
    app_store_description: "CallScore compares public creator calls against observed market outcomes and publishes methodology-led scorecards.",
  };
  assert.deepEqual(preflightGraphOwnedProviderCall("whop_listing_update_node", approvedInput(valid)), { ok: true });

  for (const forbidden of [
    { ...valid, status: "live" },
    { ...valid, name: "Changed" },
    { ...valid, icon: { id: "file_unsafe" } },
    { ...valid, initial_price: 0 },
    { ...valid, product_id: "prod_unsafe" },
  ]) {
    assert.deepEqual(preflightGraphOwnedProviderCall("whop_listing_update_node", approvedInput(forbidden)), {
      ok: false,
      blockerCode: "forbidden_whop_listing_field",
    });
  }
});

test("graph-owned WHOP_UPDATE_APP uses a narrow direct Whop endpoint fallback and writes no forbidden fields", async () => {
  const previousFetch = globalThis.fetch;
  const previousWhopKey = process.env.WHOP_API_KEY;
  const previousTestMode = process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
  const previousAppDir = process.env.CALLSCORE_APP_DIR;
  const isolatedAppDir = mkdtempSync(join(tmpdir(), "callscore-whop-listing-test-"));
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.WHOP_API_KEY = "test-whop-key";
  delete process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
  process.env.CALLSCORE_APP_DIR = isolatedAppDir;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      id: "app_cDfDRY1cj8yQJZ",
      description: "Updated short description",
      app_store_description: "Updated long description explaining CallScore's public creator-call evidence, methodology, scorecards, and research limitations.",
      status: "live",
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await executeGraphOwnedProviderCall("WHOP_UPDATE_APP", {
      id: "app_cDfDRY1cj8yQJZ",
      description: "Updated short description",
      app_store_description: "Updated long description explaining CallScore's public creator-call evidence, methodology, scorecards, and research limitations.",
    });
    assert.equal(result.ok, true);
    assert.equal(result.response.id, "app_cDfDRY1cj8yQJZ");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.whop.com/api/v1/apps/app_cDfDRY1cj8yQJZ");
    assert.equal(calls[0]?.init?.method, "PATCH");
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.deepEqual(body, {
      description: "Updated short description",
      app_store_description: "Updated long description explaining CallScore's public creator-call evidence, methodology, scorecards, and research limitations.",
    });
    assert.equal("status" in body, false);
    assert.equal("id" in body, false);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-whop-key");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWhopKey === undefined) delete process.env.WHOP_API_KEY;
    else process.env.WHOP_API_KEY = previousWhopKey;
    if (previousTestMode === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
    else process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = previousTestMode;
    if (previousAppDir === undefined) delete process.env.CALLSCORE_APP_DIR;
    else process.env.CALLSCORE_APP_DIR = previousAppDir;
    rmSync(isolatedAppDir, { recursive: true, force: true });
  }
});
