import { appendFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DEFAULT_CANDLE_REFRESH_SYMBOLS } from "./refresh-candles";
import { loadEnv, timestamp } from "./script-helpers";

const DEFAULT_CREATORS = [
  "@AltcoinDaily",
  "@DiscoverCrypto",
  "@CryptoBanter",
  "@CryptosRUs",
  "@AlexBecker",
] as const;

const STAGES = [
  "secret-hygiene",
  "discover",
  "transcripts",
  "shadow-extract",
  "shadow-diff",
  "shadow-promote",
  "candles",
  "match-prices",
  "compute-scores",
  "audit",
  "pipeline-readiness",
  "verify-public-surface",
] as const;

type StageName = (typeof STAGES)[number];

interface DataPipelineArgs {
  readonly creators: readonly string[];
  readonly symbols: readonly string[];
  readonly limitCreators: number;
  readonly limitVideos: number;
  readonly limitLlmVideos: number;
  readonly limitPromotions: number;
  readonly sinceDays: number;
  readonly maxCandleRequestsPerSymbol: number;
  readonly gapMs: number;
  readonly auditDir: string;
  readonly shadowRunId: string;
  readonly shadowProvider: string | null;
  readonly shadowModel: string | null;
  readonly shadowAllowStatuses: string | null;
  readonly rematchAllPrices: boolean;
  readonly limitPriceMatches: number;
  readonly priceMatchBatchSize: number;
  readonly priceMatchStartAfterId: number;
  readonly verifyBaseUrl: string | null;
  readonly write: boolean;
  readonly skipStages: ReadonlySet<StageName>;
}

interface StageResult {
  readonly stage: StageName;
  readonly status: "completed" | "skipped" | "failed";
  readonly mode: "WRITE" | "DRY";
  readonly started_at: string;
  readonly finished_at: string;
  readonly duration_ms: number;
  readonly command?: readonly string[];
  readonly audit_file?: string;
  readonly exit_code?: number | null;
  readonly error?: string;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function csv(value: string | null, fallback: readonly string[]): readonly string[] {
  if (!value) return fallback;
  const parsed = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function parseSkipStages(argv: readonly string[]): ReadonlySet<StageName> {
  const skipped = new Set<StageName>();
  for (const stage of STAGES) {
    if (argv.includes(`--skip-${stage}`)) skipped.add(stage);
  }
  return skipped;
}

export function parseDataPipelineArgs(argv = process.argv.slice(2)): DataPipelineArgs {
  const limitCreators = positiveInt(argValue(argv, "--limit-creators"), DEFAULT_CREATORS.length);
  const auditDir = argValue(argv, "--audit-dir") ?? `.tmp/callscore-pipeline/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  return {
    creators: csv(argValue(argv, "--creators"), DEFAULT_CREATORS).slice(0, limitCreators),
    symbols: csv(argValue(argv, "--symbols"), DEFAULT_CANDLE_REFRESH_SYMBOLS),
    limitCreators,
    limitVideos: positiveInt(argValue(argv, "--limit-videos"), 250),
    limitLlmVideos: positiveInt(argValue(argv, "--limit-llm-videos"), 100),
    limitPromotions: positiveInt(argValue(argv, "--limit-promotions"), 25),
    sinceDays: positiveInt(argValue(argv, "--since-days"), 365),
    maxCandleRequestsPerSymbol: positiveInt(argValue(argv, "--max-candle-requests-per-symbol"), 25),
    gapMs: positiveInt(argValue(argv, "--gap-ms"), 1000),
    auditDir,
    shadowRunId: argValue(argv, "--shadow-run-id") ?? `pipeline-${path.basename(auditDir).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    shadowProvider: argValue(argv, "--shadow-provider"),
    shadowModel: argValue(argv, "--shadow-model"),
    shadowAllowStatuses: argValue(argv, "--shadow-allow-statuses"),
    rematchAllPrices: argv.includes("--rematch-all-prices"),
    limitPriceMatches: positiveInt(argValue(argv, "--limit-price-matches"), Number.MAX_SAFE_INTEGER),
    priceMatchBatchSize: positiveInt(argValue(argv, "--price-match-batch-size"), 200),
    priceMatchStartAfterId: nonNegativeInt(argValue(argv, "--price-match-start-after-id"), 0),
    verifyBaseUrl: argValue(argv, "--verify-base-url"),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    skipStages: parseSkipStages(argv),
  };
}

function repoRoot(): string {
  return path.resolve(__dirname, "../..");
}

function scriptCommand(scriptPath: string, args: readonly string[]): readonly string[] {
  return [process.execPath, "--import", "tsx", scriptPath, ...args];
}

function auditFile(args: DataPipelineArgs, stage: StageName, suffix = "jsonl"): string {
  return path.resolve(repoRoot(), args.auditDir, `${stage}.${suffix}`);
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "") || "all";
}

function appendRunAudit(args: DataPipelineArgs, result: StageResult): void {
  mkdirSync(path.resolve(repoRoot(), args.auditDir), { recursive: true });
  appendFileSync(
    path.resolve(repoRoot(), args.auditDir, "pipeline-run.jsonl"),
    `${JSON.stringify(result)}\n`,
  );
}

function runCommand(stage: StageName, command: readonly string[], args: DataPipelineArgs, auditPath?: string): StageResult {
  const startedAt = timestamp();
  const start = Date.now();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot(),
    env: process.env,
    encoding: "utf-8",
    stdio: "pipe",
  });

  if (auditPath) {
    mkdirSync(path.dirname(auditPath), { recursive: true });
    appendFileSync(auditPath, JSON.stringify({
      ts: timestamp(),
      stage,
      command: [command[0], ...command.slice(1).map((part) => part.includes("=") ? part.split("=")[0] : part)],
      stdout: result.stdout?.slice(-20_000) ?? "",
      stderr: result.stderr?.slice(-20_000) ?? "",
      exit_code: result.status,
    }) + "\n");
  }

  const stageResult: StageResult = {
    stage,
    status: result.status === 0 ? "completed" : "failed",
    mode: args.write ? "WRITE" : "DRY",
    started_at: startedAt,
    finished_at: timestamp(),
    duration_ms: Date.now() - start,
    command,
    audit_file: auditPath,
    exit_code: result.status,
    error: result.status === 0 ? undefined : (result.stderr || result.error?.message || "stage failed").slice(-1000),
  };
  appendRunAudit(args, stageResult);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return stageResult;
}

