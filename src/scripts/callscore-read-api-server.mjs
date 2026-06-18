import { createServer } from "node:http";
import pg from "pg";
import {
  isExcludedCreator,
  publicEligibleCallsWhereSql,
  publicVisibleCallsWhereSql,
  toReadApiLeaderboardContract,
} from "../lib/leaderboard-safety.mjs";

const { Pool } = pg;

const HOST = process.env.HH_READ_API_HOST || "127.0.0.1";
const PORT = Number(process.env.HH_READ_API_PORT || "8789");
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DB_URL) {
  throw new Error("DATABASE_URL/POSTGRES_URL missing");
}

const pool = new Pool({ connectionString: DB_URL });

function log(event, fields = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    component: "callscore-read-api",
    event,
    ...fields,
  }));
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.setHeader("access-control-allow-origin", "https://call-score.com");
  res.setHeader("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.end(JSON.stringify(body));
}

function parsePeriod(url) {
  const period = url.searchParams.get("period") || "12m";
  return ["all_time", "12m", "90d", "30d"].includes(period) ? period : "12m";
}

function parseLimit(url, fallback, max) {
  const raw = Number(url.searchParams.get("limit") || fallback);
  if (!Number.isInteger(raw) || raw <= 0) return fallback;
  return Math.min(raw, max);
}

function normalizeHandle(raw) {
  return decodeURIComponent(raw || "").trim().replace(/^@+/, "");
}

function sumBucketCalls(rows) {
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.total_calls || 0)), 0);
}

function limitLeaderboardContract(contract, limit) {
  const limited = {
    ...contract,
    officialRankedRows: contract.officialRankedRows.slice(0, limit),
    provisionalRows: contract.provisionalRows.slice(0, limit),
    watchlistRows: contract.watchlistRows.slice(0, limit),
    staleRows: contract.staleRows.slice(0, limit),
    excludedRows: contract.excludedRows.slice(0, limit),
    pendingMaturityRows: contract.pendingMaturityRows.slice(0, limit),
  };

  limited.counts = {
    publicEligibleCalls: sumBucketCalls([
      ...limited.officialRankedRows,
      ...limited.provisionalRows,
      ...limited.watchlistRows,
      ...limited.staleRows,
      ...limited.pendingMaturityRows,
    ]),
    officialRankedCreators: limited.officialRankedRows.length,
    provisionalCreators: limited.provisionalRows.length,
    watchlistCreators: limited.watchlistRows.length,
    staleCreators: limited.staleRows.length,
    excludedCreators: limited.excludedRows.length,
    pendingMaturityCreators: limited.pendingMaturityRows.length,
  };
  limited.leaderboard = {
    period: contract.period,
    rows: limited.officialRankedRows,
  };

  return limited;
}

