import type { BrollClip } from "./broll-types";

const UNSPLASH_BASE = "https://api.unsplash.com/search/photos";

export interface UnsplashSearchOptions {
  readonly perPage?: number;
}

interface UnsplashUrls {
  readonly raw: string;
  readonly full: string;
  readonly regular: string;
}

interface UnsplashLinks {
  readonly html: string;
}

interface UnsplashPhoto {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly urls: UnsplashUrls;
  readonly links: UnsplashLinks;
}

interface UnsplashSearchResponse {
  readonly results: readonly UnsplashPhoto[];
}

function getApiKey(): string | undefined {
  return process.env.UNSPLASH_ACCESS_KEY?.trim() || undefined;
}

const UNSPLASH_AUTH_HEADER = "Authorization";

const CLIENT_ID_PREFIX = "Client-ID ";

async function unsplashFetch(
  query: string,
  accessToken: string,
  perPage: number,
): Promise<UnsplashSearchResponse> {
  const url = UNSPLASH_BASE + "?query=" + encodeURIComponent(query) + "&per_page=" + perPage;
  const res = await fetch(url, {
    headers: {
      [UNSPLASH_AUTH_HEADER]: CLIENT_ID_PREFIX + accessToken,
    },
  });
  if (!res.ok) {
    return { results: [] };
  }
  return res.json() as Promise<UnsplashSearchResponse>;
}

function toBrollClip(photo: UnsplashPhoto): BrollClip {
  return {
    url: photo.urls.full,
    thumbnailUrl: photo.urls.regular,
    provider: "unsplash",
    width: photo.width,
    height: photo.height,
    durationSeconds: 0,
    license: "unsplash-free",
  };
}

export async function unsplashSearch(
  query: string,
  options: UnsplashSearchOptions = {},
): Promise<BrollClip[]> {
  const apiKey = getApiKey() ?? "";
  const perPage = options.perPage ?? 5;
  const data = await unsplashFetch(query, apiKey, perPage);
  return data.results.map(toBrollClip);
}
