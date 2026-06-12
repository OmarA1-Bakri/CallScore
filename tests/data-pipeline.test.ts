import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDataPipelineStageCommands,
  parseDataPipelineArgs,
} from "../src/scripts/run-data-pipeline";
import {
  buildDailyPipelineCommands,
  parseDailyPipelineArgs,
} from "../src/scripts/run-daily-pipeline";
import { getNextConsensusWindowStart } from "../src/scripts/detect-consensus";
import {
  buildCycleCommand,
  lockIsStale,
  parseContinuousDataPipelineArgs,
} from "../src/scripts/run-continuous-data-pipeline";
import {
  HIGH_LOW_CACHE_MAX_ENTRIES,
  MATCH_PRICE_CACHE_MAX_ENTRIES,
  MATCH_PRICES_ADVISORY_LOCK_ID,
  getCallSelectionPredicate,
  parseMatchPricesArgs,
  setLruCacheEntry,
  withMatchPricesAdvisoryLock,
} from "../src/scripts/match-prices";
import {
  buildReplaceStoredCallsStatements,
  executeStatementsInTransaction,
  runWithConcurrency,
} from "../src/scripts/script-helpers";
import {
  computeAlpha,
  computeReturn,
  didHitTarget,
  isDirectionCorrect,
} from "../src/lib/scoring";
import {
  buildLiveScoreEligibleStatsSql,
  parseVerifyPublicSurfaceArgs,
} from "../src/scripts/verify-public-surface";
import { parseRepairPriceAtCallArgs, toleranceBand } from "../src/scripts/repair-price-at-call";
import { buildSymbolFunnelSql, parseSymbolFunnelAuditArgs } from "../src/scripts/audit-symbol-funnel";
import {
  callBlockerCaseSql,
  callsBlockedByReasonSql,
  normalizePipelineBlockerLimit,
  pipelineStageCaseSql,
} from "../src/lib/pipeline-blockers";
import { parseBackfillPublicationDatesArgs } from "../src/scripts/backfill-publication-dates";
import {
  buildYtDlpTranscriptArgs,
  classifyYtDlpFailure,
  extractRequestedSubtitleUrl,
  parseBackfillTranscriptsArgs,
  redactedYtDlpOptionSummary,
  stripCaptionText,
  ytDlpAuthArgs,
  ytDlpExtraArgs,
  ytDlpPoTokenProviderArgs,
} from "../src/scripts/backfill-transcripts";
import {
  COVERAGE_AUDIT_SECTION_NAMES,
  coverageAuditQueries,
  parseCoverageAuditArgs,
} from "../src/scripts/audit-coverage-100";
import {
  buildWhereClause,
  filterWritableResults,
  parseArgs as parseAuditRecomputeArgs,
  shouldProcessInBatches,
  summarizeAuditResults,
} from "../src/scripts/audit-recompute";
import {
  parseRssApiDiscoveryArgs,
  parseYouTubeRss,
  upsertVideo,
} from "../src/scripts/discover-videos-rss-api";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { splitSqlStatements } from "../src/scripts/migrate";

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

async function waitFor(predicate: () => boolean, timeoutMs = 500) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("data pipeline defaults to safe local dry-run for top creators", () => {
  const args = parseDataPipelineArgs([]);

  assert.equal(args.write, false);
  assert.deepEqual(args.creators, [
    "@AltcoinDaily",
    "@DiscoverCrypto_",
    "@CryptoBanterGroup",
    "@CryptosRUs",
    "@AlexBeckersChannel",
  ]);
  assert.equal(args.limitVideos, 250);
  assert.equal(args.limitLlmVideos, 100);
  assert.equal(args.limitPromotions, 25);
  assert.equal(args.sinceDays, 365);
  assert.equal(args.maxCandleRequestsPerSymbol, 25);
  assert.match(args.shadowRunId, /^pipeline-/);
  assert.equal(args.shadowProvider, "ollama");
  assert.equal(args.shadowModel, "kimi-k2.6:cloud");
  assert.equal(args.shadowRequestTimeoutMs, 180_000);
  assert.equal(args.shadowAgents, 1);
  assert.equal(args.shadowVideoAgents, 1);
  assert.equal(args.shadowChunkAgents, 1);
  assert.equal(args.shadowAllowStatuses, null);
  assert.equal(args.rematchAllPrices, false);
  assert.equal(args.limitPriceMatches, 1000);
  assert.equal(args.priceMatchBatchSize, 200);
  assert.equal(args.priceMatchStartAfterId, 0);
  assert.equal(args.verifyBaseUrl, null);
  assert.equal(args.skipStages.size, 0);
});

