import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { loadEnv, sleep, timestamp } from "./script-helpers";

const DEFAULT_INTERVAL_MS = 30 * 60_000;
const DEFAULT_FAILURE_INTERVAL_MS = 10 * 60_000;
const DEFAULT_STALE_LOCK_MS = 6 * 60 * 60_000;
const DEFAULT_AUDIT_ROOT = ".tmp/callscore-pipeline/continuous";
const DEFAULT_LOCK_FILE = ".tmp/callscore-pipeline/continuous.lock";

export interface ContinuousDataPipelineArgs {
  readonly write: boolean;
  readonly once: boolean;
  readonly maxCycles: number;
  readonly intervalMs: number;
  readonly failureIntervalMs: number;
  readonly staleLockMs: number;
  readonly auditRoot: string;
  readonly lockFile: string;
  readonly safeWriteDefaults: boolean;
  readonly pipelineArgs: readonly string[];
}

interface LockRecord {
  readonly pid: number;
  readonly started_at: string;
  readonly updated_at: string;
  readonly cycle: number;
}

interface CycleResult {
  readonly cycle: number;
  readonly status: "completed" | "failed";
  readonly started_at: string;
  readonly finished_at: string;
  readonly duration_ms: number;
  readonly audit_dir: string;
  readonly command: readonly string[];
  readonly exit_code: number | null;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function nonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function positiveNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitArgs(argv: readonly string[]): {
  readonly controlArgs: readonly string[];
  readonly pipelineArgs: readonly string[];
} {
  const separator = argv.indexOf("--");
  if (separator < 0) return { controlArgs: argv, pipelineArgs: [] };
  return {
    controlArgs: argv.slice(0, separator),
    pipelineArgs: argv.slice(separator + 1),
  };
}

export function parseContinuousDataPipelineArgs(
  argv = process.argv.slice(2),
): ContinuousDataPipelineArgs {
  const { controlArgs, pipelineArgs } = splitArgs(argv);
  const once = controlArgs.includes("--once");
  const intervalMs = controlArgs.includes("--interval-ms")
    ? positiveNumber(argValue(controlArgs, "--interval-ms"), DEFAULT_INTERVAL_MS)
    : positiveNumber(argValue(controlArgs, "--interval-minutes"), DEFAULT_INTERVAL_MS / 60_000) * 60_000;
  const failureIntervalMs = controlArgs.includes("--failure-interval-ms")
    ? positiveNumber(argValue(controlArgs, "--failure-interval-ms"), DEFAULT_FAILURE_INTERVAL_MS)
    : positiveNumber(argValue(controlArgs, "--failure-interval-minutes"), DEFAULT_FAILURE_INTERVAL_MS / 60_000) * 60_000;
  const staleLockMs = controlArgs.includes("--stale-lock-ms")
    ? positiveNumber(argValue(controlArgs, "--stale-lock-ms"), DEFAULT_STALE_LOCK_MS)
    : positiveNumber(argValue(controlArgs, "--stale-lock-minutes"), DEFAULT_STALE_LOCK_MS / 60_000) * 60_000;

  return {
    write: controlArgs.includes("--write") && !controlArgs.includes("--dry-run"),
    once,
    maxCycles: once ? 1 : nonNegativeInt(argValue(controlArgs, "--max-cycles"), 0),
    intervalMs,
    failureIntervalMs,
    staleLockMs,
    auditRoot: argValue(controlArgs, "--audit-root") ?? DEFAULT_AUDIT_ROOT,
    lockFile: argValue(controlArgs, "--lock-file") ?? DEFAULT_LOCK_FILE,
    safeWriteDefaults: !controlArgs.includes("--unsafe-promotion-defaults"),
    pipelineArgs,
  };
}

function repoRoot(): string {
  return path.resolve(__dirname, "../..");
}

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}

function hasAnyFlag(args: readonly string[], flags: readonly string[]): boolean {
  return flags.some((flag) => hasFlag(args, flag));
}

function withDefaultArg(args: readonly string[], flag: string, value: string): readonly string[] {
  return hasFlag(args, flag) ? args : [...args, flag, value];
}

function safeStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function hasReviewedPromotionArgs(args: readonly string[]): boolean {
  return hasAnyFlag(args, ["--shadow-promote-video-ids", "--reviewed-video-ids", "--video-ids"]);
}

function buildCyclePipelineArgs(
  args: ContinuousDataPipelineArgs,
  cycle: number,
  now = new Date(),
): readonly string[] {
  const runStamp = safeStamp(now);
  const auditDir = path.posix.join(
    args.auditRoot.replace(/\\/g, "/"),
    `${runStamp}-cycle-${cycle}`,
  );
  let pipelineArgs = [...args.pipelineArgs];

  if (args.write && !hasFlag(pipelineArgs, "--write") && !hasFlag(pipelineArgs, "--dry-run")) {
    pipelineArgs = ["--write", ...pipelineArgs];
  }
  if (!args.write && !hasFlag(pipelineArgs, "--write") && !hasFlag(pipelineArgs, "--dry-run")) {
    pipelineArgs = ["--dry-run", ...pipelineArgs];
  }

  pipelineArgs = [...withDefaultArg(pipelineArgs, "--audit-dir", auditDir)];
  pipelineArgs = [...withDefaultArg(pipelineArgs, "--shadow-run-id", `continuous-${runStamp}-cycle-${cycle}`)];
  pipelineArgs = [...withDefaultArg(pipelineArgs, "--shadow-fallback-model", "glm-5.1")];
  pipelineArgs = [...withDefaultArg(pipelineArgs, "--shadow-agents", "2")];
  pipelineArgs = [...withDefaultArg(pipelineArgs, "--shadow-video-agents", "2")];
  pipelineArgs = [...withDefaultArg(pipelineArgs, "--shadow-chunk-agents", "2")];
  pipelineArgs = [...withDefaultArg(pipelineArgs, "--shadow-model-attempts", "2")];
  pipelineArgs = [...withDefaultArg(pipelineArgs, "--shadow-gap-ms", "0")];

  if (
    args.safeWriteDefaults &&
    (args.write || hasFlag(pipelineArgs, "--write")) &&
    !hasFlag(pipelineArgs, "--skip-shadow-promote") &&
    !hasReviewedPromotionArgs(pipelineArgs)
  ) {
    pipelineArgs.push("--skip-shadow-promote");
  }

  return pipelineArgs;
}

