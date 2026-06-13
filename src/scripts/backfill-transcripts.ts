import { execFile } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { query } from "../lib/db";
import { writeJsonlRecord } from "../lib/shadow-extraction";
import {
  buildTranscriptExtractionPlan,
  defaultTranscriptExtractionMethods,
  envForTranscriptMethod,
  isLocalBackfillMethod,
  isYtDlpBackfillMethod,
  parseTranscriptExtractionMethodChain,
  resolveYtDlpBinaryForMethod,
  transcriptMethodProvider,
  type TranscriptExtractionMethod,
} from "../lib/transcript-extraction-methods";
import { loadEnv, sleep, timestamp } from "./script-helpers";

const execFileAsync = promisify(execFile);

const DEFAULT_TRANSCRIPT_BATCH_LIMIT = 25;
const DEFAULT_TRANSCRIPT_CONCURRENCY = 1;
const MAX_TRANSCRIPT_CONCURRENCY = 1;
const DEFAULT_YTDLP_SLEEP_SECONDS = 20;
const DEFAULT_YTDLP_MAX_SLEEP_SECONDS = 60;
const DEFAULT_RETRY_COOLDOWN_HOURS = 24;
const DEFAULT_STALE_RETRY_DAYS = 7;
const DEFAULT_LOCK_FILE = "/tmp/callscore-slow-ytdlp-transcripts.lock";
const DEFAULT_YTDLP_EXTRACTOR_RETRIES = 2;
const DEFAULT_YTDLP_RETRY_SLEEP = "extractor:exp=20:120:2";
const DEFAULT_YTDLP_PO_TOKEN_PROVIDER_BASE_URL = "http://127.0.0.1:4416";

export interface BackfillTranscriptsArgs {
  readonly creator: string | null;
  readonly limit: number;
  readonly offset: number;
  readonly concurrency: number;
  readonly methods: readonly TranscriptExtractionMethod[];
  readonly gapMs: number;
  readonly fallbackYtDlp: boolean;
  readonly useSerpApi: boolean;
  readonly ytDlpSleepSeconds: number;
  readonly ytDlpMaxSleepSeconds: number;
  readonly retryCooldownHours: number;
  readonly staleRetryDays: number;
  readonly stopOnProviderBlock: boolean;
  readonly lockFile: string;
  readonly write: boolean;
  readonly auditOut: string | null;
}

interface MissingTranscriptVideo {
  readonly id: number;
  readonly creator_id: number;
  readonly youtube_video_id: string;
  readonly title: string | null;
  readonly creator_name: string;
  readonly youtube_handle: string;
  readonly published_at: string | null;
}

interface TranscriptResult {
  readonly text: string;
  readonly quality: number;
  readonly source: string;
  readonly detail?: string;
}

export type TranscriptFailureReason =
  | "provider_credentials_missing"
  | "providers_returned_no_transcript"
  | "external_handoff_required"
  | "media_fallback_required"
  | "no_captions"
  | "bot_verification_required"
  | "cookie_invalid_or_rotated"
  | "po_token_required"
  | "js_challenge_runtime_missing"
  | "rate_limited"
  | "failed_retryable"
  | "failed_terminal";

interface TranscriptFailure {
  readonly reason: TranscriptFailureReason;
  readonly status: "failed";
  readonly provider: string;
  readonly detail?: string;
}

interface TranscriptHandoff {
  readonly reason: "external_handoff_required" | "media_fallback_required";
  readonly status: "pending_handoff";
  readonly provider: string;
  readonly detail?: string;
  readonly method: TranscriptExtractionMethod;
  readonly previousFailureReason?: TranscriptFailureReason;
}

type TranscriptFetch =
  | { readonly ok: true; readonly transcript: TranscriptResult }
  | { readonly ok: false; readonly failure: TranscriptFailure }
  | { readonly ok: false; readonly handoff: TranscriptHandoff };

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

