# Authority-Based Decision Router Implementation Plan

> Historical implementation plan. Current canonical tests use live souls IDs from `docs/ops/callscore-channel-head-souls.yaml`; translate any pre-CMO snippets such as `callscore-x-linkedin-growth-head` to current IDs before reuse.

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task with TDD.

**Goal:** Replace the monolithic `decideChannelHeadAction()` with an authority-based decision router that separates hard gates from priority scoring and dispatches to focused handlers per action authority tier.

**Architecture:** Keep the existing LangGraph graph (one graph, 5 nodes). Replace the single `channel_head_decision` node with a `decision_router` that reads each agent's declared capabilities from a typed registry and dispatches to the correct authority-specific handler. Handlers are typed functions with their own gate chains and scoring, not separate subgraphs. Receipts remain the contract boundary.

**Tech Stack:** TypeScript, @langchain/langgraph, Zod, node:test (native, no jest/vitest). Test command: `node --import tsx --test tests/<file>.ts`.

**Skills to update after implementation:**
- `callscore-system-activation` — reflect new architecture
- `hermes-orchestrator` — reflect new routing model
- `callscore-startup` — reflect new decision architecture

---

### Task 1: Define ActionAuthority type and capability registry (RED)

**Objective:** Create a typed enum and agent-to-authority mapping as a single source of truth.

**Files:**
- Create: `src/lib/autonomy/action-authority.ts`
- Test: `tests/action-authority.test.ts`

**Step 1: Write failing test**

`tests/action-authority.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionAuthority,
  authorityForAgent,
  authoritiesForClass,
  type ActionAuthorityType,
} from "../src/lib/autonomy/action-authority";

test("action-authority defines the 7 canonical authority tiers", () => {
  assert.equal(ActionAuthority.length, 7);
  assert.ok(ActionAuthority.includes("read_only_observe"));
  assert.ok(ActionAuthority.includes("internal_enqueue"));
  assert.ok(ActionAuthority.includes("draft_artifact"));
  assert.ok(ActionAuthority.includes("internal_state_mutation"));
  assert.ok(ActionAuthority.includes("owned_public_publish"));
  assert.ok(ActionAuthority.includes("gated_external_send"));
  assert.ok(ActionAuthority.includes("hard_gate"));
});

test("authorityForAgent returns correct authorities for known agents", () => {
  const xLinkedIn = authorityForAgent("callscore-x-linkedin-growth-head");
  assert.ok(xLinkedIn.includes("draft_artifact"));
  assert.ok(xLinkedIn.includes("owned_public_publish"));
  assert.ok(!xLinkedIn.includes("hard_gate"));
  assert.ok(!xLinkedIn.includes("read_only_observe"));
});

test("authorityForAgent returns correct authorities for sentinel agents", () => {
  const sentinel = authorityForAgent("callscore-data-pipeline-sentinel");
  assert.ok(sentinel.includes("read_only_observe"));
  assert.ok(sentinel.includes("hard_gate"));
  assert.ok(!sentinel.includes("owned_public_publish"));
});

test("authorityForAgent returns correct authorities for pipeline agents", () => {
  const discoverer = authorityForAgent("callscore-youtube-discovery-head");
  assert.ok(discoverer.includes("read_only_observe"));
  assert.ok(discoverer.includes("internal_enqueue"));
  const scorer = authorityForAgent("callscore-scorer-head");
  assert.ok(scorer.includes("internal_state_mutation"));
});

test("authorityForAgent returns class-based fallback for unknown agents", () => {
  const unknown = authorityForAgent("callscore-unknown-agent");
  assert.ok(Array.isArray(unknown));
  assert.ok(unknown.length > 0);
  assert.ok(unknown.includes("read_only_observe")); // default fallback
});

test("authoritiesForClass returns correct defaults per class", () => {
  assert.deepEqual(authoritiesForClass("channel_head"), ["draft_artifact", "owned_public_publish"]);
  assert.deepEqual(authoritiesForClass("sentinel"), ["read_only_observe", "hard_gate"]);
  assert.deepEqual(authoritiesForClass("gatekeeper"), ["hard_gate"]);
  assert.deepEqual(authoritiesForClass("pipeline_discovery"), ["read_only_observe", "internal_enqueue"]);
  assert.deepEqual(authoritiesForClass("research_head"), ["read_only_observe"]);
  assert.deepEqual(authoritiesForClass("pipeline_scorer"), ["internal_state_mutation"]);
  assert.deepEqual(authoritiesForClass("channel_head_gated_send"), ["draft_artifact", "gated_external_send"]);
});
```

Run: `node --import tsx --test tests/action-authority.test.ts`
Expected: FAIL — "Cannot find module"

**Step 2: Write minimal implementation**

`src/lib/autonomy/action-authority.ts`:
```ts
/** Canonical action authority tiers — the fundamental permission model. */
export const ActionAuthority = [
  "read_only_observe",       // scan, monitor, check freshness
  "internal_enqueue",        // enqueue jobs, mark states for downstream
  "draft_artifact",          // write campaign dossiers, drafts, approval packets
  "internal_state_mutation", // update leaderboards, scores, consensus snapshots
  "owned_public_publish",    // publish to owned X/LinkedIn/TG/Discord channels
  "gated_external_send",     // email, partnership, outreach (always gated)
  "hard_gate",               // compliance, safety, trust, data freshness gate
] as const;

export type ActionAuthorityType = (typeof ActionAuthority)[number];

/** Per-class default authorities — used as fallback when an agent ID is not in the registry. */
const CLASS_DEFAULTS: Record<string, ActionAuthorityType[]> = {
  strategist: ["draft_artifact", "owned_public_publish"],
  channel_head: ["draft_artifact", "owned_public_publish"],
  channel_head_gated_send: ["draft_artifact", "gated_external_send"],
  sentinel: ["read_only_observe", "hard_gate"],
  gatekeeper: ["hard_gate"],
  orchestrator: ["read_only_observe"],
  architect: ["read_only_observe"],
  implementer: ["draft_artifact"],
  reviewer: ["read_only_observe"],
  safety: ["hard_gate"],
  trust: ["hard_gate"],
  transcript_shadow: ["read_only_observe", "internal_enqueue"],
  runtime_worker: ["read_only_observe"],
  pipeline_discovery: ["read_only_observe", "internal_enqueue"],
  pipeline_scraper: ["read_only_observe", "internal_enqueue"],
  pipeline_extractor: ["read_only_observe"],
  pipeline_matcher: ["read_only_observe"],
  pipeline_scorer: ["internal_state_mutation"],
  pipeline_consensus: ["internal_state_mutation"],
  pipeline_verifier: ["read_only_observe"],
  pipeline_refresher: ["read_only_observe", "internal_enqueue"],
  pipeline_admission: ["read_only_observe", "internal_enqueue"],
  pipeline_markov: ["read_only_observe"],
  research_head: ["read_only_observe"],
};

/**
 * Explicit agent-to-authority overrides for agents whose authority
 * doesn't match their class default. Keys are agent_ids.
 */
const AGENT_OVERRIDES: Record<string, ActionAuthorityType[]> = {
  "callscore-artofwar-strategist": ["draft_artifact", "owned_public_publish"],
  "callscore-whop-commerce-head": ["draft_artifact", "gated_external_send"],
  "callscore-email-partnership-drafts-head": ["draft_artifact", "gated_external_send"],
};

/**
 * Extract agent class from an agent_id by stripping the "callscore-" prefix
 * and the "-head" suffix, then taking the last segment.
 */
function inferClass(agentId: string): string {
  const stripped = agentId.replace(/^callscore-/, "").replace(/-head$/, "");
  const segments = stripped.split("-");
  // Pipeline agents have class after the pipeline_ prefix
  if (segments[0] === "data") return "sentinel";
  if (segments[0] === "pipeline") return `pipeline_${segments[1]}`;
  // Known non-pipeline classes
  const classMap: Record<string, string> = {
    artofwar: "strategist",
    x: "channel_head",
    linkedin: "channel_head",
    community: "channel_head",
    whop: "channel_head_gated_send",
    email: "channel_head_gated_send",
    partnership: "channel_head_gated_send",
    opportunity: "research_head",
    compliance: "gatekeeper",
    orchestrator: "orchestrator",
    architect: "architect",
    implementer: "implementer",
    reviewer: "reviewer",
    safety: "safety",
    trust: "trust",
    gemma: "transcript_shadow",
    transcript: "transcript_shadow",
    channel: "runtime_worker",
    agent: "runtime_worker",
    worker: "runtime_worker",
  };
  return classMap[segments[0]] ?? segments[0];
}

export function authoritiesForClass(className: string): ActionAuthorityType[] {
  return CLASS_DEFAULTS[className] ?? ["read_only_observe"];
}

export function authorityForAgent(agentId: string): ActionAuthorityType[] {
  if (AGENT_OVERRIDES[agentId]) return AGENT_OVERRIDES[agentId];
  return authoritiesForClass(inferClass(agentId));
}
```

