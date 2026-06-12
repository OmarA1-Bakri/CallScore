import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  DEFAULT_PHASE,
  enqueueCandleRefreshJob,
  enqueueComputeScoresJob,
  enqueueMatchPricesBatchJob,
  enqueueNightlyMlVerifierJob,
  enqueueWorkplaneJob,
} from "../lib/pipeline";
import { getWorkplaneJobSpec, isWorkplaneJobType, WORKPLANE_JOB_TYPES, type WorkplaneJobType } from "../lib/workplane-jobs";

const HOST = process.env.HH_ENQUEUE_HOST || "127.0.0.1";
const PORT = Number(process.env.HH_ENQUEUE_PORT || "8788");
const PATH = "/internal/callscore/enqueue";

const MAX_BODY_BYTES = 8192;
const MAX_SYMBOLS = 25;
const MAX_REQUESTS_PER_SYMBOL = 25;
const MAX_MATCH_LIMIT = 10_000;
const MAX_MATCH_BATCH_SIZE = 1_000;
const MAX_ML_BATCH_SIZE = 1_000;

const SUPPORTED_TYPES = new Set([
  "candle_refresh",
  "match_prices_batch",
  "compute_scores",
  "ml_verifier_batch",
  ...WORKPLANE_JOB_TYPES,
]);

