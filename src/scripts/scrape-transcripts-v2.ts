import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { query } from "../lib/db";
import type { Creator } from "../lib/types";

interface Args {
  readonly creator?: string;
  readonly fromFirecrawl: boolean;
  readonly firecrawlDecision: "usable" | "all";
  readonly limitCreators: number;
  readonly offsetCreators: number;
  readonly limitVideos: number;
  readonly sinceDays: number;
  readonly transcriptLangs: readonly string[];
  readonly onlyMissing: boolean;
  readonly write: boolean;
  readonly auditOut: string | null;
}

type MutableArgs = {
  creator?: string;
  fromFirecrawl: boolean;
  firecrawlDecision: "usable" | "all";
  limitCreators: number;
  offsetCreators: number;
  limitVideos: number;
  sinceDays: number;
  transcriptLangs: string[];
  onlyMissing: boolean;
  write: boolean;
  auditOut: string | null;
};

interface FirecrawlRow {
  readonly name?: string;
  readonly expected_handle?: string;
  readonly quality?: { readonly decision?: string; readonly market_refs?: number; readonly youtube_hits?: number };
}

interface YtDlpPlaylistEntry {
  readonly id?: string;
  readonly url?: string;
  readonly title?: string;
}

interface YtDlpVideo {
  readonly id?: string;
  readonly title?: string;
  readonly upload_date?: string;
  readonly timestamp?: number;
  readonly language?: string;
  readonly subtitles?: Record<string, readonly CaptionFormat[]>;
  readonly automatic_captions?: Record<string, readonly CaptionFormat[]>;
}

interface CaptionFormat {
  readonly ext?: string;
  readonly url?: string;
  readonly name?: string;
}

interface ExistingVideo {
  readonly id: number;
  readonly transcript: string | null;
}

interface TranscriptResult {
  readonly text: string;
  readonly lang: string;
  readonly auto: boolean;
  readonly source: "yt-dlp-caption" | "serpapi";
}

type TranscriptFetchResult =
  | { readonly ok: true; readonly transcript: TranscriptResult }
  | { readonly ok: false; readonly reason: TranscriptFailureReason; readonly detail?: string };

type TranscriptFailureReason =
  | "no-captions"
  | "caption-http-429"
  | "caption-http-forbidden"
  | "caption-http-unavailable"
  | "subtitle-download-failed"
  | "parse-empty"
  | "transcript-too-short"
  | "ip-blocked"
  | "provider-quota-exceeded"
  | "no-videos-tab"
  | "yt-dlp-error";

interface SerpApiTranscriptItem {
  readonly snippet?: string;
  readonly text?: string;
  readonly start_ms?: number;
  readonly start_time?: number;
  readonly start_time_text?: string;
}

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL) return;
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

export function parseScrapeV2Args(argv: readonly string[]): Args {
  const args: MutableArgs = {
    fromFirecrawl: false,
    firecrawlDecision: "usable",
    limitCreators: 5,
    offsetCreators: 0,
    limitVideos: 5,
    sinceDays: 365,
    transcriptLangs: ["original", "en"],
    onlyMissing: true,
    write: false,
    auditOut: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === "--creator") args.creator = next();
    else if (arg === "--from-firecrawl") args.fromFirecrawl = true;
    else if (arg === "--firecrawl-decision") {
      const value = next();
      if (value !== "usable" && value !== "all") throw new Error("--firecrawl-decision must be usable or all");
      args.firecrawlDecision = value;
    } else if (arg === "--limit-creators") args.limitCreators = Math.max(1, Number.parseInt(next(), 10) || 1);
    else if (arg === "--offset-creators") args.offsetCreators = Math.max(0, Number.parseInt(next(), 10) || 0);
    else if (arg === "--limit-videos") args.limitVideos = Math.max(1, Number.parseInt(next(), 10) || 1);
    else if (arg === "--since-days") args.sinceDays = Math.max(1, Number.parseInt(next(), 10) || 1);
    else if (arg === "--transcript-langs") args.transcriptLangs = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--include-existing") args.onlyMissing = false;
    else if (arg === "--audit-out") args.auditOut = next();
    else if (arg === "--write") args.write = true;
    else if (arg === "--dry-run") args.write = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args as Args;
}