**Step 3: Run test to verify pass**

Run: `node --import tsx --test tests/action-authority.test.ts`
Expected: PASS — all 6 tests pass

**Step 4: Commit**

```bash
cd /opt/crypto-tuber-ranked
git add src/lib/autonomy/action-authority.ts tests/action-authority.test.ts
git commit -m "feat: add ActionAuthority type and capability registry"
```

---

### Task 2: Extract hard gates from scoring into pure gate functions (RED)

**Objective:** Separate the hard gate checks currently mixed into `scoreChannelHeadCandidate()` into a prioritized gate chain. The scoring function keeps only the averaging/confidence logic.

**Files:**
- Create: `src/lib/autonomy/decision-gates.ts`
- Modify: `src/lib/autonomy/channel-head-scoring.ts` (simplify to pure scoring)
- Test: `tests/decision-gates.test.ts`

**Step 1: Write failing test**

`tests/decision-gates.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateGates,
  checkKillSwitchAndHeartbeat,
  checkPublicVerify,
  checkCooldownAndWorkplane,
  checkRiskClass,
  checkOwnedPublicBoundaries,
  checkEvidenceAndCaps,
  checkMediaAndOriginality,
  checkQualityThreshold,
  checkReviewThreshold,
  type GateResult,
} from "../src/lib/autonomy/decision-gates";
import type { ChannelHeadDecisionContext } from "../src/lib/autonomy/channel-head-context";

const now = "2026-06-21T12:00:00.000Z";
const later = "2026-06-21T13:00:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;

function baseCtx(overrides: Partial<ChannelHeadDecisionContext> = {}): ChannelHeadDecisionContext {
  return {
    now, taskId: "task-1", targetActionType: "publish_owned_public",
    riskClass: "safe_owned_public",
    channelHeadSoul: { agentId: "test-agent", channelId: "test-channel", soulVersion: "v1", purpose: "test" },
    gtmRegistryState: { laneId: "test", currentStatus: "ready_public_owned", requiredGate: "NONE", ownedOrManaged: true, zeroSpendRequired: true, allowedActions: ["publish_owned_public"], forbiddenActions: [], rollbackPath: "/rollback" },
    workplane: { status: "OK", blockers: [] },
    recentReceipts: [],
    cooldown: { channelCooldownActive: false, providerErrorCooldownActive: false, duplicatePayloadCooldownActive: false, waitUntil: later },
    mediaGate: { status: "pass", evidenceHash: hash, artifactIds: ["media-1"] },
    originalityGate: { status: "pass", evidenceHash: hash },
    qualitySignal: { status: "pass", score: 0.92, verifierSignal: "pass", evidenceHash: hash },
    channelPolicy: { policyVersion: "v1", publicClaimsSupported: true, claimBearingAllowed: true, safeOwnedPublicAllowed: true, requiresNonFounderReviewBelowConfidence: 0.8 },
    evidence: { evidenceLevel: "E3", evidenceHash: hash, sourceArtifactIds: ["art-1"] },
    payloadHash: hash,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: "hb-1", fresh: true, lease_expires_at: later },
    publicVerify: { status: "pass", checked_at: now },
    ...overrides,
  };
}

test("checkKillSwitchAndHeartbeat returns gate_pass when healthy", () => {
  const result = checkKillSwitchAndHeartbeat(baseCtx());
  assert.equal(result, null); // null = pass through
});

test("checkKillSwitchAndHeartbeat returns wait when kill switch active", () => {
  const result = checkKillSwitchAndHeartbeat(baseCtx({ killSwitch: { ...baseCtx().killSwitch, global_active: true } }));
  assert.ok(result);
  assert.equal(result!.decision, "wait");
  assert.ok(result!.reason_codes!.includes("global_kill_switch_active"));
});

test("checkOwnedPublicBoundaries returns gate_pass when all clear", () => {
  const result = checkOwnedPublicBoundaries(baseCtx());
  assert.equal(result, null);
});

test("checkOwnedPublicBoundaries returns suppress when registry not ready", () => {
  const result = checkOwnedPublicBoundaries(baseCtx({ gtmRegistryState: { ...baseCtx().gtmRegistryState, currentStatus: "gated" } }));
  assert.ok(result);
  assert.equal(result!.decision, "suppress");
});

test("evaluateGates chains gates in priority order and returns first hit", () => {
  // All clear -> null
  assert.equal(evaluateGates(baseCtx()), null);

  // Kill switch triggered -> wait (even if other things fail)
  const killSwitchHit = evaluateGates(baseCtx({ killSwitch: { ...baseCtx().killSwitch, global_active: true }, evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] } }));
  assert.equal(killSwitchHit!.decision, "wait");

  // Restricted risk -> request_gate
  const restrictedHit = evaluateGates(baseCtx({ riskClass: "restricted_provider", gtmRegistryState: { ...baseCtx().gtmRegistryState, currentStatus: "gated" } }));
  assert.equal(restrictedHit!.decision, "request_gate");
});

test("checkQualityThreshold returns suppress when score below minimum", () => {
  const result = checkQualityThreshold(baseCtx({ qualitySignal: { ...baseCtx().qualitySignal, score: 0.31, status: "fail" } }));
  assert.ok(result);
  assert.equal(result!.decision, "suppress");
});
```

Run: `node --import tsx --test tests/decision-gates.test.ts`
Expected: FAIL — "Cannot find module"

**Step 2: Write minimal implementation**

