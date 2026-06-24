import assert from "node:assert/strict";
import test from "node:test";
import {
  creatorEligibilityReason,
  isEligibleCreatorForIntelligence,
  isNewsOrMediaCreator,
} from "../src/lib/creator-eligibility/creator-eligibility";

test("news/media creators are context-only and excluded from creator intelligence", () => {
  const creator = { id: 10, name: "Crypto News Desk", focus: "Crypto journalism, market structure, major ecosystem interviews" };
  assert.equal(isNewsOrMediaCreator(creator), true);
  assert.equal(isEligibleCreatorForIntelligence(creator), false);
  assert.equal(creatorEligibilityReason(creator), "news_or_media_context_only");
});

test("creator-call focus remains eligible for intelligence", () => {
  const creator = { id: 11, name: "Chart Caller", focus: "EN / Global / creator calls" };
  assert.equal(isNewsOrMediaCreator(creator), false);
  assert.equal(isEligibleCreatorForIntelligence(creator), true);
  assert.equal(creatorEligibilityReason(creator), null);
});

test("hybrid or education-only creators default to excluded until reviewed", () => {
  const creator = { id: 12, name: "Crypto Education", focus: "Crypto education, security, onboarding, news commentary" };
  assert.equal(isEligibleCreatorForIntelligence(creator), false);
  assert.equal(creatorEligibilityReason(creator), "news_or_media_context_only");
});

test("explicit DB-style ineligible fields override focus text", () => {
  assert.equal(isEligibleCreatorForIntelligence({ id: 13, focus: "creator calls", eligible_for_creator_scoring: false }), false);
  assert.equal(isNewsOrMediaCreator({ id: 14, focus: "creator calls", is_news_channel: true }), true);
});


test("reviewed news/media exclusions remove Altcoin Daily from creator measurement", () => {
  const creator = { id: 2, name: "Altcoin Daily", youtube_handle: "@AltcoinDaily", focus: "EN / Global / creator calls" };
  assert.equal(isNewsOrMediaCreator(creator), true);
  assert.equal(isEligibleCreatorForIntelligence(creator), false);
  assert.equal(creatorEligibilityReason(creator), "news_or_media_context_only");
});