test("data pipeline parses explicit bounds and skip flags", () => {
  const args = parseDataPipelineArgs([
    "--creators",
    "@A,@B,@C",
    "--limit-creators",
    "2",
    "--symbols",
    "ETHUSDT,SOLUSDT",
    "--limit-videos",
    "50",
    "--limit-llm-videos",
    "20",
    "--limit-promotions",
    "3",
    "--max-candle-requests-per-symbol",
    "4",
    "--audit-dir",
    ".tmp/pipeline-test",
    "--shadow-run-id",
    "shadow-canary",
    "--shadow-provider",
    "ollama",
    "--shadow-model",
    "deepseek-v4-flash",
    "--shadow-request-timeout-ms",
    "240000",
    "--shadow-agents",
    "3",
    "--shadow-video-agents",
    "2",
    "--shadow-chunk-agents",
    "3",
    "--shadow-allow-statuses",
    "new_calls,changed_calls",
    "--rematch-all-prices",
    "--limit-price-matches",
    "500",
    "--price-match-batch-size",
    "25",
    "--price-match-start-after-id",
    "12345",
    "--verify-base-url",
    "https://call-score.com",
    "--skip-shadow-diff",
    "--skip-secret-hygiene",
    "--skip-discover",
    "--write",
  ]);

  assert.equal(args.write, true);
  assert.deepEqual(args.creators, ["@A", "@B"]);
  assert.deepEqual(args.symbols, ["ETHUSDT", "SOLUSDT"]);
  assert.equal(args.limitVideos, 50);
  assert.equal(args.limitLlmVideos, 20);
  assert.equal(args.limitPromotions, 3);
  assert.equal(args.maxCandleRequestsPerSymbol, 4);
  assert.equal(args.auditDir, ".tmp/pipeline-test");
  assert.equal(args.shadowRunId, "shadow-canary");
  assert.equal(args.shadowProvider, "ollama");
  assert.equal(args.shadowModel, "deepseek-v4-flash");
  assert.equal(args.shadowRequestTimeoutMs, 240_000);
  assert.equal(args.shadowAgents, 3);
  assert.equal(args.shadowVideoAgents, 2);
  assert.equal(args.shadowChunkAgents, 3);
  assert.equal(args.shadowAllowStatuses, "new_calls,changed_calls");
  assert.equal(args.rematchAllPrices, true);
  assert.equal(args.limitPriceMatches, 500);
  assert.equal(args.priceMatchBatchSize, 25);
  assert.equal(args.priceMatchStartAfterId, 12345);
  assert.equal(args.verifyBaseUrl, "https://call-score.com");
  assert.equal(args.skipStages.has("secret-hygiene"), true);
  assert.equal(args.skipStages.has("shadow-diff"), true);
  assert.equal(args.skipStages.has("discover"), true);
});

test("continuous data pipeline defaults to a non-overlapping dry-run loop", () => {
  const args = parseContinuousDataPipelineArgs([]);

  assert.equal(args.write, false);
  assert.equal(args.once, false);
  assert.equal(args.maxCycles, 0);
  assert.equal(args.intervalMs, 30 * 60_000);
  assert.equal(args.failureIntervalMs, 10 * 60_000);
  assert.equal(args.auditRoot, ".tmp/callscore-pipeline/continuous");
  assert.equal(args.lockFile, ".tmp/callscore-pipeline/continuous.lock");
  assert.deepEqual(args.pipelineArgs, []);
});

test("continuous data pipeline treats dead-pid locks as stale", () => {
  const lockFile = ".tmp/test-continuous-dead-pid.lock";
  const lockPath = join(__dirname, "..", lockFile);
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(
    lockPath,
    JSON.stringify({
      pid: 999999999,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cycle: 1,
    }),
  );
  try {
    const args = parseContinuousDataPipelineArgs(["--lock-file", lockFile]);
    assert.equal(lockIsStale(args), true);
  } finally {
    if (existsSync(lockPath)) rmSync(lockPath, { force: true });
  }
});

test("continuous data pipeline write mode uses safe launch defaults", () => {
  const args = parseContinuousDataPipelineArgs([
    "--write",
    "--once",
    "--interval-minutes",
    "5",
    "--",
    "--creators",
    "@A",
  ]);
  const command = buildCycleCommand(args, 2, new Date("2026-05-06T00:00:00.000Z"));

  assert.equal(args.write, true);
  assert.equal(args.once, true);
  assert.equal(args.maxCycles, 1);
  assert.equal(args.intervalMs, 5 * 60_000);
  assert.ok(command.includes("src/scripts/run-data-pipeline.ts"));
  assert.ok(command.includes("--write"));
  assert.ok(command.includes("--skip-shadow-promote"));
  assert.ok(command.includes("--shadow-fallback-model"));
  assert.ok(command.includes("glm-5.1"));
  assert.ok(command.includes("--shadow-agents"));
  assert.ok(command.includes("2"));
  assert.ok(command.includes("--audit-dir"));
  assert.ok(command.some((part) => part.endsWith("continuous/2026-05-06T00-00-00-000Z-cycle-2")));
  assert.ok(command.includes("--shadow-run-id"));
  assert.ok(command.includes("continuous-2026-05-06T00-00-00-000Z-cycle-2"));
});

test("continuous data pipeline preserves reviewed promotion args", () => {
  const args = parseContinuousDataPipelineArgs([
    "--write",
    "--",
    "--shadow-promote-video-ids",
    "101,102",
    "--shadow-allow-statuses",
    "new_calls",
  ]);
  const command = buildCycleCommand(args, 1, new Date("2026-05-06T00:00:00.000Z"));

  assert.ok(command.includes("--shadow-promote-video-ids"));
  assert.ok(command.includes("101,102"));
  assert.equal(command.includes("--skip-shadow-promote"), false);
});

