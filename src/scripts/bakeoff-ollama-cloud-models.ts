import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { query } from "../lib/db";
import { buildRunId, readJsonlFile, writeJsonFile, type ShadowDiffRecord, type ShadowExtractedCallRecord } from "../lib/shadow-extraction";
import { loadEnv, timestamp } from "./script-helpers";

export const DEFAULT_OLLAMA_BAKEOFF_MODELS = [
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "glm-5.1",
  "kimi-k2.6",
  "qwen3.5:397b",
  "minimax-m2.7",
  "nemotron-3-super",
  "gemma4:31b",
] as const;

const DEFAULT_OUT_ROOT = ".tmp/ollama-model-bakeoff";
const DEFAULT_LIMIT = 8;
const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;
const DEFAULT_GAP_MS = 1_000;
const OLLAMA_CLOUD_HOST = "https://ollama.com";

interface ChallengeVideoRow {
  readonly id: number;
  readonly creator_name: string;
  readonly youtube_handle: string;
  readonly title: string | null;
  readonly published_at: string | null;
  readonly transcript_length: number;
  readonly existing_calls: number;
  readonly challenge_reason: string;
}

export interface BakeoffArgs {
  readonly execute: boolean;
  readonly runId: string;
  readonly outDir: string;
  readonly models: readonly string[];
  readonly videoIds: readonly number[];
  readonly limit: number;
  readonly creatorHandle: string | null;
  readonly requestTimeoutMs: number;
  readonly gapMs: number;
  readonly chunkChars: number | null;
  readonly maxChunks: number | null;
  readonly continueOnError: boolean;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0 || !argv[i + 1]) return null;
  return argv[i + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function positiveIntList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((parsed) => Number.isInteger(parsed) && parsed > 0);
}

function csv(value: string | null, fallback: readonly string[]): string[] {
  const parsed = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallback];
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "model";
}

export function parseOllamaBakeoffArgs(argv = process.argv.slice(2)): BakeoffArgs {
  const runId = argValue(argv, "--run-id") ?? buildRunId("ollama-bakeoff");
  return {
    execute: argv.includes("--execute"),
    runId,
    outDir: argValue(argv, "--out-dir") ?? join(DEFAULT_OUT_ROOT, runId),
    models: csv(argValue(argv, "--models"), DEFAULT_OLLAMA_BAKEOFF_MODELS),
    videoIds: positiveIntList(argValue(argv, "--video-ids")),
    limit: positiveInt(argValue(argv, "--limit"), DEFAULT_LIMIT),
    creatorHandle: argValue(argv, "--creator"),
    requestTimeoutMs: positiveInt(argValue(argv, "--request-timeout-ms"), DEFAULT_REQUEST_TIMEOUT_MS),
    gapMs: positiveInt(argValue(argv, "--gap-ms"), DEFAULT_GAP_MS),
    chunkChars: argValue(argv, "--chunk-chars") ? positiveInt(argValue(argv, "--chunk-chars"), 8000) : null,
    maxChunks: argValue(argv, "--max-chunks") ? positiveInt(argValue(argv, "--max-chunks"), 100) : null,
    continueOnError: !argv.includes("--fail-fast"),
  };
}

