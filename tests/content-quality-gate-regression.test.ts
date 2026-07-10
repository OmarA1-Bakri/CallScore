import * as assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";

const gate = "/srv/agents/hermes/scripts/callscore-content-quality-gate.py";
const gateExists = existsSync(gate);

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

describe("CallScore social content quality gate regressions", { skip: !gateExists }, () => {
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

  test("public-facing draft or test disclaimer fails", () => {
    const result = runGate(baseDraft({
      drafts: {
        x: {
          exact_copy: "This week, crypto trust debates keep stopping at disclosure. DRAFT TEST ONLY: CallScore tracked a BTC call with a timestamp and outcome.",
          growth_mechanics: goodCopy.x.growth_mechanics,
        },
        linkedin: {
          exact_copy: "This week, crypto trust debates keep stopping at disclosure. DRAFT TEST ONLY: CallScore tracked a BTC call with a timestamp, entry zone, and outcome window.",
          growth_mechanics: goodCopy.linkedin.growth_mechanics,
        },
      },
      visual_asset: {
        required: true,
        png_sha256: "d".repeat(64),
        svg_path: "/tmp/product-specific-editorial-visual.svg",
        alt_text: "Product-specific editorial proof visual",
      },
    }));

    assert.notEqual(result.code, 0, JSON.stringify(result.parsed));
    assert.ok(result.parsed.failures.includes("public_draft_disclaimer_blocked"), JSON.stringify(result.parsed));
  });

  test("thought leadership clipped mock visual metadata fails", () => {
    const result = runGate(baseDraft({
      visual_asset: {
        required: true,
        png_sha256: "e".repeat(64),
        title: "Local SVG preview with clipped headline",
        alt_text: "Mock preview card. Headline clipped at the right edge. Not a production render.",
        render_status: "clipped",
      },
    }));

    assert.notEqual(result.code, 0, JSON.stringify(result.parsed));
    assert.ok(result.parsed.failures.includes("thought_leadership_clipped_or_mock_visual_banned"), JSON.stringify(result.parsed));
  });

  test("thought leadership render_status clipped fails even when title and alt text are clean", () => {
    const result = runGate(baseDraft({
      visual_asset: {
        required: true,
        png_sha256: "f".repeat(64),
        title: "Product-specific editorial proof render",
        alt_text: "CallScore product screenshot showing a creator call trail with timestamp and outcome window.",
        render_status: "clipped",
      },
    }));

    assert.notEqual(result.code, 0, JSON.stringify(result.parsed));
    assert.ok(result.parsed.failures.includes("thought_leadership_clipped_or_mock_visual_banned"), JSON.stringify(result.parsed));
  });

  test("single-channel LinkedIn first-person I think hook is recognized as opinion", () => {
    const copy = "I think most crypto creator vetting fails at the handoff between teams.\n\nRecent reporting makes the split hard to ignore. The operating question is whether attention, incentives, and reconstructable outcomes are joined into one auditable decision.";
    const result = runGate({
      single_channel_correction: true,
      channel: "linkedin",
      content_type: "thought_leadership",
      drafts: {
        linkedin: {
          exact_copy: copy,
          growth_mechanics: { media_plan: "image", cta: "Ask which ledger is missing", target_entities: ["crypto partnership teams"] },
        },
      },
      visual_asset: {
        required: true,
        png_sha256: "9".repeat(64),
        png_path: "/tmp/three-ledger-partnership-gate.png",
        alt_text: "Three evidence ledgers feed one partnership approval decision, with an unknown outcome withholding approval.",
      },
      provider_payloads: {
        linkedin: { images: ["/tmp/three-ledger-partnership-gate.png"] },
      },
    });

    assert.equal(result.code, 0, JSON.stringify(result.parsed));
    assert.equal(result.parsed.ok, true, JSON.stringify(result.parsed));
  });
});
