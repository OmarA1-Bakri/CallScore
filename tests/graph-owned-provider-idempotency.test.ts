import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { executeGraphOwnedProviderCall, providerExecutionReceiptId } from "../src/lib/workplane/node-wrappers/graph-owned-provider-adapter";

function installMcpFetch(
  responses: Array<{ successful: boolean; id?: string; error?: string }>,
  beforeProviderResponse?: (providerCallNumber: number) => void,
) {
  let providerCalls = 0;
  const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { status: 200, headers: { "mcp-session-id": "test-session" } });
    }
    if (body.method === "notifications/initialized") return new Response("", { status: 202 });
    if (body.method === "tools/list") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "COMPOSIO_MULTI_EXECUTE_TOOL" }] } }), { status: 200 });
    }
    if (body.method === "tools/call") {
      const response = responses[Math.min(providerCalls, responses.length - 1)]!;
      providerCalls += 1;
      beforeProviderResponse?.(providerCalls);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const toolResult = {
        data: {
          results: [{
            tool_slug: "TWITTER_CREATION_OF_A_POST",
            successful: response.successful,
            data: response.id ? { id: response.id } : undefined,
            error: response.error,
          }],
        },
      };
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: JSON.stringify(toolResult) }] },
      }), { status: 200 });
    }
    throw new Error(`unexpected method ${body.method}`);
  }) as typeof globalThis.fetch;
  return { fetch, providerCalls: () => providerCalls };
}

function withProviderEnvironment(root: string) {
  const previousRoot = process.env.CALLSCORE_APP_DIR;
  const previousKey = process.env.COMPOSIO_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.CALLSCORE_APP_DIR = root;
  process.env.COMPOSIO_API_KEY = "test-only";
  delete process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
  return () => {
    globalThis.fetch = previousFetch;
    if (previousRoot === undefined) delete process.env.CALLSCORE_APP_DIR; else process.env.CALLSCORE_APP_DIR = previousRoot;
    if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = previousKey;
    rmSync(root, { recursive: true, force: true });
  };
}

test("identical concurrent graph-owned provider calls execute the provider once", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-idempotency-"));
  const restore = withProviderEnvironment(root);
  const mcp = installMcpFetch([{ successful: true, id: "post-once" }]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "same reviewed payload" };
    const [first, second] = await Promise.all([
      executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload),
      executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload),
    ]);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.executionReceiptId, second.executionReceiptId);
    assert.equal(mcp.providerCalls(), 1);
  } finally {
    restore();
  }
});

test("a failed provider execution receipt does not permanently suppress a successful retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-retry-"));
  const restore = withProviderEnvironment(root);
  const mcp = installMcpFetch([
    { successful: false, error: "temporary provider failure" },
    { successful: true, id: "post-after-retry" },
  ]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "retry the reviewed payload" };
    const first = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    const second = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(first.ok, false);
    assert.equal(second.ok, true);
    assert.equal(mcp.providerCalls(), 2);
  } finally {
    restore();
  }
});

test("concurrent callers share an explicit non-mutation failure while a later invocation may retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-shared-failure-"));
  const restore = withProviderEnvironment(root);
  const mcp = installMcpFetch([
    { successful: false, error: "CreditsDepleted" },
    { successful: true, id: "post-after-shared-failure" },
  ]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "retry only after shared explicit failure" };
    const [first, waiter] = await Promise.all([
      executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload),
      executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload),
    ]);
    assert.equal(first.ok, false);
    assert.equal(waiter.ok, false);
    assert.equal(first.blockerCode, "blocked_rate_limit");
    assert.equal(waiter.blockerCode, "blocked_rate_limit");
    assert.equal(mcp.providerCalls(), 1);

    const retry = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(retry.ok, true);
    assert.equal(mcp.providerCalls(), 2);
  } finally {
    restore();
  }
});

test("a provider success whose receipt cannot be persisted leaves an immediate outcome-unknown tombstone", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-receipt-failure-"));
  const restore = withProviderEnvironment(root);
  const payload = { text: "do not repeat after receipt persistence fails" };
  const receiptId = providerExecutionReceiptId("TWITTER_CREATION_OF_A_POST", payload);
  const receiptRoot = join(root, ".tmp", "workflow-receipts", "provider_execution");
  const receiptPath = join(receiptRoot, `${receiptId}.json`);
  const claimPath = join(receiptRoot, `${receiptId}.claim`);
  const mcp = installMcpFetch([{ successful: true, id: "possibly-published" }], () => {
    mkdirSync(receiptPath);
  });
  globalThis.fetch = mcp.fetch;

  try {
    const first = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(first.ok, false);
    assert.equal(first.blockerCode, "provider_execution_outcome_unknown");
    assert.equal(first.mutationOutcome, "unknown");
    assert.equal(existsSync(claimPath), true);

    const second = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(second.ok, false);
    assert.equal(second.blockerCode, "provider_execution_outcome_unknown");
    assert.equal(mcp.providerCalls(), 1);
  } finally {
    restore();
  }
});