type Body = {
  type?: unknown;
  source?: unknown;
  payload?: Record<string, unknown>;
};

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    component: "callscore-enqueue",
    event,
    ...fields,
  }));
}

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function verifyAuth(req: IncomingMessage): boolean {
  const secret = process.env.HH_ENQUEUE_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === secret;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy(new Error("request_body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseSymbols(raw: unknown): readonly string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw new Error("payload.symbols must be an array");
  const symbols = raw.map((value) => {
    if (typeof value !== "string") throw new Error("payload.symbols must contain strings");
    const symbol = value.trim().toUpperCase();
    if (!/^[A-Z0-9:_-]{3,40}$/.test(symbol)) throw new Error("payload.symbols contains invalid symbol");
    return symbol;
  }).filter(Boolean);
  if (symbols.length === 0) throw new Error("payload.symbols must not be empty when provided");
  if (symbols.length > MAX_SYMBOLS) throw new Error("payload.symbols exceeds allowed size");
  return symbols;
}

function positiveInt(raw: unknown, fallback: number, max: number, name: string): number {
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  if (value > max) throw new Error(`${name} exceeds allowed maximum`);
  return value;
}

function nonNegativeInt(raw: unknown, fallback: number, max: number, name: string): number {
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  if (value > max) throw new Error(`${name} exceeds allowed maximum`);
  return value;
}

function sourceValue(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 80) : "unknown";
}

function validateWorkplanePayload(type: WorkplaneJobType, payload: Record<string, unknown>): void {
  const spec = getWorkplaneJobSpec(type);
  if (payload.write === true && !spec.production_db_writes_allowed) {
    throw new Error(`${type} is report-only and cannot write production state`);
  }
  if (payload.production_call_write === true || payload.write_production_calls === true) {
    throw new Error(`${type} cannot write production calls`);
  }
  if (payload.public_action === true || payload.publish === true || payload.send === true || payload.spend === true) {
    throw new Error(`${type} requires explicit approval for public/provider/spend action`);
  }
  if (payload.provider_mutation === true || payload.pricing_mutation === true || payload.payment_mutation === true || payload.entitlement_mutation === true) {
    throw new Error(`${type} requires explicit approval for provider/customer mutation`);
  }

  const limit = positiveInt(payload.limit, spec.max_batch_size, Math.max(spec.max_batch_size, 1), "payload.limit");
  if (type === "transcript_collect_laptop" && limit > 5 && payload.allow_large_batch !== true) {
    throw new Error("transcript_collect_laptop limit >5 requires payload.allow_large_batch=true");
  }
}

function validate(body: Body): {
  type: "candle_refresh" | "match_prices_batch" | "compute_scores" | "ml_verifier_batch" | WorkplaneJobType;
  source: string;
  payload: Record<string, unknown>;
} {
  if (typeof body.type !== "string" || !SUPPORTED_TYPES.has(body.type)) {
    throw new Error("unsupported job type");
  }
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
  if (isWorkplaneJobType(body.type)) validateWorkplanePayload(body.type, payload);
  if (!isWorkplaneJobType(body.type) && payload.write !== undefined && payload.write !== true) {
    throw new Error("payload.write must be true when provided");
  }
  return {
    type: body.type as "candle_refresh" | "match_prices_batch" | "compute_scores" | "ml_verifier_batch" | WorkplaneJobType,
    source: sourceValue(body.source),
    payload,
  };
}

async function enqueue(validated: ReturnType<typeof validate>) {
  if (validated.type === "candle_refresh") {
    return enqueueCandleRefreshJob({
      symbols: parseSymbols(validated.payload.symbols),
      maxRequestsPerSymbol: positiveInt(
        validated.payload.max_requests_per_symbol,
        25,
        MAX_REQUESTS_PER_SYMBOL,
        "payload.max_requests_per_symbol",
      ),
    });
  }
  if (validated.type === "match_prices_batch") {
    return enqueueMatchPricesBatchJob({
      limit: positiveInt(validated.payload.limit, 1_000, MAX_MATCH_LIMIT, "payload.limit"),
      batchSize: positiveInt(validated.payload.batch_size, 200, MAX_MATCH_BATCH_SIZE, "payload.batch_size"),
      startAfterId: nonNegativeInt(validated.payload.start_after_id, 0, Number.MAX_SAFE_INTEGER, "payload.start_after_id"),
    });
  }
  if (validated.type === "compute_scores") {
    return enqueueComputeScoresJob();
  }
  if (isWorkplaneJobType(validated.type)) {
    return enqueueWorkplaneJob({
      type: validated.type,
      payload: validated.payload,
    });
  }
  return enqueueNightlyMlVerifierJob({
    batchSize: positiveInt(validated.payload.batch_size, 250, MAX_ML_BATCH_SIZE, "payload.batch_size"),
  });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (!verifyAuth(req)) {
    log("unauthorized", { remote: req.socket.remoteAddress });
    json(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  let raw = "";
  try {
    raw = await readBody(req);
  } catch {
    json(res, 413, { ok: false, error: "request_body_too_large" });
    return;
  }

  let parsed: Body;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    json(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  let validated: ReturnType<typeof validate>;
  try {
    validated = validate(parsed);
  } catch (error) {
    json(res, 400, { ok: false, error: error instanceof Error ? error.message : "invalid_payload" });
    return;
  }

  try {
    const { run, job } = await enqueue(validated);
    log("enqueued", {
      source: validated.source,
      run_id: run.id,
      run_key: run.run_key,
      job_id: job.id,
      job_type: job.type,
      job_status: job.status,
    });
    json(res, 200, {
      ok: true,
      phase: job.phase ?? DEFAULT_PHASE,
      run: { id: run.id, run_key: run.run_key, type: run.type, status: run.status },
      job: { id: job.id, type: job.type, status: job.status },
    });
  } catch (error) {
    log("enqueue_error", { message: error instanceof Error ? error.message : String(error) });
    json(res, 500, { ok: false, error: "enqueue_failed" });
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (req.method === "GET" && url.pathname === "/healthz") {
    json(res, 200, { ok: true, service: "callscore-enqueue", supported_types: Array.from(SUPPORTED_TYPES) });
    return;
  }
  if (url.pathname !== PATH) {
    json(res, 404, { ok: false, error: "not_found" });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  void handle(req, res);
});

server.listen(PORT, HOST, () => {
  log("server_start", { host: HOST, port: PORT, path: PATH, supported_types: Array.from(SUPPORTED_TYPES) });
});
