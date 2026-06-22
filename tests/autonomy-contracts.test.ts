import test from "node:test";
import assert from "node:assert/strict";
import {
  AutonomyReceiptSchema,
  ChannelHeadActionSchema,
  ChannelHeadDecisionSchema,
  ChannelHeadInputSnapshotSchema,
  FreshCallDiscoveryEventSchema,
  NonFounderReviewItemSchema,
  RiskClassSchema,
  SentinelRunReceiptSchema,
  TrustDecisionSchema,
} from "../src/lib/autonomy/contracts";
import {
  buildAutonomyReceipt,
  hashAutonomyReceipt,
  parseAutonomyReceipt,
} from "../src/lib/autonomy/receipts";

const now = "2026-06-21T10:00:00.000Z";
const later = "2026-06-21T10:05:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;
const gateReceiptId = "gate-receipt-1";

const goodInputSnapshot = {
  schema_version: "callscore_channel_head_input_snapshot.v1",
  snapshot_id: "snapshot-1",
  created_at: now,
  agent_id: "callscore-x-linkedin-growth-head",
  channel_id: "owned_social",
  autonomy_mode: "full_autonomous_bounded",
  soul_version: "souls.v1",
  policy_version: "policy.v1",
  workplane: {
    status: "OK",
    checked_at: now,
    blockers: [],
  },
  gtm_registry: {
    lane_id: "owned-social",
    current_status: "ready",
    required_gate: "NONE",
    owned_or_managed: true,
    zero_spend_required: true,
    allowed_actions: ["draft", "publish_owned_public"],
    forbidden_actions: ["dm", "paid_spend"],
  },
  freshness: {
    status: "fresh",
    claim_bearing_allowed: true,
    latest_pipeline_run_id: "pipeline-1",
    blockers: [],
  },
  evidence: {
    evidence_level: "E3",
    evidence_hash: hash,
    source_artifact_ids: ["artifact-1"],
    public_claims_supported: true,
  },
  kill_switch: {
    global_active: false,
    channel_active: false,
    agent_paused: false,
    missing_state_blocks_dispatch: true,
  },
  heartbeat: {
    heartbeat_id: "heartbeat-1",
    fresh: true,
    lease_expires_at: later,
  },
  cooldowns: {
    channel_cooldown_active: false,
    provider_error_cooldown_active: false,
    duplicate_payload_cooldown_active: false,
  },
  caps: {
    channel_posts_today: 0,
    max_channel_posts_per_day: 1,
    total_posts_today: 0,
    max_total_posts_per_day: 3,
    external_mutations_in_flight: 0,
    max_external_mutations_in_flight: 1,
  },
  public_verify: {
    status: "pass",
    checked_at: now,
  },
  prior_receipt_ids: [],
};

const goodSafeAction = {
  schema_version: "callscore_channel_head_action.v1",
  action_id: "action-1",
  created_at: now,
  agent_id: "callscore-x-linkedin-growth-head",
  channel_id: "owned_social",
  action_type: "publish_owned_public",
  risk_class: "safe_owned_public",
  dry_run: false,
  external_mutation_requested: true,
  external_mutation_performed: false,
  restricted_gate_required: null,
  gate_receipt_id: null,
  payload_hash: hash,
  evidence_hash: hash,
  idempotency_key: "owned_social:action-1",
  parent_receipt_ids: [],
  rollback_path: "docs/ops/rollback.md",
  provider: null,
  provider_operation: null,
  reason: "owned public post has supporting evidence and passed policy",
  metadata: { campaign: "sentinel" },
};

const goodDecision = {
  schema_version: "callscore_channel_head_decision.v1",
  decision_id: "decision-1",
  created_at: now,
  agent_id: "callscore-x-linkedin-growth-head",
  channel_id: "owned_social",
  task_id: "task-1",
  input_snapshot_id: "snapshot-1",
  risk_class: "safe_owned_public",
  decision: "act",
  confidence: 0.91,
  reason_codes: ["fresh_evidence", "owned_public_channel"],
  explanation: "Evidence is fresh and action stays on owned public channel.",
  proposed_action: goodSafeAction,
  gate_required: null,
  gate_receipt_id: null,
  non_founder_review_required: false,
  suppress_until: null,
  wait_until: null,
  blockers: [],
  receipts_to_write: ["receipt-1"],
  next_wake_at: later,
};

