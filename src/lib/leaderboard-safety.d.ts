declare module "@/lib/leaderboard-safety.mjs" {
  export function toReadApiLeaderboardContract<Row>(
    period: string,
    rows?: readonly Row[],
    options?: Record<string, unknown>,
  ): {
    ok: true;
    period: string;
    emptyReason: string | null;
    counts: {
      publicEligibleCalls: number;
      officialRankedCreators: number;
      provisionalCreators: number;
      watchlistCreators: number;
      staleCreators: number;
      excludedCreators: number;
      pendingMaturityCreators: number;
    };
    officialRankedRows: Row[];
    provisionalRows: Row[];
    watchlistRows: Row[];
    staleRows: Row[];
    excludedRows: Row[];
    pendingMaturityRows: Row[];
    leaderboard: {
      period: string;
      rows: Row[];
    };
  };
}