export function buildCycleCommand(
  args: ContinuousDataPipelineArgs,
  cycle: number,
  now = new Date(),
): readonly string[] {
  return [
    process.execPath,
    "--import",
    "tsx",
    "src/scripts/run-data-pipeline.ts",
    ...buildCyclePipelineArgs(args, cycle, now),
  ];
}

function lockPath(args: ContinuousDataPipelineArgs): string {
  return path.resolve(repoRoot(), args.lockFile);
}

function auditRootPath(args: ContinuousDataPipelineArgs): string {
  return path.resolve(repoRoot(), args.auditRoot);
}

function writeLock(args: ContinuousDataPipelineArgs, cycle: number): void {
  const file = lockPath(args);
  mkdirSync(path.dirname(file), { recursive: true });
  const record: LockRecord = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cycle,
  };
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { flag: "w" });
}

function readLock(args: ContinuousDataPipelineArgs): Partial<LockRecord> | null {
  const file = lockPath(args);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Partial<LockRecord>;
  } catch {
    return {};
  }
}

function processIsRunning(pid: number | undefined): boolean | null {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return null;
  }
}

export function lockIsStale(args: ContinuousDataPipelineArgs): boolean {
  const parsed = readLock(args);
  if (!parsed) return false;
  const running = processIsRunning(parsed.pid);
  if (running === false) return true;
  const updated = parsed.updated_at ? Date.parse(parsed.updated_at) : 0;
  return !Number.isFinite(updated) || Date.now() - updated > args.staleLockMs;
}

function acquireLock(args: ContinuousDataPipelineArgs): boolean {
  const file = lockPath(args);
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) {
    if (!lockIsStale(args)) return false;
    rmSync(file, { force: true });
  }
  writeLock(args, 0);
  return true;
}

function releaseLock(args: ContinuousDataPipelineArgs): void {
  rmSync(lockPath(args), { force: true });
}

function appendContinuousAudit(args: ContinuousDataPipelineArgs, result: CycleResult): void {
  const root = auditRootPath(args);
  mkdirSync(root, { recursive: true });
  appendFileSync(path.join(root, "continuous-run.jsonl"), `${JSON.stringify(result)}\n`);
}

async function runCycle(
  args: ContinuousDataPipelineArgs,
  cycle: number,
): Promise<CycleResult> {
  const startedAt = timestamp();
  const start = Date.now();
  const command = buildCycleCommand(args, cycle, new Date());
  const auditDirIndex = command.indexOf("--audit-dir") + 1;
  const auditDir = auditDirIndex > 0 ? command[auditDirIndex] : args.auditRoot;

  console.log(
    `[${timestamp()}] continuous-pipeline cycle=${cycle} start mode=${args.write ? "WRITE" : "DRY-RUN"} auditDir=${auditDir}`,
  );

  const exitCode = await new Promise<number | null>((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: repoRoot(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", (error) => {
      console.error(`[${timestamp()}] continuous-pipeline spawn error:`, error);
      resolve(1);
    });
    child.on("close", (code) => resolve(code));
  });

  const result: CycleResult = {
    cycle,
    status: exitCode === 0 ? "completed" : "failed",
    started_at: startedAt,
    finished_at: timestamp(),
    duration_ms: Date.now() - start,
    audit_dir: auditDir,
    command,
    exit_code: exitCode,
  };
  appendContinuousAudit(args, result);
  console.log(
    `[${timestamp()}] continuous-pipeline cycle=${cycle} ${result.status} exit=${exitCode}`,
  );
  return result;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseContinuousDataPipelineArgs(argv);
  mkdirSync(auditRootPath(args), { recursive: true });

  if (!acquireLock(args)) {
    console.error(
      `[${timestamp()}] continuous-pipeline already running; lock=${lockPath(args)}`,
    );
    process.exitCode = 2;
    return;
  }

  let cycle = 0;
  let stopping = false;
  const stop = () => {
    stopping = true;
    console.log(`[${timestamp()}] continuous-pipeline stop requested; exiting after current cycle`);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  let hadFailure = false;
  try {
    while (!stopping) {
      cycle += 1;
      writeLock(args, cycle);
      const result = await runCycle(args, cycle);
      if (result.status === "failed") hadFailure = true;
      if (args.maxCycles > 0 && cycle >= args.maxCycles) break;
      const waitMs = result.status === "completed" ? args.intervalMs : args.failureIntervalMs;
      console.log(`[${timestamp()}] continuous-pipeline sleeping ${waitMs}ms`);
      await sleep(waitMs);
    }
    if (hadFailure) process.exitCode = 1;
  } finally {
    releaseLock(args);
  }
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
