import { appendFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { DEFAULT_CANDLE_REFRESH_SYMBOLS } from "./refresh-candles";
import { loadEnv, runWithConcurrency, timestamp } from "./script-helpers";

const DEFAULT_CREATORS = [
  "@AltcoinDaily",
  "@DiscoverCrypto",
  "@CryptoBanter",
  "@CryptosRUs",
  "@AlexBecker",
] as const;

const DEFAULT_SHADOW_PROVIDER = "ollama";
const DEFAULT_SHADOW_MODEL = "kimi-k2.6";
const DEFAULT_SHADOW_REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_SHADOW_AGENTS = 1;
const MAX_SHADOW_AGENTS = 3;
const DEFAULT_SHADOW_VIDEO_AGENTS = 1;
const MAX_SHADOW_VIDEO_AGENTS = 3;
const DEFAULT_SHADOW_CHUNK_AGENTS = 1;
const MAX_SHADOW_CHUNK_AGENTS = 3;
const DEFAULT_SHADOW_MODEL_ATTEMPTS = 2;
const MAX_SHADOW_MODEL_ATTEMPTS = 3;
const DEFAULT_SHADOW_GAP_MS = 0;

const STAGES = [
  "secret-hygiene",
  "discover",
  "transcripts",
  "shadow-extract",
  "shadow-validate",
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
  readonly shadowFallbackModel: string | null;
  readonly shadowRequestTimeoutMs: number;
  readonly shadowAgents: number;
  readonly shadowVideoAgents: number;
  readonly shadowChunkAgents: number;
  readonly shadowModelAttempts: number;
  readonly shadowGapMs: number;
  readonly shadowPromoteVideoIds: readonly number[];
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

function boundedPositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  return Math.min(positiveInt(value, fallback), max);
}

function positiveIntList(value: string | null): readonly number[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((parsed) => Number.isInteger(parsed) && parsed > 0),
    ),
  );
}

function nonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function csv(
  value: string | null,
  fallback: readonly string[],
): readonly string[] {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function parseSkipStages(argv: readonly string[]): ReadonlySet<StageName> {
  const skipped = new Set<StageName>();
  for (const stage of STAGES) {
    if (argv.includes(`--skip-${stage}`)) skipped.add(stage);
  }
  return skipped;
}

export function parseDataPipelineArgs(
  argv = process.argv.slice(2),
): DataPipelineArgs {
  const limitCreators = positiveInt(
    argValue(argv, "--limit-creators"),
    DEFAULT_CREATORS.length,
  );
  const auditDir =
    argValue(argv, "--audit-dir") ??
    `.tmp/callscore-pipeline/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  return {
    creators: csv(argValue(argv, "--creators"), DEFAULT_CREATORS).slice(
      0,
      limitCreators,
    ),
    symbols: csv(argValue(argv, "--symbols"), DEFAULT_CANDLE_REFRESH_SYMBOLS),
    limitCreators,
    limitVideos: positiveInt(argValue(argv, "--limit-videos"), 250),
    limitLlmVideos: positiveInt(argValue(argv, "--limit-llm-videos"), 100),
    limitPromotions: positiveInt(argValue(argv, "--limit-promotions"), 25),
    sinceDays: positiveInt(argValue(argv, "--since-days"), 365),
    maxCandleRequestsPerSymbol: positiveInt(
      argValue(argv, "--max-candle-requests-per-symbol"),
      25,
    ),
    gapMs: positiveInt(argValue(argv, "--gap-ms"), 1000),
    auditDir,
    shadowRunId:
      argValue(argv, "--shadow-run-id") ??
      `pipeline-${path.basename(auditDir).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    shadowProvider:
      argValue(argv, "--shadow-provider") ?? DEFAULT_SHADOW_PROVIDER,
    shadowModel: argValue(argv, "--shadow-model") ?? DEFAULT_SHADOW_MODEL,
    shadowFallbackModel: argValue(argv, "--shadow-fallback-model"),
    shadowRequestTimeoutMs: positiveInt(
      argValue(argv, "--shadow-request-timeout-ms"),
      DEFAULT_SHADOW_REQUEST_TIMEOUT_MS,
    ),
    shadowAgents: boundedPositiveInt(
      argValue(argv, "--shadow-agents"),
      DEFAULT_SHADOW_AGENTS,
      MAX_SHADOW_AGENTS,
    ),
    shadowVideoAgents: boundedPositiveInt(
      argValue(argv, "--shadow-video-agents"),
      DEFAULT_SHADOW_VIDEO_AGENTS,
      MAX_SHADOW_VIDEO_AGENTS,
    ),
    shadowChunkAgents: boundedPositiveInt(
      argValue(argv, "--shadow-chunk-agents"),
      DEFAULT_SHADOW_CHUNK_AGENTS,
      MAX_SHADOW_CHUNK_AGENTS,
    ),
    shadowModelAttempts: boundedPositiveInt(
      argValue(argv, "--shadow-model-attempts"),
      DEFAULT_SHADOW_MODEL_ATTEMPTS,
      MAX_SHADOW_MODEL_ATTEMPTS,
    ),
    shadowGapMs: nonNegativeInt(
      argValue(argv, "--shadow-gap-ms"),
      DEFAULT_SHADOW_GAP_MS,
    ),
    shadowPromoteVideoIds: positiveIntList(
      argValue(argv, "--shadow-promote-video-ids"),
    ),
    shadowAllowStatuses: argValue(argv, "--shadow-allow-statuses"),
    rematchAllPrices: argv.includes("--rematch-all-prices"),
    limitPriceMatches: positiveInt(
      argValue(argv, "--limit-price-matches"),
      Number.MAX_SAFE_INTEGER,
    ),
    priceMatchBatchSize: positiveInt(
      argValue(argv, "--price-match-batch-size"),
      200,
    ),
    priceMatchStartAfterId: nonNegativeInt(
      argValue(argv, "--price-match-start-after-id"),
      0,
    ),
    verifyBaseUrl: argValue(argv, "--verify-base-url"),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    skipStages: parseSkipStages(argv),
  };
}

function repoRoot(): string {
  return path.resolve(__dirname, "../..");
}

function scriptCommand(
  scriptPath: string,
  args: readonly string[],
): readonly string[] {
  return [process.execPath, "--import", "tsx", scriptPath, ...args];
}

function auditFile(
  args: DataPipelineArgs,
  stage: StageName,
  suffix = "jsonl",
): string {
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

function sanitizeCommandForAudit(
  command: readonly string[],
): readonly string[] {
  return [
    command[0],
    ...command
      .slice(1)
      .map((part) => (part.includes("=") ? part.split("=")[0] : part)),
  ];
}
function runCommand(
  stage: StageName,
  command: readonly string[],
  args: DataPipelineArgs,
  auditPath?: string,
): Promise<StageResult> {
  const startedAt = timestamp();
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repoRoot(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      stderr += error.message;
    });
    child.on("close", (code) => {
      if (auditPath) {
        mkdirSync(path.dirname(auditPath), { recursive: true });
        appendFileSync(
          auditPath,
          JSON.stringify({
            ts: timestamp(),
            stage,
            command: sanitizeCommandForAudit(command),
            stdout: stdout.slice(-20_000),
            stderr: stderr.slice(-20_000),
            exit_code: code,
          }) + "\n",
        );
      }
      const stageResult: StageResult = {
        stage,
        status: code === 0 ? "completed" : "failed",
        mode: args.write ? "WRITE" : "DRY",
        started_at: startedAt,
        finished_at: timestamp(),
        duration_ms: Date.now() - start,
        command,
        audit_file: auditPath,
        exit_code: code,
        error: code === 0 ? undefined : (stderr || "stage failed").slice(-1000),
      };
      appendRunAudit(args, stageResult);
      resolve(stageResult);
    });
  });
}

function runCommandAsync(
  stage: StageName,
  command: readonly string[],
  args: DataPipelineArgs,
  auditPath?: string,
): Promise<StageResult> {
  const startedAt = timestamp();
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repoRoot(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      stderr += error.message;
    });
    child.on("close", (code) => {
      if (auditPath) {
        mkdirSync(path.dirname(auditPath), { recursive: true });
        appendFileSync(
          auditPath,
          JSON.stringify({
            ts: timestamp(),
            stage,
            command: sanitizeCommandForAudit(command),
            stdout: stdout.slice(-20_000),
            stderr: stderr.slice(-20_000),
            exit_code: code,
          }) + "\n",
        );
      }
      const stageResult: StageResult = {
        stage,
        status: code === 0 ? "completed" : "failed",
        mode: args.write ? "WRITE" : "DRY",
        started_at: startedAt,
        finished_at: timestamp(),
        duration_ms: Date.now() - start,
        command,
        audit_file: auditPath,
        exit_code: code,
        error: code === 0 ? undefined : (stderr || "stage failed").slice(-1000),
      };
      appendRunAudit(args, stageResult);
      resolve(stageResult);
    });
  });
}

async function runCommandsWithPool(
  stage: StageName,
  commands: readonly (readonly string[])[],
  args: DataPipelineArgs,
  concurrency: number,
): Promise<readonly StageResult[]> {
  const auditPath = auditFile(args, stage, "log.jsonl");
  return await runWithConcurrency(
    commands,
    concurrency,
    (command) =>
      runCommandAsync(
        stage,
        command,
        args,
        auditPath,
      ),
    (result) => result.status === "failed",
  );
}

