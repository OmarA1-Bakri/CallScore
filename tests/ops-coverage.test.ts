import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHermesWorkerArgs } from "../src/scripts/hermes-worker";
import {
  compareEvalMetrics,
  parseMlAutoresearchArgs,
} from "../src/scripts/ml-autoresearch";
import { readBootstrapProducts } from "../src/scripts/bootstrap-whop";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

test("global security headers include a restrictive CSP", async () => {
  const nextConfig = (await import("../next.config.js")).default as {
    headers: () => Promise<readonly { source: string; headers: readonly { key: string; value: string }[] }[]>;
  };
  const headersConfig = await nextConfig.headers();
  const globalHeaders = headersConfig.find((entry: { source: string }) => entry.source === "/:path*");
  assert.ok(globalHeaders, "expected global /:path* headers");
  const headers = new Map(
    globalHeaders.headers.map((header: { key: string; value: string }) => [header.key, header.value]),
  );
  const csp = headers.get("Content-Security-Policy");

  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.ok(csp, "Content-Security-Policy header is required");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors https:\/\/whop\.com https:\/\/\*\.whop\.com/);
  assert.match(csp, /base-uri 'self'/);
  assert.doesNotMatch(csp, /\n/);
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
    "src/scripts/extract-calls-openrouter.ts",
    "src/scripts/compute-scores.ts",
    "src/scripts/hermes-worker.ts",
  ]) {
    const src = read(file);
    assert.match(src, /createLogger/);
    assert.doesNotMatch(src, /console\.(log|warn|error)/, `${file} should log through createLogger`);
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
  assert.match(pkg.scripts.extract, /extract-calls-openrouter\.ts/);
  assert.doesNotMatch(pkg.scripts.extract, /extract-calls\.ts(?:\s|$)/);
  assert.match(pkg.scripts.pipeline, /pipeline:data/);
});

test("legacy extractor wrappers redirect to canonical OpenRouter implementation", () => {
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
