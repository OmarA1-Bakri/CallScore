import { existsSync } from "node:fs";

export const DEFAULT_HH_YTDLP_EJS_WPC_BIN = "/opt/callscore/yt-dlp-2026.6.9/bin/yt-dlp";

export type TranscriptExtractionMethod =
  | "serpapi_transcript"
  | "hh_ytdlp"
  | "hh_ytdlp_ejs_wpc"
  | "laptop_ytdlp"
  | "youtube_transcript_api_laptop"
  | "media_asr_fallback";

export interface TranscriptExtractionPlanEntry {
  readonly method: TranscriptExtractionMethod;
  readonly provider: string;
  readonly executionLocation: "HH" | "laptop";
  readonly command: string;
  readonly requiresExternalRunner: boolean;
  readonly requiresIngest: boolean;
  readonly maxBatchSize: number;
  readonly notes: readonly string[];
}

const METHOD_ALIASES: Record<string, TranscriptExtractionMethod> = {
  serpapi: "serpapi_transcript",
  "serpapi-transcript": "serpapi_transcript",
  serpapi_transcript: "serpapi_transcript",
  ytdlp: "hh_ytdlp",
  "yt-dlp": "hh_ytdlp",
  hh_ytdlp: "hh_ytdlp",
  "hh-ytdlp": "hh_ytdlp",
  hh_ytdlp_ejs_wpc: "hh_ytdlp_ejs_wpc",
  "hh-ytdlp-ejs-wpc": "hh_ytdlp_ejs_wpc",
  "hh-yt-dlp-ejs-wpc": "hh_ytdlp_ejs_wpc",
  laptop_ytdlp: "laptop_ytdlp",
  "laptop-ytdlp": "laptop_ytdlp",
  "laptop-yt-dlp": "laptop_ytdlp",
  youtube_transcript_api_laptop: "youtube_transcript_api_laptop",
  "youtube-transcript-api-laptop": "youtube_transcript_api_laptop",
  "youtube-transcript-api": "youtube_transcript_api_laptop",
  media_asr_fallback: "media_asr_fallback",
  "media-asr-fallback": "media_asr_fallback",
  asr: "media_asr_fallback",
};

export function parseTranscriptExtractionMethodChain(value: string | null | undefined): TranscriptExtractionMethod[] {
  if (!value?.trim()) return [];
  const methods: TranscriptExtractionMethod[] = [];
  const seen = new Set<TranscriptExtractionMethod>();
  for (const raw of value.split(",")) {
    const key = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!key) continue;
    const method = METHOD_ALIASES[key];
    if (!method) throw new Error(`Unsupported transcript extraction method: ${raw.trim()}`);
    if (seen.has(method)) continue;
    seen.add(method);
    methods.push(method);
  }
  return methods;
}

export function defaultTranscriptExtractionMethods(options: {
  readonly useSerpApi: boolean;
  readonly fallbackYtDlp: boolean;
  readonly env?: Record<string, string | undefined>;
}): TranscriptExtractionMethod[] {
  const configured = parseTranscriptExtractionMethodChain(options.env?.TRANSCRIPT_EXTRACTION_METHODS);
  if (configured.length > 0) return configured;
  const methods: TranscriptExtractionMethod[] = [];
  if (options.useSerpApi) methods.push("serpapi_transcript");
  if (options.fallbackYtDlp) methods.push("hh_ytdlp");
  return methods;
}

export function transcriptMethodProvider(method: TranscriptExtractionMethod): string {
  if (method === "serpapi_transcript") return "serpapi";
  if (method === "hh_ytdlp" || method === "hh_ytdlp_ejs_wpc" || method === "laptop_ytdlp") return "yt-dlp";
  if (method === "youtube_transcript_api_laptop") return "youtube-transcript-api";
  return "media-asr";
}

export function isLocalBackfillMethod(method: TranscriptExtractionMethod): boolean {
  return method === "serpapi_transcript" || method === "hh_ytdlp" || method === "hh_ytdlp_ejs_wpc";
}

export function isYtDlpBackfillMethod(method: TranscriptExtractionMethod): boolean {
  return method === "hh_ytdlp" || method === "hh_ytdlp_ejs_wpc";
}