`src/lib/autonomy/decision-gates.ts`:
```ts
import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { ChannelHeadDecisionValue } from "./contracts";
import { classifyChannelHeadRisk } from "./risk-classifier";

export interface GateResult {
  readonly decision: ChannelHeadDecisionValue;
  readonly reason_codes: readonly string[];
  readonly gate_required?: string | null;
  readonly suppress_until?: string | null;
  readonly wait_until?: string | null;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

/** Gate 1: Kill switch, heartbeat lease, agent pause */
export function checkKillSwitchAndHeartbeat(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.killSwitch.global_active) return { decision: "wait", reason_codes: ["global_kill_switch_active"], wait_until: addMinutes(ctx.now, 15) };
  if (ctx.killSwitch.channel_active) return { decision: "wait", reason_codes: ["channel_kill_switch_active"], wait_until: addMinutes(ctx.now, 15) };
  if (ctx.killSwitch.agent_paused) return { decision: "wait", reason_codes: ["agent_paused"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.heartbeat_id) return { decision: "wait", reason_codes: ["heartbeat_missing"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.fresh) return { decision: "wait", reason_codes: ["heartbeat_stale"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.lease_expires_at) return { decision: "wait", reason_codes: ["heartbeat_lease_missing"], wait_until: addMinutes(ctx.now, 15) };
  if (new Date(ctx.heartbeat.lease_expires_at).getTime() <= new Date(ctx.now).getTime()) return { decision: "wait", reason_codes: ["heartbeat_lease_expired"], wait_until: addMinutes(ctx.now, 15) };
  return null;
}

/** Gate 2: Public live-verify status */
export function checkPublicVerify(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.publicVerify.status === "fail") return { decision: "suppress", reason_codes: ["public_verify_failed"], suppress_until: addMinutes(ctx.now, 24 * 60) };
  if (ctx.publicVerify.status === "unknown") return { decision: "suppress", reason_codes: ["public_verify_unknown"], suppress_until: addMinutes(ctx.now, 24 * 60) };
  if (!ctx.publicVerify.checked_at) return { decision: "suppress", reason_codes: ["public_verify_missing_checked_at"], suppress_until: addMinutes(ctx.now, 24 * 60) };
  return null;
}

/** Gate 3: Cooldown and Workplane status */
export function checkCooldownAndWorkplane(ctx: ChannelHeadDecisionContext): GateResult | null {
  const blockers: string[] = [];
  if (ctx.cooldown.channelCooldownActive) blockers.push("channel_cooldown_active");
  if (ctx.cooldown.providerErrorCooldownActive) blockers.push("provider_error_cooldown_active");
  if (ctx.cooldown.duplicatePayloadCooldownActive) blockers.push("duplicate_payload_cooldown_active");
  if (ctx.workplane.status === "BLOCKED") blockers.push("workplane_blocked");
  if (blockers.length > 0) return { decision: "wait", reason_codes: blockers, wait_until: ctx.cooldown.waitUntil ?? addMinutes(ctx.now, 60) };
  return null;
}

/** Gate 4: Risk class — restricted actions require explicit gate evidence */
export function checkRiskClass(ctx: ChannelHeadDecisionContext): GateResult | null {
  const risk = classifyChannelHeadRisk(ctx);
  if (risk.action_risk === "restricted") return { decision: "request_gate", reason_codes: risk.reason_codes, gate_required: risk.gate_required };
  return null;
}

/** Gate 5: Owned-public boundary checks (registry, policy, action allow/forbid) */
export function checkOwnedPublicBoundaries(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.targetActionType !== "publish_owned_public") return null;
  const reasons: string[] = [];
  if (ctx.gtmRegistryState.currentStatus !== "ready_public_owned") reasons.push("registry_not_ready");
  if (!ctx.gtmRegistryState.ownedOrManaged) reasons.push("not_owned_or_managed");
  if (!ctx.gtmRegistryState.zeroSpendRequired) reasons.push("non_zero_spend");
  if (!ctx.gtmRegistryState.allowedActions.includes(ctx.targetActionType)) reasons.push("action_not_allowed");
  if (ctx.gtmRegistryState.forbiddenActions.includes(ctx.targetActionType)) reasons.push("action_forbidden");
  if (!ctx.channelPolicy.safeOwnedPublicAllowed) reasons.push("policy_disallows_safe_owned_public");
  if (reasons.length > 0) return { decision: "suppress", reason_codes: [...new Set(reasons)], suppress_until: addMinutes(ctx.now, 24 * 60) };
  return null;
}

/** Gate 6: Evidence and daily caps */
export function checkEvidenceAndCaps(ctx: ChannelHeadDecisionContext): GateResult | null {
  const reasons: string[] = [];
  if (ctx.evidence.evidenceLevel === "E0" || !ctx.evidence.evidenceHash || ctx.evidence.sourceArtifactIds.length === 0) reasons.push("evidence_incomplete");
  if (!ctx.channelPolicy.claimBearingAllowed) reasons.push("claim_bearing_not_allowed");
  if (!ctx.channelPolicy.publicClaimsSupported) reasons.push("public_claims_not_supported");
  if (ctx.caps.channelPostsToday >= ctx.caps.maxChannelPostsPerDay) reasons.push("channel_daily_cap_reached");
  if (ctx.caps.totalPostsToday >= ctx.caps.maxTotalPostsPerDay) reasons.push("global_daily_cap_reached");
  if (reasons.length > 0) return { decision: "suppress", reason_codes: [...new Set(reasons)], suppress_until: addMinutes(ctx.now, 24 * 60) };
  return null;
}

/** Gate 7: Media gate and originality gate */
export function checkMediaAndOriginality(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.mediaGate.status === "missing") return { decision: "suppress", reason_codes: ["media_gate_missing"], suppress_until: addMinutes(ctx.now, 24 * 60) };
  if (ctx.mediaGate.status === "fail") return { decision: "suppress", reason_codes: ["media_gate_failed"], suppress_until: addMinutes(ctx.now, 24 * 60) };
  if (ctx.originalityGate.status === "fail") return { decision: "suppress", reason_codes: ["originality_gate_failed"], suppress_until: addMinutes(ctx.now, 24 * 60) };
  if (ctx.originalityGate.status === "missing") return { decision: "suppress", reason_codes: ["originality_gate_missing"], suppress_until: addMinutes(ctx.now, 24 * 60) };
  return null;
}

/** Gate 8: Quality score threshold — suppress if too low */
export function checkQualityThreshold(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.qualitySignal.status === "fail" || ctx.qualitySignal.score < 0.5) return { decision: "suppress", reason_codes: ["quality_signal_failed", "verifier_confidence_low"], suppress_until: addMinutes(ctx.now, 24 * 60) };
  return null;
}

/** Gate 9: Ambiguous quality — escalate to non-founder review */
export function checkReviewThreshold(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.qualitySignal.status === "ambiguous") return { decision: "escalate_non_founder_review", reason_codes: ["quality_signal_ambiguous", "non_founder_review_required"] };
  if (ctx.qualitySignal.score < ctx.channelPolicy.requiresNonFounderReviewBelowConfidence) return { decision: "escalate_non_founder_review", reason_codes: ["confidence_below_non_founder_review_threshold", "non_founder_review_required"] };
  return null;
}

/**
 * Evaluate gates in priority order. Returns the first gate that triggers,
 * or null if all gates pass (action is allowed).
 */
export function evaluateGates(ctx: ChannelHeadDecisionContext): GateResult | null {
  const gates = [
    checkKillSwitchAndHeartbeat,
    checkPublicVerify,
    checkCooldownAndWorkplane,
    checkRiskClass,
    checkOwnedPublicBoundaries,
    checkEvidenceAndCaps,
    checkMediaAndOriginality,
    checkQualityThreshold,
    checkReviewThreshold,
  ] as const;
  for (const gate of gates) {
    const result = gate(ctx);
    if (result) return result;
  }
  return null;
}
```

**Step 3: Run test to verify pass**

Run: `node --import tsx --test tests/decision-gates.test.ts`
Expected: PASS — all tests pass

**Step 4: Simplify `channel-head-scoring.ts` to pure scoring**

Remove the gate logic — scoring now only computes dimension scores and confidence.