function audit(args: Args, row: Record<string, unknown>): void {
  if (!args.auditOut) return;
  fs.mkdirSync(path.dirname(args.auditOut), { recursive: true });
  fs.appendFileSync(args.auditOut, `${JSON.stringify(row)}\n`);
}

function repoRoot(): string {
  return path.resolve(__dirname, "../..");
}

function ytDlpPath(): string {
  return process.env.YTDLP_BIN || "yt-dlp";
}

function channelUrl(handle: string): string {
  if (handle.startsWith("@")) return `https://www.youtube.com/${handle}/videos`;
  if (handle.startsWith("channel/")) return `https://www.youtube.com/${handle}/videos`;
  if (handle.startsWith("UC")) return `https://www.youtube.com/channel/${handle}/videos`;
  if (handle.startsWith("http://") || handle.startsWith("https://")) return handle;
  return `https://www.youtube.com/${handle}/videos`;
}

export function classifyScrapeFailure(message: string, status?: number): TranscriptFailureReason {
  const text = String(message || "");
  if (/IpBlocked|IP blocked|blocked by YouTube/i.test(text)) return "ip-blocked";
  if (/limit-exceeded|quota|Plan usage limit/i.test(text)) return "provider-quota-exceeded";
  if (status === 429 || /HTTP Error 429|Too Many Requests|rate.?limit/i.test(text)) return "caption-http-429";
  if (status === 403 || /HTTP Error 403|Forbidden/i.test(text)) return "caption-http-forbidden";
  if (/does not have a videos tab|no videos tab/i.test(text)) return "no-videos-tab";
  if (status && status >= 400) return "caption-http-unavailable";
  return "yt-dlp-error";
}

