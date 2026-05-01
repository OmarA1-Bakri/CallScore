import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { query } from "../lib/db";
import type { Creator } from "../lib/types";
import { loadEnv, timestamp } from "./script-helpers";

export interface DiscoverVideosArgs {
  readonly creator?: string;
  readonly limitCreators: number;
  readonly offsetCreators: number;
  readonly limitVideos: number;
  readonly sinceDays: number;
  readonly oldStopAfter: number;
  readonly gapMs: number;
  readonly accessBlockStopAfter: number;
  readonly write: boolean;
  readonly auditOut?: string;
}

type MutableDiscoverVideosArgs = {
  creator?: string;
  limitCreators: number;
  offsetCreators: number;
  limitVideos: number;
  sinceDays: number;
  oldStopAfter: number;
  gapMs: number;
  accessBlockStopAfter: number;
  write: boolean;
  auditOut?: string;
};

class SystemicYouTubeAccessBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemicYouTubeAccessBlockedError";
  }
}

interface YtDlpPlaylistEntry {
  readonly id?: string;
  readonly url?: string;
  readonly title?: string;
  readonly upload_date?: string;
  readonly timestamp?: number;
  readonly release_timestamp?: number;
}

interface YtDlpVideoDetails {
  readonly id?: string;
  readonly title?: string;
  readonly upload_date?: string;
  readonly timestamp?: number;
  readonly release_timestamp?: number;
  readonly availability?: string;
}

export type DateSource = "upload_date" | "timestamp" | "release_timestamp" | "existing_published_at";

export interface PublicationDateResult {
  readonly publishedAt: string | null;
  readonly dateSource: DateSource | null;
}

interface ExistingVideoRow {
  readonly id: number;
  readonly published_at: string | null;
  readonly transcript: string | null;
}

interface CreatorDiscoveryStats {
  listed: number;
  within365: number;
  insertedNew: number;
  alreadyExisting: number;
  olderThan365: number;
  missingOrUntrustedDate: number;
  metadataFailures: number;
  accessBlockedFailures: number;
}

interface DiscoveryRunState {
  accessBlockedFailures: number;
}

interface AuditRow {
  readonly ts: string;
  readonly mode: "WRITE" | "DRY";
  readonly creator_id: number;
  readonly creator_name: string;
  readonly creator_handle: string;
  readonly youtube_video_id: string;
  readonly title: string | null;
  readonly published_at: string | null;
  readonly date_source: DateSource | null;
  readonly inside_365_day_window: boolean | null;
  readonly status:
    | "inserted_new"
    | "already_existing"
    | "would_insert_new"
    | "would_keep_existing"
    | "older_than_365"
    | "rejected_missing_date"
    | "metadata_failure";
  readonly detail?: string;
}

export function parseDiscoverVideosArgs(argv: readonly string[]): DiscoverVideosArgs {
  const args: MutableDiscoverVideosArgs = {
    limitCreators: 5,
    offsetCreators: 0,
    limitVideos: 250,
    sinceDays: 365,
    oldStopAfter: 8,
    gapMs: 0,
    accessBlockStopAfter: 10,
    write: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };

    if (arg === "--creator") args.creator = next();
    else if (arg === "--limit-creators") args.limitCreators = Math.max(1, Number.parseInt(next(), 10) || 1);
    else if (arg === "--offset-creators") args.offsetCreators = Math.max(0, Number.parseInt(next(), 10) || 0);
    else if (arg === "--limit-videos") args.limitVideos = Math.max(1, Number.parseInt(next(), 10) || 1);
    else if (arg === "--since-days") args.sinceDays = Math.max(1, Number.parseInt(next(), 10) || 1);
    else if (arg === "--old-stop-after") args.oldStopAfter = Math.max(1, Number.parseInt(next(), 10) || 1);
    else if (arg === "--gap-ms") args.gapMs = Math.max(0, Number.parseInt(next(), 10) || 0);
    else if (arg === "--access-block-stop-after") args.accessBlockStopAfter = Math.max(1, Number.parseInt(next(), 10) || 1);
    else if (arg === "--audit-out") args.auditOut = next();
    else if (arg === "--write") args.write = true;
    else if (arg === "--dry-run") args.write = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args as DiscoverVideosArgs;
}