`src/lib/autonomy/channel-head-scoring.ts`:
```ts
import type { ChannelHeadDecisionContext } from "./channel-head-context";
import { classifyChannelHeadRisk } from "./risk-classifier";

export type ChannelHeadScoreDecision = "act" | "suppress" | "review" | "request_gate" | "wait";
export type ChannelHeadConfidenceBucket = "low" | "medium" | "high";

export interface ChannelHeadScoreDimension {
  readonly name: string;
  readonly score: number;
  readonly reason_codes: readonly string[];
}

export interface ChannelHeadCandidateScore {
  readonly total_score: number;
  readonly confidence_bucket: ChannelHeadConfidenceBucket;
  readonly dimensions: readonly ChannelHeadScoreDimension[];
  readonly reason_codes: readonly string[];
}

export const DIMENSION_NAMES = [
  "freshness",
  "evidence_completeness",
  "cooldown_clearance",
  "novelty_originality",
  "media_readiness",
  "public_claim_risk",
  "prior_performance_receipt_signal",
  "verifier_confidence",
  "channel_fit",
  "action_risk",
] as const;

function dimension(name: (typeof DIMENSION_NAMES)[number], score: number, reason_codes: readonly string[]): ChannelHeadScoreDimension {
  return { name, score: Math.max(0, Math.min(1, score)), reason_codes };
}

function average(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function confidenceBucket(totalScore: number): ChannelHeadConfidenceBucket {
  if (totalScore >= 0.85) return "high";
  if (totalScore >= 0.6) return "medium";
  return "low";
}

/**
 * Pure priority scoring — computes dimension scores and confidence.
 * Does NOT make gate decisions. Call evaluateGates() first.
 */
export function scoreChannelHeadCandidate(context: ChannelHeadDecisionContext): ChannelHeadCandidateScore {
  const risk = classifyChannelHeadRisk(context);
  const cooldownClear = !context.cooldown.channelCooldownActive && !context.cooldown.providerErrorCooldownActive && !context.cooldown.duplicatePayloadCooldownActive;
  const evidenceComplete = context.evidence.evidenceLevel !== "E0" && Boolean(context.evidence.evidenceHash) && context.evidence.sourceArtifactIds.length > 0;
  const mediaReady = context.mediaGate.status === "pass" && context.mediaGate.artifactIds.length > 0;
  const originalityReady = context.originalityGate.status === "pass";
  const policyClear = context.channelPolicy.publicClaimsSupported && context.channelPolicy.claimBearingAllowed;
  const channelFit = context.gtmRegistryState.currentStatus === "ready_public_owned" && context.gtmRegistryState.ownedOrManaged && context.gtmRegistryState.zeroSpendRequired && context.gtmRegistryState.allowedActions.includes(context.targetActionType) && !context.gtmRegistryState.forbiddenActions.includes(context.targetActionType) && context.channelPolicy.safeOwnedPublicAllowed;
  const qualityScore = context.qualitySignal.status === "fail" ? 0 : context.qualitySignal.score;
  const receiptScore = Math.min(1, context.recentReceipts.length / 2);

  const dimensions = [
    dimension("freshness", context.workplane.status === "OK" ? 1 : 0.4, [context.workplane.status === "OK" ? "workplane_ok" : "workplane_not_ok"]),
    dimension("evidence_completeness", evidenceComplete ? 1 : 0, [evidenceComplete ? "evidence_complete" : "evidence_incomplete"]),
    dimension("cooldown_clearance", cooldownClear ? 1 : 0, [cooldownClear ? "cooldown_clear" : "cooldown_active"]),
    dimension("novelty_originality", originalityReady ? 1 : 0, [originalityReady ? "originality_gate_passed" : "originality_gate_not_passed"]),
    dimension("media_readiness", mediaReady ? 1 : 0, [mediaReady ? "media_ready" : "media_not_ready"]),
    dimension("public_claim_risk", policyClear ? 1 : 0, [policyClear ? "public_claim_policy_clear" : "public_claim_policy_blocked"]),
    dimension("prior_performance_receipt_signal", receiptScore, [receiptScore > 0 ? "prior_receipts_present" : "prior_receipts_missing"]),
    dimension("verifier_confidence", qualityScore, [qualityScore >= 0.8 ? "verifier_confidence_high" : qualityScore >= 0.6 ? "verifier_confidence_medium" : "verifier_confidence_low"]),
    dimension("channel_fit", channelFit ? 1 : 0, [channelFit ? "channel_fit_clear" : "channel_fit_blocked"]),
    dimension("action_risk", risk.action_risk === "low" ? 1 : 0, risk.reason_codes),
  ];
  const totalScore = Number(average(dimensions.map((d) => d.score)).toFixed(4));
  const reasonCodes = [...new Set(dimensions.flatMap((d) => d.reason_codes))];

  return {
    total_score: totalScore,
    confidence_bucket: confidenceBucket(totalScore),
    dimensions,
    reason_codes: [...reasonCodes, "score_computed"],
  };
}
```

**Step 5: Update scoring test to match pure scoring shape**

The existing `tests/channel-head-scoring.test.ts` tests will need updates — the scoring function no longer returns a `decision` or `gate_required` field. Keep the tests that check dimension names, scores, and confidence bucket. Remove tests that assert decision routing (those move to `decision-gates.test.ts`).

**Step 6: Verify scoring tests still pass**

Run: `node --import tsx --test tests/channel-head-scoring.test.ts`
Expected: updated tests all pass

**Step 7: Commit**

```bash
cd /opt/crypto-tuber-ranked
git add src/lib/autonomy/decision-gates.ts src/lib/autonomy/channel-head-scoring.ts tests/decision-gates.test.ts tests/channel-head-scoring.test.ts
git commit -m "feat: extract hard gates from scoring into prioritized gate chain"
```

---

### Task 3: Create authority-specific decision handlers (RED)

**Objective:** Create a decision handler for each authority tier. Each handler: receives context → runs gates → if gates pass, runs scoring → produces action/receipt.

**Files:**
- Create: `src/lib/autonomy/decision-handlers/owned-public-publish.ts`
- Create: `src/lib/autonomy/decision-handlers/read-only-observe.ts`
- Create: `src/lib/autonomy/decision-handlers/hard-gate.ts`
- Create: `src/lib/autonomy/decision-handlers/draft-artifact.ts`
- Create: `src/lib/autonomy/decision-handlers/index.ts`
- Test: `tests/decision-handlers/owned-public-publish.test.ts`

**Step 1: Write failing test**

