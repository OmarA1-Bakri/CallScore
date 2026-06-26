import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

const originalityGateModulePath = "../src/lib/workplane/" + "social-originality-gate";

type OriginalityDecision = {
  readonly ok: boolean;
  readonly blocker_codes: readonly string[];
  readonly warnings?: readonly string[];
  readonly allowed_visual_classes?: readonly string[];
};

type SocialOriginalityGateModule = {
  evaluateSocialOriginalityGate: (input: Record<string, unknown>) => OriginalityDecision | Promise<OriginalityDecision>;
};

async function loadOriginalityGate(): Promise<SocialOriginalityGateModule> {
  return await import(originalityGateModulePath) as SocialOriginalityGateModule;
}

async function evaluate(input: Record<string, unknown>): Promise<OriginalityDecision> {
  const gate = await loadOriginalityGate();
  return await gate.evaluateSocialOriginalityGate(input);
}

describe("social originality and thought-leadership asset RED contract", () => {
  test("generic EVIDENCE CARD fails thought-leadership asset gate", async () => {
    const decision = await evaluate({
      campaign_type: "thought_leadership",
      platform: "linkedin",
      visual_asset: {
        title: "EVIDENCE CARD",
        class: "generic_evidence_card",
        source: "packet_scaffold",
      },
      copy: "Crypto rankings need proof. CallScore shows the evidence.",
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("generic_evidence_card_thought_leadership_blocked"), true);
  });

  test("X and LinkedIn duplicate content fails originality gate", async () => {
    const text = "CallScore ranks crypto creator calls from source-backed evidence, not vibes.";
    const decision = await evaluate({
      campaign_type: "owned_public_organic",
      x_copy: text,
      linkedin_copy: text,
      shared_evidence_refs: ["callscore:freshness:2026-06-26"],
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("cross_platform_duplicate_copy"), true);
  });

  test("LinkedIn padded X content fails originality gate", async () => {
    const xCopy = "CallScore ranks crypto creator calls from source-backed evidence.";
    const linkedinCopy = `${xCopy}\n\nMore context: proof beats vibes. Follow for updates.`;
    const decision = await evaluate({
      campaign_type: "owned_public_organic",
      x_copy: xCopy,
      linkedin_copy: linkedinCopy,
      shared_evidence_refs: ["callscore:freshness:2026-06-26"],
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("linkedin_padded_x_copy"), true);
  });

  test("X truncated LinkedIn content fails originality gate", async () => {
    const linkedinCopy = "CallScore ranks crypto creator calls from source-backed evidence, showing which calls had entries, windows, and outcomes instead of relying on vibes.";
    const xCopy = "CallScore ranks crypto creator calls from source-backed evidence, showing which calls had entries, windows, and outcomes...";
    const decision = await evaluate({
      campaign_type: "owned_public_organic",
      x_copy: xCopy,
      linkedin_copy: linkedinCopy,
      shared_evidence_refs: ["callscore:freshness:2026-06-26"],
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("x_truncated_linkedin_copy"), true);
  });

  test("same thesis and data source are allowed when copy is platform-native", async () => {
    const decision = await evaluate({
      campaign_type: "owned_public_organic",
      x_copy: "Proof beats vibes: CallScore tracks creator calls against actual market windows.",
      linkedin_copy: "Crypto creator rankings should start with auditable call evidence. CallScore connects each public call to the market window it claimed to beat, so the methodology can be inspected instead of guessed.",
      shared_evidence_refs: ["callscore:freshness:2026-06-26"],
      visual_asset: {
        title: "CallScore source-backed ranking screenshot",
        class: "product_screenshot",
      },
    });

    assert.equal(decision.ok, true);
    assert.deepEqual(decision.blocker_codes, []);
  });

  test("Reddit subreddit action requires approval plus rules and community fit", async () => {
    const decision = await evaluate({
      campaign_type: "owned_public_organic",
      platform: "reddit",
      reddit_surface: "subreddit",
      subreddit: "CryptoCurrency",
      reddit_community_approval: null,
      subreddit_rules_checked: false,
      community_fit: false,
      copy: "I built CallScore to rank crypto YouTubers. Check it out.",
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("reddit_community_approval_required"), true);
    assert.equal(decision.blocker_codes.includes("reddit_rules_check_required"), true);
    assert.equal(decision.blocker_codes.includes("reddit_community_fit_required"), true);
  });

  test("YouTube publish requires complete asset QA and approval", async () => {
    const decision = await evaluate({
      campaign_type: "owned_public_organic",
      platform: "youtube",
      youtube_publish: {
        title: "CallScore daily short",
        description: "",
        thumbnail_path: null,
        captions_path: null,
        qa_report_path: null,
        approval_receipt_id: null,
      },
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("youtube_description_required"), true);
    assert.equal(decision.blocker_codes.includes("youtube_thumbnail_required"), true);
    assert.equal(decision.blocker_codes.includes("youtube_captions_required"), true);
    assert.equal(decision.blocker_codes.includes("youtube_qa_report_required"), true);
    assert.equal(decision.blocker_codes.includes("youtube_approval_required"), true);
  });
});