test("match-prices defaults to incomplete market data and parses full recompute bounds", () => {
  const defaults = parseMatchPricesArgs([]);
  assert.equal(defaults.rematchAll, false);
  assert.equal(defaults.batchSize, 200);
  assert.equal(defaults.limit, Number.MAX_SAFE_INTEGER);
  assert.equal(defaults.startAfterId, 0);
  assert.equal(defaults.fetchBinance, false);
  assert.equal(defaults.binanceToleranceMinutes, 30);
  assert.match(getCallSelectionPredicate(defaults), /price_at_call IS NULL/);
  assert.match(getCallSelectionPredicate(defaults), /price_30d IS NULL/);
  assert.match(getCallSelectionPredicate(defaults), /hit_target IS NULL/);

  const full = parseMatchPricesArgs([
    "--all",
    "--limit",
    "250",
    "--batch-size",
    "50",
    "--start-after-id",
    "123",
    "--fetch-binance",
    "--binance-tolerance-minutes",
    "15",
  ]);
  assert.equal(full.rematchAll, true);
  assert.equal(full.limit, 250);
  assert.equal(full.batchSize, 50);
  assert.equal(full.startAfterId, 123);
  assert.equal(full.fetchBinance, true);
  assert.equal(full.binanceToleranceMinutes, 15);
  assert.equal(getCallSelectionPredicate(full), "id > $1");
});

test("match-prices exposes a stable advisory lock id for single-run idempotency", () => {
  assert.equal(Number.isInteger(MATCH_PRICES_ADVISORY_LOCK_ID), true);
  assert.ok(MATCH_PRICES_ADVISORY_LOCK_ID > 0);
});

test("RSS/API video discovery is dry-run by default and parses YouTube RSS", () => {
  const args = parseRssApiDiscoveryArgs([
    "--source",
    "auto",
    "--limit-creators",
    "2",
    "--limit-videos",
    "10",
  ]);
  assert.equal(args.write, false);
  assert.equal(args.source, "auto");
  assert.equal(args.limitCreators, 2);
  assert.equal(args.limitVideos, 10);

  const videos = parseYouTubeRss(`
    <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
      <entry><yt:videoId>abc123</yt:videoId><title>A &amp; B</title><published>2026-05-01T00:00:00+00:00</published></entry>
      <entry><yt:videoId>def456</yt:videoId><title>Second</title><published>2026-05-02T00:00:00+00:00</published></entry>
      <entry><yt:videoId>ghi789</yt:videoId><title>Third</title><published>2026-05-03T00:00:00+00:00</published></entry>
      <entry><yt:videoId>jkl012</yt:videoId><title>Fourth</title><published>2026-05-04T00:00:00+00:00</published></entry>
      <entry><yt:videoId>mno345</yt:videoId><title>Fifth</title><published>2026-05-05T00:00:00+00:00</published></entry>
      <entry><yt:videoId>pqr678</yt:videoId><title>Sixth</title><published>2026-05-06T00:00:00+00:00</published></entry>
    </feed>
  `, 5);
  assert.equal(videos.length, 5);
  assert.deepEqual(videos[0], {
    youtube_video_id: "abc123",
    title: "A & B",
    published_at: "2026-05-01T00:00:00+00:00",
    source: "rss",
  });
  assert.equal(videos[4]?.youtube_video_id, "mno345");
});

test("transcript status migration gates provider waterfall state", async () => {
  const statements = splitSqlStatements(read("migrations/012-video-transcript-status.sql"));
  const normalizedStatements = statements.map((statement) => statement.replace(/\s+/g, " ").trim());
  assert.ok(normalizedStatements.some((statement) => statement.includes("transcript_status TEXT")));
  assert.ok(normalizedStatements.some((statement) => statement.includes("transcript_attempts INTEGER")));
  assert.ok(normalizedStatements.some((statement) => statement.includes("transcript_provider TEXT")));
  assert.ok(normalizedStatements.some((statement) => statement.includes("idx_videos_transcript_status")));

  const queries: string[] = [];
  await upsertVideo(
    { id: 7 } as never,
    {
      youtube_video_id: "abc123",
      title: "Example",
      published_at: "2026-05-01T00:00:00+00:00",
      source: "rss",
    },
    async <T>(text: string): Promise<T[]> => {
      queries.push(text.replace(/\s+/g, " ").trim());
      return [] as T[];
    },
  );

  assert.equal(queries.length, 1);
  assert.match(queries[0] ?? "", /transcript_status, transcript_attempts, transcript_provider/);
  assert.match(queries[0] ?? "", /WHEN videos\.transcript IS NOT NULL AND videos\.transcript <> '' THEN 'available'/);
  assert.match(queries[0] ?? "", /ELSE COALESCE\(videos\.transcript_status, 'pending'\)/);
  assert.match(queries[0] ?? "", /transcript_provider = CASE/);
  assert.match(queries[0] ?? "", /COALESCE\(videos\.transcript_provider, EXCLUDED\.transcript_provider, 'legacy'\)/);
});

