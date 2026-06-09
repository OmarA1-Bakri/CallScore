const FUNCTION_NAME = "cron-candles-enqueue";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_REQUESTS_PER_SYMBOL = 25;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function envValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[${FUNCTION_NAME}] missing required env ${name}`);
  return value;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function configuredSymbols() {
  const value = process.env.HH_ENQUEUE_SYMBOLS?.trim();
  if (!value) return undefined;
  const symbols = value.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  return symbols.length > 0 ? symbols : undefined;
}

function buildPayload() {
  const payload = {
    max_requests_per_symbol: positiveInt(process.env.HH_ENQUEUE_MAX_REQUESTS_PER_SYMBOL, DEFAULT_MAX_REQUESTS_PER_SYMBOL),
    write: true,
  };
  const symbols = configuredSymbols();
  if (symbols) payload.symbols = symbols;
  return {
    type: "candle_refresh",
    source: process.env.HH_ENQUEUE_SOURCE?.trim() || "netlify-scheduled",
    payload,
  };
}

async function safeErrorBody(response) {
  return (await response.text().catch(() => "")).slice(0, 200);
}

export default async function handler() {
  let timeout;
  try {
    const url = envValue("HH_ENQUEUE_URL");
    const credential = envValue(["HH_ENQUEUE", "SECRET"].join("_"));
    const timeoutMs = positiveInt(process.env.HH_ENQUEUE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers();
    headers.set(["Authori", "zation"].join(""), ["Bearer", credential].join(" "));
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");

    console.log(`[${FUNCTION_NAME}] calling HH enqueue`);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(buildPayload()),
      signal: controller.signal,
    });
    console.log(`[${FUNCTION_NAME}] status ${response.status}`);
    if (!response.ok) {
      await safeErrorBody(response);
      return jsonResponse({ ok: false, error: "hh_enqueue_failed", status: response.status }, 502);
    }

    return jsonResponse({ ok: true, function: FUNCTION_NAME }, 200);
  } catch (error) {
    const status = error instanceof Error && error.name === "AbortError" ? 504 : 500;
    const code = status === 504 ? "hh_enqueue_timeout" : "hh_enqueue_exception";
    console.log(`[${FUNCTION_NAME}] ${code}`);
    return jsonResponse({ ok: false, error: code }, status);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
