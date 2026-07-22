import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  WORKPLANE_JOB_SPECS,
  WORKPLANE_JOB_TYPES,
  canonicalLocalModelForWorkplanePayload,
  canonicalShadowExecutionConfig,
  canonicalTranscriptRecoveryRunConfig,
  evaluateArtOfWarCampaignWithLocalModel,
  getWorkplaneJobSpec,
  mergeTranscriptRecoveryEvidence,
  buildTranscriptRecoveryReplayEvidence,
  readTranscriptRecoveryAudit,
  runWorkplaneJob,
  summarizeTranscriptRecoveryRecords,
  transcriptRecoveryJournalMutationCount,
  validateTranscriptRecoveryMutationJournal,
  workflowReceiptIsValidForRun,
} from "../src/lib/workplane-jobs";
import { PipelineDispatchJobTypeSchema } from "../src/lib/workplane/operating-graph-schemas";
import {
  buildReadinessDomains,
  chooseStatusNextAction,
  decideNextAutonomousAction,
  summarizePublicArtifactReadiness,
  latestArtOfWarCampaignReceipt,
  latestGemmaShadowArtifact,
  latestGemmaCapacityPreflightArtifact,
  latestMlEvalArtifact,
  latestMlVerifierQualityGateArtifact,
  readCollectorCooldownState,
  workplaneJobModelForStatus,
} from "../src/lib/workplane-status";

test("workplane job specs cover required Hermes surfaces with safe defaults", () => {
  for (const required of [
    "transcript_collect_laptop",
    "transcript_ingest_result",
    "transcript_recover_hh",
    "local_model_shadow_extract",
    "gemma_shadow_extract",
    "ml_extraction_eval",
    "ml_idle_improve",
    "extraction_promotion_review",
    "loop_engineering_eval",
    "whop_provider_health",
    "whop_plan_inventory_check",
    "whop_entitlement_sync_dry_run",
    "whop_webhook_replay_safe",
    "whop_customer_status_check",
    "whop_activation_review",
    "artofwar_strategy_brief",
    "artofwar_content_queue_dry_run",
    "artofwar_campaign_plan_generate",
    "artofwar_audience_research_dry_run",
    "artofwar_outreach_queue_prepare",
    "artofwar_publish_approval_review",
    "artofwar_owned_public_execution",
    "artofwar_spend_approval_review",
    "artofwar_campaign_preflight",
    "artofwar_campaign_iteration",
    "artofwar_campaign_verify",
    "artofwar_campaign_persona_test",
    "artofwar_campaign_dry_run",
    "artofwar_campaign_local_model_eval",
    "artofwar_campaign_gemma_eval",
    "artofwar_campaign_receipt",
    "artofwar_campaign_dossier",
    "artofwar_campaign_approval_review",
    "automation_registry_refresh",
    "automation_dry_run",
    "automation_health_check",
    "automation_activation_review",
  ]) {
    assert.equal((WORKPLANE_JOB_TYPES as readonly string[]).includes(required), true, required);
  }

  const collector = getWorkplaneJobSpec("transcript_collect_laptop");
  assert.equal(collector.execution_location, "Omar laptop");
  assert.equal(collector.max_batch_size, 5);
  assert.equal(collector.concurrency, 1);
  assert.equal(collector.production_db_writes_allowed, true);
  assert.equal(collector.production_call_writes_allowed, false);
  assert.equal(collector.public_ranking_impact_allowed, false);
  assert.match(collector.cooldown_policy, /12-24h/);
  assert.match(collector.default_safe_command, /-Workplane/);
  assert.ok(collector.failure_classification.includes("collector_tool_error"));

  const localModel = getWorkplaneJobSpec("local_model_shadow_extract");
  assert.equal(localModel.execution_location, "HH");
  assert.equal(localModel.max_batch_size, 10);
  assert.equal(localModel.production_db_writes_allowed, false);
  assert.equal(localModel.production_call_writes_allowed, false);
  assert.match(localModel.default_safe_command, /qwen3:4b-instruct-2507-q4_K_M/);
  assert.equal(getWorkplaneJobSpec("gemma_shadow_extract").default_safe_command, localModel.default_safe_command);
  assert.equal(PipelineDispatchJobTypeSchema.safeParse("local_model_shadow_extract").success, true);
  assert.equal(PipelineDispatchJobTypeSchema.safeParse("artofwar_campaign_local_model_eval").success, true);
  assert.match(getWorkplaneJobSpec("artofwar_campaign_local_model_eval").output_artifact, /artofwar_campaign_local_model_eval/);
  assert.match(getWorkplaneJobSpec("artofwar_campaign_gemma_eval").output_artifact, /artofwar_campaign_gemma_eval/);

  const ingest = getWorkplaneJobSpec("transcript_ingest_result");
  assert.equal(ingest.production_db_writes_allowed, true);
  assert.equal(ingest.production_call_writes_allowed, false);

  const recovery = getWorkplaneJobSpec("transcript_recover_hh");
  assert.equal(recovery.execution_location, "HH");
  assert.equal(recovery.max_batch_size, 9);
  assert.equal(recovery.concurrency, 1);
  assert.equal(recovery.production_db_writes_allowed, true);
  assert.equal(recovery.production_call_writes_allowed, false);
  assert.ok(recovery.failure_classification.includes("mutation_conflict"));
  assert.match(recovery.default_safe_command, /hh_ytdlp_ejs_wpc/);
  assert.match(recovery.default_safe_command, /--youtube-video-ids/);
  assert.match(recovery.default_safe_command, /--force-targeted-retry/);
  assert.ok(recovery.failure_classification.includes("bot_verification_required"));
  assert.ok(recovery.failure_classification.includes("js_challenge_runtime_missing"));

  const whop = getWorkplaneJobSpec("whop_plan_inventory_check");
  assert.equal(whop.production_db_writes_allowed, false);
  assert.equal(whop.production_call_writes_allowed, false);
  assert.match(whop.default_safe_command, /workplane:status/);

  const art = getWorkplaneJobSpec("artofwar_publish_approval_review");
  assert.equal(art.public_ranking_impact_allowed, false);
  assert.match(art.cooldown_policy, /not applicable/);
});

