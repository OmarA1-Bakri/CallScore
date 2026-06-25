import type { BrollClip } from "./broll-types";

const PEXELS_BASE = "https://api.pexels.com/videos/search";

export interface PexelsSearchOptions {
  readonly perPage?: number;
}

interface PexelsVideoFile {
  readonly id: number;
  readonly quality: string;
  readonly file_type: string;
  readonly link: string;
  readonly width: number;
  readonly height: number;
}

interface PexelsVideo {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly url: string;
  readonly image: string;
  readonly duration: number;
  readonly video_files: readonly PexelsVideoFile[];
}

interface PexelsSearchResponse {
  readonly videos: readonly PexelsVideo[];
}

function getApiKey(): string | undefined {
  return process.env.PEXELS_API_KEY?.trim() || undefined;
}

const PEXELS_AUTH_HEADER = "Authorization";

async function pexelsFetch(query: string, token: string, perPage: number): Promise<PexelsSearchResponse> {
  const url = PEXELS_BASE + "?query=" + encodeURIComponent(query) + "&per_page=" + perPage;
  const res = await fetch(url, {
    headers: {
      [PEXELS_AUTH_HEADER]: token,
    },
  });
  if (!res.ok) {
    return { videos: [] };
  }
  return res.json() as Promise<PexelsSearchResponse>;
}

function toBrollClip(pexels: PexelsVideo): BrollClip | null {
  const preferredFile =
    pexels.video_files.find((f) => f.quality === "hd") ?? pexels.video_files[0];
  if (!preferredFile) return null;

  return {
    url: preferredFile.link,
    thumbnailUrl: pexels.image,
    provider: "pexels",
    width: pexels.width,
    height: pexels.height,
    durationSeconds: pexels.duration,
    license: "pexels-free",
  };
}

export async function pexelsSearch(
  query: string,
  options: PexelsSearchOptions = {},
): Promise<BrollClip[]> {
  const apiKey = getApiKey() ?? "";
  const perPage = options.perPage ?? 5;
  const data = await pexelsFetch(query, apiKey, perPage);
  const clips: BrollClip[] = [];
  for (const video of data.videos) {
    const clip = toBrollClip(video);
    if (clip) clips.push(clip);
  }
  return clips;
}
