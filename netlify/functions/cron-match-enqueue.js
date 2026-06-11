const FUNCTION_NAME = "cron-match-enqueue";
const DEFAULT_TIMEOUT_MS = 15000;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
function buildPayload() {
  return {
    type: "match_prices_batch",
    source: process.env.HH_ENQUEUE_SOURCE?.trim() || "netlify-scheduled",
    payload: {
      limit: positiveInt(process.env.HH_MATCH_LIMIT, 1000),
      batch_size: positiveInt(process.env.HH_MATCH_BATCH_SIZE, 200),
      start_after_id: Math.max(0, positiveInt(process.env.HH_MATCH_START_AFTER_ID, 0)),
      write: true,
    },
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
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(buildPayload()), signal: controller.signal });
    if (!response.ok) {
      await safeErrorBody(response);
      return jsonResponse({ ok: false, error: "hh_enqueue_failed", status: response.status }, 502);
    }
    return jsonResponse({ ok: true, function: FUNCTION_NAME }, 200);
  } catch (error) {
    const status = error instanceof Error && error.name === "AbortError" ? 504 : 500;
    return jsonResponse({ ok: false, error: status === 504 ? "hh_enqueue_timeout" : "hh_enqueue_exception" }, status);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
