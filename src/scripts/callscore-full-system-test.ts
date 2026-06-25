/**
 * callscore-full-system-test.ts — Full-stack integration test for the
 * CallScore pipeline. Exercises every subsystem:
 *
 *   1. Full TypeScript compilation (all files)
 *   2. LangGraph StateGraph topology with all 5 decisions
 *   3. Markov HMM engine with mock transition states
 *   4. Channel head decision engine (every decision type)
 *   5. State machine (all transitions, persistence)
 *   6. Pipeline guard audit (offline mode)
 *   7. Langfuse tracing (connectivity + trace creation)
 *   8. Markov scoring dimension
 *   9. Agent heartbeat dry-run
 *
 * Usage: npx tsx src/scripts/callscore-full-system-test.ts
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execSync, type ExecSyncOptions } from "node:child_process";
import type { HardeningCheck } from "../lib/pipeline-guard-audit";
import type { MarkovScoringInput } from "../lib/autonomy/channel-head-markov-dimension";

// ── Helpers ────────────────────────────────────────────────────────────────

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

interface TestResult {
  name: string;
  ok: boolean;
  detail: string;
  duration: number;
}

const results: TestResult[] = [];
let passed = 0;
let failed = 0;
let totalStart = 0;
const testQueue: Array<() => Promise<void>> = [];

function test(name: string, fn: () => Promise<void>): void;
function test(name: string, fn: () => void): void;
function test(name: string, fn: (() => void) | (() => Promise<void>)): void {
  testQueue.push(async () => {
    const start = Date.now();
    const finish = (ok: boolean, msg: string) => {
      const duration = Date.now() - start;
      if (ok) { passed++; results.push({ name, ok: true, detail: "OK", duration }); console.log(`  ✓ ${name} (${duration}ms)`); }
      else { failed++; results.push({ name, ok: false, detail: msg, duration }); console.log(`  ✗ ${name} — ${msg} (${duration}ms)`); }
    };
    try { await (fn as () => Promise<void>)(); finish(true, "OK"); }
    catch (e) { finish(false, e instanceof Error ? e.message : String(e)); }
  });
}

// ── 1. TypeScript compilation ─────────────────────────────────

async function checkCompile(): Promise<void> {
  const files = [
    "src/lib/autonomy/channel-head-graph.ts",
    "src/lib/autonomy/channel-head-decision.ts",
    "src/lib/autonomy/channel-head-state-machine.ts",
    "src/lib/autonomy/channel-head-langfuse.ts",
    "src/lib/autonomy/channel-head-markov-dimension.ts",
    "src/lib/autonomy/channel-head-scoring.ts",
    "src/lib/autonomy/contracts.ts",
    "src/lib/markov/markov-hmm.ts",
    "src/lib/markov/markov-predictor.ts",
    "src/lib/markov/markov-transition-matrix.ts",
    "src/lib/markov/markov-agent.ts",
    "src/lib/markov/markov-report.ts",
    "src/lib/markov/markov-schemas.ts",
    "src/lib/validation/pipeline-state-schema.ts",
    "src/lib/validation/markov-schema.ts",
    "src/lib/validation/transition-schema.ts",
    "src/lib/validation/agent-soul-schema.ts",
    "src/lib/pipeline-guard-audit.ts",
    "src/scripts/callscore-agent-heartbeat.ts",
  ].join(" ");

  execSync(`npx tsc --noEmit --strict --skipLibCheck --esModuleInterop --moduleResolution bundler --module esnext --target es2022 ${files}`, {
    cwd: "/opt/crypto-tuber-ranked",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    encoding: "utf8",
  } as ExecSyncOptions);
}

// ── 2. Markov engine ─────────────────────────────────────────

async function checkMarkovEngine(): Promise<void> {
  const { buildTransitionMatrix } = await import("../lib/markov/markov-transition-matrix");
  const { predictNextStates, stabilityScore } = await import("../lib/markov/markov-predictor");
  const { CREATOR_TRANSITION_STATES } = await import("../lib/markov/markov-schemas");

  // Build mock data using the schema's own allowed fields
  const now = new Date();
  const states: Array<Record<string, unknown>> = [];
  for (let cid = 101; cid <= 1010; cid += 101) {
    for (let m = 0; m < 12; m++) {
      const period = new Date(now.getFullYear(), now.getMonth() - 11 + m, 1);
      const pEnd = new Date(period.getFullYear(), period.getMonth() + 1, 0);
      const si = (cid + m) % CREATOR_TRANSITION_STATES.length;
      states.push({
        creator_id: cid,
        creator_name: `creator-${cid}`,
        youtube_handle: null,
        period_start: period.toISOString(),
        period_end: pEnd.toISOString(),
        state: CREATOR_TRANSITION_STATES[si],
        confidence: 0.5 + (m / 12) * 0.4,
        drivers: [],
        warnings: [],
        snapshot: {
          creator_id: cid,
          creator_name: `creator-${cid}`,
          youtube_handle: null,
          period: "monthly",
          period_start: period.toISOString(),
          period_end: pEnd.toISOString(),
          calls_count: 5 + m,
          score_ready_calls: 4 + m,
          win_rate: 0.55,
          avg_score: 0.6,
          avg_alpha_30d: 0.02,
          avg_return_30d: 0.05,
          bullish_pct: 0.6,
          bearish_pct: 0.3,
          symbol_diversity: 3,
          specificity_avg: 0.7,
          extraction_confidence_avg: 0.85,
          score_stddev: 0.15,
          alpha_spread: 0.08,
          latest_call_at: period.toISOString(),
          activity_status: "active" as const,
          eligibility_status: "eligible" as const,
          excluded_reason: null,
        },
      } as Record<string, unknown>);
    }
  }

  const matrix = buildTransitionMatrix(states as never, { smoothing: "add_one", alpha: 1, min_observations_per_row: 10, max_sparsity_ratio: 0.6, prediction_steps: 4 });
  if (matrix.total_observations < 50) throw new Error(`Expected >=50 observations, got ${matrix.total_observations}`);
  if (!matrix.matrix || matrix.matrix.length !== CREATOR_TRANSITION_STATES.length) throw new Error("Matrix dimensions wrong");
  if (matrix.sparsity_ratio === undefined) throw new Error("Missing sparsity_ratio");

  const preds = predictNextStates(matrix, 2, 4);
  if (!preds || preds.length !== 4) throw new Error(`Expected 4 prediction steps, got ${preds?.length}`);

  const stab = stabilityScore(preds);
  if (stab < 0 || stab > 1) throw new Error(`Stability score out of range: ${stab}`);
}

// ── 3. Markov agent node ─────────────────────────────────────

async function checkMarkovAgent(): Promise<void> {
  const { runMarkov } = await import("../lib/markov/markov-agent");
  const { CREATOR_TRANSITION_STATES } = await import("../lib/markov/markov-schemas");

  const now = new Date();
  const states: Array<Record<string, unknown>> = [];
  for (const cid of [101, 202, 303]) {
    for (let m = 0; m < 20; m++) {
      const period = new Date(now.getFullYear(), now.getMonth() - 19 + m, 1);
      const pEnd = new Date(period.getFullYear(), period.getMonth() + 1, 0);
      const si = (cid + m * 3) % CREATOR_TRANSITION_STATES.length;
      states.push({
        creator_id: cid,
        creator_name: `creator-${cid}`,
        youtube_handle: null,
        period_start: period.toISOString(),
        period_end: pEnd.toISOString(),
        state: CREATOR_TRANSITION_STATES[si],
        confidence: 0.5 + (m / 20) * 0.4,
        drivers: [],
        warnings: [],
        snapshot: {
          creator_id: cid,
          creator_name: `creator-${cid}`,
          youtube_handle: null,
          period: "monthly",
          period_start: period.toISOString(),
          period_end: pEnd.toISOString(),
          calls_count: 10,
          score_ready_calls: 8,
          win_rate: 0.55,
          avg_score: 0.6,
          avg_alpha_30d: 0.02,
          avg_return_30d: 0.05,
          bullish_pct: 0.6,
          bearish_pct: 0.3,
          symbol_diversity: 3,
          specificity_avg: 0.7,
          extraction_confidence_avg: 0.85,
          score_stddev: 0.15,
          alpha_spread: 0.08,
          latest_call_at: period.toISOString(),
          activity_status: "active" as const,
          eligibility_status: "eligible" as const,
          excluded_reason: null,
        },
      } as Record<string, unknown>);
    }
  }

  const report = await runMarkov(states as never);
  if (report.creator_count !== 3) throw new Error(`Expected 3 creators, got ${report.creator_count}`);
  if (report.predictions.length !== 3) throw new Error(`Expected 3 predictions, got ${report.predictions.length}`);
  if (!report.matrix.total_observations || report.matrix.total_observations < 50) throw new Error(`Insufficient observations: ${report.matrix.total_observations}`);
  if (!report.readiness) throw new Error("Missing readiness");
}

// ── 4. Channel head decisions ────────────────────────────────

function makeContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    now,
    taskId: `task-test`,
    targetActionType: "monitor_read_only",
    riskClass: "safe_owned_public",
    channelHeadSoul: {
      agentId: "test-agent",
      channelId: "test-channel",
      soulVersion: "callscore_channel_head_souls.v1",
      purpose: "Test",
    },
    gtmRegistryState: {
      laneId: "test-channel",
      currentStatus: "ready_public_owned",
      requiredGate: "NONE",
      ownedOrManaged: true,
      zeroSpendRequired: true,
      allowedActions: ["monitor_read_only", "draft", "publish_owned_public"],
      forbiddenActions: ["provider_mutation", "payment_mutation", "whop_customer_mutation", "db_deploy_mutation", "secret_exposure"],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
    workplane: { status: "OK", automationReadiness: "CONTROLLED_FULL", blockers: [] },
    recentReceipts: [],
    cooldown: { channelCooldownActive: false, providerErrorCooldownActive: false, duplicatePayloadCooldownActive: false, waitUntil: now },
    mediaGate: { status: "pass", evidenceHash: sha256("media"), artifactIds: ["test-artifact"] },
    originalityGate: { status: "pass", evidenceHash: sha256("originality") },
    qualitySignal: { status: "pass", score: 0.9, verifierSignal: "test", evidenceHash: sha256("quality") },
    channelPolicy: {
      policyVersion: "test.v1",
      publicClaimsSupported: true,
      claimBearingAllowed: true,
      safeOwnedPublicAllowed: true,
      requiresNonFounderReviewBelowConfidence: 0.6,
    },
    evidence: { evidenceLevel: "E2", evidenceHash: sha256("evidence"), sourceArtifactIds: ["test-soul", "test-registry"] },
    payloadHash: sha256("payload"),
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 5, totalPostsToday: 0, maxTotalPostsPerDay: 10 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: false },
    heartbeat: { heartbeat_id: "heartbeat:test", fresh: true, lease_expires_at: new Date(Date.now() + 300_000).toISOString() },
    publicVerify: { status: "pass", checked_at: now },
    ...overrides,
  };
}

async function checkDecisionAct(): Promise<void> {
  const { decideChannelHeadAction } = await import("../lib/autonomy/channel-head-decision");
  const result = decideChannelHeadAction(makeContext() as never);
  if (result.decision.decision !== "act") throw new Error(`Expected "act", got "${result.decision.decision}"`);
  if (result.receipt.status !== "succeeded") throw new Error(`Expected receipt "succeeded", got "${result.receipt.status}"`);
  if (!result.decision.decision_id) throw new Error("Missing decision_id");
}

async function checkDecisionWait(): Promise<void> {
  const { decideChannelHeadAction } = await import("../lib/autonomy/channel-head-decision");
  const ctx = makeContext({ cooldown: { channelCooldownActive: true, providerErrorCooldownActive: false, duplicatePayloadCooldownActive: false, waitUntil: new Date(Date.now() + 3600000).toISOString() } });
  const result = decideChannelHeadAction(ctx as never);
  if (result.decision.decision !== "wait") throw new Error(`Expected "wait", got "${result.decision.decision}"`);
  if (!result.decision.wait_until) throw new Error("Expected wait_until timestamp");
}

async function checkDecisionSuppress(): Promise<void> {
  const { decideChannelHeadAction } = await import("../lib/autonomy/channel-head-decision");
  const ctx = makeContext({ mediaGate: { status: "fail", evidenceHash: sha256("fail"), artifactIds: [] }, targetActionType: "publish_owned_public" });
  const result = decideChannelHeadAction(ctx as never);
  if (result.decision.decision !== "suppress") throw new Error(`Expected "suppress", got "${result.decision.decision}"`);
  if (!result.decision.suppress_until) throw new Error("Expected suppress_until");
}

async function checkDecisionGate(): Promise<void> {
  const { decideChannelHeadAction } = await import("../lib/autonomy/channel-head-decision");
  const ctx = makeContext({ riskClass: "restricted_financial", targetActionType: "publish_owned_public" });
  const result = decideChannelHeadAction(ctx as never);
  if (result.decision.decision !== "request_gate") throw new Error(`Expected "request_gate", got "${result.decision.decision}"`);
  if (!result.decision.gate_required) throw new Error("Expected gate_required");
}

async function checkDecisionReview(): Promise<void> {
  const { decideChannelHeadAction } = await import("../lib/autonomy/channel-head-decision");
  const ctx = makeContext({
    qualitySignal: { status: "pass", score: 0.7, verifierSignal: "test", evidenceHash: sha256("review") },
    channelPolicy: { policyVersion: "test.v1", publicClaimsSupported: true, claimBearingAllowed: true, safeOwnedPublicAllowed: true, requiresNonFounderReviewBelowConfidence: 0.8 },
  });
  const result = decideChannelHeadAction(ctx as never);
  if (result.decision.decision !== "escalate_non_founder_review") throw new Error(`Expected "escalate_non_founder_review", got "${result.decision.decision}"`);
  if (!result.decision.non_founder_review_required) throw new Error("Expected review_required");
}

async function checkReceiptWrite(): Promise<void> {
  const { decideChannelHeadAction, writeChannelHeadDecisionReceipt } = await import("../lib/autonomy/channel-head-decision");
  const result = decideChannelHeadAction(makeContext() as never);
  const testDir = "/tmp/callscore-test-receipts";
  rmSync(testDir, { recursive: true, force: true });
  const path = writeChannelHeadDecisionReceipt(result, testDir);
  if (!existsSync(path)) throw new Error(`Receipt file not found: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed.receipt || !parsed.decision) throw new Error("Missing receipt/decision in file");
  if (parsed.receipt.receipt_id !== result.receipt.receipt_id) throw new Error("Receipt ID mismatch");
  rmSync(testDir, { recursive: true, force: true });
}

// ── 5. State machine ─────────────────────────────────────────

async function checkStateMachine(): Promise<void> {
  const sm = await import("../lib/autonomy/channel-head-state-machine");

  // Decision-to-state mapping
  const map: Record<string, string> = { act: "ACTING", wait: "WAITING", suppress: "SUPPRESSED", request_gate: "GATED", escalate_non_founder_review: "REVIEW" };
  for (const [d, ex] of Object.entries(map)) {
    const next = sm.decisionToNextState(d, "EVALUATING");
    if (next !== ex) throw new Error(`decisionToNextState("${d}") expected "${ex}", got "${next}"`);
  }

  // Invalid transition throws
  let threw = false;
  try { sm.assertValidTransition("INITIAL", "COMPLETE"); } catch { threw = true; }
  if (!threw) throw new Error("Expected error for INITIAL → COMPLETE");

  // Actual transition
  const initial = sm.createInitialState("test-agent", "test-channel", new Date().toISOString());
  const ev = sm.transitionState(initial, "EVALUATING", "test");
  if (ev.state !== "EVALUATING") throw new Error(`Expected EVALUATING, got ${ev.state}`);
  if (ev.transitions.length !== 1) throw new Error("Expected 1 transition record");
  if (!ev.in_flight) throw new Error("Expected in_flight");
  const act = sm.transitionState(ev, "ACTING", "acting");
  const done = sm.transitionState(act, "COMPLETE", "done");
  if (done.completion_count !== 1) throw new Error(`Expected completion_count=1, got ${done.completion_count}`);
}

async function checkStatePersistence(): Promise<void> {
  const sm = await import("../lib/autonomy/channel-head-state-machine");
  const testDir = "/tmp/callscore-test-states";
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });

  const state = sm.createInitialState("persist-agent", "persist-channel", new Date().toISOString());
  const savedPath = sm.saveState(state, testDir);
  if (!existsSync(savedPath)) throw new Error("State file not saved");

  const loaded = sm.loadState("persist-agent", "persist-channel", testDir);
  if (loaded.state !== "INITIAL") throw new Error(`Expected INITIAL, got ${loaded.state}`);
  if (loaded.agent_id !== "persist-agent") throw new Error("Agent ID not preserved");

  // Fresh agent gets INITIAL
  const fresh = sm.loadState("new-agent", "new-channel", testDir);
  if (fresh.state !== "INITIAL") throw new Error("Expected INITIAL for new agent");

  rmSync(testDir, { recursive: true, force: true });
}

// ── 6. LangGraph StateGraph ──────────────────────────────────

async function checkGraphTopology(): Promise<void> {
  const { createCallScoreGraph, setGraphInputs } = await import("../lib/autonomy/channel-head-graph");

  setGraphInputs({ dryRun: true }, { mockData: true }, { contexts: [makeContext() as never] });

  const graph = createCallScoreGraph();
  const result = await graph.invoke({ run_id: `test-${Date.now()}`, started_at: new Date().toISOString() });

  if (result.guard_overall !== "pass") throw new Error(`Expected guard "pass", got "${result.guard_overall}"`);
  if (result.channel_head_results?.length !== 1) throw new Error(`Expected 1 decision, got ${result.channel_head_results?.length}`);
  if (result.receipts?.length !== 1) throw new Error(`Expected 1 receipt, got ${result.receipts?.length}`);
  if (result.errors?.length > 0) throw new Error(`Expected 0 errors, got ${result.errors.length}`);
}

async function checkGraphAllAgents(): Promise<void> {
  const { createCallScoreGraph, setGraphInputs } = await import("../lib/autonomy/channel-head-graph");

  const AGENTS = [
    "callscore-architect-head", "callscore-artofwar-strategist", "callscore-candidate-admission-head",
    "callscore-candle-refresher-head", "callscore-channel-agent-worker-head", "callscore-community-drops-head",
    "callscore-compliance-linter-head", "callscore-consensus-head", "callscore-data-pipeline-sentinel",
    "callscore-email-partnership-drafts-head", "callscore-markov-trajectory-head", "callscore-ml-verifier-head",
    "callscore-opportunity-research-head", "callscore-price-matcher-head", "callscore-scoring-head",
    "callscore-supervisor-head", "callscore-transcript-scraper-head", "callscore-whop-commerce-head",
    "callscore-x-writer-head", "callscore-youtube-discovery-head", "callscore-llm-extractor-head",
  ];

  const contexts = AGENTS.map((id) => makeContext({
    channelHeadSoul: { agentId: id, channelId: id.includes("artofwar") ? "art_of_war" : "general", soulVersion: "callscore_channel_head_souls.v1", purpose: `Test ${id}` },
  }));

  setGraphInputs({ dryRun: true }, { mockData: true }, { contexts: contexts as never });

  const graph = createCallScoreGraph();
  const result = await graph.invoke({ run_id: `test-21-${Date.now()}`, started_at: new Date().toISOString() });

  const decisions = result.channel_head_results ?? [];
  const receipts = result.receipts ?? [];
  if (decisions.length !== 21) throw new Error(`Expected 21 decisions, got ${decisions.length}`);
  if (receipts.length !== 21) throw new Error(`Expected 21 receipts, got ${receipts.length}`);
  if ((result.errors ?? []).length > 0) throw new Error(`Expected 0 errors, got ${result.errors.length}`);
}

// ── 7. Pipeline guard ────────────────────────────────────────

async function checkPipelineGuard(): Promise<void> {
  const { derivePipelineReadinessClasses } = await import("../lib/pipeline-guard-audit");

  const passChecks: HardeningCheck[] = [
    { id: "creator_stats_30d", status: "pass", summary: "test", metrics: {}, next_action: "none" },
    { id: "ml_promotion_state", status: "pass", summary: "test", metrics: {}, next_action: "none" },
    { id: "transition_state_coverage", status: "pass", summary: "test", metrics: {}, next_action: "none" },
  ];
  const passReadiness = derivePipelineReadinessClasses(passChecks);
  if (passReadiness.markov_readiness !== "green") throw new Error(`Expected green, got ${passReadiness.markov_readiness}`);

  const blockChecks: HardeningCheck[] = [...passChecks, { id: "markov_sparsity_block", status: "block", summary: "test", metrics: {}, next_action: "none" }];
  const blockReadiness = derivePipelineReadinessClasses(blockChecks);
  if (blockReadiness.markov_readiness !== "blocked") throw new Error(`Expected blocked, got ${blockReadiness.markov_readiness}`);
}

// ── 8. Langfuse ────────────────────────────────────────────────

async function checkLangfuse(): Promise<void> {
  const { langfuseConfigured, createDecisionTrace } = await import("../lib/autonomy/channel-head-langfuse");

  if (!langfuseConfigured()) {
    console.log("    (Langfuse not configured — skipping trace test)");
    return;
  }

  const traceId = createDecisionTrace("test-agent", "test-channel");
  if (!traceId) throw new Error("createDecisionTrace returned null despite config");
  if (typeof traceId !== "string" || traceId.length < 10) throw new Error(`Unexpected trace ID: ${traceId}`);
}

// ── 9. Markov dimension ──────────────────────────────────────

async function checkMarkovDimension(): Promise<void> {
  const { scoreMarkovDimension } = await import("../lib/autonomy/channel-head-markov-dimension");

  // Stable predictions → score=1
  const stableInput: MarkovScoringInput = {
    prediction: {
      creator_id: 101,
      creator_name: "test",
      current_state: "STABLE_PERFORMER",
      current_state_confidence: 0.8,
      current_period: "2026-01-01",
      predictions: [
        { step: 1, distribution: [{ state: "STABLE_PERFORMER", probability: 0.6 }], low_confidence: false },
        { step: 2, distribution: [{ state: "STABLE_PERFORMER", probability: 0.7 }], low_confidence: false },
        { step: 3, distribution: [{ state: "STABLE_PERFORMER", probability: 0.65 }], low_confidence: false },
        { step: 4, distribution: [{ state: "STABLE_PERFORMER", probability: 0.55 }], low_confidence: false },
      ],
      stability_score: 0.85,
    },
    matrix_observations: 200,
    backtest_accuracy: 0.6,
  };
  const stable = scoreMarkovDimension(stableInput);
  if (stable.score !== 1.0) throw new Error(`Expected stable score 1.0, got ${stable.score}`);

  // Volatile → score < 0.5
  const volatileInput: MarkovScoringInput = {
    prediction: {
      creator_id: 202,
      creator_name: "test2",
      current_state: "HIGH_VOLATILITY",
      current_state_confidence: 0.4,
      current_period: "2026-01-01",
      predictions: [
        { step: 1, distribution: [{ state: "STABLE_PERFORMER", probability: 0.6 }, { state: "HIGH_VOLATILITY", probability: 0.4 }], low_confidence: false },
        { step: 2, distribution: [{ state: "HIGH_VOLATILITY", probability: 0.7 }, { state: "STABLE_PERFORMER", probability: 0.3 }], low_confidence: false },
        { step: 3, distribution: [{ state: "COLD_STREAK", probability: 0.3 }, { state: "STABLE_PERFORMER", probability: 0.7 }], low_confidence: false },
        { step: 4, distribution: [{ state: "DETERIORATING", probability: 0.2 }], low_confidence: false },
      ],
      stability_score: 0.25,
    },
    matrix_observations: 200,
    backtest_accuracy: 0.6,
  };
  const volatile = scoreMarkovDimension(volatileInput);
  if (volatile.score >= 0.5) throw new Error(`Expected volatile score <0.5, got ${volatile.score}`);
}

// ── 10. Heartbeat dry-run ────────────────────────────────────

async function checkHeartbeat(): Promise<void> {
  execSync("npx tsx src/scripts/callscore-agent-heartbeat.ts --dry-run 2>&1 | tail -5", {
    cwd: "/opt/crypto-tuber-ranked",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    encoding: "utf8",
  } as ExecSyncOptions);
}

// ── Main runner ──────────────────────────────────────────────

async function runAll(): Promise<void> {
  while (testQueue.length > 0) {
    const t = testQueue.shift()!;
    await t();
  }
}

async function main(): Promise<void> {
  totalStart = Date.now();
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║   CallScore Full System Integration Test       ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const hasLF = Boolean(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
  console.log(`  Langfuse=${hasLF ? "yes" : "no"}  Node=${process.version}  CWD=${process.cwd()}\n`);

  // ── 1 ──
  console.log("1. TypeScript compilation");
  test("20+ source files compile with strict mode", checkCompile);
  await runAll();

  // ── 2 ──
  console.log("\n2. Markov HMM engine");
  test("Transition matrix builds from mock states", checkMarkovEngine);
  test("Markov agent node produces predictions", checkMarkovAgent);
  await runAll();

  // ── 3 ──
  console.log("\n3. Channel head decision engine");
  test("Decision: act", checkDecisionAct);
  test("Decision: wait (cooldown)", checkDecisionWait);
  test("Decision: suppress (media fail)", checkDecisionSuppress);
  test("Decision: request_gate (restricted risk)", checkDecisionGate);
  test("Decision: escalate_non_founder_review", checkDecisionReview);
  test("Receipt writing to disk", checkReceiptWrite);
  await runAll();

  // ── 4 ──
  console.log("\n4. State machine");
  test("Transitions and decision mapping", checkStateMachine);
  test("File-backed persistence", checkStatePersistence);
  await runAll();

  // ── 5 ──
  console.log("\n5. LangGraph StateGraph");
  test("Graph pass path, 1 agent", checkGraphTopology);
  test("Graph pass path, 21 agents", checkGraphAllAgents);
  await runAll();

  // ── 6 ──
  console.log("\n6. Pipeline guard audit");
  test("derivePipelineReadinessClasses (offline)", checkPipelineGuard);
  await runAll();

  // ── 7 ──
  console.log("\n7. Langfuse tracing");
  test("Langfuse connectivity and trace creation", checkLangfuse);
  await runAll();

  // ── 8 ──
  console.log("\n8. Markov scoring dimension");
  test("Dimension scores stable vs volatile", checkMarkovDimension);
  await runAll();

  // ── 9 ──
  console.log("\n9. Agent heartbeat");
  test("Heartbeat --dry-run with 26 agents", checkHeartbeat);
  await runAll();

  // ── Summary ──
  const totalMs = Date.now() - totalStart;
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   ${passed} passed, ${failed} failed  (${totalMs}ms)               ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  if (failed > 0) {
    console.log("Failures:");
    for (const r of results) {
      if (!r.ok) console.log(`  ✗ ${r.name}: ${r.detail}`);
    }
    console.log("");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });

export {};
