export const PENDING_MATURITY_EMPTY_REASON = "PENDING_MATURITY" as const;

export interface ReadApiLeaderboardContract<Row> {
  readonly ok?: boolean;
  readonly period?: string;
  readonly emptyReason?: string | null;
  readonly officialRankedRows?: readonly Row[];
  readonly provisionalRows?: readonly Row[];
  readonly watchlistRows?: readonly Row[];
  readonly staleRows?: readonly Row[];
  readonly excludedRows?: readonly Row[];
  readonly pendingMaturityRows?: readonly Row[];
  readonly leaderboard?: {
    readonly period?: string;
    readonly rows?: readonly Row[];
  };
}

export function getOfficialRankedReadApiRows<Row>(
  contract: ReadApiLeaderboardContract<Row> | null | undefined,
): readonly Row[] {
  return Array.isArray(contract?.officialRankedRows)
    ? contract.officialRankedRows
    : [];
}

export function isPendingMaturityLeaderboard(
  contract: Pick<ReadApiLeaderboardContract<unknown>, "emptyReason"> | null | undefined,
): boolean {
  return contract?.emptyReason === PENDING_MATURITY_EMPTY_REASON;
}

export function getLeaderboardEmptyMessage(
  contract: Pick<ReadApiLeaderboardContract<unknown>, "emptyReason"> | null | undefined,
): string {
  if (isPendingMaturityLeaderboard(contract)) {
    return "30d official rankings are pending maturity. Calls need a complete 30-day outcome window before this period can show an official leaderboard.";
  }

  return "No official ranked creators are available for this period yet. Newer tracked calls may still be awaiting extraction, confidence review, sample thresholds, or outcome windows.";
}