test("canonical local-model execution ignores caller-controlled model, host, and output payloads", () => {
  assert.equal(canonicalLocalModelForWorkplanePayload({ model: "gemma4:latest" }), "qwen3:4b-instruct-2507-q4_K_M");
  const config = canonicalShadowExecutionConfig({
    run_id: "safe-canary",
    model: "gemma4:latest",
    ollama_host: "https://unreviewed.example.test",
    shadow_out: "/tmp/unreviewed.jsonl",
    limit: 999,
    num_predict: 99999,
  });
  assert.equal(config.model, "qwen3:4b-instruct-2507-q4_K_M");
  assert.equal(config.ollama_host, "http://127.0.0.1:11434");
  assert.equal(config.shadow_out, "/tmp/callscore-shadow-extractions/safe-canary.jsonl");
  assert.equal(config.limit, "10");
  assert.equal(config.num_predict, "1024");
  assert.throws(() => canonicalShadowExecutionConfig({ run_id: "../escape" }), /safe identifier allowlist/);
});

test("Art of War local-model evaluator calls loopback Ollama with exact canonical Qwen3", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  let requestRedirect: RequestRedirect | undefined;
  const evaluation = await evaluateArtOfWarCampaignWithLocalModel(
    { campaign_id: "campaign-1", claim: "Receipts beat vibes", audience: "crypto operators", cta: "Inspect the evidence" },
    async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      requestRedirect = init?.redirect;
      return new Response(JSON.stringify({
        model: "qwen3:4b-instruct-2507-q4_K_M",
        response: JSON.stringify({
          claim_risk: "low",
          cta_risk: "low",
          trust_risk: "low",
          audience_fit: "strong",
          recommendation: "keep",
          confidence: 0.92,
        }),
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  );
  assert.equal(requestUrl, "http://127.0.0.1:11434/api/generate");
  assert.equal(requestBody.model, "qwen3:4b-instruct-2507-q4_K_M");
  assert.equal(requestRedirect, "error");
  assert.equal(evaluation.model, "qwen3:4b-instruct-2507-q4_K_M");
  assert.equal(evaluation.evaluation.recommendation, "keep");
});

test("Art of War evaluator rejects null and coercive confidence output", async () => {
  const responseFor = (value: unknown) => async () => new Response(JSON.stringify({
    model: "qwen3:4b-instruct-2507-q4_K_M",
    response: JSON.stringify(value),
  }), { status: 200 });
  await assert.rejects(
    evaluateArtOfWarCampaignWithLocalModel({}, responseFor(null)),
    /invalid JSON object/,
  );
  await assert.rejects(
    evaluateArtOfWarCampaignWithLocalModel({}, responseFor({
      claim_risk: ["low"], cta_risk: "low", trust_risk: "low", audience_fit: "strong", recommendation: "keep", confidence: 0.5,
    })),
    /schema validation/,
  );
  await assert.rejects(
    evaluateArtOfWarCampaignWithLocalModel({}, responseFor({
      claim_risk: "low", cta_risk: "low", trust_risk: "low", audience_fit: "strong", recommendation: "keep", confidence: "0.5",
    })),
    /schema validation/,
  );
});

test("Art of War evaluator emits a canonical success artifact without mutation authority", async () => {
  const runId = `artofwar-eval-success-${Date.now()}`;
  const artifact = `.tmp/workflow-receipts/artofwar_campaign_local_model_eval/${runId}.artifact.json`;
  const result = await runWorkplaneJob({
    id: 9000,
    run_id: 9000,
    type: "artofwar_campaign_local_model_eval",
    payload: { run_id: runId, model: "attacker-model", claim: "test" },
  } as never, {
    fetchImpl: async () => new Response(JSON.stringify({
      model: "qwen3:4b-instruct-2507-q4_K_M",
      response: JSON.stringify({ claim_risk: "low", cta_risk: "low", trust_risk: "low", audience_fit: "strong", recommendation: "keep", confidence: 0.8 }),
    }), { status: 200 }),
  });
  assert.equal(result.success, true);
  assert.equal(result.record_type, "LocalModelEvaluationReceipt");
  assert.equal(result.canonical_model, "qwen3:4b-instruct-2507-q4_K_M");
  assert.equal(result.requested_model_remapped, true);
  assert.equal(result.public_action_allowed, false);
  assert.equal(result.out, artifact);
  assert.notEqual(result.receipt_path, result.out);
  const persisted = JSON.parse(readFileSync(artifact, "utf8")) as Record<string, unknown>;
  assert.equal(persisted.record_type, "LocalModelEvaluationReceipt");
  assert.equal(persisted.decision, "local_model_evaluation_artifact_only");
  assert.equal(existsSync(String(result.receipt_path)), true);
  rmSync(artifact, { force: true });
  rmSync(String(result.receipt_path), { force: true });
});

test("Art of War evaluator does not relabel evidence-write failures as model failures", async () => {
  const runId = `artofwar-eval-write-failure-${Date.now()}`;
  const artifact = `.tmp/workflow-receipts/artofwar_campaign_local_model_eval/${runId}.artifact.json`;
  mkdirSync(artifact, { recursive: true });
  await assert.rejects(
    runWorkplaneJob({ id: 9002, run_id: 9002, type: "artofwar_campaign_local_model_eval", payload: { run_id: runId } } as never, {
      fetchImpl: async () => new Response(JSON.stringify({
        model: "qwen3:4b-instruct-2507-q4_K_M",
        response: JSON.stringify({ claim_risk: "low", cta_risk: "low", trust_risk: "low", audience_fit: "strong", recommendation: "keep", confidence: 0.8 }),
      }), { status: 200 }),
    }),
    /EISDIR|illegal operation on a directory/i,
  );
  rmSync(artifact, { recursive: true, force: true });
});

test("Art of War evaluator emits a blocked compatibility artifact and receipt on schema failure", async () => {
  const runId = `artofwar-eval-failure-${Date.now()}`;
  const artifact = `.tmp/workflow-receipts/artofwar_campaign_gemma_eval/${runId}.artifact.json`;
  const result = await runWorkplaneJob({
    id: 9001,
    run_id: 9001,
    type: "artofwar_campaign_gemma_eval",
    payload: { run_id: runId, model: "gemma4:latest", claim: "test" },
  } as never, {
    fetchImpl: async () => new Response(JSON.stringify({
      model: "qwen3:4b-instruct-2507-q4_K_M",
      response: "null",
    }), { status: 200 }),
  });
  assert.equal(result.success, false);
  assert.equal(result.failure_class, "invalid_model_output");
  assert.equal(result.record_type, "GemmaEvaluationReceipt");
  assert.equal(result.out, artifact);
  assert.equal(existsSync(artifact), true);
  assert.equal(typeof result.receipt_path, "string");
  assert.notEqual(result.receipt_path, result.out);
  const persisted = JSON.parse(readFileSync(artifact, "utf8")) as Record<string, unknown>;
  assert.equal(persisted.record_type, "GemmaEvaluationReceipt");
  assert.equal(persisted.result, "blocked");
  assert.equal(persisted.failure_class, "invalid_model_output");
  rmSync(artifact, { force: true });
  rmSync(String(result.receipt_path), { force: true });
});

test("transcript recovery reports only current-run requested-row DB mutations", () => {
  const summary = summarizeTranscriptRecoveryRecords([
    { run_id: "run-current", youtube_video_id: "VCbmPx1l7AU", status: "failed", reason: "no_captions", db_write_performed: true },
  ], true, ["VCbmPx1l7AU"], "run-current");
  assert.equal(summary.production_db_writes_performed, true);
  assert.equal(summary.db_rows_mutated, 1);
  assert.deepEqual(summary.blockers, ["no_captions"]);

  const conflict = summarizeTranscriptRecoveryRecords([
    { run_id: "run-current", youtube_video_id: "VCbmPx1l7AU", status: "mutation_conflict", reason: "mutation_conflict", db_write_performed: false },
  ], true, ["VCbmPx1l7AU"], "run-current");
  assert.equal(conflict.production_db_writes_performed, false);
  assert.deepEqual(conflict.blockers, ["mutation_conflict"]);

  const stale = summarizeTranscriptRecoveryRecords([
    { run_id: "run-prior", youtube_video_id: "VCbmPx1l7AU", status: "updated", db_write_performed: true },
  ], true, ["VCbmPx1l7AU"], "run-current");
  assert.equal(stale.production_db_writes_performed, false);
  assert.equal(stale.db_rows_mutated, 0);
  assert.deepEqual(stale.blockers, ["audit_record_mismatch"]);

  const config = canonicalTranscriptRecoveryRunConfig({ run_id: "run-current", audit_out: "/tmp/injected.jsonl" });
  assert.equal(config.audit_out, ".tmp/workflow-receipts/transcript_recover_hh/run-current.jsonl");
  assert.throws(() => canonicalTranscriptRecoveryRunConfig({ run_id: "../escape" }), /safe identifier allowlist/);

  const malformedPath = join(mkdtempSync(join(tmpdir(), "callscore-audit-reader-")), "audit.jsonl");
  writeFileSync(malformedPath, `${JSON.stringify({ run_id: "run-current", youtube_video_id: "VCbmPx1l7AU", status: "updated", db_write_performed: true })}\n{"broken":\n`);
  const preserved = summarizeTranscriptRecoveryRecords(readTranscriptRecoveryAudit(malformedPath), true, ["VCbmPx1l7AU"], "run-current");
  assert.equal(preserved.db_rows_mutated, 1);
  assert.equal(preserved.production_db_writes_performed, true);
  assert.deepEqual(preserved.blockers, ["audit_record_mismatch"]);
  rmSync(dirname(malformedPath), { recursive: true, force: true });
});

test("transcript recovery merges transactional DB journal evidence without double-counting", () => {
  const journal = [{
    run_id: "run-current",
    youtube_video_id: "VCbmPx1l7AU",
    status: "failed",
    reason: "no_captions",
    db_write_performed: true,
    evidence_source: "pipeline_job_transaction_journal",
  }];
  const journalOnly = mergeTranscriptRecoveryEvidence([], journal);
  assert.throws(
    () => validateTranscriptRecoveryMutationJournal([journal[0], "malformed"]),
    /mutation journal record is malformed/,
  );
  assert.throws(
    () => validateTranscriptRecoveryMutationJournal([{ ...journal[0], run_id: "", status: "" }]),
    /mutation journal record is malformed/,
  );
  const duplicateEvidence = buildTranscriptRecoveryReplayEvidence(
    [journal[0], { ...journal[0], reason: "no_captions" }],
    ["VCbmPx1l7AU"],
    "run-current",
    false,
  );
  assert.equal((duplicateEvidence.journal_records as unknown[]).length, 1);
  assert.throws(
    () => buildTranscriptRecoveryReplayEvidence([{ ...journal[0], reason: "x".repeat(400) }], ["VCbmPx1l7AU"], "run-current", false),
    /mutation journal record is malformed/,
  );
  assert.deepEqual(validateTranscriptRecoveryMutationJournal(journal), journal);
  const replayEvidence = buildTranscriptRecoveryReplayEvidence(journal, ["VCbmPx1l7AU"], "run-current", false);
  assert.equal(replayEvidence.production_db_writes_performed, true);
  assert.equal(replayEvidence.db_rows_mutated, 1);
  assert.equal(replayEvidence.recovered_from_transactional_journal, true);
  assert.equal(transcriptRecoveryJournalMutationCount([
    ...journal,
    ...journal,
    { ...journal[0], run_id: "foreign-run" },
    { ...journal[0], youtube_video_id: "lVLvnT4j9TU" },
  ], ["VCbmPx1l7AU"], "run-current"), 1);
  const recovered = summarizeTranscriptRecoveryRecords(journalOnly, true, ["VCbmPx1l7AU"], "run-current");
  assert.equal(recovered.production_db_writes_performed, true);
  assert.equal(recovered.db_rows_mutated, 1);

  const duplicateAudit = [
    { run_id: "run-current", youtube_video_id: "VCbmPx1l7AU", status: "failed", reason: "no_captions", db_write_performed: true },
    { run_id: "run-current", youtube_video_id: "VCbmPx1l7AU", status: "failed", reason: "no_captions", db_write_performed: true },
  ];
  const merged = mergeTranscriptRecoveryEvidence(duplicateAudit, journal);
  assert.equal(merged.length, 2);
  const duplicateSummary = summarizeTranscriptRecoveryRecords(merged, true, ["VCbmPx1l7AU"], "run-current");
  assert.equal(duplicateSummary.db_rows_mutated, 1);
  assert.deepEqual(duplicateSummary.blockers, ["audit_record_mismatch", "no_captions"]);
});

test("transcript recovery replay preserves the original workflow receipt", async () => {
  const runId = `transcript-replay-${Date.now()}`;
  const auditPath = `.tmp/workflow-receipts/transcript_recover_hh/${runId}.jsonl`;
  const receiptPath = `.tmp/workflow-receipts/transcript_recover_hh/${runId}.json`;
  mkdirSync(dirname(auditPath), { recursive: true });
  writeFileSync(auditPath, "", { mode: 0o600 });
  const originalReceiptObject = {
    run_id: runId,
    workflow_name: "transcript_recover_hh",
    started_at: "2026-07-22T00:00:00.000Z",
    finished_at: "2026-07-22T00:00:01.000Z",
    command: "bounded recovery",
    result: "passed",
    blockers: [],
    approval_evidence: null,
    next_action: "none",
  };
  writeFileSync(receiptPath, JSON.stringify(originalReceiptObject));
  assert.equal(workflowReceiptIsValidForRun(receiptPath, runId), false);
  writeFileSync(receiptPath, JSON.stringify({
    ...originalReceiptObject,
    evidence: {
      production_db_writes_performed: true,
      db_rows_mutated: 1,
      recovered_from_transactional_journal: true,
      source_run_id: runId,
      journal_records: [{ run_id: "foreign-run", youtube_video_id: "VCbmPx1l7AU", status: "updated", db_write_performed: true }],
    },
  }));
  assert.equal(workflowReceiptIsValidForRun(receiptPath, runId), false);
  const originalReceipt = JSON.stringify({
    ...originalReceiptObject,
    evidence: {
      production_db_writes_performed: false,
      db_rows_mutated: 0,
      recovered_from_transactional_journal: false,
      source_run_id: runId,
      journal_records: [],
    },
  });
  const partialReceiptPath = `.tmp/workflow-receipts/transcript_recover_hh/${runId}.partial.json`;
  writeFileSync(partialReceiptPath, JSON.stringify({ run_id: runId, result: "not-a-result" }));
  assert.equal(workflowReceiptIsValidForRun(partialReceiptPath, runId), false);
  writeFileSync(receiptPath, originalReceipt);
  assert.equal(workflowReceiptIsValidForRun(receiptPath, runId), true);
  const result = await runWorkplaneJob({
    id: 77123,
    run_id: 77123,
    type: "transcript_recover_hh",
    payload: { run_id: runId, youtube_video_ids: ["VCbmPx1l7AU"], write: false },
  } as never);
  assert.equal(readFileSync(receiptPath, "utf8"), originalReceipt);
  assert.equal(result.original_receipt_present, true);
  assert.equal(result.original_receipt_valid, true);
  assert.equal(result.original_receipt_overwritten, false);
  assert.notEqual(result.receipt_path, receiptPath);
  const replayReceipt = JSON.parse(readFileSync(String(result.receipt_path), "utf8"));
  assert.deepEqual(replayReceipt.evidence, {
    production_db_writes_performed: false,
    db_rows_mutated: 0,
    recovered_from_transactional_journal: false,
    source_run_id: runId,
    journal_records: [],
  });

  const receiptOnlyRunId = `transcript-replay-receipt-only-${Date.now()}`;
  const receiptOnlyPath = `.tmp/workflow-receipts/transcript_recover_hh/${receiptOnlyRunId}.json`;
  const receiptOnlyAuditPath = `.tmp/workplane-jobs/transcript_recover_hh/${receiptOnlyRunId}.jsonl`;
  const receiptOnlyBody = JSON.stringify({
    ...originalReceiptObject,
    run_id: receiptOnlyRunId,
    evidence: { ...JSON.parse(originalReceipt).evidence, source_run_id: receiptOnlyRunId },
  });
  writeFileSync(receiptOnlyPath, receiptOnlyBody);
  const receiptOnlyReplay = await runWorkplaneJob({
    id: 77124,
    run_id: 77124,
    type: "transcript_recover_hh",
    payload: { run_id: receiptOnlyRunId, youtube_video_ids: ["VCbmPx1l7AU"], write: false },
  } as never);
  assert.equal(existsSync(receiptOnlyAuditPath), false);
  assert.equal(readFileSync(receiptOnlyPath, "utf8"), receiptOnlyBody);
  assert.notEqual(receiptOnlyReplay.receipt_path, receiptOnlyPath);
  rmSync(auditPath, { force: true });
  rmSync(receiptPath, { force: true });
  rmSync(partialReceiptPath, { force: true });
  rmSync(String(result.receipt_path), { force: true });
  rmSync(receiptOnlyPath, { force: true });
  rmSync(String(receiptOnlyReplay.receipt_path), { force: true });
});

test("workplane status exposes all job specs as JSON-friendly records", () => {
  const rows = workplaneJobModelForStatus();
  assert.equal(rows.length, WORKPLANE_JOB_TYPES.length);
  assert.equal(rows.some((row) => row.type === "ml_idle_improve"), true);
  assert.equal(rows.every((row) => row.public_ranking_impact_allowed === false), true);
});

test("collector cooldown state handles missing, active, clear, and malformed files", () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-state-"));
  const now = new Date("2026-06-12T12:00:00.000Z");
  assert.equal(readCollectorCooldownState(null, now).status, "unknown");
  assert.equal(readCollectorCooldownState(join(dir, "missing.json"), now).status, "unknown");

  const active = join(dir, "active.json");
  writeFileSync(active, JSON.stringify({ cooldown_until_utc: "2026-06-12T20:00:00.000Z", cooldown_reason: "rate_limited", video_failures: { a: { reason: "rate_limited", failed_at_utc: "2026-06-12T11:00:00.000Z" } } }));
  const activeState = readCollectorCooldownState(active, now);
  assert.equal(activeState.status, "active");
  assert.equal(activeState.cooldown_reason, "rate_limited");
  assert.equal(activeState.latest_failure_reason, "rate_limited");
  assert.deepEqual(activeState.recent_failure_reasons, { rate_limited: 1 });

  const clear = join(dir, "clear.json");
  writeFileSync(clear, JSON.stringify({ cooldown_until_utc: "2026-06-12T01:00:00.000Z" }));
  assert.equal(readCollectorCooldownState(clear, now).status, "clear");

  const malformed = join(dir, "bad.json");
  writeFileSync(malformed, "not json");
  assert.equal(readCollectorCooldownState(malformed, now).status, "malformed");
});

test("artifact readers summarize Gemma shadow and ML reports without throwing on malformed files", () => {
  const dir = mkdtempSync(join(tmpdir(), "workplane-artifacts-"));
  const shadow = join(dir, "gemma-shadow-test.jsonl");
  writeFileSync(shadow, `${JSON.stringify({ record_type: "shadow_extraction", accepted_count: 0, error: "Ollama timed out" })}\n`);
  const shadowSummary = latestGemmaShadowArtifact(dir);
  assert.equal(shadowSummary.exists, true);
  assert.equal(shadowSummary.malformed, false);
  assert.deepEqual(shadowSummary.summary.errors, { timeout: 1 });

  const report = join(dir, "gemma-shadow-test.ml-idle-report.json");
  writeFileSync(report, JSON.stringify({ run_id: "ml", metrics: { shadow_records: 1 }, promotion_gate: { eligible_for_write_canary: false }, production_default_changed: false }));
  const mlSummary = latestMlEvalArtifact(dir);
  assert.equal(mlSummary.exists, true);
  assert.equal((mlSummary.summary.promotion_gate as Record<string, unknown>).eligible_for_write_canary, false);

  writeFileSync(join(dir, "z-gemma-shadow-bad.jsonl"), "not json");
  assert.equal(latestGemmaShadowArtifact(dir).malformed, true);
});

test("Gemma readiness trusts bounded shadow sample receipts and clean artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-gemma-shadow-receipt-"));
  const receiptDir = join(root, ".tmp", "workflow-receipts", "gemma_shadow_sample");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "gemma-laptop-batch3.json"), JSON.stringify({
    workflow_name: "gemma_shadow_sample",
    run_id: "gemma-laptop-batch3",
    result: "passed",
    artifact_path: ".tmp/shadow-extraction/gemma-laptop-batch3.jsonl",
    blockers: [],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "clear", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: 0, last_success_count: 0, last_failure_count: 0, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: ".tmp/shadow-extraction/gemma-laptop-batch3.jsonl", exists: true, modified_at: "now", malformed: false, summary: { rows: 5, accepted_calls: 1, errors: { none: 5 } } },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "none", reason: "test", job_type: "gemma_shadow_extract", allowed: true },
    now: new Date("2026-06-14T04:10:00.000Z"),
  });

  assert.equal(domains.local_model_shadow_extraction.status, "READY");
  assert.deepEqual(domains.local_model_shadow_extraction.blockers, []);
  assert.equal(domains.local_model_shadow_extraction.canary_available, true);
  assert.match(String(domains.local_model_shadow_extraction.safe_next_action), /shadow diff/);
  assert.ok(domains.local_model_shadow_extraction.evidence.some((item) => item.includes("latest_local_model_shadow_sample_receipt=")));
});