export async function selectChallengeVideos(args: Pick<BakeoffArgs, "limit" | "videoIds" | "creatorHandle">): Promise<ChallengeVideoRow[]> {
  if (args.videoIds.length > 0) {
    return query<ChallengeVideoRow>(
      `SELECT v.id,
              c.name AS creator_name,
              c.youtube_handle,
              v.title,
              v.published_at,
              length(v.transcript) AS transcript_length,
              (SELECT COUNT(*)::int FROM calls ca WHERE ca.video_id = v.id) AS existing_calls,
              'explicit_video_id' AS challenge_reason
       FROM videos v
       JOIN creators c ON c.id = v.creator_id
       WHERE v.id = ANY($1::int[])
         AND v.transcript IS NOT NULL
         AND v.transcript_quality > 0.2
       ORDER BY array_position($1::int[], v.id)`,
      [args.videoIds],
    );
  }

  const params: unknown[] = [];
  const creatorFilter = args.creatorHandle ? "AND c.youtube_handle = $1" : "";
  if (args.creatorHandle) params.push(args.creatorHandle);
  params.push(args.limit);
  const limitParam = `$${params.length}`;

  return query<ChallengeVideoRow>(
    `WITH eligible AS (
       SELECT v.id,
              c.name AS creator_name,
              c.youtube_handle,
              v.title,
              v.published_at,
              length(v.transcript) AS transcript_length,
              (SELECT COUNT(*)::int FROM calls ca WHERE ca.video_id = v.id) AS existing_calls,
              EXISTS (
                SELECT 1 FROM calls lc
                WHERE lc.video_id = v.id
                  AND lc.extraction_confidence < 0.7
                  AND lc.price_at_call IS NOT NULL
                  AND lc.price_30d IS NOT NULL
                  AND lc.return_30d IS NOT NULL
              ) AS has_low_confidence_score_ready
       FROM videos v
       JOIN creators c ON c.id = v.creator_id
       WHERE v.transcript IS NOT NULL
         AND v.transcript_quality > 0.2
         ${creatorFilter}
     ), ranked AS (
       SELECT *,
              CASE
                WHEN has_low_confidence_score_ready THEN 'low_confidence_score_ready'
                WHEN existing_calls >= 2 THEN 'multi_call_existing'
                WHEN transcript_length >= 12000 THEN 'long_transcript'
                WHEN existing_calls = 0 THEN 'no_existing_calls'
                ELSE 'recent_transcript'
              END AS challenge_reason,
              row_number() OVER (
                PARTITION BY CASE
                  WHEN has_low_confidence_score_ready THEN 'low_confidence_score_ready'
                  WHEN existing_calls >= 2 THEN 'multi_call_existing'
                  WHEN transcript_length >= 12000 THEN 'long_transcript'
                  WHEN existing_calls = 0 THEN 'no_existing_calls'
                  ELSE 'recent_transcript'
                END
                ORDER BY published_at DESC NULLS LAST, id DESC
              ) AS reason_rank
       FROM eligible
     )
     SELECT id, creator_name, youtube_handle, title, published_at, transcript_length, existing_calls, challenge_reason
     FROM ranked
     ORDER BY reason_rank ASC,
              CASE challenge_reason
                WHEN 'low_confidence_score_ready' THEN 1
                WHEN 'multi_call_existing' THEN 2
                WHEN 'long_transcript' THEN 3
                WHEN 'no_existing_calls' THEN 4
                ELSE 5
              END,
              published_at DESC NULLS LAST,
              id DESC
     LIMIT ${limitParam}`,
    params,
  );
}

interface ModelRunPaths {
  readonly model: string;
  readonly modelSlug: string;
  readonly runId: string;
  readonly shadowOut: string;
  readonly diffOut: string;
  readonly runMetaOut: string;
  readonly logOut: string;
}

export function buildModelRunPaths(args: Pick<BakeoffArgs, "outDir" | "runId">, model: string): ModelRunPaths {
  const modelSlug = safeFilePart(model);
  const runId = `${args.runId}-${modelSlug}`;
  return {
    model,
    modelSlug,
    runId,
    shadowOut: join(args.outDir, `${modelSlug}.shadow.jsonl`),
    diffOut: join(args.outDir, `${modelSlug}.diff.jsonl`),
    runMetaOut: join(args.outDir, `${modelSlug}.meta.json`),
    logOut: join(args.outDir, `${modelSlug}.log`),
  };
}

export function buildShadowExtractCommand(args: BakeoffArgs, paths: ModelRunPaths, videoIds: readonly number[]): string[] {
  const command = [
    "node",
    "--import",
    "tsx",
    "src/scripts/shadow-extract-transcripts.ts",
    "--provider",
    "ollama",
    "--ollama-host",
    OLLAMA_CLOUD_HOST,
    "--model",
    paths.model,
    "--run-id",
    paths.runId,
    "--video-ids",
    videoIds.join(","),
    "--limit",
    String(videoIds.length),
    "--shadow-out",
    paths.shadowOut,
    "--run-meta-out",
    paths.runMetaOut,
    "--request-timeout-ms",
    String(args.requestTimeoutMs),
    "--gap-ms",
    String(args.gapMs),
  ];
  if (args.execute) command.push("--execute");
  if (args.chunkChars) command.push("--chunk-chars", String(args.chunkChars));
  if (args.maxChunks) command.push("--max-chunks", String(args.maxChunks));
  return command;
}

export function buildShadowDiffCommand(paths: ModelRunPaths): string[] {
  return [
    "node",
    "--import",
    "tsx",
    "src/scripts/shadow-diff-extractions.ts",
    "--shadow-in",
    paths.shadowOut,
    "--diff-out",
    paths.diffOut,
    "--run-id",
    paths.runId,
  ];
}

