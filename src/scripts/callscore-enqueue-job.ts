import { enqueuePipelineJob } from "../lib/pipeline";

type JobName = "candles" | "match" | "scores" | "ml";
type Mode = "schedule" | "probe";

type Args = {
  job?: JobName;
  mode: Mode;
  symbols?: string[];
  maxRequestsPerSymbol?: number;
  matchLimit?: number;
  matchBatchSize?: number;
  mlBatchSize?: number;
  queuedBy: string;
};

function usage(): never {
  console.error(`Usage: node --import tsx src/scripts/callscore-enqueue-job.ts --job <candles|match|scores|ml> [--mode schedule|probe]

Options:
  --symbols BTCUSDT,ETHUSDT      candles only; default BTCUSDT,ETHUSDT,SOLUSDT
  --max-requests-per-symbol N    candles only; default 25 schedule, 1 probe
  --match-limit N                match only; default 1000 schedule, 10 probe
  --match-batch-size N           match only; default 200 schedule, 10 probe
  --ml-batch-size N              ml only; default 250 schedule, 1 probe
  --queued-by VALUE              metadata only; default local-hh-scheduler

Required environment:
  DATABASE_PROVIDER=postgres
  DATABASE_URL or another supported Postgres URL env var must be set.

This script only enqueues pipeline jobs. It does not execute jobs, deploy, call Whop, or mutate provider/channel state.`);
  process.exit(2);
}

function positiveInt(raw: string | undefined, name: string): number | undefined {
  if (raw == null || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: "schedule", queuedBy: "local-hh-scheduler" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) usage();
      return value;
    };
    switch (arg) {
      case "--job": {
        const job = next();
        if (!["candles", "match", "scores", "ml"].includes(job)) usage();
        args.job = job as JobName;
        break;
      }
      case "--mode": {
        const mode = next();
        if (!["schedule", "probe"].includes(mode)) usage();
        args.mode = mode as Mode;
        break;
      }
      case "--symbols":
        args.symbols = next().split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--max-requests-per-symbol":
        args.maxRequestsPerSymbol = positiveInt(next(), "--max-requests-per-symbol");
        break;
      case "--match-limit":
        args.matchLimit = positiveInt(next(), "--match-limit");
        break;
      case "--match-batch-size":
        args.matchBatchSize = positiveInt(next(), "--match-batch-size");
        break;
      case "--ml-batch-size":
        args.mlBatchSize = positiveInt(next(), "--ml-batch-size");
        break;
      case "--queued-by":
        args.queuedBy = next();
        break;
      case "--help":
      case "-h":
        usage();
        break;
      default:
        usage();
    }
  }
  if (!args.job) usage();
  return args;
}

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function quarterHourKey(now = new Date()): string {
  const copy = new Date(now);
  copy.setUTCSeconds(0, 0);
  copy.setUTCMinutes(Math.floor(copy.getUTCMinutes() / 15) * 15);
  return copy.toISOString().replace(/[:.]/g, "-");
}

function uniqueProbeKey(prefix: string): string {
  return `${prefix}:probe:${new Date().toISOString().replace(/[:.]/g, "-")}:${process.pid}`;
}

function scheduledKey(prefix: string, cadence: "daily" | "quarter-hour"): string {
  return cadence === "daily" ? `${prefix}:${dayKey()}` : `${prefix}:${quarterHourKey()}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (process.env.DATABASE_PROVIDER !== "postgres") {
    throw new Error("DATABASE_PROVIDER must be set to postgres for local HH scheduler enqueue");
  }

  const jobName = args.job;
  if (!jobName) usage();
  const probe = args.mode === "probe";
  const prefix = `local-hh-${jobName}`;
  const key = probe
    ? uniqueProbeKey(prefix)
    : scheduledKey(prefix, jobName === "candles" ? "quarter-hour" : "daily");

  const defaults = {
    symbols: args.symbols ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    maxRequestsPerSymbol: args.maxRequestsPerSymbol ?? (probe ? 1 : 25),
    matchLimit: args.matchLimit ?? (probe ? 10 : 1000),
    matchBatchSize: args.matchBatchSize ?? (probe ? 10 : 200),
    mlBatchSize: args.mlBatchSize ?? (probe ? 1 : 250),
  };

  const config = (() => {
    switch (jobName) {
      case "candles":
        return {
          runType: "candle-refresh",
          jobType: "candle_refresh",
          priority: 90,
          payload: {
            symbols: defaults.symbols,
            max_requests_per_symbol: defaults.maxRequestsPerSymbol,
            write: true,
            queued_by: args.queuedBy,
            mode: args.mode,
          },
        };
      case "match":
        return {
          runType: "match-prices-batch",
          jobType: "match_prices_batch",
          priority: 80,
          payload: {
            limit: defaults.matchLimit,
            batch_size: defaults.matchBatchSize,
            start_after_id: 0,
            rematch_all: false,
            queued_by: args.queuedBy,
            mode: args.mode,
          },
        };
      case "scores":
        return {
          runType: "compute-scores",
          jobType: "compute_scores",
          priority: 70,
          payload: {
            queued_by: args.queuedBy,
            mode: args.mode,
          },
        };
      case "ml":
        return {
          runType: "nightly-ml-verifier",
          jobType: "ml_verifier_batch",
          priority: 100,
          payload: {
            batch_size: defaults.mlBatchSize,
            audit_only: true,
            queued_by: args.queuedBy,
            mode: args.mode,
          },
        };
      default:
        throw new Error(`Unsupported job: ${args.job}`);
    }
  })();

  const { run, job } = await enqueuePipelineJob({
    runKey: key,
    runType: config.runType,
    jobType: config.jobType,
    priority: config.priority,
    idempotencyKey: key,
    maxAttempts: 1,
    payload: config.payload,
  });

  console.log(JSON.stringify({
    ok: true,
    mode: args.mode,
    queued_by: args.queuedBy,
    run: { id: run.id, run_key: run.run_key, type: run.type, status: run.status },
    job: { id: job.id, type: job.type, status: job.status, priority: job.priority },
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
