import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHermesWorkerArgs } from "../src/scripts/hermes-worker";
import { UPSERT_NEXT_CHANNEL_TASK_SQL } from "../src/scripts/callscore-agent-heartbeat";
import {
  compareEvalMetrics,
  parseMlAutoresearchArgs,
} from "../src/scripts/ml-autoresearch";
import { readBootstrapProducts } from "../src/scripts/bootstrap-whop";

const root = join(__dirname, "..");

type NextConfigType = {
  headers: () => Promise<readonly { source: string; headers: readonly { key: string; value: string }[] }[]>;
};

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function readAbsolute(path: string): string {
  return readFileSync(path, "utf8");
}

test("global security headers include a restrictive CSP", async () => {
  const nextConfig = (await import("../next.config.js")).default as NextConfigType;
  const headersConfig = await nextConfig.headers();
  const globalHeaders = headersConfig.find((entry: { source: string }) => entry.source === "/:path*");
  assert.ok(globalHeaders, "expected global /:path* headers");
  const headers = new Map(
    globalHeaders.headers.map((header: { key: string; value: string }) => [header.key, header.value]),
  );
  const middleware = read("middleware.ts");

  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(middleware, /Content-Security-Policy/);
  assert.match(middleware, /default-src 'self'/);
  assert.match(middleware, /object-src 'none'/);
  assert.match(middleware, /frame-ancestors 'self' https:\/\/whop\.com https:\/\/\*\.whop\.com/);
  assert.match(middleware, /base-uri 'self'/);
  assert.match(middleware, /manifest-src 'self'/);
  assert.match(middleware, /worker-src 'self' blob:/);
  assert.match(middleware, /media-src 'self' data: blob:/);
  assert.doesNotMatch(middleware, /script-src[^`\n]*'unsafe-inline'/);
});

test("CI workflow gates lint, typecheck, tests, and build", () => {
  const workflow = ".github/workflows/ci.yml";
  assert.equal(existsSync(join(root, workflow)), true);
  const src = read(workflow);
  assert.match(src, /npm run lint/);
  assert.match(src, /npm run typecheck/);
  assert.match(src, /npm test/);
  assert.match(src, /npm run build/);
});

test("core production pipeline scripts use structured logger instead of console", () => {
  for (const file of [
    "src/scripts/match-prices.ts",
    "src/scripts/detect-consensus.ts",
    "src/scripts/extract-calls-llm.ts",
    "src/scripts/compute-scores.ts",
    "src/scripts/hermes-worker.ts",
  ]) {
    const src = read(file);
    assert.match(src, /createLogger/);
    assert.doesNotMatch(src, /\bconsole\.(log|warn|error|info|debug|trace|dir|table)\b/, `${file} should log through createLogger`);
  }
});

test("Hermes worker args are bounded and explicit", () => {
  const args = parseHermesWorkerArgs([
    "--once",
    "--dry-run",
    "--worker-id",
    "unit-worker",
    "--poll-ms",
    "500",
    "--max-jobs",
    "2",
  ]);

  assert.equal(args.once, true);
  assert.equal(args.dryRun, true);
  assert.equal(args.workerId, "unit-worker");
  assert.equal(args.pollMs, 500);
  assert.equal(args.maxJobs, 2);
  assert.equal(args.pipelineJobs, true);
  assert.ok(args.channelTaskTypes.length > 0);
});

test("Hermes worker can run dedicated channel-agent task workers", () => {
  const args = parseHermesWorkerArgs([
    "--no-pipeline-jobs",
    "--channel-task-types",
    "owned_social_draft_and_monitor,compliance_lint_gate",
    "--worker-id",
    "channel-agent-owned-social-1",
  ]);

  assert.equal(args.pipelineJobs, false);
  assert.deepEqual(args.channelTaskTypes, ["owned_social_draft_and_monitor", "compliance_lint_gate"]);
  assert.equal(args.workerId, "channel-agent-owned-social-1");
});

test("Hermes worker dispatches claimed pipeline jobs through the operating graph", () => {
  const source = read("src/scripts/hermes-worker.ts");
  assert.match(source, /dispatchClaimedPipelineJobThroughOperatingGraph/);
  assert.match(source, /goal:\s*"dispatch_worker_once"/);
  assert.match(source, /workerDispatchFixture/);
});

test("Hermes worker dispatches claimed channel tasks through the operating graph", () => {
  const source = read("src/scripts/hermes-worker.ts");
  assert.match(source, /dispatchClaimedChannelTaskThroughOperatingGraph/);
  assert.match(source, /await dispatchClaimedChannelTaskThroughOperatingGraph\(channelTask, args\.workerId, logger\)/);
  assert.match(source, /supportedChannelTaskTypes:\s*\[\.\.\.SUPPORTED_CHANNEL_TASK_TYPES\]/);
  assert.doesNotMatch(source, /const metrics = await runChannelTask\(channelTask, args\.workerId\)/);
});

test("Docker compose runs pipeline and channel-agent workers as separate services", () => {
  const compose = read("docker-compose.yml");
  const hermesWorker = compose.match(/  hermes-worker:\n[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:)/)?.[0] ?? "";
  const channelWorker = compose.match(/  channel-agent-worker:\n[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:)/)?.[0] ?? "";
  const latentContinuous = compose.match(/  data-pipeline-continuous:\n[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:|\n?$)/)?.[0] ?? "";
  assert.match(hermesWorker, /--worker-id", "data-pipeline-worker/);
  assert.match(hermesWorker, /--no-channel-tasks/);
  assert.match(hermesWorker, /\.tmp:\/app\/\.tmp/, "pipeline worker receipts and public artifacts must persist on host");
  assert.doesNotMatch(hermesWorker, /--no-pipeline-jobs/);
  assert.match(channelWorker, /--worker-id", "channel-agent-worker/);
  assert.match(channelWorker, /--no-pipeline-jobs/);
  assert.match(channelWorker, /\.tmp:\/app\/\.tmp/, "channel worker receipts must persist on host");
  assert.doesNotMatch(channelWorker, /pipeline:data:continuous/);
  assert.match(latentContinuous, /profiles:\s*\["debug"\]/, "latent continuous direct consumer must require the debug profile");
});

test("Netlify schedules only graph-backed alert crons after O13 cutover", () => {
  const netlify = read("netlify.toml");
  assert.match(netlify, /\[functions\."cron-alerts-scan"\][\s\S]*schedule = "0 \*\/6 \* \* \*"/);
  assert.match(netlify, /\[functions\."cron-alerts-send"\][\s\S]*schedule = "15 \*\/6 \* \* \*"/);
  for (const disabled of [
    "cron-weekly",
    "cron-ml-enqueue",
    "cron-candles-enqueue",
    "cron-match-enqueue",
    "cron-scores-enqueue",
  ]) {
    assert.doesNotMatch(netlify, new RegExp(`\\[functions\\."${disabled}"\\][\\s\\S]*schedule\\s*=`), `${disabled} must not be an active Netlify scheduled function`);
  }
});

test("active O13 shell wrappers enter operating goals before legacy implementations", () => {
  const wrappers = [
    ["/srv/agents/hermes/scripts/callscore-daily-pipeline-operating.sh", "refresh_data", /--refresh-data-command/],
    ["/srv/agents/hermes/scripts/callscore-cron-candles.sh", "refresh_data", /CALLSCORE_CANDLES_PRODUCER|callscore-enqueue-candles/],
    ["/srv/agents/hermes/scripts/callscore-cron-match.sh", "refresh_data", /CALLSCORE_MATCH_PRODUCER|callscore-enqueue-match/],
    ["/srv/agents/hermes/scripts/callscore-cron-scores.sh", "refresh_data", /CALLSCORE_SCORES_PRODUCER|callscore-enqueue-scores/],
    ["/srv/agents/hermes/scripts/callscore-video-scheduler.sh", "produce_video", /--video-command|CALLSCORE_VIDEO_SCHEDULER_IMPL/],
    ["/srv/agents/hermes/scripts/callscore-video-queue-consumer.sh", "produce_video", /--video-command|CALLSCORE_VIDEO_QUEUE_CONSUMER_IMPL/],
    ["/srv/agents/hermes/scripts/callscore-creator-growth-scout.sh", "evidence_research", /--evidence-command|CALLSCORE_CREATOR_GROWTH_SCOUT_IMPL/],
  ] as const;

  for (const [scriptPath, goal, commandPattern] of wrappers) {
    assert.equal(existsSync(scriptPath), true, `${scriptPath} must exist`);
    const script = readAbsolute(scriptPath);
    assert.match(script, /npm run operating:goal/);
    assert.match(script, new RegExp(`--goal\\s+${goal}`));
    assert.match(script, commandPattern);
    assert.match(script, /npm run workplane:status -- --json/);
    assert.match(script, /npm run agents:heartbeat -- --dry-run/);
  }
});

test("installed O13 systemd entrypoints use graph wrappers or canonical compose workers", () => {
  const canary = readAbsolute("/etc/systemd/system/callscore-control-plane-canary.service");
  const dailyDropIn = readAbsolute("/etc/systemd/system/callscore-daily-pipeline.service.d/o13-operating-graph.conf");
  const worker = readAbsolute("/etc/systemd/system/hermes-worker.service");

  assert.match(canary, /ExecStart=\/usr\/bin\/npm run operating:goal -- --goal monitor --read-live --max-items 1/);
  assert.match(dailyDropIn, /ExecStart=\s*\nExecStart=\/srv\/agents\/hermes\/scripts\/callscore-daily-pipeline-operating\.sh/);
  assert.match(worker, /ExecStart=\/usr\/bin\/docker compose up -d hermes-worker/);
  assert.doesNotMatch(worker, /data-pipeline-continuous/);
});

test("agent heartbeat does not enqueue duplicate open channel tasks", () => {
  assert.match(UPSERT_NEXT_CHANNEL_TASK_SQL, /existing_open/i);
  assert.match(UPSERT_NEXT_CHANNEL_TASK_SQL, /status IN \('pending','running'\)/i);
  assert.match(UPSERT_NEXT_CHANNEL_TASK_SQL, /WHERE NOT EXISTS \(SELECT 1 FROM existing_open\)/i);
  assert.match(UPSERT_NEXT_CHANNEL_TASK_SQL, /'existing_open' AS source/i);
});

test("ML autoresearch parser and gates reject precision regressions", () => {
  const args = parseMlAutoresearchArgs([
    "--baseline-prompt-version",
    "v1",
    "--candidate-prompt-version",
    "v2",
    "--provider",
    "openrouter",
    "--model",
    "test-model",
    "--limit",
    "10",
    "--write",
  ]);

  assert.equal(args.baselinePromptVersion, "v1");
  assert.equal(args.candidatePromptVersion, "v2");
  assert.equal(args.provider, "openrouter");
  assert.equal(args.model, "test-model");
  assert.equal(args.limit, 10);
  assert.equal(args.write, true);

  const comparison = compareEvalMetrics([
    {
      call_id: 1,
      label: "approve",
      label_reason_code: null,
      symbol: "BTCUSDT",
      baseline_decision: "approve",
      candidate_decision: "reject",
    },
    {
      call_id: 2,
      label: "reject",
      label_reason_code: "generic_word",
      symbol: "LINKUSDT",
      baseline_decision: "reject",
      candidate_decision: "approve",
    },
  ]);

  assert.equal(comparison.accepted, false);
  assert.ok(comparison.acceptance_reasons.includes("precision_regressed"));
  assert.ok(comparison.acceptance_reasons.includes("critical_holdout_regressions"));
});

test("Whop bootstrap env reader is import-safe and validates required product ids", () => {
  assert.deepEqual(
    readBootstrapProducts({
      WHOP_FREE_PRODUCT_ID: "prod_free",
      WHOP_PRO_PRODUCT_ID: "prod_pro",
      WHOP_ALPHA_PRODUCT_ID: "prod_alpha",
    } as unknown as NodeJS.ProcessEnv),
    {
      free: "prod_free",
      pro: "prod_pro",
      alpha: "prod_alpha",
    },
  );
});

test("legacy pipeline package scripts point at canonical entrypoints", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

  assert.match(pkg.scripts.scrape, /scrape-transcripts-v2\.ts/);
  assert.doesNotMatch(pkg.scripts.scrape, /scrape-transcripts\.ts/);
  assert.match(pkg.scripts.extract, /extract-calls-llm\.ts/);
  assert.doesNotMatch(pkg.scripts.extract, /extract-calls\.ts(?:\s|$)/);
  assert.match(pkg.scripts.pipeline, /pipeline:data/);
});

test("legacy extractor wrappers redirect to canonical LLM extraction implementation", () => {
  assert.match(read("src/scripts/extract-calls.ts"), /extract-calls-openrouter/);
  assert.match(read("src/scripts/extract-calls-batch.ts"), /extract-calls-openrouter/);
  assert.match(read("src/scripts/scrape-transcripts.ts"), /scrape-transcripts-v2/);
});

test("current pipeline docs mark stale scripts and design lock superseded", () => {
  const doc = read("docs/current-pipeline-entrypoints.md");
  assert.match(doc, /scrape-transcripts\.ts/);
  assert.match(doc, /extract-calls\.ts/);
  assert.match(doc, /extract-calls-batch\.ts/);
  assert.match(doc, /SUPERSEDED/);
  assert.match(doc, /frontend-design-spec\.md/);
});