test("match-prices skips work under advisory-lock contention", async () => {
  const statements: string[] = [];
  const result = await withMatchPricesAdvisoryLock(
    async () => {
      throw new Error("work should not run when lock is busy");
    },
    async <T>(sql: string): Promise<T[]> => {
      statements.push(sql);
      return [{ locked: false }] as T[];
    },
  );

  assert.deepEqual(result, { locked: false });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /pg_try_advisory_lock/);
  assert.doesNotMatch(statements.join("\n"), /pg_advisory_unlock/);
});

test("consensus detection advances past the full anchored window", () => {
  const calls = [
    { call_date: "2026-01-01T00:00:00.000Z" },
    { call_date: "2026-01-02T00:00:00.000Z" },
    { call_date: "2026-01-07T00:00:00.000Z" },
    { call_date: "2026-01-09T00:00:00.000Z" },
  ];

  assert.equal(
    getNextConsensusWindowStart(calls, 0, Date.parse("2026-01-08T00:00:00.000Z")),
    3,
  );
  assert.equal(
    getNextConsensusWindowStart(calls, 0, Date.parse("2026-01-10T00:00:00.000Z")),
    calls.length,
  );
});

test("public surface verification only fetches external URLs when explicitly requested", () => {
  assert.equal(parseVerifyPublicSurfaceArgs([]).baseUrl, null);
  assert.equal(
    parseVerifyPublicSurfaceArgs(["--base-url", "https://call-score.com"])
      .baseUrl,
    "https://call-score.com",
  );
});

test("public surface verification compares live score eligibility against cached creator stats", () => {
  const sql = buildLiveScoreEligibleStatsSql();

  assert.match(sql, /FROM calls c/);
  assert.match(sql, /COUNT\(DISTINCT c\.creator_id\)/);
  assert.match(sql, /extraction_confidence >= 0\.7/);
  assert.match(sql, /price_at_call IS NOT NULL/);
  assert.match(sql, /return_30d IS NOT NULL/);
});

test("publication-date backfill is dry-run and bounded by default", () => {
  const defaults = parseBackfillPublicationDatesArgs([]);
  assert.equal(defaults.write, false);
  assert.equal(defaults.limit, 100);
  assert.equal(defaults.offset, 0);
  assert.equal(defaults.concurrency, 4);

  const explicit = parseBackfillPublicationDatesArgs([
    "--creator",
    "@A",
    "--limit",
    "7",
    "--offset",
    "3",
    "--concurrency",
    "20",
    "--audit-out",
    ".tmp/dates.jsonl",
    "--write",
  ]);
  assert.equal(explicit.creator, "@A");
  assert.equal(explicit.limit, 7);
  assert.equal(explicit.offset, 3);
  assert.equal(explicit.concurrency, 10);
  assert.equal(explicit.auditOut, ".tmp/dates.jsonl");
  assert.equal(explicit.write, true);
});

test("transcript backfill is dry-run and bounded by default", () => {
  const args = parseBackfillTranscriptsArgs([
    "--creator",
    "@A",
    "--limit",
    "7",
    "--concurrency",
    "99",
    "--audit-out",
    ".tmp/transcripts.jsonl",
  ]);
  assert.equal(args.creator, "@A");
  assert.equal(args.limit, 7);
  assert.equal(args.concurrency, 1);
  assert.equal(args.fallbackYtDlp, true);
  assert.equal(args.ytDlpSleepSeconds, 20);
  assert.equal(args.ytDlpMaxSleepSeconds, 60);
  assert.equal(args.stopOnProviderBlock, true);
  assert.equal(args.auditOut, ".tmp/transcripts.jsonl");
  assert.equal(args.write, false);
});



test("transcript backfill supports redacted yt-dlp auth env hooks", () => {
  assert.deepEqual(ytDlpAuthArgs({}), []);
  assert.deepEqual(ytDlpAuthArgs({ YTDLP_COOKIES_PATH: "/run/secrets/youtube.cookies" }), [
    "--cookies",
    "/run/secrets/youtube.cookies",
  ]);
  assert.equal(ytDlpAuthArgs({ YTDLP_COOKIES: "# Netscape\n.example" }).length, 0);
  assert.deepEqual(ytDlpAuthArgs({ YTDLP_COOKIES_FROM_BROWSER: "chromium:Default" }), [
    "--cookies-from-browser",
    "chromium:Default",
  ]);
});

test("transcript backfill exposes safe yt-dlp recovery options without logging secrets", () => {
  const env = {
    YTDLP_COOKIES_PATH: "/run/secrets/youtube.cookies",
    YTDLP_PO_TOKEN_PROVIDER: "bgutil-http",
    YTDLP_PO_TOKEN_PROVIDER_BASE_URL: "http://127.0.0.1:4416",
    YTDLP_PLAYER_CLIENT: "mweb",
    YTDLP_EXTRACTOR_ARGS: "youtube:player_client=mweb\nyoutube:player_skip=configs",
    YTDLP_JS_RUNTIMES: "node",
    YTDLP_REMOTE_COMPONENTS: "1",
    YTDLP_USER_AGENT: "Mozilla/5.0 Test Agent",
  };
  assert.deepEqual(ytDlpExtraArgs(env), [
    "--extractor-args",
    "youtube:player_client=mweb",
    "--extractor-args",
    "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416",
    "--extractor-args",
    "youtube:player_client=mweb",
    "--extractor-args",
    "youtube:player_skip=configs",
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
    "--user-agent",
    "Mozilla/5.0 Test Agent",
  ]);

  assert.deepEqual(redactedYtDlpOptionSummary(env), {
    auth: "cookies_path",
    playerClient: true,
    poTokenProvider: "bgutil-http",
    poTokenProviderBaseUrl: true,
    poTokenProviderHome: false,
    extractorArgs: 2,
    jsRuntimes: true,
    remoteComponents: true,
    userAgent: true,
  });
  assert.doesNotMatch(JSON.stringify(redactedYtDlpOptionSummary(env)), /youtube\\.cookies|Mozilla|127\\.0\\.0\\.1|mweb/);
});

