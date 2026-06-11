export const EXCLUSION_REASONS = Object.freeze({
  MEDIA_NEWS_CHANNEL: "EXCLUDED_MEDIA_NEWS_CHANNEL",
  CONTAMINATED_CALL_SOURCE: "EXCLUDED_CONTAMINATED_CALL_SOURCE",
  NON_TARGET_CREATOR: "EXCLUDED_NON_TARGET_CREATOR",
  DUPLICATE_OR_ALIAS: "EXCLUDED_DUPLICATE_OR_ALIAS",
});

export const EXCLUDED_CREATOR_CLASSES = Object.freeze([
  "news",
  "media",
  "aggregation",
  "aggregator",
  "contaminated",
  "non-target",
  "non target",
  "duplicate",
  "alias",
  "ambiguous",
]);

export const TARGET_CREATOR_CRITERIA = Object.freeze([
  "accountable individual or accountable creator brand",
  "explicit market call ownership",
  "sufficient public-eligible call sample",
  "fresh enough creator dataset",
  "not excluded by product policy",
  "not a news/media/aggregation channel",
  "not contaminated by ambiguous call ownership",
]);

const ALTCOIN_DAILY_CHANNEL_IDS = new Set(["ucblhgkvy-bjpcawebgtnfbw"]);
const POLICY_EXCLUDED_IDENTITIES = new Map([
  ["alexbeckerschannel", EXCLUSION_REASONS.NON_TARGET_CREATOR],
  ["moneyzg", EXCLUSION_REASONS.NON_TARGET_CREATOR],
  ["cryptoinspector", EXCLUSION_REASONS.NON_TARGET_CREATOR],
]);

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compactText(value) {
  return normalizeText(value).replace(/^@+/, "").replace(/[^a-z0-9]+/g, "");
}

export function normalizeCreatorIdentity(row = {}) {
  const name = normalizeText(row.name ?? row.creator_name ?? row.display_name);
  const handle = compactText(row.youtube_handle ?? row.handle ?? row.creator_youtube_handle);
  const channelId = normalizeText(
    row.youtube_channel_id ?? row.channel_id ?? row.creator_youtube_channel_id,
  );
  const aliases = Array.isArray(row.aliases)
    ? row.aliases.map((alias) => compactText(alias)).filter(Boolean)
    : [];

  return {
    name,
    compactName: compactText(name),
    handle,
    channelId,
    aliases,
  };
}

export function isAltcoinDaily(row = {}) {
  const identity = normalizeCreatorIdentity(row);
  return (
    identity.compactName === "altcoindaily" ||
    identity.handle === "altcoindaily" ||
    identity.aliases.includes("altcoindaily") ||
    ALTCOIN_DAILY_CHANNEL_IDS.has(identity.channelId)
  );
}

function configuredExclusionReason(row = {}) {
  const reason = row.exclusion_reason ?? row.exclusionReason;
  return reason ? String(reason) : null;
}

function normalizedPolicyText(row = {}) {
  return normalizeText(`${row.creator_type ?? row.creatorType ?? ""} ${configuredExclusionReason(row) ?? ""}`);
}

export function getCreatorExclusion(row = {}) {
  if (isAltcoinDaily(row)) {
    return {
      excluded: true,
      reason: EXCLUSION_REASONS.MEDIA_NEWS_CHANNEL,
      source: "hard_policy",
    };
  }

  const identity = normalizeCreatorIdentity(row);
  const policyReason = POLICY_EXCLUDED_IDENTITIES.get(identity.compactName)
    ?? POLICY_EXCLUDED_IDENTITIES.get(identity.handle)
    ?? identity.aliases.map((alias) => POLICY_EXCLUDED_IDENTITIES.get(alias)).find(Boolean);
  if (policyReason) {
    return {
      excluded: true,
      reason: policyReason,
      source: "hard_policy",
    };
  }

  const configuredReason = configuredExclusionReason(row);
  if (configuredReason) {
    return {
      excluded: true,
      reason: configuredReason,
      source: "configured_reason",
    };
  }

  const policyText = normalizedPolicyText(row);
  if (/\b(news|media|aggregation|aggregator)\b/.test(policyText)) {
    return {
      excluded: true,
      reason: EXCLUSION_REASONS.MEDIA_NEWS_CHANNEL,
      source: "creator_type",
    };
  }

  if (/\bcontaminated\b/.test(policyText)) {
    return {
      excluded: true,
      reason: EXCLUSION_REASONS.CONTAMINATED_CALL_SOURCE,
      source: "creator_type",
    };
  }

  if (/\bduplicate\b|\balias\b/.test(policyText)) {
    return {
      excluded: true,
      reason: EXCLUSION_REASONS.DUPLICATE_OR_ALIAS,
      source: "creator_type",
    };
  }

  if (/\bnon[-_\s]?target\b|\bambiguous\b|\bnon[-_\s]?accountable\b/.test(policyText)) {
    return {
      excluded: true,
      reason: EXCLUSION_REASONS.NON_TARGET_CREATOR,
      source: "creator_type",
    };
  }

  return {
    excluded: false,
    reason: null,
    source: null,
  };
}

export function isExcludedCreator(row = {}) {
  return getCreatorExclusion(row).excluded;
}

export function getExclusionReason(row = {}) {
  return getCreatorExclusion(row).reason ?? EXCLUSION_REASONS.NON_TARGET_CREATOR;
}

export function isTargetCreatorClass(row = {}) {
  return !isExcludedCreator(row);
}
