import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { CreatorScore, VideoFormat } from "../schemas/video.schemas";

const dims: Record<VideoFormat, { width: number; height: number }> = {
  daily_short: { width: 1080, height: 1920 },
  leaderboard_update: { width: 1080, height: 1920 },
  creator_breakdown: { width: 1080, height: 1920 },
  weekly_investigation: { width: 1280, height: 720 },
};

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function renderDeterministicThumbnail(input: { readonly format: VideoFormat; readonly creator: CreatorScore; readonly pngPath: string; readonly jpgPath: string }): Promise<{ pngPath: string; jpgPath: string }> {
  const { width, height } = dims[input.format];
  await fs.mkdir(path.dirname(input.pngPath), { recursive: true });
  const score = Math.round(input.creator.alphaScore);
  const title = input.format === "leaderboard_update" ? "Leaderboard moved" : input.creator.name;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#020617"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect x="${width * 0.06}" y="${height * 0.08}" width="${width * 0.88}" height="${height * 0.84}" rx="42" fill="#111827" stroke="#38bdf8" stroke-width="6"/>
    <text x="${width * 0.1}" y="${height * 0.17}" fill="#38bdf8" font-family="Arial" font-size="${Math.round(width * 0.055)}" font-weight="700">CallScore</text>
    <text x="${width * 0.1}" y="${height * 0.35}" fill="#ffffff" font-family="Arial" font-size="${Math.round(width * 0.072)}" font-weight="900">${escapeXml(title).slice(0, 30)}</text>
    <text x="${width * 0.1}" y="${height * 0.52}" fill="#94a3b8" font-family="Arial" font-size="${Math.round(width * 0.04)}">tracked calls: ${input.creator.totalCalls}</text>
    <text x="${width * 0.1}" y="${height * 0.70}" fill="#22c55e" font-family="Arial" font-size="${Math.round(width * 0.14)}" font-weight="900">${score}</text>
    <text x="${width * 0.1}" y="${height * 0.78}" fill="#ffffff" font-family="Arial" font-size="${Math.round(width * 0.04)}">CallScore alpha score</text>
    <text x="${width * 0.1}" y="${height * 0.88}" fill="#cbd5e1" font-family="Arial" font-size="${Math.round(width * 0.032)}">Who made the call? What happened?</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(input.pngPath);
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(input.jpgPath);
  return { pngPath: input.pngPath, jpgPath: input.jpgPath };
}
