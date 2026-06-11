import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchHhCreator, getHhReadApiBase } from "../src/lib/hh-read-api";

const originalFetch = globalThis.fetch;
const originalBase = process.env.HH_READ_API_BASE;
const originalSecret = process.env.HH_READ_SECRET;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.HH_READ_API_BASE;
  else process.env.HH_READ_API_BASE = originalBase;
  if (originalSecret === undefined) delete process.env.HH_READ_SECRET;
  else process.env.HH_READ_SECRET = originalSecret;
});

test("getHhReadApiBase trims trailing slashes", () => {
  assert.equal(
    getHhReadApiBase({ HH_READ_API_BASE: "https://ops-bridge.call-score.com/api/read///" } as unknown as NodeJS.ProcessEnv),
    "https://ops-bridge.call-score.com/api/read",
  );
});

test("fetchHhCreator normalizes handles and passes period plus limit", async () => {
  process.env.HH_READ_API_BASE = "https://ops-bridge.call-score.com/api/read/";
  process.env.HH_READ_SECRET = "secret_test";

  let requestedPath = "";
  let requestedPeriod: string | null = null;
  let requestedLimit: string | null = null;
  let requestedAuth: string | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestedUrl = new URL(String(input));
    requestedPath = requestedUrl.pathname;
    requestedPeriod = requestedUrl.searchParams.get("period");
    requestedLimit = requestedUrl.searchParams.get("limit");
    requestedAuth = new Headers(init?.headers).get("Authorization");
    return new Response(JSON.stringify({
      ok: true,
      creator: { id: 93, name: "99Bitcoins", youtube_handle: "@99Bitcoins" },
      stats: null,
      calls: [],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const payload = await fetchHhCreator("@99Bitcoins", "all_time", 50);

  assert.equal(payload?.creator.name, "99Bitcoins");
  assert.equal(requestedPath, "/api/read/creator/99Bitcoins");
  assert.equal(requestedPeriod, "all_time");
  assert.equal(requestedLimit, "50");
  assert.equal(requestedAuth, "Bearer secret_test");
});

test("fetchHhCreator returns null when read API is unavailable", async () => {
  process.env.HH_READ_API_BASE = "https://ops-bridge.call-score.com/api/read";
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: false }), { status: 404 })) as typeof fetch;

  assert.equal(await fetchHhCreator("missing"), null);
});
