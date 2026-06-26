import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

const guardModulePath = "../src/lib/workplane/" + "external-mutation-guard";

type GuardDecision = {
  readonly allowed: boolean;
  readonly blocker_code?: string;
  readonly provider_call_permitted?: boolean;
  readonly receipt?: {
    readonly status?: string;
    readonly provider_mutation_performed?: boolean;
    readonly public_publish_performed?: boolean;
    readonly external_url?: string | null;
    readonly external_object_id?: string | null;
    readonly provider_response?: unknown;
  };
};

type GuardModule = {
  evaluateExternalMutationRequest: (input: Record<string, unknown>) => GuardDecision | Promise<GuardDecision>;
  finalizeExternalMutationReceipt: (input: Record<string, unknown>) => GuardDecision | Promise<GuardDecision>;
};

async function loadGuard(): Promise<GuardModule> {
  return await import(guardModulePath) as GuardModule;
}

const graphContext = {
  operating_graph_run_id: "graph-run-001",
  graph_node_id: "x_owned_publish_node",
  goal: "revenue_now",
  platform: "x",
  mutation_family: "public_publish",
  acting_agent_id: "callscore-x-head",
  authority: "owned_public_publish",
  approved_payload_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  dry_run: false,
  parent_receipt_id: "receipt-parent-001",
};

async function expectBlocked(input: Record<string, unknown>, blockerCode: string): Promise<void> {
  const guard = await loadGuard();
  const decision = await guard.evaluateExternalMutationRequest(input);
  assert.equal(decision.allowed, false);
  assert.equal(decision.blocker_code, blockerCode);
  assert.equal(decision.provider_call_permitted, false);
}

