import { enqueuePipelineJob } from "../lib/pipeline";
import { getWorkplaneJobSpec, isWorkplaneJobType, type WorkplaneJobType } from "../lib/workplane-jobs";

type JobName = "candles" | "match" | "scores" | "ml" | "workplane";
type Mode = "schedule" | "probe";

type Args = {
  job?: JobName;
  mode: Mode;
  symbols?: string[];
  maxRequestsPerSymbol?: number;
  matchLimit?: number;
  matchBatchSize?: number;
  mlBatchSize?: number;
  workplaneType?: WorkplaneJobType;
  limit?: number;
  browser?: string;
  sinceDays?: number;
  queuedBy: string;
};

function usage(): never {
  console.error(`Usage: node --import tsx src/scripts/callscore-enqueue-job.ts --job <candles|match|scores|ml|workplane> [--mode schedule|probe]

Options:
  --symbols BTCUSDT,ETHUSDT      candles only; default BTCUSDT,ETHUSDT,SOLUSDT
  --max-requests-per-symbol N    candles only; default 25 schedule, 1 probe
  --match-limit N                match only; default 1000 schedule, 10 probe
  --match-batch-size N           match only; default 200 schedule, 10 probe
  --ml-batch-size N              ml only; default 250 schedule, 1 probe
  --workplane-type TYPE          workplane only; required, e.g. transcript_collect_laptop
  --limit N                      workplane transcript only; max 5 without explicit gated large-batch path
  --browser VALUE                workplane transcript only; default firefox
  --since-days N                 workplane transcript only; default 45
  --queued-by VALUE              metadata only; default local-hh-scheduler

Required environment:
  DATABASE_PROVIDER=postgres
  DATABASE_URL or another supported Postgres URL env var must be set.

This script only enqueues pipeline jobs. It does not execute jobs, deploy, call Whop, publish, spend, or mutate provider/channel state.`);
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
        if (!["candles", "match", "scores", "ml", "workplane"].includes(job)) usage();
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
      case "--workplane-type": {
        const type = next();
        if (!isWorkplaneJobType(type)) usage();
        args.workplaneType = type;
        break;
      }
      case "--limit":
        args.limit = positiveInt(next(), "--limit");
        break;
      case "--browser":
        args.browser = next();
        break;
      case "--since-days":
        args.sinceDays = positiveInt(next(), "--since-days");
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
  if (args.job === "workplane" && !args.workplaneType) usage();
  if (args.job !== "workplane" && args.workplaneType) usage();
  if (args.limit && args.limit > 5) {
    throw new Error("--limit >5 is not supported by this safe workplane enqueue path");
  }
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
  const prefix = jobName === "workplane" ? `local-hh-workplane-${args.workplaneType}` : `local-hh-${jobName}`;
  const key = probe
    ? uniqueProbeKey(prefix)
    : scheduledKey(prefix, jobName === "candles" ? "quarter-hour" : "daily");

  const defaults = {
    symbols: args.symbols ?? ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    maxRequestsPerSymbol: args.maxRequestsPerSymbol ?? (probe ? 1 : 25),
    matchLimit: args.matchLimit ?? (probe ? 10 : 1000),
    matchBatchSize: args.matchBatchSize ?? (probe ? 10 : 200),
    mlBatchSize: args.mlBatchSize ?? (probe ? 1 : 250),
    limit: args.limit ?? 5,
    browser: args.browser ?? "firefox",
    sinceDays: args.sinceDays ?? 45,
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
      case "workplane": {
        const workplaneType = args.workplaneType;
        if (!workplaneType) usage();
        const spec = getWorkplaneJobSpec(workplaneType);
        const transcriptPayload = workplaneType === "transcript_collect_laptop"
          ? {
              limit: defaults.limit,
              browser: defaults.browser,
              since_days: defaults.sinceDays,
              allow_large_batch: false,
              write_result_to_hh: true,
              workplane_claim: true,
            }
          : {};
        return {
          runType: `workplane-${workplaneType}`,
          jobType: workplaneType,
          priority: workplaneType === "transcript_collect_laptop" ? 65 : 55,
          payload: {
            ...spec.input_payload,
            ...transcriptPayload,
            queued_by: args.queuedBy,
            mode: args.mode,
            production_call_writes_allowed: spec.production_call_writes_allowed,
            public_ranking_impact_allowed: spec.public_ranking_impact_allowed,
          },
        };
      }
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
