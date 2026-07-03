import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

const creativeTasteGateModulePath = "../src/lib/workplane/" + "creative-taste-gate";

type CreativeTasteGateDecision = {
  readonly ok: boolean;
  readonly blocker_codes: readonly string[];
  readonly warnings: readonly string[];
  readonly score: number;
  readonly max_score: number;
  readonly dimension_scores: Record<string, number>;
};

type CreativeTasteGateModule = {
  evaluateCreativeTasteGate: (input: Record<string, unknown>) => CreativeTasteGateDecision | Promise<CreativeTasteGateDecision>;
};

async function evaluate(input: Record<string, unknown>): Promise<CreativeTasteGateDecision> {
  const gate = await import(creativeTasteGateModulePath) as CreativeTasteGateModule;
  return await gate.evaluateCreativeTasteGate(input);
}

const productionContext = {
  campaign_type: "thought_leadership",
  artifact_stage: "production_ready",
  execution_mode: "draft_ready",
  public_ready: true,
  channel: "x",
  platform: "x",
};

describe("creative taste gate RED contract", () => {
  test("blocks generic product manifesto copy", async () => {
    const decision = await evaluate({
      ...productionContext,
      copy: "CallScore is an evidence layer for crypto creator calls. It helps users understand who is trustworthy by tracking calls and outcomes.",
      evidence_refs: ["callscore:generic"],
      visual_asset: { class: "product_screenshot", rendered_png_path: "/tmp/callscore.png", png_sha256: "a".repeat(64) },
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("generic_product_manifesto_blocked"), true);
  });

  test("requires concrete creator, call, stat, discourse, or product evidence", async () => {
    const decision = await evaluate({
      ...productionContext,
      copy: "A ranking without receipts is just another leaderboard with better typography.",
      evidence_refs: [],
      visual_asset: { class: "product_screenshot", rendered_png_path: "/tmp/callscore.png", png_sha256: "b".repeat(64) },
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("concrete_evidence_required"), true);
  });

  test("blocks overused receipts greater-than-vibes scaffold", async () => {
    const decision = await evaluate({
      ...productionContext,
      copy: "Receipts > vibes. CallScore is receipts, not vibes. Crypto trust needs receipts over vibes.",
      evidence_refs: ["creator:demo", "call:btc-2026-07-03"],
      visual_asset: { class: "product_screenshot", rendered_png_path: "/tmp/callscore.png", png_sha256: "c".repeat(64) },
      recent_phrase_memory: ["receipts > vibes", "proof beats vibes", "receipts not vibes"],
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("overused_receipts_vibes_scaffold"), true);
  });

  test("blocks mock or placeholder visuals for public-ready artifacts", async () => {
    const decision = await evaluate({
      ...productionContext,
      copy: "A specific BTC call from a tracked creator resolved outside the claimed window.",
      evidence_refs: ["creator:demo", "call:btc-2026-07-03"],
      visual_asset: {
        class: "mock_card",
        title: "Local SVG preview",
        is_mock: true,
        rendered_png_path: "/tmp/mock.png",
        png_sha256: "d".repeat(64),
      },
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("mock_or_placeholder_visual_blocked"), true);
  });

  test("requires rendered visual proof for visual public artifacts", async () => {
    const decision = await evaluate({
      ...productionContext,
      copy: "This creator's last tracked ETH call had a timestamp, entry zone, and resolved outcome.",
      evidence_refs: ["creator:demo", "call:eth-2026-07-03"],
      visual_asset: {
        class: "product_screenshot",
        svg_path: "/tmp/source-only.svg",
      },
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("visual_render_proof_required"), true);
  });

  test("blocks draft or test disclaimers inside public-facing copy", async () => {
    const decision = await evaluate({
      ...productionContext,
      copy: "DRAFT TEST ONLY: This CallScore post shows a specific tracked BTC call and outcome.",
      evidence_refs: ["creator:demo", "call:btc-2026-07-03"],
      visual_asset: { class: "product_screenshot", rendered_png_path: "/tmp/callscore.png", png_sha256: "e".repeat(64) },
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("public_draft_disclaimer_blocked"), true);
  });

  test("requires full YouTube script for production package", async () => {
    const decision = await evaluate({
      ...productionContext,
      channel: "youtube",
      platform: "youtube",
      artifact_type: "youtube_publish_package",
      youtube_package: {
        title: "Stop Trusting Crypto Calls Without Receipts",
        script_outline: ["Hook", "Evidence", "CTA"],
        full_script: "",
        thumbnail: { rendered_png_path: "/tmp/thumb.png", png_sha256: "f".repeat(64) },
      },
      evidence_refs: ["creator:demo", "call:sol-2026-07-03"],
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("youtube_full_script_required"), true);
  });

  test("requires rendered YouTube thumbnail proof for production package", async () => {
    const decision = await evaluate({
      ...productionContext,
      channel: "youtube",
      platform: "youtube",
      artifact_type: "youtube_publish_package",
      youtube_package: {
        title: "Stop Trusting Crypto Calls Without Receipts",
        full_script: "Hook. Evidence. Creator score moved after a resolved call. Here is the timestamp, market window, and outcome. CTA.",
        thumbnail: { svg_path: "/tmp/thumb.svg" },
      },
      evidence_refs: ["creator:demo", "call:sol-2026-07-03"],
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blocker_codes.includes("youtube_rendered_thumbnail_required"), true);
  });

  test("allows a strong evidence-backed rendered public artifact", async () => {
    const decision = await evaluate({
      ...productionContext,
      copy: "A ranking without receipts is just market theatre. This week CallScore tracked creator:alpha after call:btc-breakout-2026-07-03 resolved outside the claimed window; check the product screenshot for the timestamp, entry zone, and outcome trail.",
      evidence_refs: ["creator:alpha", "call:btc-breakout-2026-07-03", "stat:creator-alpha-window-miss"],
      visual_asset: {
        class: "product_screenshot",
        title: "CallScore product screenshot showing creator Alpha BTC call trail",
        rendered_png_path: "/tmp/callscore-alpha-btc-call-trail.png",
        png_sha256: "1".repeat(64),
      },
      taste_brief_receipt_id: "taste-brief-1",
      taste_critique_receipt_id: "taste-critique-1",
      creative_package_approval_receipt_id: "creative-package-1",
    });

    assert.equal(decision.ok, true);
    assert.deepEqual(decision.blocker_codes, []);
    assert.equal(decision.score >= 32, true, `expected score >= 32, got ${decision.score}`);
  });
});