test("Gemma runtime capacity preflight blocks Gemma4 scheduling when host memory is insufficient", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-gemma-capacity-"));
  const receiptDir = join(root, ".tmp", "workflow-receipts", "gemma_capacity_preflight");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "gemma-capacity.json"), JSON.stringify({
    workflow_name: "gemma_capacity_preflight",
    run_id: "gemma-capacity-test",
    result: "blocked",
    model: "callscore-gemma4-extractor:latest",
    can_load: false,
    available_memory_gib: 8.2,
    required_memory_gib: 9.8,
    blockers: ["insufficient_system_memory"],
  }));

  const artifact = latestGemmaCapacityPreflightArtifact(root);
  assert.equal(artifact.exists, true);
  assert.equal(artifact.summary.result, "blocked");
  assert.equal(artifact.summary.can_load, false);
  assert.equal(artifact.summary.required_memory_gib, 9.8);

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "clear", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: 0, last_success_count: 0, last_failure_count: 0, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: ".tmp/shadow-extraction/gemma-laptop-batch3.jsonl", exists: true, modified_at: "now", malformed: false, summary: { rows: 5, accepted_calls: 1, errors: { none: 5 } } },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "none", reason: "test", job_type: "gemma_shadow_extract", allowed: true },
    now: new Date("2026-06-20T12:00:00.000Z"),
  });

  assert.equal(domains.local_model_runtime_capacity.status, "BLOCKED");
  assert.ok(domains.local_model_runtime_capacity.blockers.includes("insufficient_system_memory"));
  assert.match(String(domains.local_model_runtime_capacity.safe_next_action), /free memory|smaller model|laptop/i);
  assert.equal(domains.local_model_runtime_capacity.canary_available, false);
});