describe("graph-only external mutation guard RED contract", () => {
  test("draft_only cannot mutate external platform", async () => {
    await expectBlocked({
      mode: "draft_only",
      graph_context: graphContext,
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      mutation_flags: { external_mutation_performed: true, public_publish_performed: true },
    }, "draft_only_external_mutation_blocked");
  });

  test("approved_publish without approval cannot mutate", async () => {
    await expectBlocked({
      mode: "approved_publish",
      graph_context: graphContext,
      approved: false,
      approval_receipt_id: null,
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
    }, "approval_missing");
  });

  test("missing graph context blocks provider adapters before provider call", async () => {
    await expectBlocked({
      mode: "approved_publish",
      graph_context: null,
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
    }, "missing_operating_graph_context");
  });

  test("Gmail and Resend sends block without graph context and policy gate", async () => {
    for (const platform of ["gmail", "resend"] as const) {
      await expectBlocked({
        mode: "bounded_write",
        graph_context: null,
        approved: false,
        requested_action: "send_or_outreach",
        platform,
        provider_tool: platform === "gmail" ? "GMAIL_SEND_EMAIL" : "RESEND_SEND_EMAIL",
      }, "non_graph_email_send_blocked");
    }
  });

  test("Whop mutation blocks without graph context and approval", async () => {
    await expectBlocked({
      mode: "bounded_write",
      graph_context: null,
      approved: false,
      requested_action: "whop_mutation",
      platform: "whop",
      provider_tool: "WHOP_UPDATE_PRODUCT",
    }, "non_graph_whop_mutation_blocked");
  });

  test("Attio and PostHog writes block without graph context", async () => {
    for (const platform of ["attio", "posthog"] as const) {
      await expectBlocked({
        mode: "bounded_write",
        graph_context: null,
        approved: false,
        requested_action: "provider_mutation",
        platform,
        provider_tool: platform === "attio" ? "ATTIO_CREATE_RECORD" : "POSTHOG_CAPTURE_EVENT",
      }, "non_graph_crm_write_blocked");
    }
  });

  test("published URL or object ID cannot exist while mutation flags are false", async () => {
    await expectBlocked({
      mode: "approved_publish",
      graph_context: graphContext,
      approved: true,
      approval_receipt_id: "approval-001",
      provider_response: { id: "post-123", url: "https://x.com/callscore/status/post-123" },
      mutation_flags: { external_mutation_performed: false, provider_mutation_performed: false, public_publish_performed: false },
    }, "external_object_id_without_mutation_flag");
  });

  test("mutation flags become true only after provider success", async () => {
    await expectBlocked({
      mode: "approved_publish",
      graph_context: graphContext,
      approved: true,
      approval_receipt_id: "approval-001",
      provider_response: { ok: false, error: "provider rejected payload" },
      mutation_flags: { external_mutation_performed: true, provider_mutation_performed: true, public_publish_performed: true },
    }, "provider_success_required_before_mutation_flags");
  });

  test("provider failure writes failed receipt instead of success", async () => {
    const guard = await loadGuard();
    const decision = await guard.finalizeExternalMutationReceipt({
      mode: "approved_publish",
      graph_context: graphContext,
      approved: true,
      approval_receipt_id: "approval-001",
      provider_response: { ok: false, error: "429 rate limited" },
      parent_receipt_id: "receipt-parent-001",
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.receipt?.status, "failed");
    assert.equal(decision.receipt?.provider_mutation_performed, false);
    assert.equal(decision.receipt?.public_publish_performed, false);
    assert.deepEqual(decision.receipt?.provider_response, { ok: false, error: "429 rate limited" });
  });
});


describe("review-fail regression coverage for full mutation contract", () => {
  test("draft_only cannot permit provider call even before mutation flags are true", async () => {
    await expectBlocked({
      mode: "draft_only",
      graph_context: graphContext,
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      mutation_flags: { external_mutation_performed: false, provider_mutation_performed: false, public_publish_performed: false },
    }, "draft_only_external_mutation_blocked");
  });

  test("mutation flags cannot be true without provider response proof", async () => {
    await expectBlocked({
      mode: "approved_publish",
      graph_context: { ...graphContext, approval_receipt_id: "approval-001", evidence_receipt_id: "evidence-001", originality_receipt_id: "originality-001" },
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      mutation_flags: { external_mutation_performed: true, provider_mutation_performed: true, public_publish_performed: true },
    }, "provider_success_required_before_mutation_flags");
  });

  test("platform and provider tool must match graph context route", async () => {
    await expectBlocked({
      mode: "approved_publish",
      graph_context: { ...graphContext, platform: "linkedin", graph_node_id: "linkedin_owned_publish_node", approval_receipt_id: "approval-001", evidence_receipt_id: "evidence-001", originality_receipt_id: "originality-001" },
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
    }, "graph_context_platform_mismatch");

    await expectBlocked({
      mode: "approved_publish",
      graph_context: { ...graphContext, approval_receipt_id: "approval-001", evidence_receipt_id: "evidence-001", originality_receipt_id: "originality-001" },
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "LINKEDIN_CREATE_LINKED_IN_POST",
    }, "provider_tool_platform_mismatch");
  });

  test("public publish requires evidence and originality receipts", async () => {
    await expectBlocked({
      mode: "approved_publish",
      graph_context: { ...graphContext, approval_receipt_id: "approval-001" },
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
    }, "evidence_originality_receipts_required");
  });

  test("successful mutation receipt carries full traceability contract", async () => {
    const guard = await loadGuard();
    const fullContext = { ...graphContext, approval_receipt_id: "approval-001", evidence_receipt_id: "evidence-001", originality_receipt_id: "originality-001" };
    const decision = await guard.finalizeExternalMutationReceipt({
      mode: "approved_publish",
      graph_context: fullContext,
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ok: true, id: "post-123", url: "https://x.com/callscore/status/post-123" },
      mutation_flags: { external_mutation_performed: true, provider_mutation_performed: true, public_publish_performed: true },
      parent_receipt_id: "receipt-parent-001",
      provider_execution_receipt_id: "provider-receipt-001",
      child_receipt_ids: ["provider-receipt-001"],
    });

    const receipt = decision.receipt as Record<string, unknown> | undefined;
    assert.equal(decision.allowed, true);
    assert.equal(receipt?.status, "ok");
    assert.ok(receipt?.receipt_id);
    assert.equal(receipt?.operating_graph_run_id, fullContext.operating_graph_run_id);
    assert.equal(receipt?.graph_node_id, fullContext.graph_node_id);
    assert.equal(receipt?.goal, fullContext.goal);
    assert.equal(receipt?.platform, fullContext.platform);
    assert.equal(receipt?.acting_agent_id, fullContext.acting_agent_id);
    assert.equal(receipt?.authority, fullContext.authority);
    assert.equal(receipt?.approval_receipt_id, fullContext.approval_receipt_id);
    assert.equal(receipt?.evidence_receipt_id, fullContext.evidence_receipt_id);
    assert.equal(receipt?.originality_receipt_id, fullContext.originality_receipt_id);
    assert.equal(receipt?.approved_payload_hash, fullContext.approved_payload_hash);
    assert.equal(receipt?.dry_run, false);
    assert.equal(receipt?.provider_tool, "TWITTER_CREATION_OF_A_POST");
    assert.equal(receipt?.parent_receipt_id, "receipt-parent-001");
    assert.deepEqual(receipt?.child_receipt_ids, ["provider-receipt-001"]);
    assert.equal(receipt?.external_object_id, "post-123");
  });
});


