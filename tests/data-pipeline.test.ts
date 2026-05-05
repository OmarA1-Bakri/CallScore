import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDataPipelineStageCommands,
  parseDataPipelineArgs,
} from "../src/scripts/run-data-pipeline";
import {
  getCallSelectionPredicate,
  parseMatchPricesArgs,
} from "../src/scripts/match-prices";
import { parseVerifyPublicSurfaceArgs } from "../src/scripts/verify-public-surface";
import { parseBackfillPublicationDatesArgs } from "../src/scripts/backfill-publication-dates";
import {
  extractRequestedSubtitleUrl,
  parseBackfillTranscriptsArgs,
  stripCaptionText,
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

test("data pipeline defaults to safe local dry-run for top creators", () => {
  const args = parseDataPipelineArgs([]);

  assert.equal(args.write, false);
  assert.deepEqual(args.creators, [
    "@AltcoinDaily",
    "@DiscoverCrypto",
    "@CryptoBanter",
    "@CryptosRUs",
    "@AlexBecker",
  ]);
  assert.equal(args.limitVideos, 250);
  assert.equal(args.limitLlmVideos, 100);
  assert.equal(args.limitPromotions, 25);
  assert.equal(args.sinceDays, 365);
  assert.equal(args.maxCandleRequestsPerSymbol, 25);
  assert.match(args.shadowRunId, /^pipeline-/);
  assert.equal(args.shadowProvider, "ollama");
  assert.equal(args.shadowModel, "kimi-k2.6");
  assert.equal(args.shadowFallbackModel, null);
  assert.equal(args.shadowRequestTimeoutMs, 180_000);
  assert.equal(args.shadowAgents, 1);
  assert.equal(args.shadowVideoAgents, 1);
  assert.equal(args.shadowChunkAgents, 1);
  assert.equal(args.shadowAllowStatuses, null);
  assert.equal(args.rematchAllPrices, false);
  assert.equal(args.limitPriceMatches, Number.MAX_SAFE_INTEGER);
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
    "--shadow-fallback-model",
    "glm-5.1",
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
    "https://www.call-score.com",
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
  assert.equal(args.shadowFallbackModel, "glm-5.1");
  assert.equal(args.shadowRequestTimeoutMs, 240_000);
  assert.equal(args.shadowAgents, 3);
  assert.equal(args.shadowVideoAgents, 2);
  assert.equal(args.shadowChunkAgents, 3);
  assert.equal(args.shadowAllowStatuses, "new_calls,changed_calls");
  assert.equal(args.rematchAllPrices, true);
  assert.equal(args.limitPriceMatches, 500);
  assert.equal(args.priceMatchBatchSize, 25);
  assert.equal(args.priceMatchStartAfterId, 12345);
  assert.equal(args.verifyBaseUrl, "https://www.call-score.com");
  assert.equal(args.skipStages.has("secret-hygiene"), true);
  assert.equal(args.skipStages.has("shadow-diff"), true);
  assert.equal(args.skipStages.has("discover"), true);
});

test("match-prices defaults to incomplete market data and parses full recompute bounds", () => {
  const defaults = parseMatchPricesArgs([]);
  assert.equal(defaults.rematchAll, false);
  assert.equal(defaults.batchSize, 200);
  assert.equal(defaults.limit, Number.MAX_SAFE_INTEGER);
  assert.equal(defaults.startAfterId, 0);
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
  ]);
  assert.equal(full.rematchAll, true);
  assert.equal(full.limit, 250);
  assert.equal(full.batchSize, 50);
  assert.equal(full.startAfterId, 123);
  assert.equal(getCallSelectionPredicate(full), "id > $1");
});

test("public surface verification only fetches external URLs when explicitly requested", () => {
  assert.equal(parseVerifyPublicSurfaceArgs([]).baseUrl, null);
  assert.equal(
    parseVerifyPublicSurfaceArgs(["--base-url", "https://www.call-score.com"])
      .baseUrl,
    "https://www.call-score.com",
  );
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
  assert.equal(args.concurrency, 50);
  assert.equal(args.fallbackYtDlp, false);
  assert.equal(args.auditOut, ".tmp/transcripts.jsonl");
  assert.equal(args.write, false);
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
  assert.equal(commands["shadow-extract"][0].includes("--fallback-model"), false);
  assert.ok(commands["shadow-extract"][0].includes("--request-timeout-ms"));
  assert.ok(commands["shadow-extract"][0].includes("180000"));
  assert.ok(commands["shadow-extract"][0].includes("--video-agents"));
  assert.ok(commands["shadow-extract"][0].includes("1"));
  assert.ok(commands["shadow-extract"][0].includes("--chunk-agents"));
  assert.ok(commands["shadow-extract"][0].includes("1"));
  assert.ok(
    commands["shadow-extract"][0].some((part) =>
      part.endsWith("shadow-run-meta-A.json"),
    ),
  );
  assert.ok(
    commands["shadow-extract"][1].some((part) =>
      part.endsWith("shadow-run-meta-B.json"),
    ),
  );
  assert.equal(commands["shadow-extract"][0].includes("--execute"), false);
  assert.equal(commands["shadow-promote"][0].includes("--audit-out"), true);
  assert.ok(
    commands["shadow-promote"][0].some((part) =>
      part.endsWith("shadow-promote.jsonl"),
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
      part.endsWith("shadow-validation/A.json"),
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
  assert.deepEqual(commands["match-prices"], []);
});

test("data pipeline wires optional shadow fallback model to extraction commands", () => {
  const args = parseDataPipelineArgs([
    "--creators",
    "@A",
    "--audit-dir",
    ".tmp/pipeline-test",
    "--shadow-fallback-model",
    "glm-5.1",
  ]);
  const command = buildDataPipelineStageCommands(args)["shadow-extract"][0];

  assert.ok(command.includes("--fallback-model"));
  assert.ok(command.includes("glm-5.1"));
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
    "https://www.call-score.com",
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
  assert.equal(commands["match-prices"][0].includes("--all"), true);
  assert.equal(commands["match-prices"][0].includes("--batch-size"), true);
  assert.equal(
    commands["verify-public-surface"][0].includes("https://www.call-score.com"),
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
    },
    {
      id: 2,
      reasons: ["excerpt does not clearly support the extracted asset"],
      after: {
        score_status: "excluded_confidence",
        extraction_confidence: 0.69,
      },
    },
  ] as never;

  assert.deepEqual(
    filterWritableResults(results, { validOnly: true }).map((row) => row.id),
    [1],
  );
  assert.equal(summarizeAuditResults(results).valid, 1);
  assert.equal(summarizeAuditResults(results).wouldBecomeScored, 1);
});