test("ML verifier quality gate receipt exposes audit-only activation status", () => {
  const dir = mkdtempSync(join(tmpdir(), "callscore-ml-verifier-gate-"));
  const receiptDir = join(dir, ".tmp", "workflow-receipts", "ml_verifier_quality_gate");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "ml-verifier-quality-gate.json"), JSON.stringify({
    workflow_name: "ml_verifier_quality_gate",
    run_id: "ml-verifier-quality-gate-test",
    result: "deferred",
    sample_size: 24,
    eligible_for_activation: false,
    audit_only: true,
    agreement_rate: 0.79,
    minimum_agreement_rate: 0.9,
    public_ranking_impact_allowed: false,
    production_mutation_performed: false,
    blockers: ["agreement_rate_below_threshold"],
  }));

  const artifact = latestMlVerifierQualityGateArtifact(dir);
  assert.equal(artifact.exists, true);
  assert.equal(artifact.summary.result, "deferred");
  assert.equal(artifact.summary.sample_size, 24);
  assert.equal(artifact.summary.eligible_for_activation, false);
  assert.equal(artifact.summary.audit_only, true);
  assert.equal(artifact.summary.production_mutation_performed, false);
});

test("ML verifier readiness stays deferred until bounded audit-only quality gate passes", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-ml-verifier-domain-"));
  const receiptDir = join(root, ".tmp", "workflow-receipts", "ml_verifier_quality_gate");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "ml-verifier-quality-gate.json"), JSON.stringify({
    workflow_name: "ml_verifier_quality_gate",
    run_id: "ml-verifier-quality-gate-test",
    result: "deferred",
    sample_size: 20,
    eligible_for_activation: false,
    audit_only: true,
    agreement_rate: 0.75,
    minimum_agreement_rate: 0.9,
    public_ranking_impact_allowed: false,
    production_mutation_performed: false,
    blockers: ["agreement_rate_below_threshold"],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "clear", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: 0, last_success_count: 0, last_failure_count: 0, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "none", reason: "test", job_type: null, allowed: true },
    now: new Date("2026-06-20T12:00:00.000Z"),
  });

  assert.equal(domains.ml_verifier_quality_gate.status, "PARTIAL");
  assert.equal(domains.ml_verifier_quality_gate.canary_available, false);
  assert.equal(domains.ml_verifier_quality_gate.production_mutation_allowed, false);
  assert.ok(domains.ml_verifier_quality_gate.evidence.some((item) => item.includes("eligible_for_activation=false")));
  assert.ok(domains.ml_verifier_quality_gate.blockers.includes("agreement_rate_below_threshold"));
  assert.match(String(domains.ml_verifier_quality_gate.safe_next_action), /run bounded audit-only ML verifier quality gate/);
});

