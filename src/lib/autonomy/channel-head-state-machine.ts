/**
 * Channel head state machine — formal state definitions and transitions.
 *
 * Each channel head cycles through a lifecycle:
 *
 *   INITIAL → EVALUATING → ACTING   → COMPLETE
 *                         → WAITING  → EVALUATING (retry)
 *                         → SUPPRESSED
 *                         → GATED    → EVALUATING (after gate)
 *                         → REVIEW   → EVALUATING (after review decision)
 *                         → FAILED
 *
 * This file defines the state types, transition graph, and a
 * state persistence helper using receipt-based storage.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ── State definitions ───────────────────────────────────────

/** Canonical channel head lifecycle states. */
export const CHANNEL_HEAD_STATES = [
  "INITIAL",       // First run — no prior state
  "EVALUATING",    // Running decideChannelHeadAction
  "ACTING",        // Decision was "act" — performing action
  "WAITING",       // Decision was "wait" — cooldown/heartbeat/blockers
  "SUPPRESSED",    // Decision was "suppress" — quality/evidence failed
  "GATED",         // Decision was "request_gate" — awaiting gate approval
  "REVIEW",        // Decision was "escalate_non_founder_review"
  "COMPLETE",      // Action completed successfully
  "FAILED",        // Unrecoverable error
] as const;

export type ChannelHeadState = (typeof CHANNEL_HEAD_STATES)[number];

/** A recorded state transition. */
export interface StateTransition {
  readonly from: ChannelHeadState;
  readonly to: ChannelHeadState;
  readonly at: string;       // ISO timestamp
  readonly reason: string;   // Why the transition happened
  readonly decision_id?: string;
  readonly receipt_id?: string;
}

/** Current channel head state with history. */
export interface ChannelHeadStateData {
  readonly agent_id: string;
  readonly channel_id: string;
  readonly state: ChannelHeadState;
  readonly entered_at: string;
  readonly updated_at: string;
  readonly transitions: readonly StateTransition[];
  readonly completion_count: number;  // Total successful completions
  readonly error_count: number;
  readonly in_flight: boolean;        // Currently processing
  readonly metadata: Record<string, unknown>;
}

// ── Transition graph ───────────────────────────────────────

/** Valid next states from each current state. */
const TRANSITIONS: Record<ChannelHeadState, ChannelHeadState[]> = {
  INITIAL:     ["EVALUATING"],
  EVALUATING:  ["ACTING", "WAITING", "SUPPRESSED", "GATED", "REVIEW", "FAILED"],
  ACTING:      ["COMPLETE", "FAILED"],
  WAITING:     ["EVALUATING", "FAILED"],
  SUPPRESSED:  ["EVALUATING", "FAILED"],     // Can retry after suppression period
  GATED:       ["EVALUATING", "FAILED"],     // Re-evaluate after gate
  REVIEW:      ["EVALUATING", "FAILED"],     // Re-evaluate after review outcome
  COMPLETE:    ["INITIAL", "EVALUATING"],    // Reset or continue
  FAILED:      ["INITIAL", "EVALUATING"],    // Retry after failure
};

/**
 * Validate that a transition from → to is legal per the graph.
 * Throws if invalid (expected for coding errors — not user-facing).
 */
export function assertValidTransition(from: ChannelHeadState, to: ChannelHeadState): void {
  const allowed = TRANSITIONS[from];
  if (!allowed?.includes(to)) {
    throw new Error(
      `Invalid state transition: ${from} → ${to}. Allowed from ${from}: [${(allowed ?? ["<none>"]).join(", ")}]`,
    );
  }
}

/**
 * Determine the next machine state from a decision string.
 * Returns the state the machine should enter AFTER the decision is processed.
 *
 * - "act"       → ACTING   (decision made, now performing the action)
 * - "wait"      → WAITING  (blockers active, re-evaluate later)
 * - "suppress"  → SUPPRESSED (quality/evidence failed)
 * - "request_gate" → GATED (requires human/procedure gate)
 * - "escalate_non_founder_review" → REVIEW
 */
export function decisionToNextState(decision: string, currentState: ChannelHeadState): ChannelHeadState {
  const map: Record<string, ChannelHeadState> = {
    act: "ACTING",
    wait: "WAITING",
    suppress: "SUPPRESSED",
    request_gate: "GATED",
    escalate_non_founder_review: "REVIEW",
  };
  const next = map[decision] ?? "FAILED";
  assertValidTransition(currentState, next);
  return next;
}

/**
 * Next state after an action completes or fails.
 */
export function actionResultToNextState(success: boolean, currentState: ChannelHeadState): ChannelHeadState {
  if (currentState !== "ACTING") {
    throw new Error(`actionResultToNextState called from ${currentState}, expected ACTING`);
  }
  assertValidTransition("ACTING", success ? "COMPLETE" : "FAILED");
  return success ? "COMPLETE" : "FAILED";
}

// ── State persistence ──────────────────────────────────────

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Create a new initial state data for a channel head.
 */
export function createInitialState(agentId: string, channelId: string, now: string): ChannelHeadStateData {
  return {
    agent_id: agentId,
    channel_id: channelId,
    state: "INITIAL",
    entered_at: now,
    updated_at: now,
    transitions: [],
    completion_count: 0,
    error_count: 0,
    in_flight: false,
    metadata: {},
  };
}

/**
 * Transition the state machine to a new state.
 * Returns a new ChannelHeadStateData (immutable).
 */
export function transitionState(
  current: ChannelHeadStateData,
  to: ChannelHeadState,
  reason: string,
  decisionId?: string,
  receiptId?: string,
  now: string = new Date().toISOString(),
): ChannelHeadStateData {
  assertValidTransition(current.state, to);

  const transition: StateTransition = {
    from: current.state,
    to,
    at: now,
    reason,
    decision_id: decisionId,
    receipt_id: receiptId,
  };

  const isError = to === "FAILED";

  return {
    ...current,
    state: to,
    entered_at: to === "EVALUATING" ? now : current.entered_at,
    updated_at: now,
    in_flight: to === "EVALUATING" || to === "ACTING",
    completion_count: to === "COMPLETE" ? current.completion_count + 1 : current.completion_count,
    error_count: isError ? current.error_count + 1 : current.error_count,
    transitions: [...current.transitions, transition],
  };
}

// ── File-backed persistence ─────────────────────────────────

const DEFAULT_STATE_DIR = ".tmp/channel-head-states";

function statePath(agentId: string, stateDir: string): string {
  return join(stateDir, `${agentId}.state.json`);
}

/**
 * Load channel head state from disk, or create initial if not found.
 */
export function loadState(
  agentId: string,
  channelId: string,
  stateDir: string = DEFAULT_STATE_DIR,
  now: string = new Date().toISOString(),
): ChannelHeadStateData {
  const path = statePath(agentId, stateDir);
  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, "utf8");
      return JSON.parse(raw) as ChannelHeadStateData;
    } catch {
      return createInitialState(agentId, channelId, now);
    }
  }
  return createInitialState(agentId, channelId, now);
}

/**
 * Persist channel head state to disk.
 */
export function saveState(state: ChannelHeadStateData, stateDir: string = DEFAULT_STATE_DIR): string {
  const path = statePath(state.agent_id, stateDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return path;
}
