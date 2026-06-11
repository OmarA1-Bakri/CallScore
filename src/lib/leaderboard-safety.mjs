const ABSOLUTE_OFFICIAL_CALL_FLOOR = 25;
const OFFICIAL_THRESHOLDS = Object.freeze({
  all_time: 50,
  "12m": 25,
  "90d": 25,
  "30d": Number.POSITIVE_INFINITY,
});
const PROVISIONAL_THRESHOLDS = Object.freeze({
  all_time: 10,
  "12m": 10,
  "90d": 5,
  "30d": Number.POSITIVE_INFINITY,
});
const STALE_AFTER_DAYS = 180;
const ALTCOIN_DAILY_CHANNEL_IDS = new Set(["ucblhgkvy-bjpcawebgtnfbw"]);
const EXCLUDED_MEDIA_NEWS_CHANNEL = "EXCLUDED_MEDIA_NEWS_CHANNEL";
const PENDING_MATURITY = "PENDING_MATURITY";
const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compactText(value) {
  return normalizeText(value).replace(/^@+/, "").replace(/\s+/g, "");
}

function numberValue(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNullishRank(value) {
  return value === null || value === undefined || value === "";
}

function latestFreshnessDate(row = {}) {
  return row.latest_video_date ?? row.latestVideoDate ?? row.latest_published_at;
}

function parseValidDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rowPeriod(row, fallback = "all_time") {
  return String(row?.period || fallback || "all_time");
}

function assertSafeSqlIdentifier(alias) {
  if (!SAFE_SQL_IDENTIFIER.test(alias)) {
    throw new Error(`Unsafe SQL alias for public eligible calls: ${alias}`);
  }
}

export function normalizeCreatorIdentity(row = {}) {
  const name = normalizeText(row.name ?? row.creator_name);
  const handle = compactText(row.youtube_handle ?? row.handle ?? row.creator_youtube_handle);
  const channelId = normalizeText(
    row.youtube_channel_id ?? row.channel_id ?? row.creator_youtube_channel_id,
  );

  return {
    name,
    compactName: compactText(name),
    handle,
    channelId,
  };
}

export function isExcludedCreator(row = {}) {
  const identity = normalizeCreatorIdentity(row);
  if (identity.compactName === "altcoindaily") return true;
  if (identity.handle === "altcoindaily") return true;
  if (ALTCOIN_DAILY_CHANNEL_IDS.has(identity.channelId)) return true;

  const creatorType = normalizeText(row.creator_type ?? row.creatorType);
  const exclusionReason = normalizeText(row.exclusion_reason ?? row.exclusionReason);
  const combined = `${creatorType} ${exclusionReason}`;

  return /\b(news|media|aggregation|aggregator|non[-_\s]?target|contaminated)\b/.test(combined);
}

export function getExclusionReason(row = {}) {
  const identity = normalizeCreatorIdentity(row);
  if (
    identity.compactName === "altcoindaily" ||
    identity.handle === "altcoindaily" ||
    ALTCOIN_DAILY_CHANNEL_IDS.has(identity.channelId)
  ) {
    return EXCLUDED_MEDIA_NEWS_CHANNEL;
  }

  const reason = row.exclusion_reason ?? row.exclusionReason;
  return reason ? String(reason) : "EXCLUDED_NON_TARGET_CREATOR";
}

export function getOfficialThreshold(period = "all_time") {
  const threshold = OFFICIAL_THRESHOLDS[period] ?? OFFICIAL_THRESHOLDS.all_time;
  return threshold === Number.POSITIVE_INFINITY
    ? threshold
    : Math.max(threshold, ABSOLUTE_OFFICIAL_CALL_FLOOR);
}

function getProvisionalThreshold(period = "all_time") {
  return PROVISIONAL_THRESHOLDS[period] ?? PROVISIONAL_THRESHOLDS.all_time;
}

export function isStaleCreator(row = {}, options = {}) {
  const latest = parseValidDate(latestFreshnessDate(row));
  if (!latest) return false;

  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const staleAfterMs = (options.staleAfterDays ?? STALE_AFTER_DAYS) * 24 * 60 * 60 * 1000;
  return latest.getTime() < now.getTime() - staleAfterMs;
}

function hasFreshnessProof(row = {}) {
  return parseValidDate(latestFreshnessDate(row)) !== null;
}

export function classifyLeaderboardRow(row = {}, options = {}) {
  const period = rowPeriod(row, options.period);
  const totalCalls = numberValue(row.total_calls ?? row.totalCalls);
  const rank = row.accuracy_rank ?? row.accuracyRank;

  if (isExcludedCreator(row)) {
    return {
      bucket: "excludedRows",
      reason: getExclusionReason(row),
    };
  }

  if (period === "30d" || options.pendingMaturity === true || row.pending_maturity === true) {
    return {
      bucket: "pendingMaturityRows",
      reason: PENDING_MATURITY,
    };
  }

  if (isStaleCreator(row, options)) {
    return {
      bucket: "staleRows",
      reason: "STALE_CREATOR",
    };
  }

  const officialThreshold = getOfficialThreshold(period);
  if (
    !isNullishRank(rank) &&
    totalCalls > 0 &&
    totalCalls >= officialThreshold &&
    hasFreshnessProof(row)
  ) {
    return {
      bucket: "officialRankedRows",
      reason: null,
    };
  }

  if (
    totalCalls > 0 &&
    totalCalls >= getProvisionalThreshold(period) &&
    hasFreshnessProof(row)
  ) {
    return {
      bucket: "provisionalRows",
      reason: isNullishRank(rank) ? "NULL_RANK" : "LOW_SAMPLE",
    };
  }

  return {
    bucket: "watchlistRows",
    reason: totalCalls <= 0 ? "ZERO_CALLS" : "INSUFFICIENT_SAMPLE",
  };
}

function withSafetyMetadata(row, classification) {
  return {
    ...row,
    safetyBucket: classification.bucket,
    safetyReason: classification.reason,
    ...(classification.bucket === "excludedRows"
      ? { exclusionReason: classification.reason }
      : {}),
  };
}

function rankOfficialRows(rows) {
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

export function bucketLeaderboardRows(rows = [], options = {}) {
  const buckets = {
    officialRankedRows: [],
    provisionalRows: [],
    watchlistRows: [],
    staleRows: [],
    excludedRows: [],
    pendingMaturityRows: [],
  };

  for (const row of rows) {
    const period = rowPeriod(row, options.period);
    const classification = classifyLeaderboardRow({ ...row, period }, { ...options, period });
    buckets[classification.bucket].push(withSafetyMetadata({ ...row, period }, classification));
  }

  buckets.officialRankedRows = rankOfficialRows(buckets.officialRankedRows);

  const countRows = [
    ...buckets.officialRankedRows,
    ...buckets.provisionalRows,
    ...buckets.watchlistRows,
    ...buckets.staleRows,
    ...buckets.pendingMaturityRows,
  ];

  return {
    ...buckets,
    counts: {
      publicEligibleCalls: countRows.reduce(
        (sum, row) => sum + Math.max(0, numberValue(row.total_calls ?? row.totalCalls)),
        0,
      ),
      officialRankedCreators: buckets.officialRankedRows.length,
      provisionalCreators: buckets.provisionalRows.length,
      watchlistCreators: buckets.watchlistRows.length,
      staleCreators: buckets.staleRows.length,
      excludedCreators: buckets.excludedRows.length,
      pendingMaturityCreators: buckets.pendingMaturityRows.length,
    },
  };
}

export function toReadApiLeaderboardContract(period, rows = [], options = {}) {
  const effectivePeriod = period || "all_time";
  const bucketed = bucketLeaderboardRows(rows, { ...options, period: effectivePeriod });
  const emptyReason = effectivePeriod === "30d" ? PENDING_MATURITY : null;

  return {
    ok: true,
    period: effectivePeriod,
    emptyReason,
    counts: bucketed.counts,
    officialRankedRows: bucketed.officialRankedRows,
    provisionalRows: bucketed.provisionalRows,
    watchlistRows: bucketed.watchlistRows,
    staleRows: bucketed.staleRows,
    excludedRows: bucketed.excludedRows,
    pendingMaturityRows: bucketed.pendingMaturityRows,
    leaderboard: {
      period: effectivePeriod,
      rows: bucketed.officialRankedRows,
    },
  };
}

export function publicEligibleCallsWhereSql(alias = "calls") {
  assertSafeSqlIdentifier(alias);
  return `${alias}.score > 0 AND ${alias}.extraction_confidence >= 0.70`;
}

export function publicVisibleCallsWhereSql(alias = "calls") {
  assertSafeSqlIdentifier(alias);
  return `${alias}.score != 0 AND ${alias}.extraction_confidence >= 0.70`;
}