test("ML verifier readiness becomes READY for recurring audit-only canary after bounded gate passes", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-ml-verifier-ready-"));
  const receiptDir = join(root, ".tmp", "workflow-receipts", "ml_verifier_quality_gate");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "ml-verifier-quality-gate.json"), JSON.stringify({
    workflow_name: "ml_verifier_quality_gate",
    run_id: "ml-verifier-quality-gate-passed-test",
    result: "passed",
    sample_size: 20,
    eligible_for_activation: true,
    audit_only: true,
    agreement_rate: 1,
    minimum_agreement_rate: 0.9,
    public_ranking_impact_allowed: false,
    production_mutation_performed: false,
    blockers: [],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "clear", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: 0, last_success_count: 0, last_failure_count: 0, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "none", reason: "test", job_type: null, allowed: true },
    now: new Date("2026-06-20T12:00:00.000Z"),
  });

  assert.equal(domains.ml_verifier_quality_gate.status, "READY");
  assert.equal(domains.ml_verifier_quality_gate.canary_available, true);
  assert.equal(domains.ml_verifier_quality_gate.production_mutation_allowed, false);
  assert.deepEqual(domains.ml_verifier_quality_gate.blockers, []);
  assert.match(String(domains.ml_verifier_quality_gate.safe_next_action), /recurring audit-only ML verifier canary/);
  assert.ok(domains.ml_verifier_quality_gate.risky_actions_blocked.includes("public ranking mutation"));
});