`tests/decision-handlers/owned-public-publish.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { handleOwnedPublicPublish } from "../../src/lib/autonomy/decision-handlers/owned-public-publish";
import { ChannelHeadDecisionSchema, AutonomyReceiptSchema } from "../../src/lib/autonomy/contracts";
import type { ChannelHeadDecisionContext } from "../../src/lib/autonomy/channel-head-context";

const now = "2026-06-21T12:00:00.000Z";
const later = "2026-06-21T13:00:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;

function baseCtx(overrides: Partial<ChannelHeadDecisionContext> = {}): ChannelHeadDecisionContext {
  return {
    now, taskId: "task-1", targetActionType: "publish_owned_public",
    riskClass: "safe_owned_public",
    channelHeadSoul: { agentId: "callscore-x-linkedin-growth-head", channelId: "owned_social", soulVersion: "v1", purpose: "test" },
    gtmRegistryState: { laneId: "owned-social", currentStatus: "ready_public_owned", requiredGate: "NONE", ownedOrManaged: true, zeroSpendRequired: true, allowedActions: ["publish_owned_public"], forbiddenActions: [], rollbackPath: "/rollback" },
    workplane: { status: "OK", blockers: [] },
    recentReceipts: [],
    cooldown: { channelCooldownActive: false, providerErrorCooldownActive: false, duplicatePayloadCooldownActive: false, waitUntil: later },
    mediaGate: { status: "pass", evidenceHash: hash, artifactIds: ["media-1"] },
    originalityGate: { status: "pass", evidenceHash: hash },
    qualitySignal: { status: "pass", score: 0.92, verifierSignal: "pass", evidenceHash: hash },
    channelPolicy: { policyVersion: "v1", publicClaimsSupported: true, claimBearingAllowed: true, safeOwnedPublicAllowed: true, requiresNonFounderReviewBelowConfidence: 0.8 },
    evidence: { evidenceLevel: "E3", evidenceHash: hash, sourceArtifactIds: ["art-1"] },
    payloadHash: hash,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: "hb-1", fresh: true, lease_expires_at: later },
    publicVerify: { status: "pass", checked_at: now },
    ...overrides,
  };
}

test("owned-public-publish handler acts when all gates pass and quality is high", () => {
  const result = handleOwnedPublicPublish(baseCtx());
  assert.equal(result.decision.decision, "act");
  assert.equal(result.decision.proposed_action?.action_type, "publish_owned_public");
  assert.equal(result.decision.risk_class, "safe_owned_public");
  assert.equal(ChannelHeadDecisionSchema.parse(result.decision).decision, "act");
  assert.equal(AutonomyReceiptSchema.parse(result.receipt).receipt_id, result.receipt.receipt_id);
});

test("owned-public-publish handler waits when kill switch is active", () => {
  const result = handleOwnedPublicPublish(baseCtx({
    killSwitch: { ...baseCtx().killSwitch, global_active: true },
  }));
  assert.equal(result.decision.decision, "wait");
  assert.equal(result.receipt.status, "blocked");
});

test("owned-public-publish handler suppresses when evidence is missing", () => {
  const result = handleOwnedPublicPublish(baseCtx({
    evidence: { evidenceLevel: "E0", evidenceHash: null, sourceArtifactIds: [] },
  }));
  assert.equal(result.decision.decision, "suppress");
  assert.equal(result.receipt.status, "suppressed");
  assert.ok(result.decision.reason_codes.includes("evidence_incomplete"));
});

test("owned-public-publish handler requests gate for restricted risk", () => {
  const result = handleOwnedPublicPublish(baseCtx({
    riskClass: "restricted_provider",
    gtmRegistryState: { ...baseCtx().gtmRegistryState, currentStatus: "gated", requiredGate: "PRODUCTION_GATE" },
  }));
  assert.equal(result.decision.decision, "request_gate");
  assert.equal(result.decision.gate_required, "PRODUCTION_GATE");
});

test("owned-public-publish handler escalates ambiguous quality to non-founder review", () => {
  const result = handleOwnedPublicPublish(baseCtx({
    qualitySignal: { ...baseCtx().qualitySignal, status: "ambiguous", score: 0.67 },
  }));
  assert.equal(result.decision.decision, "escalate_non_founder_review");
  assert.equal(result.decision.non_founder_review_required, true);
});
```

Run: `node --import tsx --test tests/decision-handlers/owned-public-publish.test.ts`
Expected: FAIL — "Cannot find module"

**Step 2: Write minimal implementation**

`src/lib/autonomy/decision-handlers/index.ts`:
```ts
export { handleOwnedPublicPublish } from "./owned-public-publish";
export { handleReadOnlyObserve } from "./read-only-observe";
export { handleHardGate } from "./hard-gate";
export { handleDraftArtifact } from "./draft-artifact";
```

`src/lib/autonomy/decision-handlers/owned-public-publish.ts`:
```ts
import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import { evaluateGates } from "../decision-gates";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { decideChannelHeadAction } from "../channel-head-decision";
import { scoreChannelHeadCandidate } from "../channel-head-scoring";
import { ChannelHeadDecisionSchema, AutonomyReceiptSchema } from "../contracts";

/**
 * Owned-public-publish handler — full gate chain + scoring + action proposal.
 * Supports act, wait, suppress, request_gate, and escalate_non_founder_review.
 */
export function handleOwnedPublicPublish(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  // First run gates
  const gateResult = evaluateGates(context);

  if (gateResult) {
    // Gate triggered — use the gate decision builder to produce a clean result
    return makeDecisionFromGates(context, gateResult);
  }

  // All gates pass — use the existing decision engine for the final act/review
  // (which now delegates to scoring only, not re-checking gates)
  return decideChannelHeadAction(context);
}
```

But wait — `decideChannelHeadAction` currently still has its own gate logic embedded. For this to work cleanly, `decideChannelHeadAction` needs to be refactored to only handle the "all gates pass" path. Let me think about this more carefully.

Actually, the cleaner approach is to create a `makeDecisionFromGates` helper and a `makeActDecision` helper that splits the current `decideChannelHeadAction` into two parts.

Let me create the gate-decision-builder first:

`src/lib/autonomy/gate-decision-builder.ts`:
```ts
import { createHash } from "node:crypto";
import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { ChannelHeadDecisionResult } from "./channel-head-decision";
import type { ChannelHeadDecision } from "./contracts";
import type { AutonomyReceipt } from "./contracts";
import type { GateResult } from "./decision-gates";
import { scoreChannelHeadCandidate } from "./channel-head-scoring";
import { ChannelHeadDecisionSchema, AutonomyReceiptSchema } from "./contracts";
import { actionFor, joinedHash, explanationFor } from "./decision-helpers";

function idFor(prefix: string, parts: readonly unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function receiptStatus(decision: ChannelHeadDecision["decision"]): AutonomyReceipt["status"] {
  switch (decision) {
    case "act": return "succeeded";
    case "suppress": return "suppressed";
    case "escalate_non_founder_review": return "review";
    default: return "blocked";
  }
}

/**
 * Build a complete ChannelHeadDecisionResult from a gate result.
 * Used when a gate short-circuits the normal flow.
 */
export function makeDecisionFromGates(context: ChannelHeadDecisionContext, gate: GateResult): ChannelHeadDecisionResult {
  const score = scoreChannelHeadCandidate(context);
  const decisionId = idFor("decision", [context.now, context.taskId, context.channelHeadSoul.agentId, context.payloadHash, context.riskClass, context.targetActionType]);
  const receiptId = idFor("receipt", [decisionId, context.channelHeadSoul.agentId]);
  const inputSnapshotId = idFor("snapshot", [context.now, context.channelHeadSoul.agentId, context.gtmRegistryState.laneId]);
  const nextWakeAt = context.cooldown.waitUntil ?? addMinutes(context.now, 60);

  const decision: ChannelHeadDecision = ChannelHeadDecisionSchema.parse({
    schema_version: "callscore_channel_head_decision.v1",
    decision_id: decisionId,
    created_at: context.now,
    agent_id: context.channelHeadSoul.agentId,
    channel_id: context.channelHeadSoul.channelId,
    task_id: context.taskId,
    input_snapshot_id: inputSnapshotId,
    risk_class: context.riskClass,
    decision: gate.decision,
    confidence: Math.max(0, Math.min(1, score.total_score)),
    reason_codes: [...new Set([...gate.reason_codes, ...score.reason_codes])],
    explanation: explanationFor(gate.decision, gate.reason_codes as readonly string[]),
    proposed_action: gate.decision === "act" ? actionFor(context, decisionId) : null,
    gate_required: gate.gate_required ?? null,
    gate_receipt_id: context.gtmRegistryState.requiredReceipt ?? null,
    non_founder_review_required: gate.decision === "escalate_non_founder_review",
    suppress_until: gate.suppress_until ?? null,
    wait_until: gate.wait_until ?? null,
    blockers: [...new Set(gate.reason_codes)],
    receipts_to_write: [receiptId],
    next_wake_at: nextWakeAt,
  });

  const receipt: AutonomyReceipt = AutonomyReceiptSchema.parse({
    schema_version: "callscore_autonomy_receipt.v1",
    receipt_id: receiptId,
    created_at: context.now,
    agent_id: context.channelHeadSoul.agentId,
    channel_id: context.channelHeadSoul.channelId,
    run_id: null,
    task_id: context.taskId,
    receipt_type: "decision",
    status: receiptStatus(decision.decision),
    risk_class: context.riskClass,
    payload_hash: context.payloadHash,
    evidence_hash: joinedHash(context),
    policy_version: context.channelPolicy.policyVersion,
    soul_version: context.channelHeadSoul.soulVersion,
    dry_run: decision.decision !== "act",
    external_mutation_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    send_or_outreach_performed: false,
    gate_required: decision.gate_required,
    gate_receipt_id: decision.gate_receipt_id,
    idempotency_key: receiptId,
    parent_receipt_ids: [...context.recentReceipts],
    artifact_path: `.tmp/workflow-receipts/channel_head_decisions/${receiptId}.json`,
    rollback_path: context.gtmRegistryState.rollbackPath ?? null,
    summary: explanationFor(decision.decision, gate.reason_codes as readonly string[]),
    detail: {
      decision_id: decision.decision_id,
      input_snapshot_id: decision.input_snapshot_id,
      reason_codes: decision.reason_codes,
      target_action_type: context.targetActionType,
      restricted_lanes_fail_closed: true,
    },
  });

  return { input: context, decision, receipt };
}
```