const goodFreshCallEvent = {
  schema_version: "callscore_fresh_call_discovery_event.v1",
  event_id: "fresh-event-1",
  created_at: now,
  source: "youtube_rss",
  creator_id: "creator-1",
  creator_handle: "@creator",
  video_id: "video-1",
  youtube_video_id: "yt-1",
  published_at: now,
  transcript_status: "ready",
  candidate_call_count: 2,
  evidence_level: "E2",
  dedupe_key: "youtube_rss:creator-1:yt-1:callscore_fresh_call_discovery_event.v1",
  payload_hash: hash,
  cooldown: { active: false, reason: null, until: null },
  decision: "enqueue_extract",
  reason_codes: ["new_video"],
};

const goodSentinelReceipt = {
  schema_version: "callscore_sentinel_run_receipt.v1",
  receipt_id: "sentinel-receipt-1",
  created_at: now,
  sentinel_id: "fresh-call-sentinel",
  mode: "read_only",
  input_hash: hash,
  events_seen: 4,
  events_new: 1,
  events_duplicate: 2,
  events_cooldown_blocked: 1,
  tasks_enqueued: 0,
  production_mutation_performed: false,
  provider_mutation_performed: false,
  external_send_performed: false,
  cooldowns_respected: true,
  dedupe_keys: ["key-1"],
  blocker: null,
  artifact_path: ".tmp/workflow-receipts/sentinel/run.json",
};

const goodTrustDecision = {
  schema_version: "callscore_trust_decision.v1",
  decision_id: "trust-1",
  created_at: now,
  entity_type: "call",
  entity_id: "call-1",
  risk_class: "safe_owned_public",
  decision: "publish",
  confidence: 0.95,
  evidence_level: "E4",
  evidence_hash: hash,
  gate_receipt_id: null,
  suppress_from_public_scoring: false,
  public_visibility_allowed: true,
  non_founder_review_required: false,
  founder_review_required: false,
  reason_codes: ["quote_verified"],
  reviewer_role: "none",
  expires_at: null,
  source_artifact_ids: ["artifact-1"],
};

const goodReviewItem = {
  schema_version: "callscore_non_founder_review_item.v1",
  review_item_id: "review-1",
  created_at: now,
  queue: "trust_ops",
  reviewer_role: "trust_ops_reviewer",
  entity_type: "call",
  entity_id: "call-1",
  risk_class: "public_claim_risk",
  due_at: later,
  expires_at: "2026-06-22T10:00:00.000Z",
  reconsider_after: later,
  trust_decision_id: "trust-1",
  artifact_ids: ["artifact-1"],
  evidence: [{
    artifact_id: "artifact-1",
    evidence_type: "workflow_artifact",
    uri: "workflow://workflow-run-1/artifacts/artifact-1",
    summary: "Ambiguous evidence packet for non-founder trust review.",
    hash,
  }],
  reason_codes: ["medium_confidence_non_founder_review"],
  recommended_action: "request_more_evidence",
  source_workflow: "video_intelligence_workflow",
  source_workflow_run_id: "workflow-run-1",
  source_run_id: "pipeline-run-1",
  payload_hash: hash,
  allowed_reviewer_actions: ["approve_publish", "keep_suppressed"],
  founder_escalation_allowed: false,
  restricted_action_gate_required: null,
  status: "open",
  external_send_performed: false,
  provider_mutation_performed: false,
  whop_mutation_performed: false,
  production_mutation_performed: false,
};

const goodReceipt = {
  schema_version: "callscore_autonomy_receipt.v1",
  receipt_id: "receipt-1",
  created_at: now,
  agent_id: "callscore-x-linkedin-growth-head",
  channel_id: "owned_social",
  run_id: "run-1",
  task_id: "task-1",
  receipt_type: "decision",
  status: "succeeded",
  risk_class: "safe_owned_public",
  payload_hash: hash,
  evidence_hash: hash,
  policy_version: "policy.v1",
  soul_version: "souls.v1",
  dry_run: false,
  external_mutation_performed: false,
  provider_mutation_performed: false,
  whop_mutation_performed: false,
  production_mutation_performed: false,
  send_or_outreach_performed: false,
  gate_required: null,
  gate_receipt_id: null,
  idempotency_key: "receipt-1",
  parent_receipt_ids: [],
  artifact_path: ".tmp/workflow-receipts/autonomy/receipt-1.json",
  rollback_path: "docs/ops/rollback.md",
  summary: "Validated safe owned-public autonomy decision.",
  detail: { decision_id: "decision-1" },
};