describe("second-review regression coverage", () => {
  test("dry_run and monitor cannot permit provider mutation calls", async () => {
    for (const mode of ["dry_run", "monitor"] as const) {
      await expectBlocked({
        mode,
        graph_context: { ...graphContext, approval_receipt_id: "approval-001", evidence_receipt_id: "evidence-001", originality_receipt_id: "originality-001" },
        approved: true,
        approval_receipt_id: "approval-001",
        requested_action: "publish_owned_public",
        platform: "x",
        provider_tool: "TWITTER_CREATION_OF_A_POST",
      }, "non_graph_external_mutation_blocked");
    }
  });

  test("final successful receipt requires provider execution receipt and payload hash match", async () => {
    const guard = await loadGuard();
    const fullContext = { ...graphContext, approval_receipt_id: "approval-001", evidence_receipt_id: "evidence-001", originality_receipt_id: "originality-001", approved_payload_hash: "sha256:dbe36250874edf6a4e85b4b20d309a8739e46f06ff693aa2eb3aaa3cbeec4e5e" };
    const base = {
      mode: "approved_publish",
      graph_context: fullContext,
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_payload: { text: "hello graph" },
      provider_response: { ok: true, id: "post-123", url: "https://x.com/callscore/status/post-123" },
      mutation_flags: { external_mutation_performed: true, provider_mutation_performed: true, public_publish_performed: true },
      parent_receipt_id: "receipt-parent-001",
      child_receipt_ids: ["provider-receipt-001"],
    };

    const missingExecution = await guard.finalizeExternalMutationReceipt(base);
    assert.equal(missingExecution.allowed, false);
    assert.equal(missingExecution.blocker_code, "provider_execution_receipt_required");

    const ok = await guard.finalizeExternalMutationReceipt({ ...base, provider_execution_receipt_id: "provider-receipt-001" });
    assert.equal(ok.allowed, true);
    assert.equal((ok.receipt as Record<string, unknown>).provider_execution_receipt_id, "provider-receipt-001");
    assert.deepEqual((ok.receipt as Record<string, unknown>).provider_response, base.provider_response);
  });

  test("approved payload hash must match provider payload", async () => {
    await expectBlocked({
      mode: "approved_publish",
      graph_context: { ...graphContext, approval_receipt_id: "approval-001", evidence_receipt_id: "evidence-001", originality_receipt_id: "originality-001", approved_payload_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_payload: { text: "hello graph" },
    }, "approved_payload_hash_mismatch");
  });
});


describe("third-review receipt lineage regressions", () => {
  test("ExternalMutationReceiptSchema rejects ok receipts with null lineage", async () => {
    const schemas = await import("../src/lib/workplane/external-mutation-schemas");
    assert.equal(schemas.ExternalMutationReceiptSchema.safeParse({
      receipt_id: "external-mutation-forged",
      status: "ok",
      provider_mutation_performed: true,
      public_publish_performed: true,
    }).success, false);
  });

  test("finalizer requires provider execution receipt to appear in child lineage", async () => {
    const guard = await loadGuard();
    const fullContext = {
      ...graphContext,
      approval_receipt_id: "approval-001",
      evidence_receipt_id: "evidence-001",
      originality_receipt_id: "originality-001",
      approved_payload_hash: "sha256:4eda0211c2f0a7861ca663e2fe56a0a05400e2a6688b86d6a8cae90273a6b637",
    };
    const decision = await guard.finalizeExternalMutationReceipt({
      mode: "approved_publish",
      graph_context: fullContext,
      approved: true,
      approval_receipt_id: "approval-001",
      requested_action: "publish_owned_public",
      platform: "x",
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_payload: { text: "approved" },
      provider_response: { ok: true, id: "post-123", url: "https://x.com/callscore/status/post-123" },
      provider_execution_receipt_id: "provider-exec-001",
      child_receipt_ids: [],
      mutation_flags: { external_mutation_performed: true, provider_mutation_performed: true, public_publish_performed: true },
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.blocker_code, "provider_execution_receipt_required");
  });
});