And `decision-helpers.ts`:
```ts
import { createHash } from "node:crypto";
import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { ChannelHeadAction } from "./contracts";
import type { ChannelHeadDecisionValue } from "./contracts";

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function idFor(prefix: string, parts: readonly unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

function gateForRiskClass(riskClass: string, requiredGate: string | undefined): string | null {
  if (requiredGate && requiredGate !== "NONE") return requiredGate;
  switch (riskClass) {
    case "restricted_provider":
    case "restricted_db_deploy": return "PRODUCTION_GATE";
    case "restricted_financial": return "FINANCIAL_GATE";
    case "restricted_credentials": return "SECRET_GATE";
    case "restricted_outreach": return "SEND_GATE";
    case "public_claim_risk": return "PUBLISH_GATE";
    default: return null;
  }
}

export function joinedHash(context: ChannelHeadDecisionContext): string | null {
  return context.evidence.evidenceHash ?? context.qualitySignal.evidenceHash ?? context.mediaGate.evidenceHash ?? context.payloadHash;
}

export function actionFor(context: ChannelHeadDecisionContext, decisionId: string, actionType = context.targetActionType): ChannelHeadAction {
  const evidenceHash = joinedHash(context) ?? sha256(decisionId);
  return {
    schema_version: "callscore_channel_head_action.v1",
    action_id: idFor("action", [decisionId, actionType]),
    created_at: context.now,
    agent_id: context.channelHeadSoul.agentId,
    channel_id: context.channelHeadSoul.channelId,
    action_type: actionType,
    risk_class: context.riskClass,
    dry_run: actionType !== "publish_owned_public",
    external_mutation_requested: actionType === "publish_owned_public",
    external_mutation_performed: false,
    restricted_gate_required: gateForRiskClass(context.riskClass, context.gtmRegistryState.requiredGate),
    gate_receipt_id: context.gtmRegistryState.requiredReceipt ?? null,
    payload_hash: context.payloadHash ?? evidenceHash,
    evidence_hash: evidenceHash,
    idempotency_key: `${context.channelHeadSoul.agentId}:${actionType}:${context.taskId ?? decisionId}`,
    parent_receipt_ids: [...context.recentReceipts],
    rollback_path: context.gtmRegistryState.rollbackPath ?? null,
    provider: null,
    provider_operation: null,
    reason: `Channel-head decision selected ${actionType}.`,
    metadata: { lane_id: context.gtmRegistryState.laneId, workplane_status: context.workplane.status, quality_score: context.qualitySignal.score },
  };
}

export function explanationFor(decision: ChannelHeadDecisionValue, blockers: readonly string[]): string {
  switch (decision) {
    case "act": return "Safe owned-public action has complete evidence, media, originality, policy, and Workplane signals.";
    case "wait": return `Decision waits because cooldown or readiness blockers are active: ${blockers.join(", ")}.`;
    case "suppress": return `Decision suppressed because fail-closed quality/media/originality blockers are active: ${blockers.join(", ")}.`;
    case "request_gate": return `Restricted risk requires explicit gate evidence before action: ${blockers.join(", ")}.`;
    default: return `Ambiguous safe-owned-public item routed to non-founder review: ${blockers.join(", ")}.`;
  }
}
```

**Step 3-7: Remaining handlers (simpler)**

The `read-only-observe` handler only needs gates 1-2 (kill switch, public verify) — if those pass, it returns "act" with no mutation. Similarly for hard-gate and draft-artifact.

But actually, let me simplify this plan. The key insight is:

1. The existing `decideChannelHeadAction()` already handles the full gate chain for owned-public-publish. 
2. For other authority tiers, the handlers are much simpler — they don't need the full 10-dimension scoring.

For MVP, I'll create:
1. The gate chain (Task 2) — extracted and reusable
2. The decision router (Task 4) — dispatches by authority
3. The graph update (Task 5) — routes through the router
4. Make `decideChannelHeadAction()` use the extracted gates (Task 6)

The other authority handlers (read-only-observe, hard-gate, etc.) can be added incrementally. The router will fall back to the existing `decideChannelHeadAction()` for authority tiers that don't have dedicated handlers yet.

**Step 8: Commit**
```bash
cd /opt/crypto-tuber-ranked
git add src/lib/autonomy/decision-handlers/ src/lib/autonomy/gate-decision-builder.ts src/lib/autonomy/decision-helpers.ts tests/decision-handlers/
git commit -m "feat: add decision handlers and gate-decision-builder"
```

---

### Task 4: Create the authority-based decision router (RED)

**Objective:** Create the decision router that reads each agent's authority capabilities and dispatches to the correct handler.

**Files:**
- Create: `src/lib/autonomy/decision-router.ts`
- Test: `tests/decision-router.test.ts`

**Step 1: Write failing test**