test("autonomy Zod schemas validate canonical good fixtures", () => {
  assert.equal(RiskClassSchema.parse("restricted_provider"), "restricted_provider");
  assert.equal(NonFounderReviewItemSchema.safeParse({ ...goodReviewItem, risk_class: "high" }).success, false);
  assert.equal(ChannelHeadInputSnapshotSchema.parse(goodInputSnapshot).snapshot_id, "snapshot-1");
  assert.equal(ChannelHeadActionSchema.parse(goodSafeAction).action_id, "action-1");
  assert.equal(ChannelHeadDecisionSchema.parse(goodDecision).decision, "act");
  assert.equal(FreshCallDiscoveryEventSchema.parse(goodFreshCallEvent).decision, "enqueue_extract");
  assert.equal(SentinelRunReceiptSchema.parse(goodSentinelReceipt).receipt_id, "sentinel-receipt-1");
  assert.equal(TrustDecisionSchema.parse(goodTrustDecision).decision, "publish");
  assert.equal(NonFounderReviewItemSchema.parse(goodReviewItem).founder_escalation_allowed, false);
  assert.equal(AutonomyReceiptSchema.parse(goodReceipt).receipt_id, "receipt-1");
  assert.equal(parseAutonomyReceipt(goodReceipt).receipt_id, "receipt-1");
});

test("channel-head decision schema rejects malformed decision enums", () => {
  const result = ChannelHeadDecisionSchema.safeParse({ ...goodDecision, decision: "go" });

  assert.equal(result.success, false);
});

test("publish and act decisions require concrete payload and evidence hashes", () => {
  assert.equal(TrustDecisionSchema.safeParse({ ...goodTrustDecision, evidence_hash: null }).success, false);

  const actionWithoutEvidence = { ...goodSafeAction, evidence_hash: null };
  assert.equal(ChannelHeadActionSchema.safeParse(actionWithoutEvidence).success, false);
  assert.equal(
    ChannelHeadDecisionSchema.safeParse({ ...goodDecision, proposed_action: actionWithoutEvidence }).success,
    false,
  );

  const draftActionWithoutEvidence = {
    ...goodSafeAction,
    action_type: "draft",
    payload_hash: null,
    evidence_hash: null,
  };
  assert.equal(ChannelHeadActionSchema.safeParse(draftActionWithoutEvidence).success, false);
  assert.equal(
    ChannelHeadDecisionSchema.safeParse({ ...goodDecision, proposed_action: draftActionWithoutEvidence }).success,
    false,
  );
});

test("restricted risk classes cannot act or publish without explicit gate evidence", () => {
  const restrictedActionWithoutGate = {
    ...goodSafeAction,
    risk_class: "restricted_provider",
    restricted_gate_required: "PRODUCTION_GATE",
    gate_receipt_id: null,
  };
  assert.equal(ChannelHeadActionSchema.safeParse(restrictedActionWithoutGate).success, false);
  assert.equal(
    ChannelHeadDecisionSchema.safeParse({
      ...goodDecision,
      risk_class: "restricted_provider",
      proposed_action: restrictedActionWithoutGate,
      gate_required: "PRODUCTION_GATE",
      gate_receipt_id: null,
    }).success,
    false,
  );
  assert.equal(
    ChannelHeadDecisionSchema.safeParse({
      ...goodDecision,
      risk_class: "safe_owned_public",
      proposed_action: restrictedActionWithoutGate,
      gate_required: null,
      gate_receipt_id: null,
    }).success,
    false,
  );

  const restrictedTrustWithoutGate = {
    ...goodTrustDecision,
    risk_class: "restricted_financial",
    gate_receipt_id: null,
  };
  assert.equal(TrustDecisionSchema.safeParse(restrictedTrustWithoutGate).success, false);

  const restrictedTrustWithGate = {
    ...restrictedTrustWithoutGate,
    gate_receipt_id: gateReceiptId,
  };
  assert.equal(TrustDecisionSchema.safeParse(restrictedTrustWithGate).success, true);
});