function runYtDlpJson(args: readonly string[], timeoutMs = 180_000): unknown {
  try {
    const output = execFileSync(ytDlpPath(), args, {
      cwd: repoRoot(),
      encoding: "utf-8",
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  } catch (err) {
    const e = err as { stderr?: string | Buffer; stdout?: string | Buffer; message?: string };
    const message = [e.stderr?.toString(), e.stdout?.toString(), e.message].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const reason = classifyScrapeFailure(message);
    throw new Error(`${reason}: ${message}`);
  }
}

async function loadFirecrawlHandles(decision: "usable" | "all"): Promise<readonly string[]> {
  const p = path.join(repoRoot(), "docs/global-creator-firecrawl-search.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as { results?: readonly FirecrawlRow[] };
  const rows = raw.results ?? [];
  const handles: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (decision === "usable" && row.quality?.decision !== "usable") continue;
    const handle = row.expected_handle?.trim();
    if (!handle) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    handles.push(handle);
  }
  return handles;
}

async function loadCreators(args: Args): Promise<readonly Creator[]> {
  if (args.creator) {
    return query<Creator>("SELECT * FROM creators WHERE lower(youtube_handle) = lower($1) ORDER BY id", [args.creator]);
  }

  if (args.fromFirecrawl) {
    const handles = (await loadFirecrawlHandles(args.firecrawlDecision)).slice(args.offsetCreators, args.offsetCreators + args.limitCreators);
    if (handles.length === 0) return [];
    return query<Creator>(
      `SELECT * FROM creators WHERE lower(youtube_handle) = ANY($1::text[]) ORDER BY array_position($1::text[], lower(youtube_handle))`,
      [handles.map((h) => h.toLowerCase())],
    );
  }

  return query<Creator>("SELECT * FROM creators ORDER BY last_scraped_at NULLS FIRST, id LIMIT $1", [args.limitCreators]);
}

function parseUploadDate(uploadDate?: string, timestampSeconds?: number): string | null {
  if (uploadDate && /^\d{8}$/.test(uploadDate)) {
    return `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}T00:00:00Z`;
  }
  if (timestampSeconds) return new Date(timestampSeconds * 1000).toISOString();
  return null;
}

function isRecent(iso: string | null, sinceDays: number): boolean {
  if (!iso) return true;
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
}

function computeTranscriptQuality(text: string): number {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 0;
  const lineScore = Math.min(0.4, (lines.length / 100) * 0.4);
  const totalWords = lines.reduce((sum, line) => sum + line.split(/\s+/).filter(Boolean).length, 0);
  const avgWords = totalWords / lines.length;
  const wordScore = Math.min(0.4, (avgWords / 5) * 0.4);
  const noiseMarkers = lines.filter((line) => /\[(music|applause|laughter|silence)\]/i.test(line)).length;
  const noiseScore = Math.max(0, 0.2 - (noiseMarkers / lines.length) * 0.2);
  return Math.min(1, lineScore + wordScore + noiseScore);
}

function stripVtt(text: string): string {
  return text
    .replace(/^WEBVTT.*$/gm, "")
    .replace(/^Kind:.*$/gm, "")
    .replace(/^Language:.*$/gm, "")
    .replace(/^\d+$/gm, "")
    .replace(/^\d\d:\d\d:\d\d\.\d+\s+-->.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, idx, arr) => idx === 0 || line !== arr[idx - 1])
    .join("\n");
}

function parseJson3(text: string): string {
  const data = JSON.parse(text) as { events?: readonly { segs?: readonly { utf8?: string }[] }[] };
  const lines: string[] = [];
  for (const event of data.events ?? []) {
    const line = (event.segs ?? []).map((seg) => seg.utf8 ?? "").join("").trim();
    if (line) lines.push(line);
  }
  return lines.filter((line, idx) => idx === 0 || line !== lines[idx - 1]).join("\n");
}

export function parseCaptionPayload(text: string, ext: string | undefined): string {
  if (ext === "json3" || text.trim().startsWith("{")) return parseJson3(text);
  if (ext === "vtt" || text.startsWith("WEBVTT")) return stripVtt(text);
  return text.trim();
}

function baseLanguage(lang: string | undefined): string | null {
  const base = lang?.split("-")[0]?.trim();
  return base || null;
}

function preferredLanguages(video: YtDlpVideo, requested: readonly string[]): readonly string[] {
  const langs: string[] = [];
  const originalBase = baseLanguage(video.language);
  for (const lang of requested) {
    if (lang === "original") {
      if (video.language) langs.push(video.language);
      if (originalBase) langs.push(originalBase);
    } else if (lang === "all") {
      const caps = { ...(video.subtitles ?? {}), ...(video.automatic_captions ?? {}) };
      // yt-dlp lists translated auto-caption languages alphabetically before the video's
      // native ASR language. If we blindly try the first key (for example "ab"), YouTube
      // can return an empty/short translated caption and we incorrectly mark the video
      // no-transcript. Prefer the detected original language and English fallbacks before
      // scanning every available translated caption key.
      if (video.language) langs.push(video.language);
      if (originalBase) langs.push(originalBase);
      langs.push("en", "en-US");
      langs.push(...Object.keys(caps));
    } else {
      langs.push(lang);
      const base = baseLanguage(lang);
      if (base && base !== lang) langs.push(base);
    }
  }
  langs.push("en", "en-US");
  return Array.from(new Set(langs.filter(Boolean)));
}

function selectCaption(video: YtDlpVideo, requested: readonly string[]): { lang: string; format: CaptionFormat; auto: boolean } | null {
  const manual = video.subtitles ?? {};
  const auto = video.automatic_captions ?? {};
  const langs = preferredLanguages(video, requested);
  for (const lang of langs) {
    const manualFormats = manual[lang];
    if (manualFormats?.length) {
      const format = manualFormats.find((f) => f.ext === "json3") ?? manualFormats.find((f) => f.ext === "vtt") ?? manualFormats[0];
      if (format.url) return { lang, format, auto: false };
    }
    const autoFormats = auto[lang];
    if (autoFormats?.length) {
      const format = autoFormats.find((f) => f.ext === "json3") ?? autoFormats.find((f) => f.ext === "vtt") ?? autoFormats[0];
      if (format.url) return { lang, format, auto: true };
    }
  }
  return null;
}

async function fetchTranscript(video: YtDlpVideo, transcriptLangs: readonly string[]): Promise<TranscriptFetchResult> {
  const selected = selectCaption(video, transcriptLangs);
  if (!selected?.format.url) return { ok: false, reason: "no-captions" };
  let response: Response;
  try {
    response = await fetch(selected.format.url);
  } catch (err) {
    return { ok: false, reason: classifyScrapeFailure(err instanceof Error ? err.message : String(err)), detail: err instanceof Error ? err.message : String(err) };
  }
  if (!response.ok) {
    return { ok: false, reason: classifyScrapeFailure(response.statusText, response.status), detail: `${response.status} ${response.statusText}` };
  }
  const payload = await response.text();
  let text = "";
  try {
    text = parseCaptionPayload(payload, selected.format.ext).trim();
  } catch (err) {
    return { ok: false, reason: "parse-empty", detail: err instanceof Error ? err.message : String(err) };
  }
  if (!text) return { ok: false, reason: "parse-empty" };
  if (text.length < 200) return { ok: false, reason: "transcript-too-short", detail: `chars=${text.length}` };
  return { ok: true, transcript: { text, lang: selected.lang, auto: selected.auto, source: "yt-dlp-caption" } };
}

function videoDetails(videoId: string, transcriptLangs: readonly string[]): YtDlpVideo {
  return runYtDlpJson([
    "--dump-single-json",
    "--skip-download",
    "--write-auto-subs",
    "--write-subs",
    "--sub-langs",
    transcriptLangs.includes("all") ? "all" : Array.from(new Set([...transcriptLangs.filter((l) => l !== "original"), "en.*"])).join(","),
    `https://www.youtube.com/watch?v=${videoId}`,
  ]) as YtDlpVideo;
}

function listVideos(handle: string, limitVideos: number): readonly YtDlpPlaylistEntry[] {
  const playlist = runYtDlpJson([
    "--dump-single-json",
    "--skip-download",
    "--flat-playlist",
    "--playlist-end",
    String(limitVideos),
    channelUrl(handle),
  ]) as { entries?: readonly YtDlpPlaylistEntry[] };
  return playlist.entries ?? [];
}

async function upsertVideo(creator: Creator, video: YtDlpVideo, transcript: string, quality: number, publishedAt: string | null): Promise<void> {
  await query(
    `INSERT INTO videos (creator_id, youtube_video_id, title, published_at, transcript, transcript_quality, calls_extracted)
     VALUES ($1, $2, $3, $4, $5, $6, false)
     ON CONFLICT (youtube_video_id) DO UPDATE SET
       transcript = COALESCE(videos.transcript, EXCLUDED.transcript),
       transcript_quality = GREATEST(COALESCE(videos.transcript_quality, 0), EXCLUDED.transcript_quality),
       title = COALESCE(videos.title, EXCLUDED.title),
       published_at = COALESCE(videos.published_at, EXCLUDED.published_at)`,
    [creator.id, video.id, video.title ?? video.id, publishedAt, transcript, quality],
  );
}

async function processCreator(creator: Creator, args: Args): Promise<{ inserted: number; skipped: number; failed: number; discovered: number }> {
  console.log(`[${timestamp()}] ${args.write ? "WRITE" : "DRY"} creator ${creator.name} (${creator.youtube_handle})`);
  let entries: readonly YtDlpPlaylistEntry[] = [];
  try {
    entries = listVideos(creator.youtube_handle, args.limitVideos);
  } catch (err) {
    console.error(`[${timestamp()}]   list-fail ${creator.youtube_handle}: ${err instanceof Error ? err.message : String(err)}`);
    return { inserted: 0, skipped: 0, failed: 1, discovered: 0 };
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const entry of entries) {
    if (!entry.id) {
      failed++;
      continue;
    }
    const existing = await query<ExistingVideo>("SELECT id, transcript FROM videos WHERE youtube_video_id = $1", [entry.id]);
    if (args.onlyMissing && existing[0]?.transcript) {
      skipped++;
      continue;
    }

    let details: YtDlpVideo;
    try {
      details = videoDetails(entry.id, args.transcriptLangs);
    } catch (err) {
      console.error(`[${timestamp()}]   detail-fail ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
      continue;
    }
    const publishedAt = parseUploadDate(details.upload_date, details.timestamp);
    if (!isRecent(publishedAt, args.sinceDays)) {
      skipped++;
      continue;
    }

    const transcriptResult = await fetchTranscript(details, args.transcriptLangs);
    if (!transcriptResult.ok) {
      audit(args, {
        record_type: "transcript_backfill",
        ts: timestamp(),
        mode: args.write ? "WRITE" : "DRY",
        status: "terminal_no_transcript",
        reason: transcriptResult.reason,
        detail: transcriptResult.detail,
        video_id: existing[0]?.id,
        creator_id: creator.id,
        youtube_video_id: entry.id,
        creator: creator.youtube_handle,
      });
      console.log(`[${timestamp()}]   ${transcriptResult.reason} ${entry.id} ${details.title ?? entry.title ?? ""}${transcriptResult.detail ? ` detail=${transcriptResult.detail}` : ""}`);
      failed++;
      continue;
    }
    const transcript = transcriptResult.transcript;
    const quality = computeTranscriptQuality(transcript.text);
    if (args.write) {
      await upsertVideo(creator, details, transcript.text, quality, publishedAt);
      await query("UPDATE creators SET last_scraped_at = NOW() WHERE id = $1", [creator.id]);
    }
    audit(args, {
      record_type: "transcript_backfill",
      ts: timestamp(),
      mode: args.write ? "WRITE" : "DRY",
      status: args.write ? "updated" : "would_update",
      video_id: existing[0]?.id,
      creator_id: creator.id,
      youtube_video_id: entry.id,
      creator: creator.youtube_handle,
      transcript_chars: transcript.text.length,
      transcript_quality: quality,
      source: transcript.source,
    });
    inserted++;
    console.log(
      `[${timestamp()}]   ${args.write ? "saved" : "would-save"} ${entry.id} q=${quality.toFixed(2)} lang=${transcript.lang}${transcript.auto ? ":auto" : ""} ${details.title ?? entry.title ?? ""}`,
    );
  }

  return { inserted, skipped, failed, discovered: entries.length };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseScrapeV2Args(argv);
  const creators = await loadCreators(args);
  console.log(`[${timestamp()}] scrape-transcripts-v2 ${args.write ? "WRITE" : "DRY-RUN"}: creators=${creators.length}, limitVideos=${args.limitVideos}, fromFirecrawl=${args.fromFirecrawl}, offsetCreators=${args.offsetCreators}`);
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalDiscovered = 0;
  for (const creator of creators) {
    const res = await processCreator(creator, args);
    totalInserted += res.inserted;
    totalSkipped += res.skipped;
    totalFailed += res.failed;
    totalDiscovered += res.discovered;
  }
  console.log(
    `[${timestamp()}] scrape-v2 complete: discovered=${totalDiscovered}, ${args.write ? "saved" : "would-save"}=${totalInserted}, skipped=${totalSkipped}, failed=${totalFailed}`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