`tests/decision-router.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { routeDecision } from "../src/lib/autonomy/decision-router";
import { ActionAuthority } from "../src/lib/autonomy/action-authority";
import type { ChannelHeadDecisionContext } from "../src/lib/autonomy/channel-head-context";

const now = "2026-06-21T12:00:00.000Z";
const later = "2026-06-21T13:00:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;

function baseCtx(overrides: Partial<ChannelHeadDecisionContext> = {}): ChannelHeadDecisionContext {
  return {
    now, taskId: "task-1", targetActionType: "publish_owned_public",
    riskClass: "safe_owned_public",
    channelHeadSoul: { agentId: "callscore-x-linkedin-growth-head", channelId: "owned_social", soulVersion: "v1", purpose: "test" },
    gtmRegistryState: { laneId: "owned-social", currentStatus: "ready_public_owned", requiredGate: "NONE", ownedOrManaged: true, zeroSpendRequired: true, allowedActions: ["publish_owned_public"], forbiddenActions: [], rollbackPath: "/rollback" },
    workplane: { status: "OK", blockers: [] },
    recentReceipts: [],
    cooldown: { channelCooldownActive: false, providerErrorCooldownActive: false, duplicatePayloadCooldownActive: false, waitUntil: later },
    mediaGate: { status: "pass", evidenceHash: hash, artifactIds: ["media-1"] },
    originalityGate: { status: "pass", evidenceHash: hash },
    qualitySignal: { status: "pass", score: 0.92, verifierSignal: "pass", evidenceHash: hash },
    channelPolicy: { policyVersion: "v1", publicClaimsSupported: true, claimBearingAllowed: true, safeOwnedPublicAllowed: true, requiresNonFounderReviewBelowConfidence: 0.8 },
    evidence: { evidenceLevel: "E3", evidenceHash: hash, sourceArtifactIds: ["art-1"] },
    payloadHash: hash,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: "hb-1", fresh: true, lease_expires_at: later },
    publicVerify: { status: "pass", checked_at: now },
    ...overrides,
  };
}

test("decision router dispatches owned_public_publish agents to the publish handler", () => {
  const result = routeDecision(baseCtx());
  assert.equal(result.decision.decision, "act");
  assert.equal(result.decision.proposed_action?.action_type, "publish_owned_public");
});

test("decision router dispatches sentinel agents through gates but allows observe", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-data-pipeline-sentinel", channelId: "data_pipeline", soulVersion: "v1", purpose: "test" },
    targetActionType: "monitor_read_only",
  }));
  assert.equal(result.decision.decision, "act");
});

test("decision router blocks sentinel when kill switch active", () => {
  const result = routeDecision(baseCtx({
    channelHeadSoul: { agentId: "callscore-data-pipeline-sentinel", channelId: "data_pipeline", soulVersion: "v1", purpose: "test" },
    targetActionType: "monitor_read_only",
    killSwitch: { ...baseCtx().killSwitch, global_active: true },
  }));
  assert.equal(result.decision.decision, "wait");
});
```

Run: `node --import tsx --test tests/decision-router.test.ts`
Expected: FAIL

**Step 2: Write minimal implementation**

`src/lib/autonomy/decision-router.ts`:
```ts
import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { ChannelHeadDecisionResult } from "./channel-head-decision";
import { authorityForAgent, ActionAuthority, type ActionAuthorityType } from "./action-authority";
import { handleOwnedPublicPublish } from "./decision-handlers/owned-public-publish";
import { handleReadOnlyObserve } from "./decision-handlers/read-only-observe";
import { handleHardGate } from "./decision-handlers/hard-gate";
import { handleDraftArtifact } from "./decision-handlers/draft-artifact";
import { decideChannelHeadAction } from "./channel-head-decision";

type DecisionHandler = (context: ChannelHeadDecisionContext) => ChannelHeadDecisionResult;

const HANDLER_REGISTRY: Partial<Record<ActionAuthorityType, DecisionHandler>> = {
  owned_public_publish: handleOwnedPublicPublish,
  read_only_observe: handleReadOnlyObserve,
  hard_gate: handleHardGate,
  draft_artifact: handleDraftArtifact,
};

/**
 * Route a decision through the correct handler based on the agent's
 * declared action authorities. Falls back to the legacy decision engine
 * when no specific handler is registered.
 */
export function routeDecision(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const agentId = context.channelHeadSoul.agentId;
  const authorities = authorityForAgent(agentId);

  // Find the most specific registered handler for this agent's authorities
  for (const authority of authorities) {
    const handler = HANDLER_REGISTRY[authority];
    if (handler) return handler(context);
  }

  // Fallback: use the legacy decision engine
  return decideChannelHeadAction(context);
}

/**
 * Batch route multiple agent contexts — used by the graph node.
 */
export function routeDecisions(contexts: readonly ChannelHeadDecisionContext[]): ChannelHeadDecisionResult[] {
  return contexts.map((ctx) => routeDecision(ctx));
}
```

**Step 3: Create the simpler handlers**

`src/lib/autonomy/decision-handlers/read-only-observe.ts`:
```ts
import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import { evaluateGates } from "../decision-gates";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { decideChannelHeadAction } from "../channel-head-decision";

/**
 * Read-only observe handler — minimal gate chain (kill switch + public verify).
 * If gates pass, delegates to the legacy decision engine for the act path.
 */
export function handleReadOnlyObserve(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  // Only check system-level gates for read-only ops
  const gateResult = evaluateGatesForObserve(context);
  if (gateResult) return makeDecisionFromGates(context, gateResult);
  return decideChannelHeadAction(context);
}

function evaluateGatesForObserve(ctx: ChannelHeadDecisionContext) {
  // Kill switch and heartbeat block everything
  if (ctx.killSwitch.global_active) return { decision: "wait" as const, reason_codes: ["global_kill_switch_active"] as readonly string[], wait_until: undefined };
  if (ctx.killSwitch.channel_active) return { decision: "wait" as const, reason_codes: ["channel_kill_switch_active"] as readonly string[], wait_until: undefined };
  if (!ctx.heartbeat.heartbeat_id) return { decision: "wait" as const, reason_codes: ["heartbeat_missing"] as readonly string[], wait_until: undefined };
  if (!ctx.heartbeat.fresh) return { decision: "wait" as const, reason_codes: ["heartbeat_stale"] as readonly string[], wait_until: undefined };
  if (ctx.workplane.status === "BLOCKED") return { decision: "wait" as const, reason_codes: ["workplane_blocked"] as readonly string[], wait_until: undefined };
  return null;
}
```

`src/lib/autonomy/decision-handlers/hard-gate.ts`:
```ts
import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import { evaluateGates } from "../decision-gates";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { decideChannelHeadAction } from "../channel-head-decision";

/**
 * Hard-gate handler — full gate chain, no scoring path to "act" unless
 * all gates pass and the gate context is explicitly requesting it.
 * Compliance/safety/trust gates return "act" = block/approve result.
 */
export function handleHardGate(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const gateResult = evaluateGates(context);
  if (gateResult && gateResult.decision !== "act") return makeDecisionFromGates(context, gateResult);
  // Gates passed — trust and safety decisions land here
  return decideChannelHeadAction(context);
}
```

`src/lib/autonomy/decision-handlers/draft-artifact.ts`:
```ts
import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import { evaluateGates } from "../decision-gates";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { decideChannelHeadAction } from "../channel-head-decision";

/**
 * Draft-artifact handler — gate chain except owned-public checks.
 * Drafts are always dry-run / non-mutating so we skip the publish-specific gates.
 */
export function handleDraftArtifact(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const gateResult = evaluateGatesForDraft(context);
  if (gateResult) return makeDecisionFromGates(context, gateResult);
  return decideChannelHeadAction(context);
}

function evaluateGatesForDraft(ctx: ChannelHeadDecisionContext) {
  if (ctx.killSwitch.global_active) return { decision: "wait" as const, reason_codes: ["global_kill_switch_active"] as readonly string[], wait_until: undefined };
  if (ctx.killSwitch.channel_active) return { decision: "wait" as const, reason_codes: ["channel_kill_switch_active"] as readonly string[], wait_until: undefined };
  if (ctx.killSwitch.agent_paused) return { decision: "wait" as const, reason_codes: ["agent_paused"] as readonly string[], wait_until: undefined };
  if (!ctx.heartbeat.heartbeat_id) return { decision: "wait" as const, reason_codes: ["heartbeat_missing"] as readonly string[], wait_until: undefined };
  if (!ctx.heartbeat.fresh) return { decision: "wait" as const, reason_codes: ["heartbeat_stale"] as readonly string[], wait_until: undefined };
  if (ctx.workplane.status === "BLOCKED") return { decision: "wait" as const, reason_codes: ["workplane_blocked"] as readonly string[], wait_until: undefined };
  return null;
}
```