export function parseBackfillTranscriptsArgs(argv = process.argv.slice(2)): BackfillTranscriptsArgs {
  const requestedConcurrency = positiveInt(argValue(argv, "--concurrency"), DEFAULT_TRANSCRIPT_CONCURRENCY);
  const sleepSeconds = positiveInt(
    argValue(argv, "--yt-dlp-sleep-seconds") ?? process.env.YTDLP_SLEEP_INTERVAL_SECONDS ?? null,
    DEFAULT_YTDLP_SLEEP_SECONDS,
  );
  const fallbackYtDlp = !argv.includes("--no-yt-dlp");
  const useSerpApi = argv.includes("--serpapi");
  const explicitMethods = parseTranscriptExtractionMethodChain(
    argValue(argv, "--methods") ?? argValue(argv, "--method"),
  );
  return {
    creator: argValue(argv, "--creator"),
    limit: positiveInt(argValue(argv, "--limit") ?? process.env.TRANSCRIPT_BATCH_LIMIT ?? null, DEFAULT_TRANSCRIPT_BATCH_LIMIT),
    offset: nonNegativeInt(argValue(argv, "--offset"), 0),
    concurrency: Math.min(MAX_TRANSCRIPT_CONCURRENCY, requestedConcurrency),
    methods: explicitMethods.length > 0
      ? explicitMethods
      : defaultTranscriptExtractionMethods({ useSerpApi, fallbackYtDlp, env: process.env }),
    gapMs: nonNegativeInt(argValue(argv, "--gap-ms"), sleepSeconds * 1000),
    fallbackYtDlp,
    useSerpApi,
    ytDlpSleepSeconds: sleepSeconds,
    ytDlpMaxSleepSeconds: positiveInt(
      argValue(argv, "--yt-dlp-max-sleep-seconds") ?? process.env.YTDLP_MAX_SLEEP_INTERVAL_SECONDS ?? null,
      DEFAULT_YTDLP_MAX_SLEEP_SECONDS,
    ),
    retryCooldownHours: positiveInt(
      argValue(argv, "--retry-cooldown-hours") ?? process.env.TRANSCRIPT_RETRY_COOLDOWN_HOURS ?? null,
      DEFAULT_RETRY_COOLDOWN_HOURS,
    ),
    staleRetryDays: positiveInt(
      argValue(argv, "--stale-retry-days") ?? process.env.TRANSCRIPT_STALE_RETRY_DAYS ?? null,
      DEFAULT_STALE_RETRY_DAYS,
    ),
    stopOnProviderBlock: !argv.includes("--continue-after-provider-block"),
    lockFile: argValue(argv, "--lock-file") ?? process.env.TRANSCRIPT_LOCK_FILE ?? DEFAULT_LOCK_FILE,
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    auditOut: argValue(argv, "--audit-out"),
  };
}

function serpApiKey(): string | null {
  return process.env.SERPAPI_API_KEY
    ?? process.env.SERPAPI_TOKEN
    ?? process.env.SERPAI_TOKEN
    ?? process.env.SERP_API_KEY
    ?? process.env.SERPAPI_KEY
    ?? null;
}

function transcriptQuality(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 50) return 0.1;
  if (words < 200) return 0.35;
  if (words < 500) return 0.65;
  return Math.min(1, 0.75 + Math.min(0.25, words / 4000));
}

function textFromSerpApi(data: unknown): string {
  const obj = data as { transcript?: readonly { snippet?: string; text?: string }[] };
  return (obj.transcript ?? [])
    .map((item) => item.snippet ?? item.text ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchViaSerpApi(videoId: string): Promise<TranscriptResult | null> {
  const key = serpApiKey();
  if (!key) return null;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "youtube_video_transcript");
  url.searchParams.set("v", videoId);
  url.searchParams.set("language_code", "en");
  url.searchParams.set("type", "asr");
  url.searchParams.set("output", "json");
  url.searchParams.set("api_key", key);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || (data as { error?: string } | null)?.error) return null;
    const text = textFromSerpApi(data);
    if (text.length < 200) return null;
    return {
      text,
      quality: transcriptQuality(text),
      source: "serpapi",
      detail: `segments=${Array.isArray((data as { transcript?: unknown }).transcript) ? (data as { transcript: unknown[] }).transcript.length : 0}`,
    };
  } catch {
    return null;
  }
}