test("next autonomous action blocks unsafe/cooldown and otherwise chooses safe work", () => {
  const base = {
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "unknown" as const, cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: null, last_success_count: null, last_failure_count: null, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 10,
    collectorLastAttemptedCount: null,
    collectorLastSuccessCount: null,
  };
  assert.equal(decideNextAutonomousAction({ ...base, unsafeSourceRanks: 1 }).allowed, false);
  assert.equal(decideNextAutonomousAction({ ...base, collectorCooldown: { ...base.collectorCooldown, status: "active", cooldown_until_utc: "later" } }).action, "wait_for_collector_cooldown");
  assert.equal(decideNextAutonomousAction({ ...base, collectorLastAttemptedCount: 5, collectorLastSuccessCount: 0 }).action, "repair_transcript_targeting_or_failure_classification");
  assert.equal(
    decideNextAutonomousAction({ ...base, collectorLastAttemptedCount: 5, collectorLastSuccessCount: 0, latestTranscriptCadencePassed: true }).action,
    "run_local_model_shadow_extract_limit_10",
  );
  assert.equal(
    decideNextAutonomousAction({ ...base, collectorLastAttemptedCount: 5, collectorLastSuccessCount: 0, latestTranscriptCadenceResult: "partial_rate_limited_stop" }).action,
    "wait_for_laptop_collector_rate_limit_cooldown",
  );
  assert.equal(decideNextAutonomousAction({ ...base, latestMlEval: { path: "r", exists: true, modified_at: "now", malformed: false, summary: { promotion_gate: { eligible_for_write_canary: false } } } }).action, "start_artofwar_internal_growth_intelligence");
  assert.equal(decideNextAutonomousAction(base).job_type, "local_model_shadow_extract");
});


test("transcript readiness trusts latest successful cadence receipt over stale collector state", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-workplane-receipt-"));
  const receiptDir = join(root, ".tmp", "workflow-receipts", "transcript_laptop_cadence");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "laptop-limit5.json"), JSON.stringify({
    workflow_name: "transcript_laptop_cadence",
    run_id: "laptop-limit5",
    result: "passed",
    blockers: [],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: {
      state_path: ".tmp/laptop-collector/latest-state.json",
      status: "clear",
      cooldown_until_utc: null,
      cooldown_reason: null,
      latest_failure_reason: "transcript_failed",
      latest_job_id: "old-job",
      last_run_utc: "2026-06-12T18:33:23Z",
      last_attempted_count: 5,
      last_success_count: 0,
      last_failure_count: 5,
      last_success_rate: 0,
      recent_failure_reasons: { transcript_failed: 5 },
      checked_at: "now",
    },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 5,
    dailyPipelineActive: true,
    nextAction: { action: "repair_transcript_targeting_or_failure_classification", reason: "stale", job_type: "transcript_collect_laptop", allowed: true },
    now: new Date("2026-06-13T18:30:00.000Z"),
  });

  assert.equal(domains.transcript_collector.status, "READY");
  assert.deepEqual(domains.transcript_collector.blockers, []);
  assert.match(String(domains.transcript_collector.safe_next_action), /continue bounded laptop collector/);
  assert.ok(domains.transcript_collector.evidence.some((item) => item.includes("latest_cadence_receipt=")));
});



test("pipeline readiness recognizes latest Gemma write and score canary receipts", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-workplane-write-canary-"));
  const transcriptDir = join(root, ".tmp", "workflow-receipts", "transcript_laptop_cadence");
  const writeDir = join(root, ".tmp", "workflow-receipts", "gemma_write_canary");
  const scoreDir = join(root, ".tmp", "workflow-receipts", "pipeline_score_canary");
  mkdirSync(transcriptDir, { recursive: true });
  mkdirSync(writeDir, { recursive: true });
  mkdirSync(scoreDir, { recursive: true });
  writeFileSync(join(transcriptDir, "laptop-limit5.json"), JSON.stringify({
    workflow_name: "transcript_laptop_cadence",
    run_id: "laptop-limit5",
    result: "passed",
    blockers: [],
  }));
  writeFileSync(join(writeDir, "gemma-write.json"), JSON.stringify({
    workflow_name: "gemma_write_canary",
    run_id: "gemma-write",
    result: "passed",
    blockers: [],
  }));
  writeFileSync(join(scoreDir, "score-canary.json"), JSON.stringify({
    workflow_name: "pipeline_score_canary",
    run_id: "score-canary",
    result: "passed",
    blockers: [],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: {
      state_path: null,
      status: "clear",
      cooldown_until_utc: null,
      cooldown_reason: null,
      latest_failure_reason: null,
      latest_job_id: null,
      last_run_utc: null,
      last_attempted_count: 0,
      last_success_count: 0,
      last_failure_count: 0,
      last_success_rate: null,
      recent_failure_reasons: {},
      checked_at: "now",
    },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "none", reason: "test", job_type: "gemma_shadow_extract", allowed: true },
    now: new Date("2026-06-13T18:30:00.000Z"),
  });

  assert.equal(domains.callscore_pipeline.status, "MONITORED");
  assert.deepEqual(domains.callscore_pipeline.blockers, []);
  assert.match(String(domains.callscore_pipeline.safe_next_action), /monitor bounded laptop cadence/);
  assert.ok(domains.callscore_pipeline.evidence.some((item) => item.includes("latest_local_model_write_canary_receipt=")));
  assert.ok(domains.callscore_pipeline.evidence.some((item) => item.includes("latest_pipeline_score_canary_receipt=")));
});

