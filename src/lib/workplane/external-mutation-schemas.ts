import { z } from "zod";

import { ActionAuthority } from "../autonomy/action-authority";
import {
  DEFAULT_OPERATING_MUTATION_FLAGS,
  MutationFlagsSchema,
} from "./operating-graph-schemas";

const NonEmptyStringSchema = z.string().trim().min(1);
const Sha256HashSchema = z.string().trim().regex(/^sha256:[a-f0-9]{64}$/);

export const ExternalMutationPlatformSchema = z.enum([
  "x",
  "linkedin",
  "reddit",
  "youtube",
  "gmail",
  "resend",
  "whop",
  "attio",
  "posthog",
  "unknown",
]);

export const ExternalMutationFamilySchema = z.enum([
  "public_publish",
  "video_publish",
  "video_update",
  "public_engagement",
  "email_send",
  "whop_mutation",
  "crm_write",
  "analytics_write",
  "alert_send",
  "provider_mutation",
]);

export const ExternalMutationModeSchema = z.enum([
  "draft_only",
  "approved_publish",
  "live_owned_public",
  "bounded_write",
  "dry_run",
  "monitor",
]);

export const ExternalMutationBlockerCodeSchema = z.enum([
  "missing_operating_graph_context",
  "draft_only_external_mutation_blocked",
  "approval_missing",
  "external_object_id_without_mutation_flag",
  "provider_success_required_before_mutation_flags",
  "graph_context_platform_mismatch",
  "provider_tool_platform_mismatch",
  "evidence_originality_receipts_required",
  "provider_execution_receipt_required",
  "provider_external_object_required",
  "approved_payload_hash_mismatch",
  "payload_missing",
  "target_missing",
  "provider_call_failed",
  "non_graph_external_mutation_blocked",
  "non_graph_publish_blocked",
  "non_graph_video_publish_blocked",
  "non_graph_email_send_blocked",
  "non_graph_whop_mutation_blocked",
  "non_graph_crm_write_blocked",
  "non_graph_alert_send_blocked",
  "non_graph_reddit_mutation_blocked",
  "non_graph_youtube_mutation_blocked",
]);

export const OperatingGraphMutationContextSchema = z.object({
  operating_graph_run_id: NonEmptyStringSchema,
  graph_node_id: NonEmptyStringSchema,
  goal: NonEmptyStringSchema,
  platform: ExternalMutationPlatformSchema,
  mutation_family: ExternalMutationFamilySchema,
  acting_agent_id: NonEmptyStringSchema,
  authority: z.enum(ActionAuthority),
  approval_receipt_id: NonEmptyStringSchema.optional(),
  approved_payload_hash: Sha256HashSchema,
  evidence_receipt_id: NonEmptyStringSchema.optional(),
  originality_receipt_id: NonEmptyStringSchema.optional(),
  provider_execution_receipt_id: NonEmptyStringSchema.optional(),
  dry_run: z.literal(false),
  parent_receipt_id: NonEmptyStringSchema.optional(),
}).passthrough();

export const ProviderResponseSchema = z.object({}).catchall(z.unknown());

export const ExternalMutationGuardRequestSchema = z.object({
  mode: ExternalMutationModeSchema.optional(),
  graph_context: OperatingGraphMutationContextSchema.nullable().optional(),
  requested_action: NonEmptyStringSchema.optional(),
  platform: ExternalMutationPlatformSchema.optional(),
  provider_tool: NonEmptyStringSchema.optional(),
  approved: z.boolean().optional(),
  approval_receipt_id: NonEmptyStringSchema.nullable().optional(),
  provider_response: ProviderResponseSchema.optional(),
  provider_payload: z.unknown().optional(),
  mutation_flags: MutationFlagsSchema.default(DEFAULT_OPERATING_MUTATION_FLAGS),
  parent_receipt_id: NonEmptyStringSchema.optional(),
  child_receipt_ids: z.array(NonEmptyStringSchema).default([]),
  provider_execution_receipt_id: NonEmptyStringSchema.optional(),
}).passthrough();

export type ExternalMutationGuardRequest = z.infer<typeof ExternalMutationGuardRequestSchema>;
export type OperatingGraphMutationContext = z.infer<typeof OperatingGraphMutationContextSchema>;
export type ExternalMutationBlockerCode = z.infer<typeof ExternalMutationBlockerCodeSchema>;

export const ExternalMutationReceiptSchema = z.object({
  receipt_id: NonEmptyStringSchema,
  status: z.enum(["ok", "blocked", "failed"]),
  blocker_code: ExternalMutationBlockerCodeSchema.optional(),
  goal: NonEmptyStringSchema.nullable().default(null),
  platform: ExternalMutationPlatformSchema.nullable().default(null),
  acting_agent_id: NonEmptyStringSchema.nullable().default(null),
  authority: z.enum(ActionAuthority).nullable().default(null),
  approval_receipt_id: NonEmptyStringSchema.nullable().default(null),
  evidence_receipt_id: NonEmptyStringSchema.nullable().default(null),
  originality_receipt_id: NonEmptyStringSchema.nullable().default(null),
  approved_payload_hash: Sha256HashSchema.nullable().default(null),
  dry_run: z.boolean().nullable().default(null),
  provider_tool: NonEmptyStringSchema.nullable().default(null),
  provider_mutation_performed: z.boolean().default(false),
  public_publish_performed: z.boolean().default(false),
  public_engagement_performed: z.boolean().default(false),
  external_url: NonEmptyStringSchema.nullable().default(null),
  external_object_id: NonEmptyStringSchema.nullable().default(null),
  provider_response: z.unknown().optional(),
  provider_execution_receipt_id: NonEmptyStringSchema.nullable().default(null),
  operating_graph_run_id: NonEmptyStringSchema.nullable().default(null),
  graph_node_id: NonEmptyStringSchema.nullable().default(null),
  parent_receipt_id: NonEmptyStringSchema.nullable().default(null),
  child_receipt_ids: z.array(NonEmptyStringSchema).default([]),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.status !== "ok") return;
  const required: Array<keyof typeof receipt> = [
    "goal",
    "platform",
    "acting_agent_id",
    "authority",
    "approved_payload_hash",
    "dry_run",
    "provider_tool",
    "provider_execution_receipt_id",
    "operating_graph_run_id",
    "graph_node_id",
    "parent_receipt_id",
  ];
  for (const key of required) {
    if (receipt[key] === null || receipt[key] === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "ok external mutation receipts require full lineage" });
    }
  }
  if (receipt.public_publish_performed && (!receipt.evidence_receipt_id || !receipt.originality_receipt_id)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["evidence_receipt_id"], message: "ok public publish receipts require evidence and originality lineage" });
  }
  if (receipt.provider_execution_receipt_id && !receipt.child_receipt_ids.includes(receipt.provider_execution_receipt_id)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["child_receipt_ids"], message: "ok external mutation receipts must link provider execution receipt as child" });
  }
  if (receipt.provider_response === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["provider_response"], message: "ok external mutation receipts require provider response proof" });
  }
});

export type ExternalMutationReceipt = z.infer<typeof ExternalMutationReceiptSchema>;