test("yt-dlp PO-token provider config emits provider args without raw token exposure", () => {
  assert.deepEqual(
    ytDlpPoTokenProviderArgs({
      YTDLP_PO_TOKEN_PROVIDER: "bgutil-http",
      YTDLP_PO_TOKEN_PROVIDER_BASE_URL: "http://127.0.0.1:4416",
    }),
    ["--extractor-args", "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416"],
  );
  assert.deepEqual(
    ytDlpPoTokenProviderArgs({
      YTDLP_PO_TOKEN_PROVIDER: "bgutil-script",
      YTDLP_PO_TOKEN_PROVIDER_HOME: "/opt/callscore/bgutil-ytdlp-pot-provider",
    }),
    ["--extractor-args", "youtubepot-bgutilscript:server_home=/opt/callscore/bgutil-ytdlp-pot-provider"],
  );
  assert.throws(
    () => ytDlpPoTokenProviderArgs({ YTDLP_PO_TOKEN_PROVIDER: "bgutil-script" }),
    /YTDLP_PO_TOKEN_PROVIDER_HOME/,
  );
});

test("yt-dlp transcript args remain transcript-only and include extractor backoff", () => {
  const args = parseBackfillTranscriptsArgs(["--limit", "1", "--concurrency", "1"]);
  const ytdlpArgs = buildYtDlpTranscriptArgs("video123", args, {
    YTDLP_EXTRACTOR_ARGS: "youtube:player_client=mweb",
    YTDLP_JS_RUNTIMES: "node",
    YTDLP_RETRY_SLEEP: "extractor:exp=20:120:2",
  }, ["--cookies", "/run/secrets/youtube.cookies"]);

  assert.ok(ytdlpArgs.includes("--skip-download"));
  assert.ok(ytdlpArgs.includes("--no-playlist"));
  assert.ok(ytdlpArgs.includes("--write-auto-subs"));
  assert.ok(ytdlpArgs.includes("--write-subs"));
  assert.ok(ytdlpArgs.includes("--extractor-retries"));
  assert.ok(ytdlpArgs.includes("--retry-sleep"));
  assert.ok(ytdlpArgs.includes("extractor:exp=20:120:2"));
  assert.ok(ytdlpArgs.includes("https://www.youtube.com/watch?v=video123"));
  assert.equal(ytdlpArgs.includes("--yes-playlist"), false);
  assert.equal(ytdlpArgs.includes("-f"), false);
});

test("yt-dlp failure classifier distinguishes cookie, PO token, JS runtime, bot, and rate gates", () => {
  assert.equal(classifyYtDlpFailure("ERROR: This request requires a PO Token / Proof of Origin"), "po_token_required");
  assert.equal(classifyYtDlpFailure("ERROR: JavaScript runtime unavailable for EJS challenge"), "js_challenge_runtime_missing");
  assert.equal(classifyYtDlpFailure("ERROR: cookies are expired or rotated"), "cookie_invalid_or_rotated");
  assert.equal(classifyYtDlpFailure("ERROR: Sign in to confirm you’re not a bot"), "bot_verification_required");
  assert.equal(classifyYtDlpFailure("ERROR: HTTP Error 429: Too Many Requests"), "rate_limited");
  assert.equal(classifyYtDlpFailure("WARNING: no automatic captions"), "no_captions");
});

test("yt-dlp requested_subtitles output is dereferenced instead of stored as transcript text", () => {
  const url = "https://www.youtube.com/api/timedtext?v=abc\\u0026lang=en";
  assert.equal(
    extractRequestedSubtitleUrl(`{'en-orig': {'ext': 'vtt', 'url': '${url}'}}`),
    "https://www.youtube.com/api/timedtext?v=abc&lang=en",
  );
  assert.equal(
    stripCaptionText(
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello <c>world</c>\nhello world",
    ),
    "hello world",
  );
});



test("daily pipeline defaults to slow bounded transcript cadence", () => {
  const args = parseDailyPipelineArgs(["--write", "--transcript-limit", "25", "--transcript-concurrency", "9"]);
  assert.equal(args.write, true);
  assert.equal(args.transcriptLimit, 25);
  assert.equal(args.transcriptConcurrency, 1);
  assert.equal(args.transcriptGapMs, 20_000);

  const commands = buildDailyPipelineCommands(args);
  const transcriptCommand = commands.find((command) => command.name === "slow-transcripts")?.command ?? [];
  assert.ok(transcriptCommand.includes("src/scripts/backfill-transcripts.ts"));
  assert.ok(transcriptCommand.includes("--concurrency"));
  assert.ok(transcriptCommand.includes("1"));
  assert.ok(transcriptCommand.includes("--retry-cooldown-hours"));
});