export function parsePublicationDate(video: YtDlpVideoDetails): PublicationDateResult {
  if (video.upload_date && /^\d{8}$/.test(video.upload_date)) {
    return {
      publishedAt: `${video.upload_date.slice(0, 4)}-${video.upload_date.slice(4, 6)}-${video.upload_date.slice(6, 8)}T00:00:00Z`,
      dateSource: "upload_date",
    };
  }
  if (typeof video.timestamp === "number" && Number.isFinite(video.timestamp) && video.timestamp > 0) {
    return { publishedAt: new Date(video.timestamp * 1000).toISOString(), dateSource: "timestamp" };
  }
  if (typeof video.release_timestamp === "number" && Number.isFinite(video.release_timestamp) && video.release_timestamp > 0) {
    return { publishedAt: new Date(video.release_timestamp * 1000).toISOString(), dateSource: "release_timestamp" };
  }
  return { publishedAt: null, dateSource: null };
}

export function insideSinceDays(publishedAt: string, sinceDays: number, nowMs = Date.now()): boolean {
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= nowMs - sinceDays * 24 * 60 * 60 * 1000;
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

function runYtDlpJson(args: readonly string[], timeoutMs = 180_000): unknown {
  const output = execFileSync(ytDlpPath(), args, {
    cwd: repoRoot(),
    encoding: "utf-8",
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output);
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

function videoDetails(videoId: string): YtDlpVideoDetails {
  return runYtDlpJson([
    "--dump-single-json",
    "--skip-download",
    `https://www.youtube.com/watch?v=${videoId}`,
  ]) as YtDlpVideoDetails;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCreators(args: DiscoverVideosArgs): Promise<readonly Creator[]> {
  if (args.creator) {
    return query<Creator>("SELECT * FROM creators WHERE lower(youtube_handle) = lower($1) OR youtube_channel_id = $1 ORDER BY id", [args.creator]);
  }
  return query<Creator>("SELECT * FROM creators ORDER BY id LIMIT $1 OFFSET $2", [args.limitCreators, args.offsetCreators]);
}

async function upsertDiscoveredVideo(creator: Creator, video: YtDlpVideoDetails, publishedAt: string): Promise<"inserted_new" | "already_existing"> {
  const before = await query<ExistingVideoRow>("SELECT id, published_at, transcript FROM videos WHERE youtube_video_id = $1", [video.id]);
  await query(
    `INSERT INTO videos (creator_id, youtube_video_id, title, published_at, transcript, transcript_quality, calls_extracted)
     VALUES ($1, $2, $3, $4, NULL, NULL, false)
     ON CONFLICT (youtube_video_id) DO UPDATE SET
       creator_id = COALESCE(videos.creator_id, EXCLUDED.creator_id),
       title = COALESCE(EXCLUDED.title, videos.title),
       published_at = COALESCE(videos.published_at, EXCLUDED.published_at),
       calls_extracted = COALESCE(videos.calls_extracted, false)`,
    [creator.id, video.id, video.title ?? video.id, publishedAt],
  );
  return before.length ? "already_existing" : "inserted_new";
}

function makeAuditWriter(auditOut?: string): (row: AuditRow) => void {
  if (!auditOut) return () => undefined;
  const resolved = path.resolve(repoRoot(), auditOut);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return (row: AuditRow) => {
    fs.appendFileSync(resolved, `${JSON.stringify(row)}\n`);
  };
}

async function processCreator(
  creator: Creator,
  args: DiscoverVideosArgs,
  writeAudit: (row: AuditRow) => void,
  runState: DiscoveryRunState = { accessBlockedFailures: 0 },
): Promise<CreatorDiscoveryStats> {
  console.log(`[${timestamp()}] ${args.write ? "WRITE" : "DRY"} discover creator ${creator.name} (${creator.youtube_handle}) sinceDays=${args.sinceDays} limitVideos=${args.limitVideos}`);
  const stats: CreatorDiscoveryStats = {
    listed: 0,
    within365: 0,
    insertedNew: 0,
    alreadyExisting: 0,
    olderThan365: 0,
    missingOrUntrustedDate: 0,
    metadataFailures: 0,
    accessBlockedFailures: 0,
  };

  let entries: readonly YtDlpPlaylistEntry[] = [];
  try {
    entries = listVideos(creator.youtube_handle, args.limitVideos);
  } catch (err) {
    stats.metadataFailures++;
    console.error(`[${timestamp()}]   list-fail ${creator.youtube_handle}: ${err instanceof Error ? err.message : String(err)}`);
    return stats;
  }
  stats.listed = entries.length;

  let consecutiveOld = 0;
  let consecutiveAccessBlocked = 0;
  for (const entry of entries) {
    if (args.gapMs > 0) await sleep(args.gapMs);
    if (!entry.id) {
      stats.metadataFailures++;
      continue;
    }

    const existing = await query<ExistingVideoRow>("SELECT id, published_at, transcript FROM videos WHERE youtube_video_id = $1", [entry.id]);
    let details: YtDlpVideoDetails = { ...entry, id: entry.id, title: entry.title };
    let date: PublicationDateResult;

    if (existing[0]?.published_at) {
      date = { publishedAt: new Date(existing[0].published_at).toISOString(), dateSource: "existing_published_at" };
    } else {
      date = parsePublicationDate(details);
    }

    if (!date.publishedAt) {
      try {
        details = videoDetails(entry.id);
        date = parsePublicationDate(details);
      } catch (err) {
        stats.metadataFailures++;
        const detail = err instanceof Error ? err.message : String(err);
        const accessBlocked = /HTTP Error 429|Too Many Requests|not a bot|Sign in to confirm/i.test(detail);
        if (accessBlocked) {
          consecutiveAccessBlocked++;
          stats.accessBlockedFailures++;
          runState.accessBlockedFailures++;
        } else {
          consecutiveAccessBlocked = 0;
        }
        console.error(`[${timestamp()}]   metadata-fail ${entry.id}: ${detail}`);
        writeAudit({
          ts: timestamp(),
          mode: args.write ? "WRITE" : "DRY",
          creator_id: creator.id,
          creator_name: creator.name,
          creator_handle: creator.youtube_handle,
          youtube_video_id: entry.id,
          title: entry.title ?? null,
          published_at: null,
          date_source: null,
          inside_365_day_window: null,
          status: "metadata_failure",
          detail,
        });
        if (runState.accessBlockedFailures >= args.accessBlockStopAfter) {
          throw new SystemicYouTubeAccessBlockedError(
            `Stopping discovery run after ${runState.accessBlockedFailures} YouTube access/rate-limit metadata failures (threshold=${args.accessBlockStopAfter})`,
          );
        }
        if (consecutiveAccessBlocked >= 5) {
          console.error(`[${timestamp()}]   stopping ${creator.youtube_handle}: ${consecutiveAccessBlocked} consecutive YouTube access/rate-limit metadata failures`);
          break;
        }
        continue;
      }
    }

    if (!date.publishedAt) {
      stats.missingOrUntrustedDate++;
      console.log(`[${timestamp()}]   rejected-missing-date ${entry.id} ${details.title ?? entry.title ?? ""}`);
      writeAudit({
        ts: timestamp(),
        mode: args.write ? "WRITE" : "DRY",
        creator_id: creator.id,
        creator_name: creator.name,
        creator_handle: creator.youtube_handle,
        youtube_video_id: entry.id,
        title: details.title ?? entry.title ?? null,
        published_at: null,
        date_source: null,
        inside_365_day_window: null,
        status: "rejected_missing_date",
      });
      continue;
    }

    const insideWindow = insideSinceDays(date.publishedAt, args.sinceDays);
    consecutiveAccessBlocked = 0;
    if (!insideWindow) {
      stats.olderThan365++;
      consecutiveOld++;
      console.log(`[${timestamp()}]   older-than-${args.sinceDays} ${entry.id} published_at=${date.publishedAt} date_source=${date.dateSource} ${details.title ?? entry.title ?? ""}`);
      writeAudit({
        ts: timestamp(),
        mode: args.write ? "WRITE" : "DRY",
        creator_id: creator.id,
        creator_name: creator.name,
        creator_handle: creator.youtube_handle,
        youtube_video_id: entry.id,
        title: details.title ?? entry.title ?? null,
        published_at: date.publishedAt,
        date_source: date.dateSource,
        inside_365_day_window: false,
        status: "older_than_365",
      });
      if (consecutiveOld >= args.oldStopAfter) {
        console.log(`[${timestamp()}]   stopping ${creator.youtube_handle}: ${consecutiveOld} consecutive videos older than ${args.sinceDays} days`);
        break;
      }
      continue;
    }

    consecutiveOld = 0;
    stats.within365++;
    const status = existing.length ? (args.write ? "already_existing" : "would_keep_existing") : args.write ? "inserted_new" : "would_insert_new";
    if (args.write) {
      const writeStatus = await upsertDiscoveredVideo(creator, details, date.publishedAt);
      if (writeStatus === "inserted_new") stats.insertedNew++;
      else stats.alreadyExisting++;
    } else if (existing.length) {
      stats.alreadyExisting++;
    } else {
      stats.insertedNew++;
    }

    console.log(`[${timestamp()}]   ${status} ${entry.id} published_at=${date.publishedAt} date_source=${date.dateSource} transcript=${existing[0]?.transcript ? "present" : "missing"} ${details.title ?? entry.title ?? ""}`);
    writeAudit({
      ts: timestamp(),
      mode: args.write ? "WRITE" : "DRY",
      creator_id: creator.id,
      creator_name: creator.name,
      creator_handle: creator.youtube_handle,
      youtube_video_id: entry.id,
      title: details.title ?? entry.title ?? null,
      published_at: date.publishedAt,
      date_source: date.dateSource,
      inside_365_day_window: true,
      status,
    });
  }

  console.log(
    `[${timestamp()}] creator-summary ${creator.youtube_handle}: listed=${stats.listed} within_365=${stats.within365} inserted_new=${stats.insertedNew} already_existing=${stats.alreadyExisting} older_than_365=${stats.olderThan365} missing_or_untrusted_date=${stats.missingOrUntrustedDate} metadata_failures=${stats.metadataFailures} access_blocked_failures=${stats.accessBlockedFailures}`,
  );
  return stats;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseDiscoverVideosArgs(argv);
  const creators = await loadCreators(args);
  const writeAudit = makeAuditWriter(args.auditOut);
  console.log(`[${timestamp()}] discover-videos-365 ${args.write ? "WRITE" : "DRY-RUN"}: creators=${creators.length}, offsetCreators=${args.offsetCreators}, limitCreators=${args.limitCreators}, limitVideos=${args.limitVideos}, sinceDays=${args.sinceDays}, gapMs=${args.gapMs}, accessBlockStopAfter=${args.accessBlockStopAfter}, auditOut=${args.auditOut ?? "none"}`);

  const totals: CreatorDiscoveryStats = {
    listed: 0,
    within365: 0,
    insertedNew: 0,
    alreadyExisting: 0,
    olderThan365: 0,
    missingOrUntrustedDate: 0,
    metadataFailures: 0,
    accessBlockedFailures: 0,
  };
  const runState: DiscoveryRunState = { accessBlockedFailures: 0 };

  for (const creator of creators) {
    const stats = await processCreator(creator, args, writeAudit, runState);
    totals.listed += stats.listed;
    totals.within365 += stats.within365;
    totals.insertedNew += stats.insertedNew;
    totals.alreadyExisting += stats.alreadyExisting;
    totals.olderThan365 += stats.olderThan365;
    totals.missingOrUntrustedDate += stats.missingOrUntrustedDate;
    totals.metadataFailures += stats.metadataFailures;
    totals.accessBlockedFailures += stats.accessBlockedFailures;
  }

  console.log(
    `[${timestamp()}] discover-videos-365 complete: sinceDays=${args.sinceDays} creators=${creators.length} listed=${totals.listed} within_365=${totals.within365} inserted_new=${totals.insertedNew} already_existing=${totals.alreadyExisting} older_than_365=${totals.olderThan365} missing_or_untrusted_date=${totals.missingOrUntrustedDate} metadata_failures=${totals.metadataFailures} access_blocked_failures=${totals.accessBlockedFailures}`,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[${timestamp()}] Fatal error:`, err);
    process.exit(1);
  });
}
