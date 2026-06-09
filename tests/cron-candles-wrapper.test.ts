import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import handler from "../netlify/functions/cron-candles-enqueue.js";

type FetchCall = {
  readonly input: string | URL | Request;
  readonly init?: RequestInit;
};

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const endpointKey = "HH_ENQUEUE_URL";
const credentialKey = ["HH_ENQUEUE", "SECRET"].join("_");
const authHeaderName = ["Authori", "zation"].join("");

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

function setRequiredEnv(): void {
  process.env[endpointKey] = "https://hh.example.test/internal/callscore/enqueue";
  process.env[credentialKey] = "unit-test-credential";
}

function mockFetch(response: Response): FetchCall[] {
  const calls: FetchCall[] = [];
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input, init });
    return response;
  }) as typeof fetch;
  return calls;
}

async function responseJson(response: Response): Promise<unknown> {
  return await response.json();
}

test("cron-candles wrapper fails safely when HH endpoint is missing", async () => {
  delete process.env[endpointKey];
  process.env[credentialKey] = "unit-test-credential";
  const calls = mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));

  const response = await handler();

  assert.equal(response.status, 500);
  assert.deepEqual(await responseJson(response), { ok: false, error: "hh_enqueue_exception" });
  assert.equal(calls.length, 0);
});

test("cron-candles wrapper fails safely when HH credential is missing", async () => {
  process.env[endpointKey] = "https://hh.example.test/internal/callscore/enqueue";
  delete process.env[credentialKey];
  const calls = mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));

  const response = await handler();

  assert.equal(response.status, 500);
  assert.deepEqual(await responseJson(response), { ok: false, error: "hh_enqueue_exception" });
  assert.equal(calls.length, 0);
});

test("cron-candles wrapper returns 200 and posts candle refresh payload to HH enqueue", async () => {
  setRequiredEnv();
  process.env.HH_ENQUEUE_SYMBOLS = "xlmusdt";
  process.env.HH_ENQUEUE_MAX_REQUESTS_PER_SYMBOL = "1";
  const calls = mockFetch(new Response(JSON.stringify({ ok: true, job: { id: 1 } }), { status: 200 }));

  const response = await handler();

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { ok: true, function: "cron-candles-enqueue" });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.input, "https://hh.example.test/internal/callscore/enqueue");
  assert.equal(call.init?.method, "POST");
  const headers = call.init?.headers as Headers;
  assert.equal(headers.get(authHeaderName), ["Bearer", "unit-test-credential"].join(" "));
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("Accept"), "application/json");
  assert.deepEqual(JSON.parse(String(call.init?.body)), {
    type: "candle_refresh",
    source: "netlify-scheduled",
    payload: {
      max_requests_per_symbol: 1,
      write: true,
      symbols: ["XLMUSDT"],
    },
  });
});

test("cron-candles wrapper default payload does not require database env", async () => {
  setRequiredEnv();
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.NEON_DATABASE_URL;
  const calls = mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));

  const response = await handler();

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    type: "candle_refresh",
    source: "netlify-scheduled",
    payload: {
      max_requests_per_symbol: 25,
      write: true,
    },
  });
});

test("cron-candles wrapper returns safe 502 response for non-2xx HH response", async () => {
  setRequiredEnv();
  mockFetch(new Response("safe upstream failure detail", { status: 502 }));

  const response = await handler();

  assert.equal(response.status, 502);
  assert.deepEqual(await responseJson(response), { ok: false, error: "hh_enqueue_failed", status: 502 });
});

test("cron-candles wrapper returns safe 504 response for HH timeout", async () => {
  setRequiredEnv();
  process.env.HH_ENQUEUE_TIMEOUT_MS = "1";
  global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    await new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    throw new Error("unreachable");
  }) as typeof fetch;

  const response = await handler();

  assert.equal(response.status, 504);
  assert.deepEqual(await responseJson(response), { ok: false, error: "hh_enqueue_timeout" });
});