export function resolveYtDlpBinaryForMethod(
  method: TranscriptExtractionMethod,
  env: Record<string, string | undefined> = process.env,
  exists: (candidate: string) => boolean = existsSync,
): string {
  if (env.YTDLP_BIN?.trim()) return env.YTDLP_BIN.trim();
  if (method === "hh_ytdlp_ejs_wpc" && exists(DEFAULT_HH_YTDLP_EJS_WPC_BIN)) return DEFAULT_HH_YTDLP_EJS_WPC_BIN;
  return "yt-dlp";
}

export function envForTranscriptMethod(
  method: TranscriptExtractionMethod,
  env: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  if (method !== "hh_ytdlp_ejs_wpc") return env;
  return {
    ...env,
    YTDLP_PLAYER_CLIENT: env.YTDLP_PLAYER_CLIENT ?? "mweb",
    YTDLP_JS_RUNTIMES: env.YTDLP_JS_RUNTIMES ?? "node",
    YTDLP_REMOTE_COMPONENTS: env.YTDLP_REMOTE_COMPONENTS ?? "ejs:github",
    YTDLP_PO_TOKEN_PROVIDER: env.YTDLP_PO_TOKEN_PROVIDER ?? "wpc",
  };
}

export function buildTranscriptExtractionPlan(methods: readonly TranscriptExtractionMethod[]): TranscriptExtractionPlanEntry[] {
  return methods.map((method) => {
    if (method === "serpapi_transcript") {
      return {
        method,
        provider: "serpapi",
        executionLocation: "HH",
        command: "npm run backfill:transcripts -- --serpapi --limit <n> --dry-run",
        requiresExternalRunner: false,
        requiresIngest: false,
        maxBatchSize: 25,
        notes: ["paid/quota-bearing", "uses existing backfill-transcripts SerpAPI path"],
      };
    }
    if (method === "hh_ytdlp") {
      return {
        method,
        provider: "yt-dlp",
        executionLocation: "HH",
        command: "npm run backfill:transcripts -- --methods hh_ytdlp --limit <n> --dry-run",
        requiresExternalRunner: false,
        requiresIngest: false,
        maxBatchSize: 25,
        notes: ["caption/subtitle only", "honors existing YTDLP_* auth and retry env"],
      };
    }
    if (method === "hh_ytdlp_ejs_wpc") {
      return {
        method,
        provider: "yt-dlp",
        executionLocation: "HH",
        command: "npm run backfill:transcripts -- --methods hh_ytdlp_ejs_wpc --limit <n> --dry-run",
        requiresExternalRunner: false,
        requiresIngest: false,
        maxBatchSize: 25,
        notes: ["prefers isolated /opt/callscore yt-dlp runtime", "defaults JS runtime/remote components/player client without logging secrets"],
      };
    }
    if (method === "laptop_ytdlp") {
      return {
        method,
        provider: "yt-dlp",
        executionLocation: "laptop",
        command: "scripts/windows/run-transcript-collector.ps1 -Workplane -Limit 5 -Browser firefox -Write",
        requiresExternalRunner: true,
        requiresIngest: true,
        maxBatchSize: 5,
        notes: ["cookies remain laptop-local", "ships result through transcript:ingest"],
      };
    }
    if (method === "youtube_transcript_api_laptop") {
      return {
        method,
        provider: "youtube-transcript-api",
        executionLocation: "laptop",
        command: "run youtube-transcript-api artifact-only probe, then npm run transcript:ingest -- --input <artifact> --write on HH",
        requiresExternalRunner: true,
        requiresIngest: true,
        maxBatchSize: 5,
        notes: ["residential/laptop IP path", "no direct DB writes from stale script"],
      };
    }
    return {
      method,
      provider: "media-asr",
      executionLocation: "HH",
      command: "npm run transcript:media-fallback -- --limit 1 --dry-run",
      requiresExternalRunner: false,
      requiresIngest: false,
      maxBatchSize: 1,
      notes: ["audio-only fallback", "requires local ASR runtime and disk guards"],
    };
  });
}
