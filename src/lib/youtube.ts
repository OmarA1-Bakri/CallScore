import { google } from "googleapis";

const YOUTUBE = google.youtube({ version: "v3", auth: process.env.YOUTUBE_API_KEY });

export interface ChannelMetrics {
  readonly channelId: string;
  readonly title: string;
  readonly subscribers: number;
  readonly videoCount: number;
  readonly publishedAt: string;
}

export async function fetchChannelMetrics(batchIds: readonly string[]): Promise<readonly ChannelMetrics[]> {
  if (batchIds.length === 0 || batchIds.length > 50) {
    throw new Error(`YouTube API batch limit is 50 ids; got ${batchIds.length}`);
  }

  const { data } = await YOUTUBE.channels.list({
    part: ["snippet", "statistics"],
    id: [...batchIds],
    maxResults: 50,
  });

  const items = data.items ?? [];

  return items.map((item) => {
    const stats = item.statistics;
    return {
      channelId: item.id ?? "",
      title: item.snippet?.title ?? "",
      subscribers: parseInt(stats?.subscriberCount ?? "0", 10) || 0,
      videoCount: parseInt(stats?.videoCount ?? "0", 10) || 0,
      publishedAt: item.snippet?.publishedAt ?? "",
    };
  });
}

export function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size) as T[]);
  }
  return chunks;
}