async function publicCounts() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM creators)::int AS tracked_creators,
      (SELECT COUNT(*) FROM creator_stats WHERE period = 'all_time')::int AS ranked_creators,
      (SELECT COUNT(*) FROM calls)::int AS tracked_calls,
      (SELECT COUNT(*) FROM calls WHERE score > 0)::int AS scored_calls,
      (SELECT COUNT(*) FROM calls WHERE extraction_confidence >= 0.70)::int AS confidence_pass_calls,
      (SELECT COUNT(*) FROM calls WHERE ${publicEligibleCallsWhereSql("calls")})::int AS public_scored_calls,
      (SELECT COUNT(*) FROM calls WHERE extraction_confidence < 0.70)::int AS excluded_low_confidence_calls
  `);

  const row = result.rows[0] || {};

  return {
    trackedCreators: row.tracked_creators || 0,
    rankedCreators: row.ranked_creators || 0,
    trackedCalls: row.tracked_calls || 0,
    scoredCalls: row.scored_calls || 0,
    publicScoredCalls: row.public_scored_calls || 0,
    confidencePassCalls: row.confidence_pass_calls || 0,
    excludedLowConfidenceCalls: row.excluded_low_confidence_calls || 0,
  };
}

async function leaderboard(url) {
  const period = parsePeriod(url);
  const limit = parseLimit(url, 100, 250);
  const queryLimit = Math.min(Math.max(limit * 5, 250), 1000);

  const result = await pool.query(`
    SELECT
      cs.*,
      c.name,
      c.youtube_handle,
      c.youtube_channel_id,
      c.subscribers,
      c.focus,
      c.tier,
      c.alpha_score AS creator_alpha_score,
      c.total_calls AS creator_total_calls,
      c.win_rate AS creator_win_rate,
      c.avg_return AS creator_avg_return,
      c.accuracy_rank AS creator_accuracy_rank,
      c.last_scraped_at AS creator_last_scraped_at,
      c.created_at AS creator_created_at,
      latest.latest_video_date,
      bc.symbol AS best_call_symbol,
      bc.return_30d AS best_call_return,
      bc.score AS best_call_score,
      bc.call_date AS best_call_date,
      bc.direction AS best_call_direction,
      wc.symbol AS worst_call_symbol,
      wc.return_30d AS worst_call_return,
      wc.score AS worst_call_score,
      wc.call_date AS worst_call_date,
      wc.direction AS worst_call_direction
    FROM creator_stats cs
    JOIN creators c ON c.id = cs.creator_id
    LEFT JOIN LATERAL (
      SELECT MAX(v.published_at) AS latest_video_date
      FROM videos v
      WHERE v.creator_id = c.id
    ) latest ON TRUE
    LEFT JOIN calls bc
      ON bc.id = cs.best_call_id
     AND ${publicVisibleCallsWhereSql("bc")}
    LEFT JOIN calls wc
      ON wc.id = cs.worst_call_id
     AND ${publicVisibleCallsWhereSql("wc")}
    WHERE cs.period = $1
    ORDER BY cs.accuracy_rank ASC NULLS LAST
    LIMIT $2
  `, [period, queryLimit]);

  return limitLeaderboardContract(
    toReadApiLeaderboardContract(
      period,
      result.rows.map((row, index) => ({ rank: index + 1, ...row })),
    ),
    limit,
  );
}

async function creator(rawHandle, url) {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;

  const creatorResult = await pool.query(`
    SELECT *
    FROM creators
    WHERE lower(youtube_handle) = lower($1)
       OR lower(ltrim(youtube_handle, '@')) = lower($1)
    LIMIT 1
  `, [handle]);

  const creator = creatorResult.rows[0];
  if (!creator) return null;
  if (isExcludedCreator(creator)) return null;

  const period = parsePeriod(url);
  const callLimit = parseLimit(url, 50, 250);

  const statsResult = await pool.query(`
    SELECT *
    FROM creator_stats
    WHERE creator_id = $1
      AND period = $2
    LIMIT 1
  `, [creator.id, period]);

  const callsResult = await pool.query(`
    SELECT *
    FROM calls
    WHERE creator_id = $1
      AND ${publicVisibleCallsWhereSql("calls")}
    ORDER BY call_date DESC
    LIMIT $2
  `, [creator.id, callLimit]);

  return {
    creator,
    stats: statsResult.rows[0] || null,
    calls: callsResult.rows,
  };
}

async function callDetail(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const result = await pool.query(`
    SELECT
      c.*,
      cr.name AS creator_name,
      cr.youtube_handle AS creator_youtube_handle,
      cr.youtube_channel_id AS creator_youtube_channel_id
    FROM calls c
    LEFT JOIN creators cr ON cr.id = c.creator_id
    WHERE c.id = $1
      AND ${publicVisibleCallsWhereSql("c")}
    LIMIT 1
  `, [id]);

  const row = result.rows[0] || null;
  if (!row) return null;
  if (
    isExcludedCreator({
      name: row.creator_name,
      youtube_handle: row.creator_youtube_handle,
      youtube_channel_id: row.creator_youtube_channel_id,
    })
  ) {
    return null;
  }

  return row;
}

async function consensus(url) {
  const limit = parseLimit(url, 10, 50);

  const result = await pool.query(`
    SELECT *
    FROM consensus_signals
    ORDER BY signal_date DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

function redactArtifactJson(value) {
  const blocked = new Set(["api_key", "authorization", "cookie", "password", "secret", "token"]);
  if (Array.isArray(value)) return value.map(redactArtifactJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    blocked.has(String(key).toLowerCase()) ? "[REDACTED]" : redactArtifactJson(nested),
  ]));
}

function redactArtifactRow(row) {
  return row && row.json && typeof row.json === "object"
    ? { ...row, json: redactArtifactJson(row.json) }
    : row;
}

async function workflows(url) {
  const limit = parseLimit(url, 50, 100);
  const [runs, blocked] = await Promise.all([
    pool.query(`
      SELECT *
      FROM workflow_runs
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]),
    pool.query(`
      SELECT 'node' AS kind, id::text, workflow_run_id::text, status, error AS reason, created_at
      FROM workflow_node_runs
      WHERE status IN ('blocked', 'awaiting_approval', 'failed')
      UNION ALL
      SELECT 'approval_gate' AS kind, id::text, workflow_run_id::text, status, reason, created_at
      FROM approval_gates
      WHERE status IN ('blocked', 'awaiting_approval')
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]),
  ]);
  return { ok: true, runs: runs.rows, blockedItems: blocked.rows };
}