test("readiness domains cover all activation surfaces with mutation gates", async () => {
  const { buildReadinessDomains } = await import("../src/lib/workplane-status");
  const domains = buildReadinessDomains({
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "unknown", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: null, last_success_count: null, last_failure_count: null, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 3,
    dailyPipelineActive: true,
    nextAction: { action: "run_laptop_collector_limit_5_if_laptop_cooldown_clear", reason: "test", job_type: "transcript_collect_laptop", allowed: true },
    now: new Date("2026-06-12T12:00:00.000Z"),
  });
  for (const key of ["callscore_pipeline", "transcript_collector", "local_model_shadow_extraction", "ml_improvement_loop", "whop_auto", "art_of_war", "claude_code_automations", "hermes_worker", "provider_integrations", "activation_gates", "root_hygiene"]) {
    assert.ok(domains[key], key);
    assert.equal(domains[key].production_mutation_allowed, false, key);
  }
  assert.equal(domains.activation_gates.status, "MONITORED");
  assert.ok(domains.whop_auto.risky_actions_blocked.some((item) => item.includes("pricing")));
  assert.ok(domains.art_of_war.risky_actions_blocked.some((item) => item.includes("email/DM/outreach")));
  assert.match(domains.art_of_war.safe_next_action ?? "", /owned-channel GTM loop/);
});

test("public artifact readiness stays open when unrelated private infra lane is blocked", { skip: !existsSync("/srv/agents/repos/Claude_Code_Automations/scripts/art_of_war.py") }, async () => {
  const { buildReadinessDomains } = await import("../src/lib/workplane-status");
  const root = mkdtempSync(join(tmpdir(), "callscore-public-artifact-readiness-"));
  mkdirSync(join(root, ".tmp", "workflow-receipts", "gemma_capacity_preflight"), { recursive: true });
  writeFileSync(join(root, ".tmp", "workflow-receipts", "gemma_capacity_preflight", "blocked.json"), JSON.stringify({
    result: "failed",
    can_load: false,
    blockers: ["insufficient_system_memory"],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "clear", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: null, latest_job_id: null, last_run_utc: null, last_attempted_count: 0, last_success_count: 0, last_failure_count: 0, last_success_rate: null, recent_failure_reasons: {}, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 0,
    dailyPipelineActive: true,
    nextAction: { action: "wait_for_laptop_collector_rate_limit_cooldown", reason: "private lane", job_type: "transcript_collect_laptop", allowed: false },
    now: new Date("2026-06-26T13:00:00.000Z"),
  });

  assert.equal(domains.local_model_runtime_capacity.status, "BLOCKED");
  const readiness = summarizePublicArtifactReadiness(domains);
  assert.equal(readiness.status, "READY_PUBLIC_OWNED");
  assert.equal(readiness.allowed, true);
  assert.equal(readiness.next_job_type, "artofwar_owned_public_execution");
  assert.deepEqual(readiness.blockers, []);
  assert.match(readiness.reason, /public artifacts/i);

  const next = chooseStatusNextAction({ action: "wait_for_laptop_collector_rate_limit_cooldown", reason: "private lane", job_type: "transcript_collect_laptop", allowed: false }, readiness);
  assert.equal(next.action, "run_owned_public_artifact_canary");
  assert.equal(next.job_type, "artofwar_owned_public_execution");
  assert.equal(next.allowed, true);
});


test("rate-limited laptop cadence receipts become monitored cooldown rather than hard partial", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-workplane-rate-limit-"));
  const receiptDir = join(root, ".tmp", "workflow-receipts", "transcript_laptop_cadence");
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, "laptop-rate-limit.json"), JSON.stringify({
    workflow_name: "transcript_laptop_cadence",
    run_id: "laptop-rate-limit",
    result: "partial_rate_limited_stop",
    blockers: [],
  }));

  const domains = buildReadinessDomains({
    repoRoot: root,
    unsafeSourceRanks: 0,
    apiUnsafeOfficialCount: 0,
    collectorCooldown: { state_path: null, status: "clear", cooldown_until_utc: null, cooldown_reason: null, latest_failure_reason: "rate_limited", latest_job_id: "job", last_run_utc: "now", last_attempted_count: 5, last_success_count: 0, last_failure_count: 5, last_success_rate: 0, recent_failure_reasons: { rate_limited: 1 }, checked_at: "now" },
    latestGemmaShadow: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    latestMlEval: { path: null, exists: false, modified_at: null, malformed: false, summary: {} },
    transcriptBacklogRecent30d: 5,
    dailyPipelineActive: true,
    nextAction: { action: "wait_for_laptop_collector_rate_limit_cooldown", reason: "429", job_type: "transcript_collect_laptop", allowed: false },
    now: new Date("2026-06-14T12:00:00.000Z"),
  });

  assert.equal(domains.transcript_collector.status, "MONITORED");
  assert.deepEqual(domains.transcript_collector.blockers, []);
  assert.match(String(domains.transcript_collector.safe_next_action), /wait for laptop provider cooldown/);
});

test("workplane status exposes executable report-only job commands", () => {
  const model = workplaneJobModelForStatus();
  const campaignLoop = model.find((entry) => entry.type === "artofwar_campaign_iteration");
  assert.ok(campaignLoop, "missing campaign iteration job model");
  assert.match(String(campaignLoop.default_safe_command), /campaign-loop --dry-run/);
  assert.equal(campaignLoop.production_db_writes_allowed, false);
  assert.equal(campaignLoop.public_ranking_impact_allowed, false);
  assert.ok(Array.isArray(campaignLoop.success_criteria));
  assert.ok(Array.isArray(campaignLoop.failure_classification));
});


