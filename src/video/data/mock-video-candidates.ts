import type { CreatorScore } from "../schemas/video.schemas";

export const mockVideoCandidates: readonly CreatorScore[] = [
  {
    creatorId: 1,
    name: "Example Alpha Caller",
    youtubeHandle: "@examplealpha",
    youtubeChannelId: "UC_example_alpha",
    totalCalls: 42,
    winRate: 0.57,
    alphaScore: 71.2,
    rank: 3,
    scoreDelta: 8.4,
    rankMovement: 2,
    recentResolvedCalls: 7,
    recentCalls: [
      {
        id: 101,
        creatorId: 1,
        videoId: 201,
        symbol: "BTC",
        direction: "bullish",
        outcome: "won",
        rawQuote: "Bitcoin looks ready for another move higher.",
        callDate: "2026-06-20T09:00:00.000Z",
        score: 82.5,
        return30d: 0.12,
        alpha30d: 0.04,
        extractionConfidence: 0.91,
      },
    ],
  },
];