function parallelLimitForStage(
  stage: StageName,
  args: DataPipelineArgs,
): number {
  if (stage === "shadow-extract" || stage === "shadow-validate")
    return args.shadowAgents;
  return 1;
}

function skippedResult(
  stage: StageName,
  args: DataPipelineArgs,
  reason: string,
): StageResult {
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

export function buildDataPipelineStageCommands(
  args: DataPipelineArgs,
): Record<StageName, readonly (readonly string[])[]> {
  const writeFlag = args.write ? ["--write"] : [];
  const shadowExecuteFlag = args.write ? ["--execute"] : [];
  const shadowProviderArgs = args.shadowProvider
    ? ["--provider", args.shadowProvider]
    : [];
  const shadowModelArgs = args.shadowModel ? ["--model", args.shadowModel] : [];
  const shadowFallbackModelArgs = args.shadowFallbackModel
    ? ["--fallback-model", args.shadowFallbackModel]
    : [];
  const shadowRequestTimeoutArgs = [
    "--request-timeout-ms",
    String(args.shadowRequestTimeoutMs),
  ];
  const shadowVideoAgentsArgs = [
    "--video-agents",
    String(args.shadowVideoAgents),
  ];
  const shadowChunkAgentsArgs = [
    "--chunk-agents",
    String(args.shadowChunkAgents),
  ];
  const shadowModelAttemptsArgs = [
    "--model-attempts",
    String(args.shadowModelAttempts),
  ];
  const shadowGapArgs = ["--gap-ms", String(args.shadowGapMs)];
  const shadowAllowArgs = args.shadowAllowStatuses
    ? ["--allow-statuses", args.shadowAllowStatuses]
    : [];
  const shadowPromoteVideoIdArgs =
    args.shadowPromoteVideoIds.length > 0
      ? ["--video-ids", args.shadowPromoteVideoIds.join(",")]
      : [];
  const shadowOut = path.resolve(
    repoRoot(),
    args.auditDir,
    "shadow-extractions.jsonl",
  );
  const shadowDiffOut = path.resolve(
    repoRoot(),
    args.auditDir,
    "shadow-diff.jsonl",
  );
  const shadowPromoteAuditOut = path.resolve(
    repoRoot(),
    args.auditDir,
    "shadow-promote.jsonl",
  );
  const transcriptAuditOut = path.resolve(
    repoRoot(),
    args.auditDir,
    "transcripts.jsonl",
  );
  const shadowValidateAuditOut = path.resolve(
    repoRoot(),
    args.auditDir,
    "shadow-validation",
  );
  const verifyBaseUrlArgs = args.verifyBaseUrl
    ? ["--base-url", args.verifyBaseUrl]
    : [];
  const creatorCommands = (script: string, extra: readonly string[] = []) =>
    args.creators.map((creator) =>
      scriptCommand(script, ["--creator", creator, ...extra, ...writeFlag]),
    );

  return {
    "secret-hygiene": [
      scriptCommand("src/scripts/check-secret-hygiene.ts", []),
    ],
    discover: creatorCommands("src/scripts/discover-videos-365.ts", [
      "--limit-videos",
      String(args.limitVideos),
      "--since-days",
      String(args.sinceDays),
      "--audit-out",
      auditFile(args, "discover"),
    ]),
    transcripts: creatorCommands("src/scripts/scrape-transcripts-v2.ts", [
      "--limit-videos",
      String(args.limitVideos),
      "--since-days",
      String(args.sinceDays),
      "--audit-out",
      transcriptAuditOut,
    ]),
    "shadow-extract": args.creators.map((creator) =>
      scriptCommand("src/scripts/shadow-extract-transcripts.ts", [
        "--creator",
        creator,
        "--limit",
        String(args.limitLlmVideos),
        "--run-id",
        args.shadowRunId,
        "--shadow-out",
        shadowOut,
        "--run-meta-out",
        path.resolve(
          repoRoot(),
          args.auditDir,
          `shadow-run-meta-${safeFilePart(creator)}.json`,
        ),
        ...shadowProviderArgs,
        ...shadowModelArgs,
        ...shadowFallbackModelArgs,
        ...shadowRequestTimeoutArgs,
        ...shadowVideoAgentsArgs,
        ...shadowChunkAgentsArgs,
        ...shadowModelAttemptsArgs,
        ...shadowGapArgs,
        ...shadowExecuteFlag,
      ]),
    ),
    "shadow-validate": args.creators.map((creator) =>
      scriptCommand("src/scripts/validate-shadow-extractions.ts", [
        "--shadow-in",
        shadowOut,
        "--run-id",
        args.shadowRunId,
        "--creator",
        creator,
        "--require-records",
        "--summary",
        "--audit-out",
        path.resolve(shadowValidateAuditOut, `${safeFilePart(creator)}.json`),
      ]),
    ),
    "shadow-diff": [
      scriptCommand("src/scripts/shadow-diff-extractions.ts", [
        "--shadow-in",
        shadowOut,
        "--diff-out",
        shadowDiffOut,
        "--run-id",
        args.shadowRunId,
      ]),
    ],
    "shadow-promote": [
      scriptCommand("src/scripts/promote-shadow-extractions.ts", [
        "--shadow-in",
        shadowOut,
        "--diff-in",
        shadowDiffOut,
        "--audit-out",
        shadowPromoteAuditOut,
        "--confirm-run-id",
        args.shadowRunId,
        "--limit",
        String(args.limitPromotions),
        ...shadowAllowArgs,
        ...shadowPromoteVideoIdArgs,
        ...writeFlag,
      ]),
    ],
    candles: [
      scriptCommand("src/scripts/refresh-candles.ts", [
        "--symbols",
        args.symbols.join(","),
        "--max-requests-per-symbol",
        String(args.maxCandleRequestsPerSymbol),
        "--gap-ms",
        String(args.gapMs),
        "--audit-out",
        auditFile(args, "candles"),
        ...writeFlag,
      ]),
    ],
    "match-prices": args.write
      ? [
          scriptCommand("src/scripts/match-prices.ts", [
            ...(args.rematchAllPrices ? ["--all"] : []),
            ...(args.limitPriceMatches !== Number.MAX_SAFE_INTEGER
              ? ["--limit", String(args.limitPriceMatches)]
              : []),
            "--batch-size",
            String(args.priceMatchBatchSize),
            ...(args.priceMatchStartAfterId > 0
              ? ["--start-after-id", String(args.priceMatchStartAfterId)]
              : []),
          ]),
        ]
      : [],
    "compute-scores": args.write
      ? [scriptCommand("src/scripts/compute-scores.ts", [])]
      : [],
    audit: [scriptCommand("src/scripts/audit-coverage-report.ts", ["--json"])],
    "pipeline-readiness": [
      scriptCommand("src/scripts/audit-pipeline-readiness.ts", [
        "--shadow-in",
        shadowOut,
        "--diff-in",
        shadowDiffOut,
        "--promote-in",
        shadowPromoteAuditOut,
        "--transcript-audit-in",
        transcriptAuditOut,
        "--run-id",
        args.shadowRunId,
        "--allow-partial-shadow",
        "--audit-out",
        path.resolve(repoRoot(), args.auditDir, "pipeline-readiness.json"),
        "--summary",
      ]),
    ],
    "verify-public-surface": [
      scriptCommand("src/scripts/verify-public-surface.ts", [
        "--audit-out",
        path.resolve(
          repoRoot(),
          args.auditDir,
          "public-surface-verification.json",
        ),
        ...verifyBaseUrlArgs,
      ]),
    ],
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseDataPipelineArgs(argv);
  mkdirSync(path.resolve(repoRoot(), args.auditDir), { recursive: true });

  console.log(
    `[${timestamp()}] data-pipeline ${args.write ? "WRITE" : "DRY-RUN"}: creators=${args.creators.join(",")} symbols=${args.symbols.length} shadowAgents=${args.shadowAgents} shadowVideoAgents=${args.shadowVideoAgents} shadowChunkAgents=${args.shadowChunkAgents} shadowModelAttempts=${args.shadowModelAttempts} shadowGapMs=${args.shadowGapMs} auditDir=${args.auditDir}`,
  );
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
      const result = skippedResult(
        stage,
        args,
        args.write ? "no command" : "write-only stage skipped in dry-run",
      );
      appendRunAudit(args, result);
      console.log(`[${timestamp()}] ${stage}: skipped (${result.error})`);
      continue;
    }

    const parallelLimit = parallelLimitForStage(stage, args);
    if (parallelLimit > 1 && commands.length > 1) {
      console.log(
        `[${timestamp()}] ${stage}: running ${commands.length} commands with concurrency=${parallelLimit}`,
      );
      const results = await runCommandsWithPool(
        stage,
        commands,
        args,
        parallelLimit,
      );
      if (results.some((result) => result.status === "failed")) {
        failed = true;
        console.error(
          `[${timestamp()}] ${stage}: failed; stopping before downstream publish verification`,
        );
      }
    } else {
      for (const command of commands) {
        const result = await runCommand(
          stage,
          command,
          args,
          auditFile(args, stage, "log.jsonl"),
        );
        if (result.status === "failed") {
          failed = true;
          console.error(
            `[${timestamp()}] ${stage}: failed; stopping before downstream publish verification`,
          );
          break;
        }
      }
    }
    if (failed) break;
  }

  if (failed) process.exitCode = 1;
  console.log(
    `[${timestamp()}] data-pipeline complete: status=${failed ? "failed" : "completed"} auditDir=${args.auditDir}`,
  );
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
