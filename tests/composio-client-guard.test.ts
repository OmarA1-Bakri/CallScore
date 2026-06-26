import * as assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ComposioHttpClient, assertComposioMutationGraphContext } from "../src/video/composio/composio-client";

const graphContext = {
  operating_graph_run_id: "graph-run-001",
  graph_node_id: "youtube_video_publish_node",
  goal: "produce_video",
  platform: "youtube",
  mutation_family: "video_publish",
  acting_agent_id: "callscore-youtube-publisher",
  authority: "owned_public_publish",
  approval_receipt_id: "approval-001",
  approved_payload_hash: "sha256:270635960c58ab98404c1da0bcaf7d03dda3d95b6a2d515457a3ef9bde2a69f9",
  evidence_receipt_id: "evidence-001",
  originality_receipt_id: "originality-001",
  dry_run: false,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Composio mutation slugs fail before HTTP without operating graph context", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  const client = new ComposioHttpClient({ apiKey: "test-key", baseUrl: "https://composio.invalid" });
  await assert.rejects(
    () => client.executeTool("YOUTUBE_UPDATE_VIDEO", { video_id: "yt-001", title: "unsafe" }),
    /non_graph_youtube_mutation_blocked|missing_operating_graph_context/,
  );
  assert.equal(called, false);
});

test("Composio read-only slugs remain callable without mutation graph context", async () => {
  let captured: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true, data: { items: [] } }), { status: 200 });
  }) as typeof fetch;

  const client = new ComposioHttpClient({ apiKey: "test-key", baseUrl: "https://composio.invalid" });
  const result = await client.executeTool("YOUTUBE_GET_VIDEO_DETAILS_BATCH", { id: ["yt-001"] });
  assert.deepEqual(result, { ok: true, data: { items: [] } });
  assert.deepEqual(captured, { id: ["yt-001"] });
});

test("Composio mutation slugs strip internal graph context before provider transport", async () => {
  let captured: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true, id: "yt-001" }), { status: 200 });
  }) as typeof fetch;

  const client = new ComposioHttpClient({ apiKey: "test-key", baseUrl: "https://composio.invalid" });
  await client.executeTool("YOUTUBE_UPDATE_VIDEO", {
    video_id: "yt-001",
    title: "safe",
    __callscore_graph_context: graphContext,
    __callscore_mode: "approved_publish",
  });

  assert.deepEqual(captured, { video_id: "yt-001", title: "safe" });
});

test("assertComposioMutationGraphContext can validate direct adapter calls without HTTP", () => {
  assert.throws(
    () => assertComposioMutationGraphContext("POSTHOG_CAPTURE_EVENT", { event: "unsafe" }),
    /non_graph_crm_write_blocked|missing_operating_graph_context/,
  );
  assert.deepEqual(
    assertComposioMutationGraphContext("YOUTUBE_LIST_CHANNELS", { mine: true }),
    { mine: true },
  );
});


test("TWITTER_CREATION_OF_A_POST is classified as a guarded mutation slug", () => {
  assert.throws(
    () => assertComposioMutationGraphContext("TWITTER_CREATION_OF_A_POST", { text: "unsafe" }),
    /non_graph_external_mutation_blocked|missing_operating_graph_context/,
  );
});

test("Composio mutation slugs are denied in dry_run even with graph context", () => {
  assert.throws(
    () => assertComposioMutationGraphContext("YOUTUBE_UPDATE_VIDEO", { video_id: "yt-001", title: "dry", __callscore_graph_context: graphContext, __callscore_mode: "dry_run" }),
    /non_graph_external_mutation_blocked/,
  );
});


test("raw caller graph_context is not accepted as Composio graph proof", () => {
  assert.throws(() => assertComposioMutationGraphContext("TWITTER_CREATION_OF_A_POST", {
    graph_context: graphContext,
    text: "hello graph",
  }), /missing_operating_graph_context|non_graph_external_mutation_blocked/);
});