test("provider idempotency is isolated by connected account", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-account-scope-"));
  const restore = withProviderEnvironment(root);
  const previousAccount = process.env.COMPOSIO_TWITTER_CONNECTED_ACCOUNT_ID;
  const mcp = installMcpFetch([
    { successful: true, id: "account-a-post" },
    { successful: true, id: "account-b-post" },
  ]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "same payload for two distinct accounts" };
    process.env.COMPOSIO_TWITTER_CONNECTED_ACCOUNT_ID = "acct-A";
    const first = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    process.env.COMPOSIO_TWITTER_CONNECTED_ACCOUNT_ID = "acct-B";
    const second = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(first.executionReceiptId, second.executionReceiptId);
    assert.equal(mcp.providerCalls(), 2);
  } finally {
    if (previousAccount === undefined) delete process.env.COMPOSIO_TWITTER_CONNECTED_ACCOUNT_ID;
    else process.env.COMPOSIO_TWITTER_CONNECTED_ACCOUNT_ID = previousAccount;
    restore();
  }
});

test("provider idempotency is isolated by operating-graph workflow scope", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-workflow-scope-"));
  const restore = withProviderEnvironment(root);
  const mcp = installMcpFetch([
    { successful: true, id: "workflow-a-post" },
    { successful: true, id: "workflow-b-post" },
  ]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "intentional repeat in a distinct workflow" };
    const first = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload, { workflowId: "graph-run-A:publish" });
    const second = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload, { workflowId: "graph-run-B:publish" });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(first.executionReceiptId, second.executionReceiptId);
    assert.equal(mcp.providerCalls(), 2);
  } finally {
    restore();
  }
});

test("identical public-publish payloads are deduplicated across operating-graph workflow retries", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-public-global-dedupe-"));
  const restore = withProviderEnvironment(root);
  const mcp = installMcpFetch([{ successful: true, id: "one-public-post" }]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "same approved public payload" };
    const first = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload, {
      workflowId: "graph-run-A:x_owned_publish_node",
      dedupeAcrossWorkflows: true,
    });
    const retry = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload, {
      workflowId: "graph-run-B:x_owned_publish_node",
      dedupeAcrossWorkflows: true,
    });
    assert.equal(first.ok, true);
    assert.equal(retry.ok, true);
    assert.equal(first.executionReceiptId, retry.executionReceiptId);
    assert.equal(retry.reusedExistingExecution, true);
    assert.equal(mcp.providerCalls(), 1);
  } finally {
    restore();
  }
});

test("an ambiguous provider transport failure is not retried because the first mutation outcome is unknown", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-ambiguous-"));
  const restore = withProviderEnvironment(root);
  let providerCalls = 0;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { status: 200, headers: { "mcp-session-id": "test-session" } });
    if (body.method === "notifications/initialized") return new Response("", { status: 202 });
    if (body.method === "tools/list") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "COMPOSIO_MULTI_EXECUTE_TOOL" }] } }), { status: 200 });
    if (body.method === "tools/call") {
      providerCalls += 1;
      throw new Error("connection dropped after provider submission");
    }
    throw new Error(`unexpected method ${body.method}`);
  }) as typeof fetch;

  try {
    const payload = { text: "do not duplicate an ambiguous publish" };
    const first = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    const second = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(first.ok, false);
    assert.equal(second.ok, false);
    assert.equal(second.blockerCode, "provider_execution_outcome_unknown");
    assert.equal(second.mutationOutcome, "unknown");
    assert.equal(providerCalls, 1);
  } finally {
    restore();
  }
});

test("an old claim owned by a live process is not reclaimed", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-live-claim-"));
  const restore = withProviderEnvironment(root);
  const previousWaitMs = process.env.CALLSCORE_PROVIDER_EXECUTION_WAIT_MS;
  process.env.CALLSCORE_PROVIDER_EXECUTION_WAIT_MS = "20";
  const mcp = installMcpFetch([{ successful: true, id: "must-not-run" }]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "do not steal a live provider claim" };
    const receiptId = providerExecutionReceiptId("TWITTER_CREATION_OF_A_POST", payload);
    const receiptRoot = join(root, ".tmp", "workflow-receipts", "provider_execution");
    mkdirSync(receiptRoot, { recursive: true });
    const claimPath = join(receiptRoot, `${receiptId}.claim`);
    writeFileSync(claimPath, JSON.stringify({ pid: process.pid }));
    const staleTime = new Date(Date.now() - 11 * 60 * 1_000);
    utimesSync(claimPath, staleTime, staleTime);

    const result = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(result.ok, false);
    assert.equal(mcp.providerCalls(), 0);
  } finally {
    if (previousWaitMs === undefined) delete process.env.CALLSCORE_PROVIDER_EXECUTION_WAIT_MS; else process.env.CALLSCORE_PROVIDER_EXECUTION_WAIT_MS = previousWaitMs;
    restore();
  }
});