test("trust decisions enforce fail-closed public visibility and review routing invariants", () => {
  assert.equal(TrustDecisionSchema.safeParse({ ...goodTrustDecision, suppress_from_public_scoring: true }).success, false);
  assert.equal(
    TrustDecisionSchema.safeParse({
      ...goodTrustDecision,
      decision: "suppress",
      suppress_from_public_scoring: true,
      public_visibility_allowed: true,
    }).success,
    false,
  );
  assert.equal(
    TrustDecisionSchema.safeParse({
      ...goodTrustDecision,
      decision: "review",
      suppress_from_public_scoring: true,
      public_visibility_allowed: true,
      non_founder_review_required: true,
      reviewer_role: "none",
    }).success,
    false,
  );
  assert.equal(
    TrustDecisionSchema.safeParse({
      ...goodTrustDecision,
      risk_class: "public_claim_risk",
      evidence_level: "E0",
      source_artifact_ids: [],
      gate_receipt_id: null,
    }).success,
    false,
  );
});

test("autonomy receipt blocks restricted mutations without explicit gate evidence", () => {
  assert.equal(
    AutonomyReceiptSchema.safeParse({
      ...goodReceipt,
      risk_class: "restricted_credentials",
      dry_run: false,
      provider_mutation_performed: true,
      gate_required: "SECRET_GATE",
      gate_receipt_id: null,
    }).success,
    false,
  );

  assert.equal(
    AutonomyReceiptSchema.safeParse({
      ...goodReceipt,
      risk_class: "restricted_credentials",
      dry_run: false,
      provider_mutation_performed: true,
      gate_required: "SECRET_GATE",
      gate_receipt_id: gateReceiptId,
    }).success,
    true,
  );

  assert.equal(
    AutonomyReceiptSchema.safeParse({
      ...goodReceipt,
      risk_class: "safe_owned_public",
      dry_run: false,
      production_mutation_performed: true,
      gate_receipt_id: null,
    }).success,
    false,
  );
});

test("autonomy receipt schema rejects secret-like detail keys", () => {
  const result = AutonomyReceiptSchema.safeParse({
    ...goodReceipt,
    detail: {
      decision_id: "decision-1",
      api_key: "placeholder-value",
    },
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.message, /secret-like detail keys/i);
  }
});

test("autonomy receipt builder can redact secret-like detail keys before parsing", () => {
  const receipt = buildAutonomyReceipt({
    ...goodReceipt,
    receipt_id: "receipt-redacted",
    idempotency_key: "receipt-redacted",
    detail: {
      safe_detail: "visible",
      nested: {
        token: "placeholder-value",
        kept: true,
      },
    },
  }, { secretDetailHandling: "redact" });

  assert.equal(receipt.detail.safe_detail, "visible");
  assert.deepEqual(receipt.detail.nested, { token: "[REDACTED]", kept: true });
  assert.equal(parseAutonomyReceipt(receipt).receipt_id, "receipt-redacted");
});

test("autonomy receipt hash is deterministic and order-insensitive for object keys", () => {
  const first = buildAutonomyReceipt({
    ...goodReceipt,
    receipt_id: "receipt-hash",
    idempotency_key: "receipt-hash",
    detail: { alpha: 1, nested: { beta: 2, gamma: 3 } },
  });
  const second = buildAutonomyReceipt({
    ...goodReceipt,
    receipt_id: "receipt-hash",
    idempotency_key: "receipt-hash",
    detail: { nested: { gamma: 3, beta: 2 }, alpha: 1 },
  });

  assert.equal(hashAutonomyReceipt(first), hashAutonomyReceipt(second));
  assert.match(hashAutonomyReceipt(first), /^sha256:[a-f0-9]{64}$/);
});

test("autonomy receipt builder preserves parent receipt chain order", () => {
  const receipt = buildAutonomyReceipt({
    ...goodReceipt,
    receipt_id: "receipt-parent-chain",
    idempotency_key: "receipt-parent-chain",
    parent_receipt_ids: ["root-receipt", "review-receipt", "gate-receipt"],
  });

  assert.deepEqual(receipt.parent_receipt_ids, ["root-receipt", "review-receipt", "gate-receipt"]);
});

test("autonomy receipt builder rejects dry-run receipts that claim a mutation", () => {
  assert.throws(
    () => buildAutonomyReceipt({
      ...goodReceipt,
      receipt_id: "receipt-dry-run-mutation",
      idempotency_key: "receipt-dry-run-mutation",
      dry_run: true,
      external_mutation_performed: true,
      gate_receipt_id: gateReceiptId,
    }),
    /mutation receipts cannot be dry_run/,
  );
});
