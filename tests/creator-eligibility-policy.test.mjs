import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  EXCLUSION_REASONS,
  TARGET_CREATOR_CRITERIA,
  getCreatorExclusion,
  getExclusionReason,
  isAltcoinDaily,
  isExcludedCreator,
  isTargetCreatorClass,
  normalizeCreatorIdentity,
} from "../src/lib/creator-eligibility-policy.mjs";
import {
  classifyLeaderboardRow,
  isExcludedCreator as isExcludedFromLeaderboardSafety,
} from "../src/lib/leaderboard-safety.mjs";

test("normalizeCreatorIdentity canonicalizes display names, handles, channels, and aliases", () => {
  assert.deepEqual(
    normalizeCreatorIdentity({
      name: " Altcoin   Daily ",
      youtube_handle: "@@AltcoinDaily",
      youtube_channel_id: " UCBLHGKVY-BJPCAWEBGTNFBW ",
      aliases: ["Altcoin Daily", "@altcoindaily"],
    }),
    {
      name: "altcoin daily",
      compactName: "altcoindaily",
      handle: "altcoindaily",
      channelId: "ucblhgkvy-bjpcawebgtnfbw",
      aliases: ["altcoindaily", "altcoindaily"],
    },
  );
});

test("Altcoin Daily is categorically excluded in every identifier format", () => {
  const variants = [
    { name: "Altcoin Daily" },
    { name: "altcoin daily" },
    { name: "AltcoinDaily" },
    { youtube_handle: "@AltcoinDaily" },
    { handle: "altcoindaily" },
    { youtube_channel_id: "UCBLHGKVY-BJPCAWEBGTNFBW" },
    { aliases: ["@AltcoinDaily"] },
  ];

  for (const variant of variants) {
    assert.equal(isAltcoinDaily(variant), true);
    assert.equal(isExcludedCreator(variant), true);
    assert.equal(getExclusionReason(variant), EXCLUSION_REASONS.MEDIA_NEWS_CHANNEL);
  }
});

test("creator_type and configured exclusion reasons map to canonical exclusion reasons", () => {
  assert.equal(
    getCreatorExclusion({ creator_type: "crypto news media channel" }).reason,
    EXCLUSION_REASONS.MEDIA_NEWS_CHANNEL,
  );
  assert.equal(
    getCreatorExclusion({ creator_type: "contaminated call source" }).reason,
    EXCLUSION_REASONS.CONTAMINATED_CALL_SOURCE,
  );
  assert.equal(
    getCreatorExclusion({ creator_type: "duplicate alias identity" }).reason,
    EXCLUSION_REASONS.DUPLICATE_OR_ALIAS,
  );
  assert.equal(
    getCreatorExclusion({ creator_type: "ambiguous non-accountable source" }).reason,
    EXCLUSION_REASONS.NON_TARGET_CREATOR,
  );
  assert.equal(
    getCreatorExclusion({ exclusion_reason: "EXCLUDED_DUPLICATE_OR_ALIAS" }).reason,
    "EXCLUDED_DUPLICATE_OR_ALIAS",
  );
});

test("target creator criteria are explicit and target class gate is shared", () => {
  assert.ok(TARGET_CREATOR_CRITERIA.includes("explicit market call ownership"));
  assert.equal(isTargetCreatorClass({ name: "Valid Accountable Creator" }), true);
  assert.equal(isTargetCreatorClass({ creator_type: "news" }), false);
});

test("leaderboard safety consumes the canonical exclusion policy", () => {
  const row = {
    period: "all_time",
    name: "Altcoin Daily",
    total_calls: 500,
    accuracy_rank: 1,
    latest_video_date: new Date().toISOString(),
  };

  assert.equal(isExcludedFromLeaderboardSafety(row), true);
  assert.deepEqual(classifyLeaderboardRow(row), {
    bucket: "excludedRows",
    reason: EXCLUSION_REASONS.MEDIA_NEWS_CHANNEL,
  });
});