export function stripCaptionText(text: string): string {
  return text
    .replace(/^WEBVTT.*$/gm, "")
    .replace(/^Kind:.*$/gm, "")
    .replace(/^Language:.*$/gm, "")
    .replace(/^\d+$/gm, "")
    .replace(/^\d\d:\d\d:\d\d[.,]\d+\s+-->.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRequestedSubtitleUrl(text: string): string | null {
  const match = text.match(/['"]url['"]:\s*['"]([^'"]+)['"]/);
  return match?.[1].replace(/\\u0026/g, "&") ?? null;
}

export function ytdlpCredentialConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.YTDLP_COOKIES_PATH ?? env.YTDLP_COOKIES ?? env.YTDLP_COOKIES_FROM_BROWSER);
}

export function ytDlpAuthArgs(env: Record<string, string | undefined> = process.env): string[] {
  const cookiesPath = env.YTDLP_COOKIES_PATH ?? null;
  if (cookiesPath) return ["--cookies", cookiesPath];
  const cookies = env.YTDLP_COOKIES ?? null;
  if (cookies && !cookies.includes("\n")) return ["--cookies", cookies];
  const browser = env.YTDLP_COOKIES_FROM_BROWSER ?? null;
  if (browser) return ["--cookies-from-browser", browser];
  return [];
}

function normalizeProviderName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/_/g, "-");
}

function splitMultilineEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function truthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function ytDlpExtraArgs(env: Record<string, string | undefined> = process.env): string[] {
  const args: string[] = [];
  const playerClient = env.YTDLP_PLAYER_CLIENT?.trim()
    || (normalizeProviderName(env.YTDLP_PO_TOKEN_PROVIDER) ? "mweb" : "");
  if (playerClient) args.push("--extractor-args", `youtube:player_client=${playerClient}`);

  args.push(...ytDlpPoTokenProviderArgs(env));

  for (const extractorArg of splitMultilineEnv(env.YTDLP_EXTRACTOR_ARGS)) {
    args.push("--extractor-args", extractorArg);
  }

  const jsRuntimes = env.YTDLP_JS_RUNTIMES?.trim();
  if (jsRuntimes) args.push("--js-runtimes", jsRuntimes);

  const remoteComponents = env.YTDLP_REMOTE_COMPONENTS?.trim();
  if (remoteComponents) {
    args.push("--remote-components", truthyEnv(remoteComponents) ? "ejs:github" : remoteComponents);
  }

  const userAgent = env.YTDLP_USER_AGENT?.trim();
  if (userAgent) args.push("--user-agent", userAgent);

  return args;
}

export function ytDlpPoTokenProviderArgs(env: Record<string, string | undefined> = process.env): string[] {
  const provider = normalizeProviderName(env.YTDLP_PO_TOKEN_PROVIDER);
  if (!provider || provider === "none" || provider === "off" || provider === "false") return [];

  if (provider === "bgutil" || provider === "bgutil-http" || provider === "bgutilhttp") {
    const baseUrl = env.YTDLP_PO_TOKEN_PROVIDER_BASE_URL?.trim()
      || env.YTDLP_PO_TOKEN_BASE_URL?.trim()
      || DEFAULT_YTDLP_PO_TOKEN_PROVIDER_BASE_URL;
    return ["--extractor-args", `youtubepot-bgutilhttp:base_url=${baseUrl}`];
  }

  if (provider === "bgutil-script" || provider === "bgutilscript") {
    const serverHome = env.YTDLP_PO_TOKEN_PROVIDER_HOME?.trim();
    if (!serverHome) {
      throw new Error("YTDLP_PO_TOKEN_PROVIDER_HOME is required when YTDLP_PO_TOKEN_PROVIDER=bgutil-script");
    }
    return ["--extractor-args", `youtubepot-bgutilscript:server_home=${serverHome}`];
  }

  if (provider === "wpc" || provider === "webpo" || provider === "browser-attested") {
    const browserPath = env.YTDLP_PO_TOKEN_BROWSER_PATH?.trim()
      || env.YTDLP_WPC_BROWSER_PATH?.trim();
    return browserPath ? ["--extractor-args", `youtubepot-wpc:browser_path=${browserPath}`] : [];
  }

  throw new Error(`Unsupported YTDLP_PO_TOKEN_PROVIDER=${provider}`);
}

export function redactedYtDlpOptionSummary(env: Record<string, string | undefined> = process.env): Record<string, unknown> {
  const provider = normalizeProviderName(env.YTDLP_PO_TOKEN_PROVIDER);
  return {
    auth: env.YTDLP_COOKIES_PATH
      ? "cookies_path"
      : env.YTDLP_COOKIES
        ? "inline_cookies"
        : env.YTDLP_COOKIES_FROM_BROWSER
          ? "browser"
          : "none",
    playerClient: Boolean(env.YTDLP_PLAYER_CLIENT?.trim() || provider),
    poTokenProvider: provider || "none",
    poTokenProviderBaseUrl: Boolean(env.YTDLP_PO_TOKEN_PROVIDER_BASE_URL?.trim() || env.YTDLP_PO_TOKEN_BASE_URL?.trim()),
    poTokenProviderHome: Boolean(env.YTDLP_PO_TOKEN_PROVIDER_HOME?.trim()),
    poTokenBrowserPath: Boolean(env.YTDLP_PO_TOKEN_BROWSER_PATH?.trim() || env.YTDLP_WPC_BROWSER_PATH?.trim()),
    extractorArgs: splitMultilineEnv(env.YTDLP_EXTRACTOR_ARGS).length,
    jsRuntimes: Boolean(env.YTDLP_JS_RUNTIMES?.trim()),
    remoteComponents: Boolean(env.YTDLP_REMOTE_COMPONENTS?.trim()),
    userAgent: Boolean(env.YTDLP_USER_AGENT?.trim()),
  };
}

export function buildYtDlpTranscriptArgs(
  videoId: string,
  args: BackfillTranscriptsArgs,
  env: Record<string, string | undefined> = process.env,
  authArgs: readonly string[] = ytDlpAuthArgs(env),
  method: TranscriptExtractionMethod = "hh_ytdlp",
): string[] {
  const methodEnv = envForTranscriptMethod(method, env);
  return [
    ...authArgs,
    ...ytDlpExtraArgs(methodEnv),
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    "--quiet",
    "--write-auto-subs",
    "--write-subs",
    "--sub-langs",
    "en.*,en",
    "--sub-format",
    "vtt",
    "--sleep-requests",
    String(args.ytDlpSleepSeconds),
    "--sleep-interval",
    String(args.ytDlpSleepSeconds),
    "--max-sleep-interval",
    String(args.ytDlpMaxSleepSeconds),
    "--retries",
    "2",
    "--fragment-retries",
    "2",
    "--extractor-retries",
    String(DEFAULT_YTDLP_EXTRACTOR_RETRIES),
    "--retry-sleep",
    methodEnv.YTDLP_RETRY_SLEEP?.trim() || DEFAULT_YTDLP_RETRY_SLEEP,
    "--print",
    "requested_subtitles",
    `https://www.youtube.com/watch?v=${videoId}`,
  ];
}

function createInlineCookiesFile(env: Record<string, string | undefined> = process.env): { readonly args: readonly string[]; readonly cleanup: () => void } {
  const cookies = env.YTDLP_COOKIES;
  if (!cookies || !cookies.includes("\n")) return { args: [], cleanup: () => undefined };
  const dir = mkdtempSync(join(tmpdir(), "callscore-ytdlp-cookies-"));
  const file = join(dir, "cookies.txt");
  writeFileSync(file, cookies, { mode: 0o600 });
  return {
    args: ["--cookies", file],
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function classifyYtDlpFailure(text: string): TranscriptFailureReason {
  const lower = text.toLowerCase();
  if (
    lower.includes("po token")
    || lower.includes("potoken")
    || lower.includes("proof of origin")
    || lower.includes("gvs po")
    || lower.includes("visitor data")
  ) return "po_token_required";
  if (
    lower.includes("javascript challenge")
    || lower.includes("js runtime")
    || lower.includes("javascript runtime")
    || lower.includes("ejs")
    || lower.includes("remote component")
  ) return "js_challenge_runtime_missing";
  if (
    (lower.includes("cookie") || lower.includes("cookies"))
    && (
      lower.includes("expired")
      || lower.includes("rotated")
      || lower.includes("invalid")
      || lower.includes("not authorized")
      || lower.includes("unable to load")
    )
  ) return "cookie_invalid_or_rotated";
  if (lower.includes("sign in to confirm") || lower.includes("not a bot") || lower.includes("bot")) return "bot_verification_required";
  if (lower.includes("too many requests") || lower.includes("rate limit") || lower.includes("http error 429")) return "rate_limited";
  if (lower.includes("subtitles") || lower.includes("no captions") || lower.includes("no automatic captions")) return "no_captions";
  if (lower.includes("private video") || lower.includes("video unavailable") || lower.includes("this video is unavailable")) return "failed_terminal";
  return "failed_retryable";
}

async function fetchViaYtDlp(
  videoId: string,
  args: BackfillTranscriptsArgs,
  method: TranscriptExtractionMethod = "hh_ytdlp",
): Promise<TranscriptFetch> {
  const inlineCookies = createInlineCookiesFile();
  try {
    const methodEnv = envForTranscriptMethod(method);
    const authArgs = inlineCookies.args.length > 0 ? inlineCookies.args : ytDlpAuthArgs(methodEnv);
    const { stdout } = await execFileAsync(
      resolveYtDlpBinaryForMethod(method, methodEnv),
      buildYtDlpTranscriptArgs(videoId, args, methodEnv, authArgs, method),
      { timeout: 180_000, maxBuffer: 10 * 1024 * 1024 },
    );
    const subtitleUrl = extractRequestedSubtitleUrl(stdout);
    const captionText = subtitleUrl
      ? await fetch(subtitleUrl, { signal: AbortSignal.timeout(30_000) }).then((response) => response.ok ? response.text() : "")
      : stdout;
    const text = stripCaptionText(captionText);
    if (text.length < 200) {
      return { ok: false, failure: { reason: "no_captions", status: "failed", provider: "yt-dlp" } };
    }
    return { ok: true, transcript: { text, quality: transcriptQuality(text), source: transcriptMethodProvider(method), detail: method } };
  } catch (error) {
    const maybeError = error as { stderr?: string; stdout?: string; message?: string };
    const detail = `${maybeError.stderr ?? ""}\n${maybeError.stdout ?? ""}\n${maybeError.message ?? ""}`.slice(0, 500);
    return { ok: false, failure: { reason: classifyYtDlpFailure(detail), status: "failed", provider: transcriptMethodProvider(method), detail } };
  } finally {
    inlineCookies.cleanup();
  }
}

export async function fetchTranscript(videoId: string, args: BackfillTranscriptsArgs): Promise<TranscriptFetch> {
  let lastFailure: TranscriptFailure | null = null;
  for (const method of args.methods) {
    if (method === "serpapi_transcript") {
      if (!serpApiKey()) {
        lastFailure = { reason: "provider_credentials_missing", status: "failed", provider: "serpapi" };
        continue;
      }
      const serp = await fetchViaSerpApi(videoId);
      if (serp) return { ok: true, transcript: serp };
      lastFailure = { reason: "providers_returned_no_transcript", status: "failed", provider: "serpapi" };
      continue;
    }

    if (isYtDlpBackfillMethod(method)) {
      const result = await fetchViaYtDlp(videoId, args, method);
      if (result.ok) return result;
      if ("failure" in result) lastFailure = result.failure;
      continue;
    }

    const plan = buildTranscriptExtractionPlan([method])[0];
    return {
      ok: false,
      handoff: {
        reason: method === "media_asr_fallback" ? "media_fallback_required" : "external_handoff_required",
        status: "pending_handoff",
        provider: plan.provider,
        detail: plan.command,
        method,
        previousFailureReason: lastFailure?.reason,
      },
    };
  }

  return {
    ok: false,
    failure: lastFailure ?? {
      reason: "provider_credentials_missing",
      status: "failed",
      provider: "none",
      detail: "No transcript extraction methods configured",
    },
  };
}

async function markTranscriptFailure(videoId: number, failure: TranscriptFailure, write: boolean): Promise<void> {
  if (!write) return;
  await query(
    `UPDATE videos
     SET transcript_status = $2,
         transcript_provider = $3,
         transcript_error = $4,
         transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
         transcript_last_attempt_at = NOW()
     WHERE id = $1 AND (transcript IS NULL OR length(transcript) = 0)`,
    [videoId, failure.status, failure.provider, failure.reason],
  );
}

async function loadMissingTranscriptVideos(args: BackfillTranscriptsArgs): Promise<MissingTranscriptVideo[]> {
  const params: unknown[] = [];
  const filters = [
    "v.published_at IS NOT NULL",
    "(v.transcript IS NULL OR length(v.transcript) = 0)",
    `(v.transcript_last_attempt_at IS NULL
      OR v.transcript_last_attempt_at < NOW() - ($1::int * INTERVAL '1 hour')
      OR (v.transcript_error IN ('provider_credentials_missing','bot_verification_required','rate_limited')
          AND v.transcript_last_attempt_at < NOW() - ($2::int * INTERVAL '1 day'))
      OR (v.transcript_error IN ('cookie_invalid_or_rotated','po_token_required','js_challenge_runtime_missing')
          AND v.transcript_last_attempt_at < NOW() - ($2::int * INTERVAL '1 day')))`,
  ];
  params.push(args.retryCooldownHours, args.staleRetryDays);
  if (args.creator) {
    params.push(args.creator);
    filters.push(`lower(c.youtube_handle) = lower($${params.length})`);
  }
  params.push(args.limit, args.offset);
  return query<MissingTranscriptVideo>(
    `SELECT v.id, v.creator_id, v.youtube_video_id, v.title, v.published_at, c.name AS creator_name, c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE ${filters.join(" AND ")}
     ORDER BY v.published_at DESC NULLS LAST, v.id DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
}

function audit(args: BackfillTranscriptsArgs, row: Record<string, unknown>): void {
  if (!args.auditOut) return;
  writeJsonlRecord(args.auditOut, row);
}

function acquireLock(lockFile: string): () => void {
  mkdirSync(dirname(lockFile), { recursive: true });
  const fd = openSync(lockFile, "wx");
  writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
  return () => {
    closeSync(fd);
    rmSync(lockFile, { force: true });
  };
}

function isProviderBlock(reason: TranscriptFailureReason): boolean {
  return reason === "provider_credentials_missing"
    || reason === "external_handoff_required"
    || reason === "media_fallback_required"
    || reason === "bot_verification_required"
    || reason === "cookie_invalid_or_rotated"
    || reason === "po_token_required"
    || reason === "js_challenge_runtime_missing"
    || reason === "rate_limited";
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseBackfillTranscriptsArgs(argv);
  let releaseLock: (() => void) | null = null;
  try {
    releaseLock = acquireLock(args.lockFile);
  } catch {
    console.error(`[${timestamp()}] transcript backfill skipped: lock held at ${args.lockFile}`);
    process.exitCode = 75;
    return;
  }

  try {
    const videos = await loadMissingTranscriptVideos(args);
    console.log(`[${timestamp()}] transcript backfill ${args.write ? "WRITE" : "DRY-RUN"}: videos=${videos.length}, limit=${args.limit}, offset=${args.offset}, concurrency=${args.concurrency}, gapMs=${args.gapMs}, methods=${args.methods.join(",") || "none"}, local_methods=${args.methods.filter(isLocalBackfillMethod).join(",") || "none"}, lock=${args.lockFile}, ytdlp=${JSON.stringify(redactedYtDlpOptionSummary())}`);

    let written = 0;
    let failed = 0;
    let providerBlocked = false;
    for (let index = 0; index < videos.length; index += args.concurrency) {
      const chunk = videos.slice(index, index + args.concurrency);
      const results = await Promise.all(chunk.map(async (video) => ({
        video,
        transcript: await fetchTranscript(video.youtube_video_id, args),
      })));

      for (const { video, transcript } of results) {
        if (!transcript.ok) {
          if ("handoff" in transcript) {
            audit(args, {
              record_type: "transcript_backfill",
              ts: timestamp(),
              mode: args.write ? "WRITE" : "DRY",
              status: transcript.handoff.status,
              reason: transcript.handoff.reason,
              provider: transcript.handoff.provider,
              method: transcript.handoff.method,
              video_id: video.id,
              creator_id: video.creator_id,
              youtube_video_id: video.youtube_video_id,
              creator: video.youtube_handle,
            });
            console.log(`[${timestamp()}] ${transcript.handoff.status} ${video.youtube_video_id} ${video.creator_name} method=${transcript.handoff.method} reason=${transcript.handoff.reason}`);
            if (
              args.stopOnProviderBlock
              && transcript.handoff.previousFailureReason
              && isProviderBlock(transcript.handoff.previousFailureReason)
            ) providerBlocked = true;
            continue;
          }

          failed++;
          await markTranscriptFailure(video.id, transcript.failure, args.write);
          audit(args, {
            record_type: "transcript_backfill",
            ts: timestamp(),
            mode: args.write ? "WRITE" : "DRY",
            status: transcript.failure.status,
            reason: transcript.failure.reason,
            provider: transcript.failure.provider,
            video_id: video.id,
            creator_id: video.creator_id,
            youtube_video_id: video.youtube_video_id,
            creator: video.youtube_handle,
          });
          console.log(`[${timestamp()}] ${transcript.failure.status} ${video.youtube_video_id} ${video.creator_name} reason=${transcript.failure.reason}`);
          if (args.stopOnProviderBlock && isProviderBlock(transcript.failure.reason)) providerBlocked = true;
          continue;
        }

        if (args.write) {
          await query(
            `UPDATE videos
             SET transcript = $1, transcript_quality = $2, calls_extracted = false,
                 transcript_status = 'available', transcript_provider = $4, transcript_error = NULL,
                 transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
                 transcript_last_attempt_at = NOW()
             WHERE id = $3 AND (transcript IS NULL OR length(transcript) = 0)`,
            [transcript.transcript.text, transcript.transcript.quality, video.id, transcript.transcript.source],
          );
        }
        written++;
        audit(args, {
          record_type: "transcript_backfill",
          ts: timestamp(),
          mode: args.write ? "WRITE" : "DRY",
          status: args.write ? "updated" : "would_update",
          video_id: video.id,
          creator_id: video.creator_id,
          youtube_video_id: video.youtube_video_id,
          creator: video.youtube_handle,
          transcript_chars: transcript.transcript.text.length,
          transcript_quality: transcript.transcript.quality,
          source: transcript.transcript.source,
          detail: transcript.transcript.detail,
        });
        console.log(`[${timestamp()}] ${args.write ? "updated" : "would-update"} ${video.youtube_video_id} source=${transcript.transcript.source} chars=${transcript.transcript.text.length}`);
      }

      if (providerBlocked) {
        console.error(`[${timestamp()}] transcript backfill stopped after provider/rate-limit blocker to avoid yt-dlp stampede`);
        break;
      }
      if (args.gapMs > 0 && index + args.concurrency < videos.length) await sleep(args.gapMs);
    }

    console.log(`[${timestamp()}] transcript backfill complete: ${written} ${args.write ? "updated" : "would-update"}, ${failed} failed`);
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
