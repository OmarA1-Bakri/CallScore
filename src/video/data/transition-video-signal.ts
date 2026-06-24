import { readFileSync } from "node:fs";
import type { CreatorTransitionStateRecord, CreatorTransitionState } from "../../lib/transition/transition-schemas";

export interface TransitionVideoSignal {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string | null;
  readonly state: CreatorTransitionState;
  readonly boost: number;
  readonly reason: string;
  readonly period_start: string;
  readonly period_end: string;
}

const STATE_BOOSTS: Partial<Record<CreatorTransitionState, number>> = {
  HOT_STREAK: 1.25,
  DETERIORATING: 1.2,
  RECOVERING: 1.18,
  HIGH_VOLATILITY: 1.12,
  DIRECTIONAL_BIAS_RISK: 1.1,
};

export function buildTransitionVideoSignals(states: readonly CreatorTransitionStateRecord[], limit = 50): readonly TransitionVideoSignal[] {
  return states
    .filter((state) => STATE_BOOSTS[state.state] !== undefined)
    .map((state) => ({
      creator_id: state.creator_id,
      creator_name: state.creator_name,
      youtube_handle: state.youtube_handle,
      state: state.state,
      boost: Number(((STATE_BOOSTS[state.state] ?? 1) * state.confidence).toFixed(4)),
      reason: state.drivers[0] ?? state.state,
      period_start: state.period_start,
      period_end: state.period_end,
    }))
    .sort((a, b) => b.boost - a.boost || a.creator_name.localeCompare(b.creator_name))
    .slice(0, Math.max(1, Math.floor(limit)));
}

export function loadTransitionVideoSignalsFromArtifact(path: string, limit = 50): readonly TransitionVideoSignal[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CreatorTransitionStateRecord[];
  return buildTransitionVideoSignals(parsed, limit);
}
