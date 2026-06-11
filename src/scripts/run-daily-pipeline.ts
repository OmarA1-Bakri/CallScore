import { spawn } from "node:child_process";
import { appendFileSync, closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, timestamp } from "./script-helpers";

interface DailyPipelineArgs {
  readonly write: boolean;
  readonly transcriptLimit: number;
  readonly transcriptConcurrency: number;
  readonly transcriptGapMs: number;
  readonly sinceDays: number;
  readonly limitCreators: number;
  readonly limitVideos: number;
  readonly extractLimit: number;
  readonly matchLimit: number;
  readonly matchBatchSize: number;
  readonly readApiBase: string | null;
  readonly auditDir: string;
  readonly lockFile: string;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || argv[index + 1] === undefined) return null;
  return argv[index + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function parseDailyPipelineArgs(argv = process.argv.slice(2)): DailyPipelineArgs {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    transcriptLimit: positiveInt(argValue(argv, "--transcript-limit") ?? process.env.TRANSCRIPT_BATCH_LIMIT ?? null, 25),
    transcriptConcurrency: Math.min(1, positiveInt(argValue(argv, "--transcript-concurrency"), 1)),
    transcriptGapMs: positiveInt(argValue(argv, "--transcript-gap-ms") ?? process.env.TRANSCRIPT_GAP_MS ?? null, 20_000),
    sinceDays: positiveInt(argValue(argv, "--since-days"), 45),
    limitCreators: positiveInt(argValue(argv, "--limit-creators"), 250),
    limitVideos: positiveInt(argValue(argv, "--limit-videos"), 10),
    extractLimit: positiveInt(argValue(argv, "--extract-limit"), 50),
    matchLimit: positiveInt(argValue(argv, "--match-limit"), 500),
    matchBatchSize: positiveInt(argValue(argv, "--match-batch-size"), 100),
    readApiBase: argValue(argv, "--read-api-base") ?? process.env.HH_READ_API_BASE ?? null,
    auditDir: argValue(argv, "--audit-dir") ?? `.tmp/callscore-daily/${stamp}`,
    lockFile: argValue(argv, "--lock-file") ?? process.env.CALLSCORE_DAILY_LOCK_FILE ?? "/tmp/callscore-daily-pipeline.lock",
  };
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function script(scriptPath: string, args: readonly string[]): readonly string[] {
  return [process.execPath, "--import", "tsx", scriptPath, ...args];
}

function acquireLock(lockFile: string): () => void {
  mkdirSync(dirname(lockFile), { recursive: true });
  const fd = openSync(lockFile, "wx");
  appendFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
  return () => {
    closeSync(fd);
    rmSync(lockFile, { force: true });
  };
}

async function runStage(name: string, command: readonly string[], args: DailyPipelineArgs): Promise<number> {
  const startedAt = timestamp();
  const auditFile = resolve(repoRoot(), args.auditDir, `${name}.log`);
  mkdirSync(dirname(auditFile), { recursive: true });
  appendFileSync(auditFile, `\n[${startedAt}] START ${command.join(" ")}\n`);
  console.log(`[${startedAt}] daily:${name}: start`);
  return await new Promise((resolveStage) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repoRoot(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      appendFileSync(auditFile, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      appendFileSync(auditFile, chunk);
    });
    child.on("close", (code) => {
      appendFileSync(auditFile, `\n[${timestamp()}] END exit=${code}\n`);
      console.log(`[${timestamp()}] daily:${name}: exit=${code}`);
      resolveStage(code ?? 1);
    });
    child.on("error", (error) => {
      appendFileSync(auditFile, `\n[${timestamp()}] ERROR ${error.message}\n`);
      resolveStage(1);
    });
  });
}

export function buildDailyPipelineCommands(args: DailyPipelineArgs): readonly { readonly name: string; readonly command: readonly string[]; readonly required: boolean }[] {
  const writeFlag = args.write ? ["--write"] : [];
  return [
    {
      name: "discover",
      required: true,
      command: script("src/scripts/discover-videos-rss-api.ts", [
        "--source", "rss",
        "--limit-creators", String(args.limitCreators),
        "--limit-videos", String(args.limitVideos),
        "--since-days", String(args.sinceDays),
        "--gap-ms", "250",
        ...writeFlag,
      ]),
    },
    {
      name: "slow-transcripts",
      required: false,
      command: script("src/scripts/backfill-transcripts.ts", [
        "--limit", String(args.transcriptLimit),
        "--concurrency", String(args.transcriptConcurrency),
        "--gap-ms", String(args.transcriptGapMs),
        "--retry-cooldown-hours", "24",
        "--stale-retry-days", "7",
        "--audit-out", resolve(repoRoot(), args.auditDir, "transcripts.jsonl"),
        ...writeFlag,
      ]),
    },
    {
      name: "extract-local",
      required: false,
      command: script("src/scripts/extract-calls-local.ts", ["--limit", String(args.extractLimit)]),
    },
    {
      name: "match-prices",
      required: false,
      command: script("src/scripts/match-prices.ts", [
        "--limit", String(args.matchLimit),
        "--batch-size", String(args.matchBatchSize),
        "--fetch-binance",
      ]),
    },
    {
      name: "compute-scores",
      required: false,
      command: script("src/scripts/compute-scores.ts", []),
    },
    {
      name: "freshness-check",
      required: false,
      command: script("src/scripts/callscore-freshness-check.ts", [
        ...(args.readApiBase ? ["--read-api-base", args.readApiBase] : []),
      ]),
    },
  ];
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseDailyPipelineArgs(argv);
  let releaseLock: (() => void) | null = null;
  try {
    releaseLock = acquireLock(args.lockFile);
  } catch {
    console.error(`[${timestamp()}] daily pipeline skipped: lock held at ${args.lockFile}`);
    process.exitCode = 75;
    return;
  }

  try {
    console.log(`[${timestamp()}] callscore daily pipeline ${args.write ? "WRITE" : "DRY-RUN"}: transcriptLimit=${args.transcriptLimit} transcriptConcurrency=${args.transcriptConcurrency} transcriptGapMs=${args.transcriptGapMs} auditDir=${args.auditDir}`);
    let failed = false;
    for (const stage of buildDailyPipelineCommands(args)) {
      const code = await runStage(stage.name, stage.command, args);
      if (code !== 0 && stage.required) {
        failed = true;
        break;
      }
    }
    if (failed) process.exitCode = 1;
    console.log(`[${timestamp()}] callscore daily pipeline complete: status=${failed ? "failed" : "completed"} auditDir=${args.auditDir}`);
  } finally {
    releaseLock?.();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