function runCommand(command: readonly string[], logOut: string): void {
  mkdirSync(dirname(logOut), { recursive: true });
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  writeFileSync(
    logOut,
    [`$ ${command.join(" ")}`, result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command.join(" ")}\nSee ${logOut}`);
  }
}

function summarizeModel(paths: ModelRunPaths): Record<string, unknown> {
  const shadowRecords = existsSync(paths.shadowOut)
    ? readJsonlFile<ShadowExtractedCallRecord>(paths.shadowOut)
    : [];
  const diffRecords = existsSync(paths.diffOut)
    ? readJsonlFile<ShadowDiffRecord>(paths.diffOut)
    : [];
  const statusCounts: Record<string, number> = {};
  for (const record of diffRecords) statusCounts[record.status] = (statusCounts[record.status] ?? 0) + 1;
  const dryRunSelections = shadowRecords.filter((record) => record.error === "dry_run_no_model_call").length;
  return {
    model: paths.model,
    run_id: paths.runId,
    videos: shadowRecords.length,
    dry_run_selections: dryRunSelections,
    failures: shadowRecords.filter((record) => record.error && record.error !== "dry_run_no_model_call").length,
    accepted_calls: shadowRecords.reduce((sum, record) => sum + record.accepted_count, 0),
    candidates: shadowRecords.reduce((sum, record) => sum + record.candidate_count, 0),
    fully_covered: shadowRecords.filter((record) => record.chunk_summary.reached_transcript_end).length,
    diff_statuses: statusCounts,
    files: {
      shadow: paths.shadowOut,
      diff: paths.diffOut,
      meta: paths.runMetaOut,
      log: paths.logOut,
    },
  };
}

function writeMarkdownSummary(filePath: string, args: BakeoffArgs, challengeVideos: readonly ChallengeVideoRow[], modelSummaries: readonly Record<string, unknown>[]): void {
  const lines = [
    `# Ollama Cloud model bakeoff ${args.runId}`,
    "",
    `Mode: ${args.execute ? "EXECUTE / real Ollama Cloud calls" : "DRY-RUN / selected real challenge data only"}`,
    `Output dir: \`${args.outDir}\``,
    "",
    "## Challenge videos",
    "",
    "| Video | Creator | Reason | Existing calls | Transcript chars | Title |",
    "| ---: | --- | --- | ---: | ---: | --- |",
    ...challengeVideos.map((video) => `| ${video.id} | ${video.creator_name} | ${video.challenge_reason} | ${video.existing_calls} | ${video.transcript_length} | ${(video.title ?? "").replace(/\|/g, "\\|")} |`),
    "",
    "## Model results",
    "",
    "| Model | Videos | Dry selections | Failures | Candidates | Accepted calls | Fully covered | Diff statuses |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...modelSummaries.map((summary) => `| ${summary.model} | ${summary.videos} | ${summary.dry_run_selections ?? 0} | ${summary.failures} | ${summary.candidates} | ${summary.accepted_calls} | ${summary.fully_covered} | \`${JSON.stringify(summary.diff_statuses)}\` |`),
    "",
    "Production writes: none. This harness only uses shadow extraction and shadow diff outputs.",
  ];
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${lines.join("\n")}\n`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseOllamaBakeoffArgs(argv);
  mkdirSync(args.outDir, { recursive: true });
  const challengeVideos = await selectChallengeVideos(args);
  const videoIds = challengeVideos.map((video) => video.id);
  if (videoIds.length === 0) throw new Error("No eligible challenge videos found");

  writeJsonFile(join(args.outDir, "challenge-videos.json"), challengeVideos);
  writeJsonFile(join(args.outDir, "bakeoff-run.json"), {
    run_id: args.runId,
    started_at: timestamp(),
    execute: args.execute,
    provider: "ollama",
    ollama_host: OLLAMA_CLOUD_HOST,
    models: args.models,
    video_ids: videoIds,
    out_dir: args.outDir,
    request_timeout_ms: args.requestTimeoutMs,
    gap_ms: args.gapMs,
    production_writes: false,
  });

  console.log(`[${timestamp()}] ollama bakeoff ${args.execute ? "EXECUTE" : "DRY-RUN"}: run=${args.runId}, models=${args.models.length}, videos=${videoIds.length}, out=${args.outDir}`);
  console.log(`[${timestamp()}] challenge video ids: ${videoIds.join(",")}`);

  const summaries: Record<string, unknown>[] = [];
  for (const model of args.models) {
    const paths = buildModelRunPaths(args, model);
    try {
      const extractCommand = buildShadowExtractCommand(args, paths, videoIds);
      runCommand(extractCommand, paths.logOut);
      runCommand(buildShadowDiffCommand(paths), paths.logOut.replace(/\.log$/, ".diff.log"));
      summaries.push(summarizeModel(paths));
      console.log(`[${timestamp()}] model complete: ${model}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summaries.push({ model, run_id: paths.runId, error: message, files: { log: paths.logOut } });
      console.error(`[${timestamp()}] model failed: ${model}: ${message}`);
      if (!args.continueOnError) throw error;
    }
  }

  const summaryJson = join(args.outDir, "summary.json");
  const summaryMd = join(args.outDir, "summary.md");
  writeJsonFile(summaryJson, {
    run_id: args.runId,
    execute: args.execute,
    out_dir: args.outDir,
    challenge_videos: challengeVideos,
    models: summaries,
  });
  writeMarkdownSummary(summaryMd, args, challengeVideos, summaries);
  console.log(`[${timestamp()}] ollama bakeoff complete: summary=${summaryMd}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
