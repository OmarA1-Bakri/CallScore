import * as assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const PROFILE = "/srv/agents/hermes/profiles/callscore";
const POLICY_DIR = join(PROFILE, "policies");
const GATE_DIR = join(PROFILE, "gates");
const CONTROLLER_DIR = join(PROFILE, "orchestrators", "public-gtm-autopilot");
const CONTROLLER = join(CONTROLLER_DIR, "controller.py");

function readJson(path: string): any {
  assert.equal(existsSync(path), true, `${path} must exist`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function runController(fixture = "green", channels = "x,linkedin,youtube") {
  assert.equal(existsSync(CONTROLLER), true, `${CONTROLLER} must exist`);
  const outDir = mkdtempSync(join(tmpdir(), "public-gtm-autopilot-test-"));
  const result = spawnSync("python3", [CONTROLLER, "--dry-run", "--fixture", fixture, "--channels", channels, "--out", outDir], {
    cwd: "/opt/crypto-tuber-ranked",
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const reportPath = join(outDir, "FINAL_REPORT.json");
  return readJson(reportPath);
}

test("autopilot_policy_loaded.test", () => {
  const policy = readJson(join(POLICY_DIR, "callscore-public-gtm-autopilot-policy.json"));
  assert.equal(policy.policy_name, "callscore_public_gtm_autopilot_v1");
  assert.equal(policy.standing_operator_approval.operator, "Omar");
  assert.equal(policy.standing_operator_approval.standing_approval, true);
  assert.equal(policy.standing_operator_approval.approval_scope, "owned_public_marketing_outputs");
  assert.equal(policy.standing_operator_approval.mode, "policy_bound_autopilot");
  assert.equal(policy.standing_operator_approval.human_approval_required_per_artifact, false);
});

test("x_autopublish_green_gate.test", () => {
  const matrix = readJson(join(POLICY_DIR, "channel-autonomy-matrix.json"));
  const gate = readJson(join(GATE_DIR, "x-publication-gate.json"));
  assert.equal(matrix.channels.x.autopublish.enabled, true);
  assert.equal(matrix.channels.x.human_approval_per_post, false);
  assert.equal(gate.channel, "x");
  assert.equal(gate.human_approval_required_per_artifact, false);
  assert.ok(gate.required_checks.includes("provider_specific_dry_run_or_preflight"));
  assert.ok(gate.required_checks.includes("final_provider_mutation_receipt_after_publish"));
});

test("linkedin_autopublish_green_gate.test", () => {
  const matrix = readJson(join(POLICY_DIR, "channel-autonomy-matrix.json"));
  const gate = readJson(join(GATE_DIR, "linkedin-publication-gate.json"));
  assert.equal(matrix.channels.linkedin.autopublish.enabled, true);
  assert.equal(matrix.channels.linkedin.human_approval_per_post, false);
  assert.ok(gate.required_checks.includes("linkedin_native_copy"));
  assert.ok(gate.required_checks.includes("not_direct_x_reuse"));
  assert.ok(gate.required_checks.includes("data_window_freshness_label"));
});

test("youtube_autopublish_green_gate.test", () => {
  const matrix = readJson(join(POLICY_DIR, "channel-autonomy-matrix.json"));
  const gate = readJson(join(GATE_DIR, "youtube-publication-gate.json"));
  assert.equal(matrix.channels.youtube.autopublish.enabled, true);
  assert.equal(matrix.channels.youtube.human_approval_per_video, false);
  for (const check of ["remotion_render_only", "cartesia_omar_voice", "callscore_signal_music", "external_srt_vtt_captions", "graph_owned_upload", "no_reused_mp4", "no_ffmpeg_drawtext_production_fallback"]) {
    assert.ok(gate.required_checks.includes(check), `${check} required`);
  }
});

test("youtube_candidate_consistency_required.test", () => {
  const gate = readJson(join(GATE_DIR, "youtube-publication-gate.json"));
  assert.ok(gate.fail_closed_if.includes("selected_call_mismatch"));
  assert.ok(gate.fail_closed_if.includes("stale_cross_call_contamination"));
  assert.ok(gate.fail_closed_if.includes("youtube_mp4_not_original_to_selected_call"));
});

test("no_manual_artifact_approval_required_for_green_outputs.test", () => {
  const report = runController("green", "x,linkedin,youtube");
  for (const channel of ["x", "linkedin", "youtube"]) {
    const decision = report.channel_decisions.find((item: any) => item.channel === channel);
    assert.ok(decision, `${channel} decision missing`);
    assert.equal(decision.decision, "GREEN_AUTO_PUBLISH");
    assert.equal(decision.human_approval_required_per_artifact, false);
  }
});

test("red_outputs_fail_closed.test", () => {
  const report = runController("unsafe_hardcoded", "x,linkedin,youtube");
  for (const decision of report.channel_decisions) {
    assert.equal(["RED_ESCALATE", "BLOCKED_FAIL_CLOSED"].includes(decision.decision), true);
    assert.equal(decision.published, false);
    assert.match(decision.blocker, /hardcoded|unsafe|credential|freshness|missing/i);
  }
});

test("email_autosend_approved_creator_universe_gate.test", () => {
  const matrix = readJson(join(POLICY_DIR, "channel-autonomy-matrix.json"));
  const cadence = readJson(join(POLICY_DIR, "public-gtm-cadence-policy.json"));
  const gate = readJson(join(GATE_DIR, "email-publication-gate.json"));
  assert.equal(matrix.channels.email_partnership.autosend.enabled, true);
  assert.equal(matrix.channels.email_partnership.draft_only_until_approved_recipient_policy, false);
  assert.equal(cadence.email_partnership.enabled, true);
  assert.equal(cadence.email_partnership.public_send_without_drafts, true);
  assert.ok(gate.required_checks.includes("approved_creator_universe_membership"));
  assert.ok(gate.required_checks.includes("attio_contact_assertion_before_send"));
  assert.ok(gate.required_checks.includes("post_send_crm_communication_log"));
  assert.ok(gate.required_checks.includes("email_voice_standard"));
  assert.ok(gate.fail_closed_if.includes("recipient_not_in_approved_creator_universe"));
  assert.ok(gate.fail_closed_if.includes("crm_contact_assertion_missing"));
});

test("crm_provider_must_be_attio_via_composio.test", () => {
  const policy = readJson(join(POLICY_DIR, "callscore-public-gtm-autopilot-policy.json"));
  const crmGate = readJson(join(GATE_DIR, "attio-crm-composio-gate.json"));
  const emailGate = readJson(join(GATE_DIR, "email-publication-gate.json"));
  const engagementGate = readJson(join(GATE_DIR, "social-engagement-publication-gate.json"));
  assert.equal(policy.crm_provider_enforcement.crm, "Attio");
  assert.equal(policy.crm_provider_enforcement.provider, "Composio MCP");
  assert.equal(policy.crm_provider_enforcement.connection_status, "ACTIVE");
  assert.equal(policy.crm_provider_enforcement.matching_attribute_for_people, "email_addresses");
  assert.ok(policy.crm_provider_enforcement.allowed_tool_slugs.includes("ATTIO_ASSERT_PERSON"));
  assert.ok(policy.crm_provider_enforcement.allowed_tool_slugs.includes("ATTIO_CREATE_NOTE"));
  assert.ok(policy.crm_provider_enforcement.forbidden_paths.includes("direct_attio_http_api_from_parent_shell"));
  assert.equal(crmGate.schema, "callscore.crm_provider_gate.v1");
  assert.equal(crmGate.crm, "Attio");
  assert.equal(crmGate.provider, "Composio MCP");
  assert.equal(crmGate.active_connection_verified, true);
  assert.equal(crmGate.read_only_schema_probe.unique_writable_person_matching_attribute, "email_addresses");
  assert.ok(emailGate.required_checks.includes("attio_via_composio_only"));
  assert.ok(engagementGate.required_checks.includes("attio_via_composio_only"));
  assert.ok(emailGate.fail_closed_if.includes("crm_write_attempted_outside_attio_composio"));
  assert.ok(engagementGate.fail_closed_if.includes("attio_composio_receipt_missing"));
});

test("whop_payment_mutation_requires_separate_approval.test", () => {
  const matrix = readJson(join(POLICY_DIR, "channel-autonomy-matrix.json"));
  const cadence = readJson(join(POLICY_DIR, "public-gtm-cadence-policy.json"));
  const gate = readJson(join(GATE_DIR, "whop-commercial-publication-gate.json"));
  assert.equal(matrix.channels.whop_commercial.payment_customer_entitlement_mutation, false);
  assert.equal(cadence.whop_commercial.payment_customer_entitlement_mutation, false);
  assert.ok(gate.fail_closed_if.includes("payment_customer_entitlement_mutation_requested"));
  assert.ok(gate.human_approval_required_for.includes("payment_customer_entitlement_mutation"));
});

test("no_hardcoded_public_content_autopilot.test", () => {
  const policy = readJson(join(POLICY_DIR, "callscore-public-gtm-autopilot-policy.json"));
  assert.equal(policy.core_invariant, "Agents author. Scripts conduct. Graph hands off. Receipts prove lineage. Policy decides whether to publish.");
  assert.equal(policy.prohibitions.scripts_author_public_content, true);
  assert.equal(policy.prohibitions.hardcoded_public_content, true);
  const source = readFileSync(CONTROLLER, "utf8");
  assert.doesNotMatch(source, /exact_copy\s*=\s*["'`][^"'`]{20,}/);
  assert.doesNotMatch(source, /CallScore helps you compare crypto creators/i);
});

test("data_freshness_required_for_public_claims.test", () => {
  const freshness = readJson(join(POLICY_DIR, "public-data-freshness-gates.json"));
  for (const gate of ["website_leaderboard_updated_at", "latest_scored_call_date", "latest_scored_video_published_date", "latest_transcript_ingested_date", "pending_transcript_backlog_count", "data_window_used", "copy_visual_claim_alignment"]) {
    assert.ok(freshness.required_gates.includes(gate), `${gate} required`);
  }
  assert.ok(freshness.hard_fail_if.includes("data_through_date_missing"));
  assert.ok(freshness.hard_fail_if.includes("public_data_claims_do_not_match_source_artifacts"));
});

test("provider_receipt_required_after_publish.test", () => {
  for (const file of ["x-publication-gate.json", "linkedin-publication-gate.json", "youtube-publication-gate.json", "reddit-community-publication-gate.json", "email-publication-gate.json", "whop-commercial-publication-gate.json"]) {
    const gate = readJson(join(GATE_DIR, file));
    assert.ok(gate.required_checks.includes("provider_specific_dry_run_or_preflight"), `${file} missing provider preflight`);
    assert.ok(gate.required_checks.includes("final_provider_mutation_receipt_after_publish"), `${file} missing final provider receipt`);
    assert.ok(gate.required_outputs.includes("provider_mutation_receipt"), `${file} missing provider_mutation_receipt output`);
  }
});