test("a stale provider execution claim is reclaimed instead of blocking forever", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-stale-claim-"));
  const restore = withProviderEnvironment(root);
  const mcp = installMcpFetch([{ successful: true, id: "post-after-stale-claim" }]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "recover a stale provider claim" };
    const receiptId = providerExecutionReceiptId("TWITTER_CREATION_OF_A_POST", payload);
    const receiptRoot = join(root, ".tmp", "workflow-receipts", "provider_execution");
    mkdirSync(receiptRoot, { recursive: true });
    const claimPath = join(receiptRoot, `${receiptId}.claim`);
    writeFileSync(claimPath, JSON.stringify({
      schema: "callscore.graph_owned_provider_execution_claim.v1",
      pid: 2_147_483_647,
      phase: "pre_provider",
    }));
    const staleTime = new Date(Date.now() - 11 * 60 * 1_000);
    utimesSync(claimPath, staleTime, staleTime);

    const result = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(result.ok, true);
    assert.equal(mcp.providerCalls(), 1);
  } finally {
    restore();
  }
});

test("a stale in-flight claim is fail-closed instead of risking a duplicate mutation", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-in-flight-claim-"));
  const restore = withProviderEnvironment(root);
  const previousWaitMs = process.env.CALLSCORE_PROVIDER_EXECUTION_WAIT_MS;
  process.env.CALLSCORE_PROVIDER_EXECUTION_WAIT_MS = "20";
  const mcp = installMcpFetch([{ successful: true, id: "must-not-duplicate" }]);
  globalThis.fetch = mcp.fetch;

  try {
    const payload = { text: "unknown in-flight mutation outcome" };
    const receiptId = providerExecutionReceiptId("TWITTER_CREATION_OF_A_POST", payload);
    const receiptRoot = join(root, ".tmp", "workflow-receipts", "provider_execution");
    mkdirSync(receiptRoot, { recursive: true });
    const claimPath = join(receiptRoot, `${receiptId}.claim`);
    writeFileSync(claimPath, JSON.stringify({
      schema: "callscore.graph_owned_provider_execution_claim.v1",
      pid: 2_147_483_647,
      phase: "provider_in_flight",
    }));
    const staleTime = new Date(Date.now() - 11 * 60 * 1_000);
    utimesSync(claimPath, staleTime, staleTime);

    const result = await executeGraphOwnedProviderCall("TWITTER_CREATION_OF_A_POST", payload);
    assert.equal(result.ok, false);
    assert.equal(result.blockerCode, "provider_execution_outcome_unknown");
    assert.equal(mcp.providerCalls(), 0);
  } finally {
    if (previousWaitMs === undefined) delete process.env.CALLSCORE_PROVIDER_EXECUTION_WAIT_MS; else process.env.CALLSCORE_PROVIDER_EXECUTION_WAIT_MS = previousWaitMs;
    restore();
  }
});

test("identical provider calls from separate processes share the filesystem claim", async () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-cross-process-"));
  let providerCalls = 0;
  const server = createServer((request, response) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", async () => {
      const body = JSON.parse(raw || "{}");
      response.setHeader("content-type", "application/json");
      if (body.method === "initialize") {
        response.setHeader("mcp-session-id", "cross-process-session");
        response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }));
        return;
      }
      if (body.method === "notifications/initialized") {
        response.statusCode = 202;
        response.end("");
        return;
      }
      if (body.method === "tools/list") {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "COMPOSIO_MULTI_EXECUTE_TOOL" }] } }));
        return;
      }
      if (body.method === "tools/call") {
        providerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 150));
        const toolResult = { data: { results: [{ tool_slug: "TWITTER_CREATION_OF_A_POST", successful: true, data: { id: "cross-process-post" } }] } };
        response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(toolResult) }] } }));
        return;
      }
      response.statusCode = 500;
      response.end(JSON.stringify({ error: `unexpected method ${body.method}` }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const childScript = [
    "import('./src/lib/workplane/node-wrappers/graph-owned-provider-adapter.ts')",
    ".then(async (m) => (m.default ?? m).executeGraphOwnedProviderCall('TWITTER_CREATION_OF_A_POST', {text:'cross-process reviewed payload'}))",
    ".then((result) => { console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 2; })",
    ".catch((error) => { console.error(error); process.exitCode = 3; });",
  ].join("");
  const runChild = () => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "-e", childScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CALLSCORE_APP_DIR: root,
        COMPOSIO_API_KEY: "test-only",
        COMPOSIO_MCP_URL: `http://127.0.0.1:${address.port}`,
        CALLSCORE_GRAPH_PROVIDER_TEST_MODE: "",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

  try {
    const [first, second] = await Promise.all([runChild(), runChild()]);
    assert.equal(first.code, 0, first.stderr || first.stdout);
    assert.equal(second.code, 0, second.stderr || second.stdout);
    assert.equal(providerCalls, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