test("Art of War campaign loop supports owned public execution while restricted lanes stay gated", () => {
  const campaignJobs = [
    "artofwar_campaign_preflight",
    "artofwar_campaign_iteration",
    "artofwar_campaign_verify",
    "artofwar_campaign_persona_test",
    "artofwar_campaign_dry_run",
    "artofwar_campaign_local_model_eval",
    "artofwar_campaign_gemma_eval",
    "artofwar_campaign_receipt",
    "artofwar_campaign_dossier",
    "artofwar_campaign_approval_review",
  ] as const;

  for (const type of campaignJobs) {
    const spec = getWorkplaneJobSpec(type);
    assert.equal(spec.execution_location, "HH", type);
    assert.equal(spec.production_db_writes_allowed, false, type);
    assert.equal(spec.production_call_writes_allowed, false, type);
    assert.equal(spec.public_ranking_impact_allowed, false, type);
    assert.doesNotMatch(spec.default_safe_command, /publish|send|spend|whop:bootstrap|shadow:promote/i, type);
  }

  const preflight = getWorkplaneJobSpec("artofwar_campaign_preflight");
  assert.deepEqual((preflight.input_payload.required_fields as string[]).slice(0, 4), ["campaign_id", "track", "objective", "source_data"]);

  const persona = getWorkplaneJobSpec("artofwar_campaign_persona_test");
  assert.deepEqual(persona.input_payload.personas, ["creator_operator", "whop_buyer", "skeptical_prospect", "high_intent_buyer", "low_trust_cold_prospect", "technical_evaluator"]);
  assert.equal(persona.input_payload.threshold, 70);

  const approval = getWorkplaneJobSpec("artofwar_campaign_approval_review");
  assert.match(approval.success_criteria.join(" "), /owned public publish allowed by default/);

  const owned = getWorkplaneJobSpec("artofwar_owned_public_execution");
  assert.equal(owned.production_db_writes_allowed, false);
  assert.equal(owned.production_call_writes_allowed, false);
  assert.equal(owned.public_ranking_impact_allowed, false);
  assert.equal(owned.input_payload.ready_public_owned, true);
  assert.equal(owned.input_payload.receipt_required_after_execution, true);
  assert.match(owned.success_criteria.join(" "), /post-execution receipt required/);
  assert.ok(owned.failure_classification.includes("not_owned_channel"));
});

test("transcript recovery write mode requires forced replay-safe Workplane selection", async () => {
  await assert.rejects(
    runWorkplaneJob({
      id: 6632,
      run_id: 6632,
      type: "transcript_recover_hh",
      payload: { youtube_video_ids: ["VCbmPx1l7AU"], write: true, force_targeted_retry: false },
    } as never),
    /requires force_targeted_retry=true/,
  );
});

test("owned public execution job emits a public artifact packet and receipt without restricted mutations", async () => {
  const runId = `owned-public-artifact-test-${Date.now()}`;
  const out = join(mkdtempSync(join(tmpdir(), "callscore-owned-public-artifact-")), "artifact.json");
  const result = await runWorkplaneJob({
    id: 1,
    run_id: 1,
    type: "artofwar_owned_public_execution",
    payload: { run_id: runId, out, channel: "callscore_owned_dashboard", artifact_url: "https://call-score.com", copy: "CallScore receipts beat vibes. Latest proof packet is live." },
  } as never);

  assert.equal(result.mode, "owned_public_artifact");
  assert.equal(result.public_action_performed, true);
  assert.equal(result.external_mutation_performed, false);
  assert.equal(result.provider_mutation_performed, false);
  assert.equal(result.production_mutation_performed, false);
  assert.equal(result.out, out);
  const artifact = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(artifact.artifact_type, "OwnedPublicArtifactPacket");
  assert.equal(artifact.channel, "callscore_owned_dashboard");
  assert.equal(artifact.ready_public_owned, true);
  assert.equal(artifact.restricted_actions_blocked, true);
  assert.match(String(result.receipt_path), /artofwar_owned_public_execution/);
  rmSync(String(result.receipt_path), { force: true });
});

test("Gemma Ollama Modelfile is aligned to production shadow extraction schema", () => {
  const modelfile = readFileSync("ops/ollama/Modelfile.callscore-gemma4-extractor", "utf8");
  assert.match(modelfile, /\"symbol\":\"BTCUSDT\"/);
  assert.match(modelfile, /\"raw_quote\":\"exact quote\"/);
  assert.match(modelfile, /"extraction_confidence":0\.0-1\.0/);
  assert.doesNotMatch(modelfile, /asset_symbol/);
  assert.doesNotMatch(modelfile, /rejected_news_or_aggregation/);
});


test("existing enqueue script can safely enqueue bounded workplane jobs", () => {
  const enqueueScript = readFileSync("src/scripts/callscore-enqueue-job.ts", "utf8");
  assert.match(enqueueScript, /--job <candles\|match\|scores\|ml\|workplane>/);
  assert.match(enqueueScript, /--workplane-type TYPE/);
  assert.match(enqueueScript, /isWorkplaneJobType/);
  assert.match(enqueueScript, /getWorkplaneJobSpec/);
  assert.match(enqueueScript, /transcript_collect_laptop/);
  assert.match(enqueueScript, /--limit >5 requires --allow-large-batch/);
  assert.match(enqueueScript, /allow_large_batch: args\.allowLargeBatch === true/);
  assert.match(enqueueScript, /production_call_writes_allowed: spec\.production_call_writes_allowed/);
  assert.match(enqueueScript, /public_ranking_impact_allowed: spec\.public_ranking_impact_allowed/);
});


test("latest Art of War campaign receipt summarizes operational loop safely", () => {
  const dir = mkdtempSync(join(tmpdir(), "callscore-artofwar-receipt-"));
  const path = join(dir, "callscore-art-of-war-receipts-proof-operational-001.json");
  writeFileSync(path, JSON.stringify({
    campaign_id: "receipts-proof-operational-001",
    iteration: 1,
    decision: "revise_or_hold",
    failure_class: "audience_mismatch",
    next_safe_action: "revise_private_campaign_or_add_evidence",
    approval_required: true,
    public_action_performed: false,
    external_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    verifier_result: { passed: false },
    persona_scorecard: { passed: false },
    gemma_evaluation: { passed: false },
  }));
  const artifact = latestArtOfWarCampaignReceipt(dir);
  assert.equal(artifact.exists, true);
  assert.equal(artifact.summary.campaign_id, "receipts-proof-operational-001");
  assert.equal(artifact.summary.decision, "revise_or_hold");
  assert.equal(artifact.summary.public_action_performed, false);
  assert.equal(artifact.summary.external_mutation_performed, false);
  assert.equal(artifact.summary.approval_required, true);
});

test("Whop workplane jobs stay read-only or dry-run by default", () => {
  const whopJobs = [
    "whop_provider_health",
    "whop_plan_inventory_check",
    "whop_entitlement_sync_dry_run",
    "whop_webhook_replay_safe",
    "whop_customer_status_check",
    "whop_activation_review",
  ] as const;

  for (const type of whopJobs) {
    const spec = getWorkplaneJobSpec(type);
    assert.equal(spec.production_db_writes_allowed, false, type);
    assert.equal(spec.production_call_writes_allowed, false, type);
    assert.equal(spec.public_ranking_impact_allowed, false, type);
    assert.doesNotMatch(spec.default_safe_command, /whop:bootstrap|create|update|delete|pricing|payment/i, type);
    assert.ok(spec.failure_classification.includes("approval_missing") || spec.failure_classification.includes("unsafe_mutation_requested"), type);
  }
});