test("data pipeline wires shadow commands safely in dry-run mode", () => {
  const args = parseDataPipelineArgs([
    "--creators",
    "@A,@B",
    "--audit-dir",
    ".tmp/pipeline-test",
    "--shadow-run-id",
    "shadow-canary",
  ]);
  const commands = buildDataPipelineStageCommands(args);

  assert.ok(
    commands["secret-hygiene"][0].includes(
      "src/scripts/check-secret-hygiene.ts",
    ),
  );
  assert.equal(commands["shadow-extract"].length, 2);
  assert.ok(
    commands["shadow-extract"][0].includes(
      "src/scripts/shadow-extract-transcripts.ts",
    ),
  );
  assert.ok(commands["shadow-extract"][0].includes("--shadow-out"));
  assert.ok(commands["shadow-extract"][0].includes("shadow-canary"));
  assert.ok(commands["shadow-extract"][0].includes("--provider"));
  assert.ok(commands["shadow-extract"][0].includes("ollama"));
  assert.ok(commands["shadow-extract"][0].includes("--request-timeout-ms"));
  assert.ok(commands["shadow-extract"][0].includes("180000"));
  assert.ok(commands["shadow-extract"][0].includes("--video-agents"));
  assert.ok(commands["shadow-extract"][0].includes("1"));
  assert.ok(commands["shadow-extract"][0].includes("--chunk-agents"));
  assert.ok(commands["shadow-extract"][0].includes("1"));
  assert.ok(
    commands["shadow-extract"][0].some((part) =>
      toPosixPath(part).endsWith("shadow-run-meta-A.json"),
    ),
  );
  assert.ok(
    commands["shadow-extract"][1].some((part) =>
      toPosixPath(part).endsWith("shadow-run-meta-B.json"),
    ),
  );
  assert.equal(commands["shadow-extract"][0].includes("--execute"), false);
  assert.equal(commands["shadow-promote"][0].includes("--audit-out"), true);
  assert.ok(
    commands["shadow-promote"][0].some((part) =>
      toPosixPath(part).endsWith("shadow-promote.jsonl"),
    ),
  );
  assert.equal(commands["shadow-promote"][0].includes("--write"), false);
  assert.equal(commands["shadow-validate"].length, 2);
  assert.ok(
    commands["shadow-validate"][0].includes(
      "src/scripts/validate-shadow-extractions.ts",
    ),
  );
  assert.ok(commands["shadow-validate"][0].includes("--require-records"));
  assert.ok(
    commands["shadow-validate"][0].some((part) =>
      toPosixPath(part).endsWith("shadow-validation/A.json"),
    ),
  );
  assert.ok(
    commands["pipeline-readiness"][0].includes(
      "src/scripts/audit-pipeline-readiness.ts",
    ),
  );
  assert.ok(
    commands["pipeline-readiness"][0].includes("--allow-partial-shadow"),
  );
  assert.ok(
    commands["verify-public-surface"][0].includes(
      "src/scripts/verify-public-surface.ts",
    ),
  );
  assert.deepEqual(commands["evaluation-backfill"], []);
  assert.ok(
    commands.discover[0].includes("src/scripts/discover-videos-rss-api.ts"),
  );
  assert.ok(commands.discover[0].includes("--source"));
  assert.ok(commands.discover[0].includes("auto"));
  assert.equal(
    commands.discover[0].includes("src/scripts/discover-videos-365.ts"),
    false,
  );
});

test("data pipeline command pool starts the next item when a lane frees", async () => {
  const started: number[] = [];
  let releaseFirst = () => {};
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const resultsPromise = runWithConcurrency(
    [0, 1, 2],
    2,
    async (item) => {
      started.push(item);
      if (item === 0) await firstGate;
      return item;
    },
  );

  try {
    await waitFor(() => started.length === 3);
    assert.deepEqual(started, [0, 1, 2]);
  } finally {
    releaseFirst();
  }

  assert.deepEqual(await resultsPromise, [0, 1, 2]);
});

test("data pipeline write mode executes shadow extraction, guarded promotion, and full rematch when requested", () => {
  const args = parseDataPipelineArgs([
    "--creators",
    "@A",
    "--audit-dir",
    ".tmp/pipeline-test",
    "--shadow-run-id",
    "shadow-canary",
    "--shadow-allow-statuses",
    "new_calls",
    "--limit-promotions",
    "2",
    "--rematch-all-prices",
    "--verify-base-url",
    "https://call-score.com",
    "--write",
  ]);
  const commands = buildDataPipelineStageCommands(args);

  assert.equal(commands["shadow-extract"][0].includes("--execute"), true);
  assert.equal(commands["shadow-promote"][0].includes("--write"), true);
  assert.equal(
    commands["shadow-promote"][0].includes("--allow-statuses"),
    true,
  );
  assert.equal(commands["shadow-promote"][0].includes("new_calls"), true);
  assert.equal(commands["shadow-promote"][0].includes("2"), true);
  assert.equal(commands["evaluation-backfill"][0].includes("--all"), true);
  assert.equal(commands["evaluation-backfill"][0].includes("--batch-size"), true);
  assert.equal(
    commands["verify-public-surface"][0].includes("https://call-score.com"),
    true,
  );
});