function skippedResult(stage: StageName, args: DataPipelineArgs, reason: string): StageResult {
  const now = timestamp();
  return {
    stage,
    status: "skipped",
    mode: args.write ? "WRITE" : "DRY",
    started_at: now,
    finished_at: now,
    duration_ms: 0,
    error: reason,
  };
}

export function buildDataPipelineStageCommands(args: DataPipelineArgs): Record<StageName, readonly (readonly string[])[]> {
  const writeFlag = args.write ? ["--write"] : [];
  const shadowExecuteFlag = args.write ? ["--execute"] : [];
  const shadowProviderArgs = args.shadowProvider ? ["--provider", args.shadowProvider] : [];
  const shadowModelArgs = args.shadowModel ? ["--model", args.shadowModel] : [];
  const shadowAllowArgs = args.shadowAllowStatuses ? ["--allow-statuses", args.shadowAllowStatuses] : [];
  const shadowOut = path.resolve(repoRoot(), args.auditDir, "shadow-extractions.jsonl");
  const shadowDiffOut = path.resolve(repoRoot(), args.auditDir, "shadow-diff.jsonl");
  const shadowPromoteAuditOut = path.resolve(repoRoot(), args.auditDir, "shadow-promote.jsonl");
  const transcriptAuditOut = path.resolve(repoRoot(), args.auditDir, "transcripts.jsonl");
  const verifyBaseUrlArgs = args.verifyBaseUrl ? ["--base-url", args.verifyBaseUrl] : [];
  const creatorCommands = (script: string, extra: readonly string[] = []) =>
    args.creators.map((creator) => scriptCommand(script, ["--creator", creator, ...extra, ...writeFlag]));

  return {
    "secret-hygiene": [scriptCommand("src/scripts/check-secret-hygiene.ts", [])],
    discover: creatorCommands("src/scripts/discover-videos-365.ts", [
      "--limit-videos", String(args.limitVideos),
      "--since-days", String(args.sinceDays),
      "--audit-out", auditFile(args, "discover"),
    ]),
    transcripts: creatorCommands("src/scripts/scrape-transcripts-v2.ts", [
      "--limit-videos", String(args.limitVideos),
      "--since-days", String(args.sinceDays),
      "--audit-out", transcriptAuditOut,
    ]),
    "shadow-extract": args.creators.map((creator) => scriptCommand("src/scripts/shadow-extract-transcripts.ts", [
      "--creator", creator,
      "--limit", String(args.limitLlmVideos),
      "--run-id", args.shadowRunId,
      "--shadow-out", shadowOut,
      "--run-meta-out", path.resolve(repoRoot(), args.auditDir, `shadow-run-meta-${safeFilePart(creator)}.json`),
      ...shadowProviderArgs,
      ...shadowModelArgs,
      ...shadowExecuteFlag,
    ])),
    "shadow-diff": [scriptCommand("src/scripts/shadow-diff-extractions.ts", [
      "--shadow-in", shadowOut,
      "--diff-out", shadowDiffOut,
      "--run-id", args.shadowRunId,
    ])],
    "shadow-promote": [scriptCommand("src/scripts/promote-shadow-extractions.ts", [
      "--shadow-in", shadowOut,
      "--diff-in", shadowDiffOut,
      "--audit-out", shadowPromoteAuditOut,
      "--confirm-run-id", args.shadowRunId,
      "--limit", String(args.limitPromotions),
      ...shadowAllowArgs,
      ...writeFlag,
    ])],
    candles: [scriptCommand("src/scripts/refresh-candles.ts", [
      "--symbols", args.symbols.join(","),
      "--max-requests-per-symbol", String(args.maxCandleRequestsPerSymbol),
      "--gap-ms", String(args.gapMs),
      "--audit-out", auditFile(args, "candles"),
      ...writeFlag,
    ])],
    "match-prices": args.write ? [scriptCommand("src/scripts/match-prices.ts", [
      ...(args.rematchAllPrices ? ["--all"] : []),
      ...(args.limitPriceMatches !== Number.MAX_SAFE_INTEGER ? ["--limit", String(args.limitPriceMatches)] : []),
      "--batch-size", String(args.priceMatchBatchSize),
      ...(args.priceMatchStartAfterId > 0 ? ["--start-after-id", String(args.priceMatchStartAfterId)] : []),
    ])] : [],
    "compute-scores": args.write ? [scriptCommand("src/scripts/compute-scores.ts", [])] : [],
    audit: [scriptCommand("src/scripts/audit-coverage-report.ts", ["--json"])],
    "pipeline-readiness": [scriptCommand("src/scripts/audit-pipeline-readiness.ts", [
      "--shadow-in", shadowOut,
      "--diff-in", shadowDiffOut,
      "--promote-in", shadowPromoteAuditOut,
      "--transcript-audit-in", transcriptAuditOut,
      "--run-id", args.shadowRunId,
      "--allow-partial-shadow",
      "--audit-out", path.resolve(repoRoot(), args.auditDir, "pipeline-readiness.json"),
      "--summary",
    ])],
    "verify-public-surface": [scriptCommand("src/scripts/verify-public-surface.ts", [
      "--audit-out", path.resolve(repoRoot(), args.auditDir, "public-surface-verification.json"),
      ...verifyBaseUrlArgs,
    ])],
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseDataPipelineArgs(argv);
  mkdirSync(path.resolve(repoRoot(), args.auditDir), { recursive: true });

  console.log(`[${timestamp()}] data-pipeline ${args.write ? "WRITE" : "DRY-RUN"}: creators=${args.creators.join(",")} symbols=${args.symbols.length} auditDir=${args.auditDir}`);
  const commandsByStage = buildDataPipelineStageCommands(args);
  let failed = false;

  for (const stage of STAGES) {
    if (args.skipStages.has(stage)) {
      const result = skippedResult(stage, args, "explicitly skipped");
      appendRunAudit(args, result);
      console.log(`[${timestamp()}] ${stage}: skipped`);
      continue;
    }

    const commands = commandsByStage[stage];
    if (commands.length === 0) {
      const result = skippedResult(stage, args, args.write ? "no command" : "write-only stage skipped in dry-run");
      appendRunAudit(args, result);
      console.log(`[${timestamp()}] ${stage}: skipped (${result.error})`);
      continue;
    }

    for (const command of commands) {
      const result = runCommand(stage, command, args, auditFile(args, stage, "log.jsonl"));
      if (result.status === "failed") {
        failed = true;
        console.error(`[${timestamp()}] ${stage}: failed; stopping before downstream publish verification`);
        break;
      }
    }
    if (failed) break;
  }

  if (failed) process.exitCode = 1;
  console.log(`[${timestamp()}] data-pipeline complete: status=${failed ? "failed" : "completed"} auditDir=${args.auditDir}`);
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((error) => {
    console.error(`[${timestamp()}] Fatal error:`, error);
    process.exit(1);
  });
}
