import fs from "node:fs/promises";
import { QaReportSchema, type QaReport, type VideoJobState } from "../schemas/video.schemas";
import { validateScriptClaims } from "../planning/validate-claims";
import { YoutubeMetadataSchema } from "../schemas/video.schemas";
import { qaThumbnail } from "./qa-thumbnail";
import { qaVideo } from "./qa-video";

async function fileExists(filePath: string | null): Promise<boolean> {
  if (!filePath) return false;
  try { await fs.access(filePath); return true; } catch { return false; }
}

export async function qaVideoJob(state: VideoJobState): Promise<QaReport> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const videoExists = await fileExists(state.videoPath);
  const thumbnailExists = await fileExists(state.thumbnailPath);
  let audioStreamPresent = false;
  let dimensionsOk = false;
  let durationOk = false;
  if (!videoExists) errors.push("video_missing");
  if (!thumbnailExists) errors.push("thumbnail_missing");
  if (state.videoPath) {
    const videoQa = await qaVideo(state.videoPath, state.format);
    audioStreamPresent = videoQa.audioStreamPresent;
    dimensionsOk = videoQa.dimensionsOk;
    durationOk = videoQa.durationOk;
    errors.push(...videoQa.errors);
  }
  if (state.thumbnailPath) {
    const thumbQa = await qaThumbnail(state.thumbnailPath, state.format);
    errors.push(...thumbQa.errors);
  }
  const metadataResult = state.metadata ? YoutubeMetadataSchema.safeParse(state.metadata) : { success: false } as const;
  const metadataValid = metadataResult.success;
  if (!metadataValid) errors.push("metadata_invalid");
  const claims = state.scriptPackage ? validateScriptClaims(state.scriptPackage, state.creators) : { ok: false, errors: ["script_missing"] };
  if (!claims.ok) errors.push(...claims.errors);
  const report = QaReportSchema.parse({
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    format: state.format,
    videoExists,
    audioStreamPresent,
    dimensionsOk,
    durationOk,
    thumbnailExists,
    metadataValid,
    claimsValid: claims.ok,
    warnings,
    errors,
  });
  return report;
}
