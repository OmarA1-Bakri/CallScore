import * as assert from "node:assert/strict";
import { test, describe } from "node:test";

// RED — these imports will fail until we create the module
import {
  CmoSpecialistReceiptSchema,
  CmoChannelReviewReceiptSchema,
  CmoCampaignReceiptSchema,
  type CmoSpecialistReceipt,
  type CmoChannelReviewReceipt,
  type CmoCampaignReceipt,
} from "../src/lib/autonomy/cmo-campaign-schemas";

const now = "2026-06-25T12:00:00.000Z";

function makeSpecialistReceipt(overrides: Partial<CmoSpecialistReceipt> = {}): CmoSpecialistReceipt {
  return {
    schema_version: "callscore_cmo_specialist_receipt.v1",
    receipt_id: "sr-test-001",
    created_at: now,
    campaign_id: "campaign-test-001",
    channel: "x",
    agent_id: "callscore-x-posting-agent",
    authority: "draft_artifact",
    decision: "act",
    dry_run: true as const,
    external_mutation_performed: false as const,
    send_or_outreach_performed: false as const,
    provider_mutation_performed: false as const,
    whop_mutation_performed: false as const,
    production_mutation_performed: false as const,
    parent_receipt_ids: [],
    detail: { decision_id: "d-test-1", reason_codes: ["safe_owned_public_evidence_complete"] },
    ...overrides,
  };
}

function makeChannelReviewReceipt(overrides: Partial<CmoChannelReviewReceipt> = {}): CmoChannelReviewReceipt {
  return {
    schema_version: "callscore_cmo_channel_review_receipt.v1",
    receipt_id: "crr-test-001",
    created_at: now,
    campaign_id: "campaign-test-001",
    channel: "x",
    channel_head_agent_id: "callscore-x-head",
    specialist_receipt_ids: ["sr-test-001", "sr-test-002"],
    decision_count: 2,
    dry_run: true as const,
    external_mutation_performed: false as const,
    send_or_outreach_performed: false as const,
    provider_mutation_performed: false as const,
    whop_mutation_performed: false as const,
    production_mutation_performed: false as const,
    parent_receipt_ids: [],
    summary: "Channel x review: 2 specialist decisions processed.",
    detail: { specialist_jobs: ["callscore-x-posting-agent:act", "callscore-x-analytics-agent:draft"] },
    ...overrides,
  };
}

function makeCampaignReceipt(overrides: Partial<CmoCampaignReceipt> = {}): CmoCampaignReceipt {
  return {
    schema_version: "callscore_cmo_campaign_receipt.v1",
    receipt_id: "campaign-rec-001",
    created_at: now,
    campaign_id: "campaign-test-001",
    cmo_agent_id: "callscore-cmo-head",
    channel_review_receipt_ids: ["crr-x-001", "crr-linkedin-001", "crr-reddit-001"],
    total_specialist_decisions: 15,
    dry_run: true as const,
    external_mutation_performed: false as const,
    send_or_outreach_performed: false as const,
    provider_mutation_performed: false as const,
    whop_mutation_performed: false as const,
    production_mutation_performed: false as const,
    parent_receipt_ids: [],
    summary: "Campaign campaign-test-001: 15 specialist decisions across 3 channels.",
    detail: { channels_processed: ["x", "linkedin", "reddit"] },
    ...overrides,
  };
}

describe("CmoSpecialistReceiptSchema", () => {
  test("validates a correct specialist receipt", () => {
    const data = makeSpecialistReceipt();
    const result = CmoSpecialistReceiptSchema.parse(data);
    assert.equal(result.receipt_id, "sr-test-001");
    assert.equal(result.campaign_id, "campaign-test-001");
    assert.equal(result.channel, "x");
    assert.equal(result.dry_run, true);
    assert.equal(result.external_mutation_performed, false);
  });

  test("rejects unknown keys", () => {
    const data = { ...makeSpecialistReceipt(), unknown_field: "should_fail" };
    const result = CmoSpecialistReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });

  test("rejects missing required fields", () => {
    const data = { ...makeSpecialistReceipt() };
    delete (data as Record<string, unknown>).receipt_id;
    const result = CmoSpecialistReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });

  test("rejects mutation flag set to true in dry-run", () => {
    const data = makeSpecialistReceipt({ external_mutation_performed: true as never });
    const result = CmoSpecialistReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });

  test("rejects dry_run set to false", () => {
    const data = makeSpecialistReceipt({ dry_run: false as never });
    const result = CmoSpecialistReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });
});

describe("CmoChannelReviewReceiptSchema", () => {
  test("validates a correct channel review receipt", () => {
    const data = makeChannelReviewReceipt();
    const result = CmoChannelReviewReceiptSchema.parse(data);
    assert.equal(result.receipt_id, "crr-test-001");
    assert.equal(result.campaign_id, "campaign-test-001");
    assert.equal(result.channel, "x");
    assert.equal(result.decision_count, 2);
    assert.equal(result.dry_run, true);
  });

  test("rejects unknown keys", () => {
    const data = { ...makeChannelReviewReceipt(), extra: true };
    const result = CmoChannelReviewReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });

  test("rejects mutation flag set to true", () => {
    const data = makeChannelReviewReceipt({ whop_mutation_performed: true as never });
    const result = CmoChannelReviewReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });
});

describe("CmoCampaignReceiptSchema", () => {
  test("validates a correct campaign receipt", () => {
    const data = makeCampaignReceipt();
    const result = CmoCampaignReceiptSchema.parse(data);
    assert.equal(result.receipt_id, "campaign-rec-001");
    assert.equal(result.campaign_id, "campaign-test-001");
    assert.equal(result.total_specialist_decisions, 15);
    assert.equal(result.dry_run, true);
  });

  test("rejects unknown keys", () => {
    const data = { ...makeCampaignReceipt(), garbage: "data" };
    const result = CmoCampaignReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });

  test("rejects send_or_outreach_performed set to true", () => {
    const data = makeCampaignReceipt({ send_or_outreach_performed: true as never });
    const result = CmoCampaignReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });

  test("rejects negative total_specialist_decisions", () => {
    const data = makeCampaignReceipt({ total_specialist_decisions: -1 as never });
    const result = CmoCampaignReceiptSchema.safeParse(data);
    assert.equal(result.success, false);
  });
});