async function workflowDetail(id) {
  const runResult = await pool.query(`
    SELECT *
    FROM workflow_runs
    WHERE id = $1
    LIMIT 1
  `, [id]);
  const run = runResult.rows[0] || null;
  if (!run) return null;
  const [nodes, artifacts, events, approvalGates] = await Promise.all([
    pool.query(`SELECT * FROM workflow_node_runs WHERE workflow_run_id = $1 ORDER BY created_at ASC`, [id]),
    pool.query(`SELECT * FROM artifacts WHERE workflow_run_id = $1 ORDER BY created_at ASC`, [id]),
    pool.query(`SELECT * FROM workflow_events WHERE workflow_run_id = $1 ORDER BY created_at ASC`, [id]),
    pool.query(`SELECT * FROM approval_gates WHERE workflow_run_id = $1 ORDER BY created_at ASC`, [id]),
  ]);
  return {
    ok: true,
    run,
    nodes: nodes.rows,
    artifacts: artifacts.rows.map(redactArtifactRow),
    events: events.rows,
    approvalGates: approvalGates.rows,
    totals: {
      nodes: nodes.rows.length,
      artifacts: artifacts.rows.length,
      events: events.rows.length,
      approvalGates: approvalGates.rows.length,
      totalInputTokens: Number(run.total_input_tokens || 0),
      totalOutputTokens: Number(run.total_output_tokens || 0),
      totalCostUsd: Number(run.total_cost_usd || 0),
    },
  };
}

async function callLineage(id) {
  const result = await pool.query(`
    SELECT *
    FROM artifacts
    WHERE entity_type = 'market_call' AND entity_id = $1
    ORDER BY created_at ASC
  `, [id]);
  return { ok: true, entityType: "market_call", entityId: id, artifacts: result.rows.map(redactArtifactRow) };
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || HOST}`);

  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }

  if (req.method !== "GET") {
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    if (url.pathname === "/healthz") {
      return send(res, 200, { ok: true, service: "callscore-read-api" });
    }

    if (url.pathname === "/api/read/public-counts") {
      return send(res, 200, { ok: true, counts: await publicCounts() });
    }

    if (url.pathname === "/api/read/leaderboard") {
      return send(res, 200, await leaderboard(url));
    }

    if (url.pathname === "/api/read/consensus") {
      return send(res, 200, { ok: true, signals: await consensus(url) });
    }

    if (url.pathname === "/api/read/workflows") {
      return send(res, 200, await workflows(url));
    }

    if (url.pathname.startsWith("/api/read/workflows/")) {
      const id = url.pathname.slice("/api/read/workflows/".length);
      const data = await workflowDetail(id);
      return data
        ? send(res, 200, data)
        : send(res, 404, { ok: false, error: "workflow_not_found" });
    }

    if (url.pathname.startsWith("/api/read/calls/") && url.pathname.endsWith("/lineage")) {
      const id = url.pathname.slice("/api/read/calls/".length, -"/lineage".length);
      return send(res, 200, await callLineage(id));
    }

    if (url.pathname === "/api/read/home") {
      const [counts, board] = await Promise.all([
        publicCounts(),
        leaderboard(url),
      ]);

      return send(res, 200, {
        ...board,
        publicCounts: counts,
      });
    }

    if (url.pathname.startsWith("/api/read/creator/")) {
      const handleValue = url.pathname.slice("/api/read/creator/".length);
      const data = await creator(handleValue, url);
      return data
        ? send(res, 200, { ok: true, ...data })
        : send(res, 404, { ok: false, error: "creator_not_found" });
    }

    if (url.pathname.startsWith("/api/read/call/")) {
      const id = url.pathname.slice("/api/read/call/".length);
      const data = await callDetail(id);
      return data
        ? send(res, 200, { ok: true, call: data })
        : send(res, 404, { ok: false, error: "call_not_found" });
    }

    return send(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    log("read_error", {
      path: url.pathname,
      message: error instanceof Error ? error.message : String(error),
    });

    return send(res, 500, { ok: false, error: "read_failed" });
  }
}

createServer((req, res) => {
  void handle(req, res);
}).listen(PORT, HOST, () => {
  log("server_start", { host: HOST, port: PORT });
});
