/**
 * cmo-campaign-schemas.ts — Zod validation schemas for the CMO campaign
 * LangGraph orchestration layer.
 *
 * Every specialist receipt, channel review receipt, and campaign receipt
 * is validated at runtime boundaries with strict schemas.
 */
import { z } from "zod";

// ── Shared primitives ──

const IsoTimestampSchema = z.string().datetime({ offset: true });
const NonEmptyStringSchema = z.string().trim().min(1);

// ── Specialist receipt ──

export const CmoSpecialistReceiptSchema = z.object({
  schema_version: z.literal("callscore_cmo_specialist_receipt.v1"),
  receipt_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  campaign_id: NonEmptyStringSchema,
  channel: NonEmptyStringSchema,
  agent_id: NonEmptyStringSchema,
  authority: NonEmptyStringSchema,
  decision: NonEmptyStringSchema,
  dry_run: z.literal(true),
  external_mutation_performed: z.literal(false),
  send_or_outreach_performed: z.literal(false),
  provider_mutation_performed: z.literal(false),
  whop_mutation_performed: z.literal(false),
  production_mutation_performed: z.literal(false),
  parent_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  detail: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type CmoSpecialistReceipt = z.infer<typeof CmoSpecialistReceiptSchema>;

// ── Channel review receipt ──

export const CmoChannelReviewReceiptSchema = z.object({
  schema_version: z.literal("callscore_cmo_channel_review_receipt.v1"),
  receipt_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  campaign_id: NonEmptyStringSchema,
  channel: NonEmptyStringSchema,
  channel_head_agent_id: NonEmptyStringSchema,
  specialist_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  decision_count: z.number().int().nonnegative(),
  dry_run: z.literal(true),
  external_mutation_performed: z.literal(false),
  send_or_outreach_performed: z.literal(false),
  provider_mutation_performed: z.literal(false),
  whop_mutation_performed: z.literal(false),
  production_mutation_performed: z.literal(false),
  parent_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  summary: NonEmptyStringSchema,
  detail: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type CmoChannelReviewReceipt = z.infer<typeof CmoChannelReviewReceiptSchema>;

// ── Campaign receipt (CMO-level) ──

export const CmoCampaignReceiptSchema = z.object({
  schema_version: z.literal("callscore_cmo_campaign_receipt.v1"),
  receipt_id: NonEmptyStringSchema,
  created_at: IsoTimestampSchema,
  campaign_id: NonEmptyStringSchema,
  cmo_agent_id: NonEmptyStringSchema,
  channel_review_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  total_specialist_decisions: z.number().int().nonnegative(),
  dry_run: z.literal(true),
  external_mutation_performed: z.literal(false),
  send_or_outreach_performed: z.literal(false),
  provider_mutation_performed: z.literal(false),
  whop_mutation_performed: z.literal(false),
  production_mutation_performed: z.literal(false),
  parent_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  summary: NonEmptyStringSchema,
  detail: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type CmoCampaignReceipt = z.infer<typeof CmoCampaignReceiptSchema>;