test("coverage audit parses safe reporting arguments", () => {
  assert.deepEqual(parseCoverageAuditArgs([]), {
    json: false,
    out: null,
    pretty: true,
  });
  assert.deepEqual(
    parseCoverageAuditArgs(["--json", "--compact", "--out", ".tmp/audit.json"]),
    {
      json: true,
      out: ".tmp/audit.json",
      pretty: false,
    },
  );
  assert.equal(
    parseCoverageAuditArgs(["--audit-out", ".tmp/audit.json"]).out,
    ".tmp/audit.json",
  );
});

test("coverage audit covers required sections and 1m candle data", () => {
  const queries = coverageAuditQueries();
  for (const name of COVERAGE_AUDIT_SECTION_NAMES) {
    assert.equal(typeof queries[name], "string");
    assert.ok(queries[name].trim().length > 0);
  }
  assert.match(queries.market_candles, /FROM candles/i);
  assert.match(queries.market_candles, /interval = '1m'/i);
  assert.match(queries.market_candles, /open_time/i);
  assert.match(queries.market_symbol_gaps, /call_symbols/i);
  assert.doesNotMatch(queries.market_candles, /daily_prices/i);
});

test("audit recompute can safely target score-ready low-confidence calls", () => {
  const args = parseAuditRecomputeArgs([
    "--score-ready-low-confidence",
    "--valid-only",
    "--limit",
    "500",
    "--start-after-id",
    "1000",
    "--summary",
  ]);

  assert.equal(args.scoreReadyLowConfidence, true);
  assert.equal(args.validOnly, true);
  assert.equal(args.limit, 500);
  assert.equal(args.startAfterId, 1000);
  assert.equal(args.summary, true);
  assert.equal(shouldProcessInBatches(args), false);
  assert.equal(
    shouldProcessInBatches(
      parseAuditRecomputeArgs(["--score-ready-low-confidence", "--valid-only"]),
    ),
    true,
  );

  const where = buildWhereClause(args);
  assert.match(where.sql, /extraction_confidence < 0\.7/);
  assert.match(where.sql, /price_at_call IS NOT NULL/);
  assert.match(where.sql, /c\.id > \$1/);
  assert.deepEqual(where.params, [1000]);
});

test("audit recompute valid-only writes exclude rejected audit rows", () => {
  const results = [
    {
      id: 1,
      reasons: [],
      after: { score_status: "scored", extraction_confidence: 1 },
      decision: "PROMOTE",
    },
    {
      id: 2,
      reasons: ["excerpt does not clearly support the extracted asset"],
      after: {
        score_status: "excluded_confidence",
        extraction_confidence: 0.69,
      },
      decision: "REJECT",
    },
  ] as never;

  assert.deepEqual(
    filterWritableResults(results, { validOnly: true }).map((row) => row.id),
    [1],
  );
  assert.equal(summarizeAuditResults(results).valid, 1);
  assert.equal(summarizeAuditResults(results).wouldBecomeScored, 1);
});


test("match-prices LRU helper caps caches and refreshes recently used keys", () => {
  assert.equal(MATCH_PRICE_CACHE_MAX_ENTRIES, 50_000);
  assert.equal(HIGH_LOW_CACHE_MAX_ENTRIES, 50_000);

  const cache = new Map<string, number>();
  assert.equal(setLruCacheEntry(cache, "oldest", 1, 3), true);
  assert.equal(setLruCacheEntry(cache, "middle", 2, 3), true);
  assert.equal(setLruCacheEntry(cache, "newest", 3, 3), true);
  assert.equal(setLruCacheEntry(cache, "middle", 22, 3), true);
  assert.equal(setLruCacheEntry(cache, "overflow", 4, 3), true);

  assert.deepEqual(Array.from(cache.entries()), [
    ["newest", 3],
    ["middle", 22],
    ["overflow", 4],
  ]);
  assert.equal(setLruCacheEntry(cache, "ignored", 5, 0), false);
});

test("price repair uses bounded nearest-candle tolerance bands", () => {
  const args = parseRepairPriceAtCallArgs([
    "--write",
    "--limit",
    "10",
    "--batch-size",
    "5",
    "--max-tolerance-minutes",
    "15",
    "--symbols",
    "linkusdt,nearusdt",
    "--audit-out",
    ".tmp/price.jsonl",
  ]);
  assert.equal(args.write, true);
  assert.equal(args.limit, 10);
  assert.equal(args.batchSize, 5);
  assert.equal(args.maxToleranceMinutes, 15);
  assert.equal(args.fetchBinance, false);
  assert.deepEqual(args.symbols, ["LINKUSDT", "NEARUSDT"]);
  assert.equal(toleranceBand(60_000, 60_000), "exact_minute");
  assert.equal(toleranceBand(60_000, 62_000), "exact_minute");
  assert.equal(toleranceBand(60_000, 5 * 60_000), "within_5m");
  assert.equal(toleranceBand(60_000, 31 * 60_000), "within_30m");
  assert.equal(toleranceBand(60_000, 32 * 60_000), null);
});

