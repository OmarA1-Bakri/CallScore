import * as assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";

const gate = "/srv/agents/hermes/scripts/callscore-content-quality-gate.py";

function runGate(packet: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "callscore-quality-"));
  const path = join(dir, "draft.json");
  writeFileSync(path, `${JSON.stringify(packet, null, 2)}\n`);
  const result = spawnSync("python3", [gate, path], { encoding: "utf8" });
  const parsed = JSON.parse(result.stdout || "{}");
  return { code: result.status, parsed, stderr: result.stderr };
}

const goodCopy = {
  x: {
    exact_copy: "This week, crypto trust debates keep stopping at disclosure. The useful question is whether a call can be replayed after the candle closes.",
    growth_mechanics: { media_plan: "image", cta: "Proof visual", target_entities: ["crypto researchers"] },
  },
  linkedin: {
    exact_copy: "This week, crypto trust debates keep stopping at disclosure. That is table stakes. The harder problem is memory: can the market replay the call, the timestamp, the entry price, and the outcome window after attention moves on? That is the next trust layer.",
    growth_mechanics: { media_plan: "image", cta: "Proof visual", target_entities: ["crypto researchers"] },
  },
};

function baseDraft(overrides: Record<string, unknown> = {}) {
  return {
    content_type: "thought_leadership",
    drafts: goodCopy,
    visual_asset: {
      required: true,
      png_sha256: "a".repeat(64),
      png_b64_path: "/tmp/callscore-live-receipts-card.png.base64.txt",
      svg_path: "/tmp/callscore-live-receipts-card.svg",
      alt_text: "CallScore live snapshot: raw calls, price-backed, ranked creators. Creator calls should have receipts.",
    },
    ...overrides,
  };
}

describe("CallScore social content quality gate regressions", () => {
  test("thought_leadership with generic evidence card visual fails", () => {
    const result = runGate(baseDraft());
    assert.notEqual(result.code, 0, JSON.stringify(result.parsed));
    assert.ok(result.parsed.failures.includes("thought_leadership_generic_scorecard_visual_banned"), JSON.stringify(result.parsed));
  });

  test("thought_leadership with generic scorecard visual fails", () => {
    const result = runGate(baseDraft({
      visual_asset: {
        required: true,
        png_sha256: "b".repeat(64),
        alt_text: "Generic scorecard showing raw counts and ranked creators card",
      },
    }));
    assert.notEqual(result.code, 0, JSON.stringify(result.parsed));
    assert.ok(result.parsed.failures.includes("thought_leadership_generic_scorecard_visual_banned"), JSON.stringify(result.parsed));
  });

  test("LinkedIn thought_leadership without media proof fails", () => {
    const result = runGate(baseDraft({
      visual_asset: {
        required: true,
        png_sha256: "c".repeat(64),
        svg_path: "/tmp/product-specific-editorial-visual.svg",
        alt_text: "Product-specific editorial proof visual",
      },
      provider_payloads: {
        linkedin: { commentary: goodCopy.linkedin.exact_copy, visibility: "PUBLIC", lifecycleState: "PUBLISHED" },
      },
    }));
    assert.notEqual(result.code, 0, JSON.stringify(result.parsed));
    assert.ok(result.parsed.failures.includes("linkedin_thought_leadership_media_missing"), JSON.stringify(result.parsed));
  });

  test("data snapshot may still use evidence scorecard visuals", () => {
    const result = runGate(baseDraft({ content_type: "data_snapshot" }));
    assert.equal(result.parsed.failures.includes("thought_leadership_generic_scorecard_visual_banned"), false, JSON.stringify(result.parsed));
  });
});
