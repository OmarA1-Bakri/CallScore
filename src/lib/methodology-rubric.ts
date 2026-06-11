export const CALL_SCORE_LIFECYCLE_STATES = [
  {
    state: "raw_candidate",
    label: "Raw candidate",
    definition:
      "AI-extracted prediction candidate before ownership, confidence, market-data, and maturity checks.",
  },
  {
    state: "confidence_pass",
    label: "Confidence pass",
    definition:
      "Candidate passes the public extraction floor and is eligible for price matching review.",
  },
  {
    state: "matched",
    label: "Matched",
    definition:
      "Candidate has a valid supported asset and entry price anchor against market data.",
  },
  {
    state: "pending_maturity",
    label: "Pending maturity",
    definition:
      "Candidate has not yet reached the outcome window required for public scoring.",
  },
  {
    state: "scored",
    label: "Scored",
    definition:
      "Candidate has all required market outcomes and can receive a 0–100 Call Score.",
  },
  {
    state: "excluded",
    label: "Excluded",
    definition:
      "Candidate or source is non-target, contaminated, too low-confidence, or policy-excluded.",
  },
  {
    state: "invalid",
    label: "Invalid",
    definition:
      "Candidate failed extraction or validation and must not enter public scoring denominators.",
  },
] as const;

export type CallScoreLifecycleState =
  (typeof CALL_SCORE_LIFECYCLE_STATES)[number]["state"];

export const CREATOR_RANKING_STATES = [
  {
    state: "officialRanked",
    bucket: "officialRankedRows",
    label: "Official ranked",
    definition:
      "Passes official sample, rank, freshness, target-creator, and exclusion gates and may appear in the public leaderboard.",
  },
  {
    state: "provisional",
    bucket: "provisionalRows",
    label: "Provisional",
    definition:
      "Has meaningful scored evidence but does not yet meet the official ranking contract.",
  },
  {
    state: "watchlist",
    bucket: "watchlistRows",
    label: "Watchlist",
    definition:
      "Tracked creator with insufficient mature public-scored evidence for an official or provisional signal.",
  },
  {
    state: "stale",
    bucket: "staleRows",
    label: "Stale",
    definition:
      "Historical evidence exists, but current coverage is too old or incomplete for official ranking.",
  },
  {
    state: "excluded",
    bucket: "excludedRows",
    label: "Excluded",
    definition:
      "Non-target or policy-excluded source; permitted only in admin/audit contexts, not public rankings.",
  },
  {
    state: "pendingMaturity",
    bucket: "pendingMaturityRows",
    label: "Pending maturity",
    definition:
      "Period or calls are waiting for outcome windows to mature; not eligible for official ranking.",
  },
] as const;

export type CreatorRankingState =
  (typeof CREATOR_RANKING_STATES)[number]["state"];

export const OFFICIAL_CREATOR_THRESHOLDS = {
  all_time: {
    label: "All time",
    officialMinCalls: 24,
    certifiedMinCalls: 50,
    provisionalMinCalls: 6,
    officialEnabled: true,
  },
  "12m": {
    label: "12m",
    officialMinCalls: 12,
    certifiedMinCalls: 25,
    provisionalMinCalls: 6,
    officialEnabled: true,
  },
  "90d": {
    label: "90d",
    officialMinCalls: 3,
    certifiedMinCalls: 10,
    provisionalMinCalls: 1,
    officialEnabled: true,
  },
  "30d": {
    label: "30d",
    officialMinCalls: null,
    certifiedMinCalls: null,
    provisionalMinCalls: null,
    officialEnabled: false,
    emptyReason: "PENDING_MATURITY",
  },
} as const;

export type OfficialCreatorPeriod = keyof typeof OFFICIAL_CREATOR_THRESHOLDS;

export const CURRENT_CREATOR_RANKING_METHOD = {
  scoreField: "creator_stats.alpha_score",
  currentMeaning:
    "Current writer semantics store average 0–100 Call Score in the legacy alpha_score column, then assign rank with a sample-adjusted Creator Rank Score before raw score, win rate, sample size, and creator id tie-breakers.",
  rankOrder: ["sample_adjusted_score DESC", "alpha_score DESC", "win_rate DESC", "total_calls DESC", "creator_id ASC"],
  limitations: [
    "The alpha_score column name is misleading because it is not raw average alpha.",
    "The alpha_score storage column remains a legacy name; rank order now uses sample-adjusted score computed during source recompute.",
    "A stored score of 0 is currently used as an unscored placeholder in some writer/count paths, so methodology v2 must separate score_status from score_value.",
  ],
} as const;

export const RECOMMENDED_CREATOR_RANK_SCORE_V2 = {
  approvalGate:
    "Live ranking formula is implemented through the source-safe stats writer and remains subject to regression tests plus approved production recompute.",
  priorN: 25,
  sampleAdjustedFormula:
    "(creator_raw_score * N + global_baseline_score * prior_N) / (N + prior_N)",
  components: [
    { label: "Sample-adjusted average Call Score", weight: 45 },
    { label: "Sample-adjusted BTC-relative alpha percentile", weight: 25 },
    { label: "Consistency", weight: 15 },
    { label: "Freshness", weight: 10 },
    { label: "Specificity quality", weight: 5 },
  ],
} as const;