**Step 4: Run test to verify pass**

Run: `node --import tsx --test tests/decision-router.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd /opt/crypto-tuber-ranked
git add src/lib/autonomy/decision-router.ts src/lib/autonomy/decision-handlers/ tests/decision-router.test.ts
git commit -m "feat: add authority-based decision router with focused handlers"
```

---

### Task 5: Update the LangGraph to use the decision router (RED)

**Objective:** Replace the `channel_head_decision` node's direct call to `decideChannelHeadAction()` with the new `routeDecisions()` router.

**Files:**
- Modify: `src/lib/autonomy/channel-head-graph.ts`
- Test: `tests/decision-router.test.ts` (already covers routing)

**Step 1: Modify `channel-head-graph.ts`**

Change the `channelHeadDecisionNode` function:
```ts
import { routeDecisions } from "./decision-router";

// Replace the old channelHeadDecisionNode with this:
async function channelHeadDecisionNode(state: PipelineGraphState): Promise<Partial<PipelineGraphState>> {
  const contexts = channelHeadInput.contexts ?? state.channel_head_contexts ?? [];

  if (contexts.length === 0) {
    return { channel_head_results: [], current_agent: "channel_head_decision" };
  }

  try {
    const results = routeDecisions(contexts);
    return { channel_head_results: results, current_agent: "channel_head_decision", routing_decision: "proceed", routing_reason: `${results.length} contexts routed through decision router` };
  } catch (err) {
    return {
      errors: [{ agent_id: "channel_head_decision", message: `${err}`, ts: new Date().toISOString() }],
      routing_decision: "error",
      routing_reason: `Decision router error: ${err}`,
      current_agent: "channel_head_decision",
    };
  }
}
```

**Step 2: Verify compilation**

Run: `cd /opt/crypto-tuber-ranked && npx tsc --noEmit --strict src/lib/autonomy/channel-head-graph.ts`
Expected: zero errors

**Step 3: Commit**

```bash
cd /opt/crypto-tuber-ranked
git add src/lib/autonomy/channel-head-graph.ts
git commit -m "refactor: route channel_head_decision node through authority-based router"
```

---

### Task 6: Update the heartbeat script for router compatibility (no-test)

**Objective:** Ensure `callscore-agent-heartbeat.ts` continues to work with the new router. The heartbeat already calls `decideChannelHeadAction()` directly — that still works (the router falls back to it for agents without specific handlers). But update it to use the router for consistency.

**Files:**
- Modify: `src/scripts/callscore-agent-heartbeat.ts`

**Step 1: Update the heartbeat script**

In `buildHeartbeatDecisionArtifacts`, replace:
```ts
const result = decideChannelHeadAction(context);
```
With:
```ts
const result = routeDecision(context);
```

And add the import:
```ts
import { routeDecision } from "../lib/autonomy/decision-router";
```

**Step 2: Verify compilation**

Run: `cd /opt/crypto-tuber-ranked && npx tsc --noEmit --strict src/scripts/callscore-agent-heartbeat.ts`
Expected: zero errors

**Step 3: Verify tests still pass**

Run: `node --import tsx --test tests/callscore-agent-heartbeat.test.ts`
Expected: all pass

**Step 4: Commit**

```bash
cd /opt/crypto-tuber-ranked
git add src/scripts/callscore-agent-heartbeat.ts
git commit -m "refactor: use routeDecision in agent heartbeat"
```

---

### Task 7: Update full system test for router compatibility (no-test)

**Objective:** Ensure callscore-full-system-test.ts routes through the new decision router.

**Files:**
- Modify: `src/scripts/callscore-full-system-test.ts`

**Step 1: Update the test to exercise the router**

Add a test block that verifies the router dispatches correctly for different agent types.

**Step 2: Run full system test**

Run: `node --import tsx --test src/scripts/callscore-full-system-test.ts`
Expected: 17+/17 tests pass

**Step 3: Commit**

```bash
cd /opt/crypto-tuber-ranked
git add src/scripts/callscore-full-system-test.ts
git commit -m "test: add decision router test to full system test"
```

---

### Task 8: Update canonical skills

**Objective:** Update `callscore-system-activation`, `hermes-orchestrator`, and `callscore-startup` to reflect the new authority-based decision architecture.

**Files:**
- Modify: `/srv/agents/hermes/skills/orchestration/callscore-system-activation/SKILL.md`
- Modify: `/srv/agents/hermes/skills/orchestration/hermes-orchestrator/SKILL.md`
- Modify: `/srv/agents/hermes/skills/orchestration/callscore-startup/SKILL.md`

**Step 1: Patch `callscore-system-activation`**

In the Phase 4 section, update the agent layer description to mention the authority-based decision router. Add a new `decision_router` item to the capability_usage ledger.

**Step 2: Patch `hermes-orchestrator`**

Add a note about the decision router as a routing layer for action-authority dispatches.

**Step 3: Patch `callscore-startup`**

Add a note under the "Immediate routing rule" that the decision router dispatches by action authority.

**Step 4: Commit**

```bash
cd /srv/agents/hermes/skills
git add orchestration/callscore-system-activation/SKILL.md orchestration/hermes-orchestrator/SKILL.md orchestration/callscore-startup/SKILL.md
git commit -m "docs: update skills for authority-based decision router"
```

---

### Task 9: Dry-run the graph with the decision router

**Objective:** Run the graph dry-run test to verify the full pipeline still works end-to-end.

**Step 1: Run dry-run**

```bash
cd /opt/crypto-tuber-ranked
node --import tsx src/scripts/callscore-graph-dry-run.ts
```

Expected: 21/21 agents processed, zero errors

**Step 2: Run full system test**

```bash
node --import tsx --test src/scripts/callscore-full-system-test.ts
```

Expected: all tests pass

**Step 3: Run all decision-related tests**

```bash
node --import tsx --test tests/action-authority.test.ts tests/decision-gates.test.ts tests/decision-router.test.ts tests/decision-handlers/owned-public-publish.test.ts tests/channel-head-decision.test.ts tests/channel-head-scoring.test.ts
```

Expected: all pass

**Step 4: Commit**

```bash
cd /opt/crypto-tuber-ranked
git add -A && git commit -m "feat: authority-based decision router — gates separated from scoring, handlers per authority tier"
```

---

## Verification Checklist

Pre-flight:
- [ ] All existing tests pass before starting (`node --import tsx --test tests/channel-head-decision.test.ts tests/channel-head-scoring.test.ts`)
- [ ] Working tree is clean

After each task:
- [ ] Test written first (RED)
- [ ] Test fails for expected reason
- [ ] Minimal implementation (GREEN)
- [ ] Test passes
- [ ] No regressions in existing tests
- [ ] Committed

Final:
- [ ] Graph dry-run succeeds
- [ ] Full system test passes
- [ ] All decision-related tests pass
- [ ] Skills updated
- [ ] Capability registry covers all 44 current canonical agents/souls in `docs/ops/callscore-channel-head-souls.yaml` (the earlier 26-agent target is historical and superseded)
- [ ] Gate chain correctly prioritizes (kill switch → verify → cooldown → risk → owned-public → evidence → media → quality → review)
- [ ] Each authority handler has the correct subset of gates