test("symbol funnel audit focuses anomalous symbols and pricing blockers", () => {
  const args = parseSymbolFunnelAuditArgs([
    "--symbols",
    "LINKUSDT,NEARUSDT,XRPUSDT",
    "--json",
    "--audit-out",
    ".tmp/symbols.jsonl",
  ]);
  assert.deepEqual(args.symbols, ["LINKUSDT", "NEARUSDT", "XRPUSDT"]);
  assert.equal(args.json, true);
  assert.equal(args.auditOut, ".tmp/symbols.jsonl");
  const sql = buildSymbolFunnelSql();
  assert.match(sql, /missing_price_at_call/);
  assert.match(sql, /missing_30d_eval/);
  assert.match(sql, /low_confidence_validation_decision/);
  assert.match(sql, /FROM candles/);
});

test("pipeline blocker dashboard exposes reason, symbol, creator, and stage views", () => {
  assert.equal(normalizePipelineBlockerLimit(999), 100);
  assert.match(callBlockerCaseSql("c"), /missing_price_at_call/);
  assert.match(callBlockerCaseSql("c"), /low_confidence_score_ready_unvalidated/);
  assert.match(pipelineStageCaseSql("blocker"), /validation/);
  const sql = callsBlockedByReasonSql();
  assert.match(sql, /WITH blocked AS/);
  assert.match(sql, /WHERE NOT/);
  assert.match(sql, /GROUP BY blocker/);
});

test("replaceStoredCallsForVideo statements preserve transactional SQL order", async () => {
  const statements = buildReplaceStoredCallsStatements({
    creatorId: 7,
    videoId: 42,
    callDate: "2026-05-01T00:00:00.000Z",
    markVideoExtracted: true,
    calls: [
      {
        symbol: "ETHUSDT",
        direction: "bullish",
        call_type: "buy",
        entry_price: 100,
        target_price: 125,
        stop_loss: 90,
        timeframe: "30d",
        confidence: "high",
        strategy_type: "technical_analysis",
        raw_quote: "ETH higher",
        extraction_confidence: 0.9,
        specificity_score: 0.75,
      },
      {
        symbol: "BTCUSDT",
        direction: "bearish",
        call_type: "sell",
        entry_price: null,
        target_price: null,
        stop_loss: null,
        timeframe: null,
        confidence: "medium",
        strategy_type: "fundamental",
        raw_quote: "BTC lower",
        extraction_confidence: 0.8,
        specificity_score: 0.25,
      },
    ],
  });

  assert.match(statements[0].sql, /^DELETE FROM calls WHERE video_id/);
  assert.deepEqual(statements[0].params, [42]);
  assert.match(statements[1].sql, /^INSERT INTO calls/);
  assert.match(statements[2].sql, /^INSERT INTO calls/);
  assert.match(statements[3].sql, /^UPDATE videos SET calls_extracted = true/);

  const executed: string[] = [];
  let transactionCalls = 0;
  await executeStatementsInTransaction(
    {
      async transaction(callback) {
        transactionCalls++;
        await Promise.all(
          callback(async (sql) => {
            executed.push(sql.replace(/\s+/g, " ").trim());
            return [];
          }),
        );
        return [];
      },
    },
    statements,
  );

  assert.equal(transactionCalls, 1);
  assert.deepEqual(
    executed.map((sql) => sql.split(" ").slice(0, 3).join(" ")),
    ["DELETE FROM calls", "INSERT INTO calls", "INSERT INTO calls", "UPDATE videos SET"],
  );
});

test("replaceStoredCallsForVideo transaction helper propagates rollback failures", async () => {
  const statements = buildReplaceStoredCallsStatements({
    creatorId: 7,
    videoId: 42,
    callDate: null,
    calls: [],
  });

  let transactionCalls = 0;
  await assert.rejects(
    executeStatementsInTransaction(
      {
        async transaction(callback) {
          transactionCalls++;
          callback(async () => []);
          throw new Error("rollback simulated");
        },
      },
      statements,
    ),
    /rollback simulated/,
  );
  assert.equal(transactionCalls, 1);
});

test("scoring helpers return safe values for NaN and Infinity inputs", () => {
  assert.equal(computeReturn(Number.NaN, 110), 0);
  assert.equal(computeReturn(100, Number.POSITIVE_INFINITY), 0);
  assert.equal(computeAlpha(Number.NEGATIVE_INFINITY, 1), 0);
  assert.equal(computeAlpha(5, Number.NaN), 0);

  assert.equal(isDirectionCorrect("bullish", Number.POSITIVE_INFINITY), false);
  assert.equal(isDirectionCorrect("bearish", Number.NaN), false);
  assert.equal(isDirectionCorrect("neutral", Number.NEGATIVE_INFINITY), false);

  assert.equal(didHitTarget("bullish", Number.NaN, null, 120, 90), false);
  assert.equal(didHitTarget("bullish", 110, Number.NaN, 120, 90), false);
  assert.equal(didHitTarget("bullish", 110, null, Number.POSITIVE_INFINITY, 90), false);
  assert.equal(didHitTarget("bearish", 90, null, 120, Number.NEGATIVE_INFINITY), false);
  assert.equal(didHitTarget("bullish", 110, 95, 120, null), false);
  assert.equal(didHitTarget("bearish", 90, 105, null, 80), false);
});
