import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { accessSync, chmodSync, closeSync, constants as fsConstants, copyFileSync, lstatSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { query } from "../lib/db";
import { writeJsonlRecord } from "../lib/shadow-extraction";
import {
  buildTranscriptExtractionPlan,
  DEFAULT_HH_YTDLP_EJS_WPC_BIN,
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
const MAX_TARGETED_RECOVERY_IDS = 25;
const MAX_WORKPLANE_TARGETED_RECOVERY_IDS = 9;

export interface BackfillTranscriptsArgs {
  readonly runId: string;
  readonly creator: string | null;
  readonly youtubeVideoIds: readonly string[];
  readonly forceTargetedRetry: boolean;
  readonly workplaneJobId: number;
  readonly workplaneWorkerId: string;
  readonly workplaneJobAttempt: number;
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
  readonly transcript_status: string | null;
  readonly transcript_error: string | null;
  readonly transcript_attempts: number | null;
  readonly transcript_last_attempt_at: string | null;
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
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function youtubeVideoIds(value: string | null): string[] {
  if (!value) return [];
  const ids = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  const invalid = ids.find((id) => !/^[A-Za-z0-9_-]{11}$/.test(id));
  if (invalid) throw new Error(`Invalid YouTube video ID: ${invalid}`);
  return ids;
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
  const targetedVideoIds = youtubeVideoIds(argValue(argv, "--youtube-video-ids"));
  const forceTargetedRetry = argv.includes("--force-targeted-retry");
  if (targetedVideoIds.length > MAX_TARGETED_RECOVERY_IDS) {
    throw new Error(`--youtube-video-ids count ${targetedVideoIds.length} exceeds hard cap of ${MAX_TARGETED_RECOVERY_IDS}`);
  }
  if (forceTargetedRetry && targetedVideoIds.length === 0) {
    throw new Error("--force-targeted-retry requires --youtube-video-ids");
  }
  return {
    runId: argValue(argv, "--run-id") ?? `transcript-backfill-${Date.now()}-${process.pid}-${randomUUID()}`,
    creator: argValue(argv, "--creator"),
    youtubeVideoIds: targetedVideoIds,
    forceTargetedRetry,
    workplaneJobId: positiveInt(argValue(argv, "--workplane-job-id"), 0),
    workplaneWorkerId: (argValue(argv, "--workplane-worker-id") ?? "").trim(),
    workplaneJobAttempt: positiveInt(argValue(argv, "--workplane-job-attempt"), 0),
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

export type BackfillInvocationOwner = "cli" | "workplane";

export function assertBackfillWriteAuthority(args: BackfillTranscriptsArgs, owner: BackfillInvocationOwner): void {
  if (owner === "workplane") {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(args.runId)) throw new Error("transcript_recover_hh Workplane ownership requires a 1-96 character safe run id");
    if (args.workplaneJobId <= 0) throw new Error("transcript_recover_hh Workplane ownership requires a positive workplane job id");
    if (!args.workplaneWorkerId || args.workplaneWorkerId.length > 256) throw new Error("transcript_recover_hh Workplane ownership requires the executing worker identity");
    if (args.workplaneJobAttempt <= 0) throw new Error("transcript_recover_hh Workplane ownership requires the positive claim generation");
    if (!args.forceTargetedRetry) throw new Error("transcript_recover_hh Workplane invocation requires --force-targeted-retry");
    if (args.youtubeVideoIds.length === 0 || args.youtubeVideoIds.length > MAX_WORKPLANE_TARGETED_RECOVERY_IDS) {
      throw new Error(`transcript_recover_hh Workplane invocation requires 1 to at most ${MAX_WORKPLANE_TARGETED_RECOVERY_IDS} exact IDs`);
    }
    if (args.limit !== args.youtubeVideoIds.length || args.limit > MAX_WORKPLANE_TARGETED_RECOVERY_IDS) {
      throw new Error("transcript_recover_hh Workplane limit must equal the exact-ID count and be at most 9");
    }
    if (args.methods.length !== 1 || args.methods[0] !== "hh_ytdlp_ejs_wpc") {
      throw new Error("transcript_recover_hh Workplane invocation requires only hh_ytdlp_ejs_wpc");
    }
  }
  if (args.write && args.youtubeVideoIds.length > 0 && owner !== "workplane") {
    throw new Error("exact-ID transcript writes require transcript_recover_hh Workplane ownership");
  }
}

export function requiresHhRecoveryRuntimePreflight(args: BackfillTranscriptsArgs): boolean {
  return args.methods.includes("hh_ytdlp_ejs_wpc");
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

const CANONICAL_HH_NODE_RUNTIME = "/usr/local/bin/node";
const CANONICAL_HH_CHROMIUM = "/usr/bin/chromium";
const CANONICAL_HH_YTDLP_EJS_SENTINEL = "/opt/callscore/yt-dlp-2026.6.9/.callscore-yt-dlp-ejs-0.8.0";

export interface HhRecoveryFileInfo {
  readonly realpath: string;
  readonly is_file: boolean;
  readonly uid: number;
  readonly mode: number;
  readonly size: number;
  readonly executable: boolean;
}

export type HhRecoveryFileInspector = (path: string) => HhRecoveryFileInfo;

const inspectHhRecoveryFile: HhRecoveryFileInspector = (path) => {
  const stat = lstatSync(path);
  let executable = false;
  try {
    accessSync(path, fsConstants.X_OK);
    executable = true;
  } catch {
    executable = false;
  }
  return {
    realpath: realpathSync(path),
    is_file: stat.isFile(),
    uid: stat.uid,
    mode: stat.mode & 0o777,
    size: stat.size,
    executable,
  };
};

function requireCanonicalRootFile(path: string, label: string, inspector: HhRecoveryFileInspector, executable: boolean): HhRecoveryFileInfo {
  let info: HhRecoveryFileInfo;
  try {
    info = inspector(path);
  } catch {
    throw new Error(`HH targeted recovery ${label} canonical file is unavailable`);
  }
  if (info.realpath !== path || !info.is_file || info.uid !== 0 || (info.mode & 0o022) !== 0 || (executable && !info.executable)) {
    throw new Error(`HH targeted recovery ${label} canonical file failed ownership/type/mode checks`);
  }
  return info;
}

export function assertHhTargetedRecoveryYtDlpEnv(
  env: Record<string, string | undefined> = process.env,
  inspector: HhRecoveryFileInspector = inspectHhRecoveryFile,
): void {
  if (env.YTDLP_COOKIES_FROM_BROWSER?.trim()) {
    throw new Error("HH targeted recovery forbids --cookies-from-browser; browser profiles remain laptop-local");
  }
  if (env.YTDLP_COOKIES?.trim()) {
    throw new Error("HH targeted recovery requires YTDLP_COOKIES_PATH; YTDLP_COOKIES is not accepted");
  }
  const cookiePath = env.YTDLP_COOKIES_PATH?.trim();
  if ((cookiePath && !cookiePath.startsWith("/run/secrets/")) || cookiePath?.includes("..")) {
    throw new Error("HH targeted recovery cookie path must be a non-traversing file under /run/secrets/");
  }
  if (cookiePath) {
    let cookieInfo: HhRecoveryFileInfo;
    try {
      cookieInfo = inspector(cookiePath);
    } catch {
      throw new Error("HH targeted recovery cookie file is unavailable");
    }
    if (cookieInfo.realpath !== cookiePath || !cookieInfo.is_file || cookieInfo.uid !== 0 || (cookieInfo.mode & 0o077) !== 0 || cookieInfo.size <= 0 || cookieInfo.size > 10 * 1024 * 1024) {
      throw new Error("HH targeted recovery cookie file failed canonical ownership/type/mode/size checks");
    }
  }

  const ytDlpBin = env.YTDLP_BIN?.trim() || DEFAULT_HH_YTDLP_EJS_WPC_BIN;
  if (ytDlpBin !== DEFAULT_HH_YTDLP_EJS_WPC_BIN) {
    throw new Error(`HH targeted recovery YTDLP_BIN must be ${DEFAULT_HH_YTDLP_EJS_WPC_BIN}`);
  }
  requireCanonicalRootFile(DEFAULT_HH_YTDLP_EJS_WPC_BIN, "yt-dlp", inspector, true);
  requireCanonicalRootFile(CANONICAL_HH_YTDLP_EJS_SENTINEL, "local yt-dlp-ejs", inspector, false);
  if (env.YTDLP_EXTRA_ARGS?.trim()) {
    throw new Error("HH targeted recovery forbids YTDLP_EXTRA_ARGS");
  }
  if (env.YTDLP_PROXY?.trim()) {
    throw new Error("HH targeted recovery forbids YTDLP_PROXY");
  }

  const allowedPlayerClients = new Set(["mweb", "web", "web_safari", "tv", "tv_embedded"]);
  const configuredPlayerClients = (env.YTDLP_PLAYER_CLIENT?.trim() || "mweb").split(",").filter(Boolean);
  if (configuredPlayerClients.length === 0 || configuredPlayerClients.some((client) => !allowedPlayerClients.has(client))) {
    throw new Error("HH targeted recovery YTDLP_PLAYER_CLIENT is outside the allowlist");
  }
  const configuredJsRuntimes = env.YTDLP_JS_RUNTIMES?.trim() || `node:${CANONICAL_HH_NODE_RUNTIME}`;
  if (configuredJsRuntimes !== `node:${CANONICAL_HH_NODE_RUNTIME}`) {
    throw new Error(`HH targeted recovery YTDLP_JS_RUNTIMES must be node:${CANONICAL_HH_NODE_RUNTIME}`);
  }
  requireCanonicalRootFile(CANONICAL_HH_NODE_RUNTIME, "Node runtime", inspector, true);
  const remoteComponents = (env.YTDLP_REMOTE_COMPONENTS?.trim() || "none").toLowerCase();
  if (!["0", "false", "off", "no", "none"].includes(remoteComponents)) {
    throw new Error("HH targeted recovery remote components are disabled; local pinned yt-dlp-ejs is required");
  }

  const provider = normalizeProviderName(env.YTDLP_PO_TOKEN_PROVIDER);
  const allowedProviders = new Set(["", "none", "off", "false", "bgutil", "bgutil-http", "bgutilhttp", "wpc", "webpo", "browser-attested"]);
  if (!allowedProviders.has(provider)) {
    throw new Error(`HH targeted recovery does not allow PO-token provider ${provider || "unknown"}`);
  }
  if (provider === "bgutil" || provider === "bgutil-http" || provider === "bgutilhttp") {
    const rawUrl = env.YTDLP_PO_TOKEN_PROVIDER_BASE_URL?.trim()
      || env.YTDLP_PO_TOKEN_BASE_URL?.trim()
      || DEFAULT_YTDLP_PO_TOKEN_PROVIDER_BASE_URL;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error("HH targeted recovery PO-token provider URL is invalid");
    }
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("HH targeted recovery PO-token provider must be an unauthenticated loopback-only HTTP endpoint without query credentials");
    }
  }
  if (provider === "wpc" || provider === "webpo" || provider === "browser-attested") {
    const browserPath = env.YTDLP_PO_TOKEN_BROWSER_PATH?.trim() || env.YTDLP_WPC_BROWSER_PATH?.trim();
    if (browserPath !== CANONICAL_HH_CHROMIUM) {
      throw new Error(`HH targeted recovery WPC browser must be canonical ${CANONICAL_HH_CHROMIUM}`);
    }
    requireCanonicalRootFile(CANONICAL_HH_CHROMIUM, "Chromium", inspector, true);
  }

  for (const extractorArg of splitMultilineEnv(env.YTDLP_EXTRACTOR_ARGS)) {
    if (extractorArg === "youtube:player_skip=configs") continue;
    const clients = extractorArg.match(/^youtube:player_client=([A-Za-z0-9_,.-]+)$/)?.[1]?.split(",") ?? [];
    if (clients.length === 0 || clients.some((client) => !allowedPlayerClients.has(client))) {
      throw new Error("HH targeted recovery extractor arguments are outside the allowlist");
    }
  }
}

export function redactYtDlpDiagnostic(value: string): string {
  return value
    .replace(/((?:Cookie|Authorization)\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(--cookies(?:-from-browser)?\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\/run\/secrets\/[^\s'\"]+/g, "/run/secrets/[REDACTED]")
    .replace(/\/tmp\/callscore-ytdlp-cookies-[^\s'\"]+/g, "/tmp/callscore-ytdlp-cookies-[REDACTED]")
    .replace(/((?:po[_-]?token|token|visitor[_-]?data)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(base_url=)[^\s,;]+/gi, "$1[REDACTED]");
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
  const remoteComponentsDisabled = ["0", "false", "off", "no", "none"].includes((remoteComponents ?? "").toLowerCase());
  if (remoteComponents && !remoteComponentsDisabled) {
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

export function prepareWritableYtDlpAuth(env: Record<string, string | undefined> = process.env): { readonly args: readonly string[]; readonly cleanup: () => void } {
  const cookies = env.YTDLP_COOKIES;
  const sourcePath = env.YTDLP_COOKIES_PATH ?? (cookies && !cookies.includes("\n") ? cookies : null);
  if (sourcePath || (cookies && cookies.includes("\n"))) {
    const dir = mkdtempSync(join(tmpdir(), "callscore-ytdlp-cookies-"));
    const file = join(dir, "cookies.txt");
    if (sourcePath) copyFileSync(sourcePath, file);
    else writeFileSync(file, cookies ?? "", { mode: 0o600 });
    chmodSync(file, 0o600);
    return {
      args: ["--cookies", file],
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  }
  return { args: ytDlpAuthArgs(env), cleanup: () => undefined };
}

export function classifyYtDlpFailure(text: string): TranscriptFailureReason {
  const lower = text.toLowerCase();
  if (lower.includes("private video") || lower.includes("video unavailable") || lower.includes("this video is unavailable") || lower.includes("available to this channel's members") || lower.includes("members-only")) return "failed_terminal";
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
  return "failed_retryable";
}

async function fetchViaYtDlp(
  videoId: string,
  args: BackfillTranscriptsArgs,
  method: TranscriptExtractionMethod = "hh_ytdlp",
): Promise<TranscriptFetch> {
  const methodEnv = envForTranscriptMethod(method);
  const writableAuth = prepareWritableYtDlpAuth(methodEnv);
  try {
    const { stdout } = await execFileAsync(
      resolveYtDlpBinaryForMethod(method, methodEnv),
      buildYtDlpTranscriptArgs(videoId, args, methodEnv, writableAuth.args, method),
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
    const rawDetail = `${maybeError.stderr ?? ""}\n${maybeError.stdout ?? ""}\n${maybeError.message ?? ""}`.slice(0, 2_000);
    return { ok: false, failure: { reason: classifyYtDlpFailure(rawDetail), status: "failed", provider: transcriptMethodProvider(method), detail: redactYtDlpDiagnostic(rawDetail).slice(0, 500) } };
  } finally {
    writableAuth.cleanup();
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

export const JOURNALED_TRANSCRIPT_FAILURE_SQL = `WITH owner AS (
  SELECT id FROM pipeline_jobs
  WHERE id = $9
    AND type = 'transcript_recover_hh'
    AND status = 'running'
    AND locked_by = $12
    AND lease_expires_at > NOW()
    AND attempts = $13
  FOR UPDATE
), updated AS (
  UPDATE videos
  SET transcript_status = $2,
      transcript_provider = $3,
      transcript_error = $4,
      transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
      transcript_last_attempt_at = NOW()
  WHERE id = $1
    AND EXISTS (SELECT 1 FROM owner)
    AND transcript_status IS NOT DISTINCT FROM $5
    AND transcript_error IS NOT DISTINCT FROM $6
    AND transcript_attempts IS NOT DISTINCT FROM $7
    AND transcript_last_attempt_at IS NOT DISTINCT FROM $8::timestamptz
    AND (transcript IS NULL OR length(transcript) = 0)
  RETURNING id
), journaled AS (
  UPDATE pipeline_jobs AS p
  SET metrics = jsonb_set(
    COALESCE(p.metrics, '{}'::jsonb),
    '{transcript_recovery_mutations}',
    COALESCE(p.metrics->'transcript_recovery_mutations', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
        'run_id', $10::text,
        'youtube_video_id', $11::text,
        'video_id', $1::int,
        'status', $2::text,
        'reason', $4::text,
        'db_write_performed', true,
        'evidence_source', 'pipeline_job_transaction_journal'
      )),
    true
  )
  FROM updated
  WHERE p.id = (SELECT id FROM owner)
  RETURNING p.id
)
SELECT updated.id FROM updated JOIN journaled ON true`;

export const JOURNALED_TRANSCRIPT_SUCCESS_SQL = `WITH owner AS (
  SELECT id FROM pipeline_jobs
  WHERE id = $9
    AND type = 'transcript_recover_hh'
    AND status = 'running'
    AND locked_by = $12
    AND lease_expires_at > NOW()
    AND attempts = $13
  FOR UPDATE
), updated AS (
  UPDATE videos
  SET transcript = $1, transcript_quality = $2, calls_extracted = false,
      transcript_status = 'available', transcript_provider = $4, transcript_error = NULL,
      transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
      transcript_last_attempt_at = NOW()
  WHERE id = $3
    AND EXISTS (SELECT 1 FROM owner)
    AND transcript_status IS NOT DISTINCT FROM $5
    AND transcript_error IS NOT DISTINCT FROM $6
    AND transcript_attempts IS NOT DISTINCT FROM $7
    AND transcript_last_attempt_at IS NOT DISTINCT FROM $8::timestamptz
    AND (transcript IS NULL OR length(transcript) = 0)
  RETURNING id
), journaled AS (
  UPDATE pipeline_jobs AS p
  SET metrics = jsonb_set(
    COALESCE(p.metrics, '{}'::jsonb),
    '{transcript_recovery_mutations}',
    COALESCE(p.metrics->'transcript_recovery_mutations', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
        'run_id', $10::text,
        'youtube_video_id', $11::text,
        'video_id', $3::int,
        'status', 'updated',
        'db_write_performed', true,
        'evidence_source', 'pipeline_job_transaction_journal'
      )),
    true
  )
  FROM updated
  WHERE p.id = (SELECT id FROM owner)
  RETURNING p.id
)
SELECT updated.id FROM updated JOIN journaled ON true`;

async function markTranscriptFailure(
  video: MissingTranscriptVideo,
  failure: TranscriptFailure,
  args: BackfillTranscriptsArgs,
  owner: BackfillInvocationOwner,
): Promise<boolean> {
  if (!args.write) return true;
  if (owner !== "workplane") {
    const rows = await query<{ id: number }>(
      `UPDATE videos
       SET transcript_status = $2,
           transcript_provider = $3,
           transcript_error = $4,
           transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
           transcript_last_attempt_at = NOW()
       WHERE id = $1
         AND transcript_status IS NOT DISTINCT FROM $5
         AND transcript_error IS NOT DISTINCT FROM $6
         AND transcript_attempts IS NOT DISTINCT FROM $7
         AND transcript_last_attempt_at IS NOT DISTINCT FROM $8::timestamptz
         AND (transcript IS NULL OR length(transcript) = 0)
       RETURNING id`,
      [video.id, failure.status, failure.provider, failure.reason, video.transcript_status, video.transcript_error, video.transcript_attempts, video.transcript_last_attempt_at],
    );
    return rows.length === 1;
  }
  const rows = await query<{ id: number }>(JOURNALED_TRANSCRIPT_FAILURE_SQL, [
    video.id,
    failure.status,
    failure.provider,
    failure.reason,
    video.transcript_status,
    video.transcript_error,
    video.transcript_attempts,
    video.transcript_last_attempt_at,
    args.workplaneJobId,
    args.runId,
    video.youtube_video_id,
    args.workplaneWorkerId,
    args.workplaneJobAttempt,
  ]);
  return rows.length === 1;
}

export interface MissingTranscriptVideosQuery {
  readonly sql: string;
  readonly params: unknown[];
}

export function buildMissingTranscriptVideosQuery(args: BackfillTranscriptsArgs): MissingTranscriptVideosQuery {
  const params: unknown[] = [];
  const filters = [
    "v.published_at IS NOT NULL",
    "(v.transcript IS NULL OR length(v.transcript) = 0)",
  ];

  if (args.youtubeVideoIds.length > 0) {
    params.push(args.youtubeVideoIds);
    filters.push(`v.youtube_video_id = ANY($${params.length}::text[])`);
  }

  if (args.forceTargetedRetry) {
    filters.push("v.transcript_status = 'failed'");
    filters.push("v.transcript_error IN ('bot_verification_required','js_challenge_runtime_missing')");
  }

  if (!args.forceTargetedRetry) {
    params.push(args.retryCooldownHours);
    const retryCooldownParam = params.length;
    params.push(args.staleRetryDays);
    const staleRetryParam = params.length;
    filters.push(`(v.transcript_last_attempt_at IS NULL
      OR v.transcript_last_attempt_at < NOW() - ($${retryCooldownParam}::int * INTERVAL '1 hour')
      OR (v.transcript_error IN ('provider_credentials_missing','bot_verification_required','rate_limited')
          AND v.transcript_last_attempt_at < NOW() - ($${staleRetryParam}::int * INTERVAL '1 day'))
      OR (v.transcript_error IN ('cookie_invalid_or_rotated','po_token_required','js_challenge_runtime_missing')
          AND v.transcript_last_attempt_at < NOW() - ($${staleRetryParam}::int * INTERVAL '1 day')))`);
  }

  if (args.creator) {
    params.push(args.creator);
    filters.push(`lower(c.youtube_handle) = lower($${params.length})`);
  }
  params.push(args.limit, args.offset);
  return {
    sql: `SELECT v.id, v.creator_id, v.youtube_video_id, v.title, v.published_at,
            v.transcript_status, v.transcript_error, v.transcript_attempts, v.transcript_last_attempt_at,
            c.name AS creator_name, c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE ${filters.join(" AND ")}
     ORDER BY v.published_at DESC NULLS LAST, v.id DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  };
}

async function loadMissingTranscriptVideos(args: BackfillTranscriptsArgs): Promise<MissingTranscriptVideo[]> {
  const selection = buildMissingTranscriptVideosQuery(args);
  return query<MissingTranscriptVideo>(selection.sql, selection.params);
}

function audit(args: BackfillTranscriptsArgs, row: Record<string, unknown>): void {
  if (!args.auditOut) return;
  writeJsonlRecord(args.auditOut, { run_id: args.runId, ...row });
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

async function runBackfillTranscripts(argv: readonly string[], owner: BackfillInvocationOwner): Promise<void> {
  loadEnv();
  const args = parseBackfillTranscriptsArgs([...argv]);
  assertBackfillWriteAuthority(args, owner);
  if (requiresHhRecoveryRuntimePreflight(args)) assertHhTargetedRecoveryYtDlpEnv();
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
              previous_failure_reason: transcript.handoff.previousFailureReason,
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
          const failureApplied = await markTranscriptFailure(video, transcript.failure, args, owner);
          if (args.write && !failureApplied) {
            audit(args, {
              record_type: "transcript_backfill",
              ts: timestamp(),
              mode: "WRITE",
              status: "mutation_conflict",
              reason: "mutation_conflict",
              detail: "concurrent_row_change",
              db_write_performed: false,
              video_id: video.id,
              creator_id: video.creator_id,
              youtube_video_id: video.youtube_video_id,
              previous_transcript_status: video.transcript_status,
              previous_transcript_error: video.transcript_error,
              previous_transcript_attempts: video.transcript_attempts,
              previous_transcript_last_attempt_at: video.transcript_last_attempt_at,
            });
            console.error(`[${timestamp()}] mutation-conflict ${video.youtube_video_id}: row changed after selection`);
            continue;
          }
          audit(args, {
            record_type: "transcript_backfill",
            ts: timestamp(),
            mode: args.write ? "WRITE" : "DRY",
            status: transcript.failure.status,
            reason: transcript.failure.reason,
            provider: transcript.failure.provider,
            db_write_performed: args.write && failureApplied,
            video_id: video.id,
            creator_id: video.creator_id,
            youtube_video_id: video.youtube_video_id,
            creator: video.youtube_handle,
            previous_transcript_status: video.transcript_status,
            previous_transcript_error: video.transcript_error,
            previous_transcript_attempts: video.transcript_attempts,
            previous_transcript_last_attempt_at: video.transcript_last_attempt_at,
          });
          console.log(`[${timestamp()}] ${transcript.failure.status} ${video.youtube_video_id} ${video.creator_name} reason=${transcript.failure.reason}`);
          if (args.stopOnProviderBlock && isProviderBlock(transcript.failure.reason)) providerBlocked = true;
          continue;
        }

        if (args.write) {
          const updatedRows = owner === "workplane"
            ? await query<{ id: number }>(JOURNALED_TRANSCRIPT_SUCCESS_SQL, [
              transcript.transcript.text,
              transcript.transcript.quality,
              video.id,
              transcript.transcript.source,
              video.transcript_status,
              video.transcript_error,
              video.transcript_attempts,
              video.transcript_last_attempt_at,
              args.workplaneJobId,
              args.runId,
              video.youtube_video_id,
              args.workplaneWorkerId,
              args.workplaneJobAttempt,
            ])
            : await query<{ id: number }>(
              `UPDATE videos
               SET transcript = $1, transcript_quality = $2, calls_extracted = false,
                   transcript_status = 'available', transcript_provider = $4, transcript_error = NULL,
                   transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
                   transcript_last_attempt_at = NOW()
               WHERE id = $3
                 AND transcript_status IS NOT DISTINCT FROM $5
                 AND transcript_error IS NOT DISTINCT FROM $6
                 AND transcript_attempts IS NOT DISTINCT FROM $7
                 AND transcript_last_attempt_at IS NOT DISTINCT FROM $8::timestamptz
                 AND (transcript IS NULL OR length(transcript) = 0)
               RETURNING id`,
              [transcript.transcript.text, transcript.transcript.quality, video.id, transcript.transcript.source, video.transcript_status, video.transcript_error, video.transcript_attempts, video.transcript_last_attempt_at],
            );
          if (updatedRows.length !== 1) {
            failed++;
            audit(args, {
              record_type: "transcript_backfill",
              ts: timestamp(),
              mode: "WRITE",
              status: "mutation_conflict",
              reason: "mutation_conflict",
              detail: "concurrent_row_change",
              db_write_performed: false,
              video_id: video.id,
              creator_id: video.creator_id,
              youtube_video_id: video.youtube_video_id,
              previous_transcript_status: video.transcript_status,
              previous_transcript_error: video.transcript_error,
              previous_transcript_attempts: video.transcript_attempts,
              previous_transcript_last_attempt_at: video.transcript_last_attempt_at,
            });
            console.error(`[${timestamp()}] mutation-conflict ${video.youtube_video_id}: row changed after selection`);
            continue;
          }
        }
        written++;
        audit(args, {
          record_type: "transcript_backfill",
          ts: timestamp(),
          mode: args.write ? "WRITE" : "DRY",
          status: args.write ? "updated" : "would_update",
          db_write_performed: args.write,
          video_id: video.id,
          creator_id: video.creator_id,
          youtube_video_id: video.youtube_video_id,
          creator: video.youtube_handle,
          transcript_chars: transcript.transcript.text.length,
          transcript_quality: transcript.transcript.quality,
          source: transcript.transcript.source,
          detail: transcript.transcript.detail,
          previous_transcript_status: video.transcript_status,
          previous_transcript_error: video.transcript_error,
          previous_transcript_attempts: video.transcript_attempts,
          previous_transcript_last_attempt_at: video.transcript_last_attempt_at,
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

export async function main(argv = process.argv.slice(2)): Promise<void> {
  return runBackfillTranscripts(argv, "cli");
}

export async function runTargetedTranscriptRecoveryFromWorkplane(argv: readonly string[]): Promise<void> {
  return runBackfillTranscripts(argv, "workplane");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
