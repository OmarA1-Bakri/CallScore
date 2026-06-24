import { readFileSync } from "node:fs";
import { query as defaultQuery } from "../db";
import { creatorEligibilityReason, isEligibleCreatorForIntelligence } from "../creator-eligibility/creator-eligibility";
import type { CreatorTransitionState, CreatorTransitionStateRecord } from "../transition/transition-schemas";
import type { StormEvidencePack, StormRecentVideo, StormSupportingCall } from "./storm-schemas";

type QueryFn = <T>(text: string, params?: unknown[]) => Promise<T[]>;

export const INTERESTING_STORM_STATES: readonly CreatorTransitionState[] = [
  "HOT_STREAK",
  "DETERIORATING",
  "RECOVERING",
  "HIGH_VOLATILITY",
  "DIRECTIONAL_BIAS_RISK",
];

interface CreatorRow {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string | null;
  readonly focus: string | null;
}

interface CallEvidenceRow extends StormSupportingCall {
  readonly video_title: string | null;
  readonly youtube_video_id: string | null;
}

export function loadTransitionStatesArtifact(path: string): readonly CreatorTransitionStateRecord[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CreatorTransitionStateRecord[];
  return parsed;
}

export function selectStormTransition(
  states: readonly CreatorTransitionStateRecord[],
  creatorId?: number | null,
): CreatorTransitionStateRecord {
  const candidates = states
    .filter((state) => creatorId == null || state.creator_id === creatorId)
    .filter((state) => INTERESTING_STORM_STATES.includes(state.state))
    .sort((a, b) => (
      b.confidence - a.confidence ||
      b.snapshot.score_ready_calls - a.snapshot.score_ready_calls ||
      b.period_start.localeCompare(a.period_start)
    ));
  if (candidates[0]) return candidates[0];

  const fallback = states
    .filter((state) => creatorId == null || state.creator_id === creatorId)
    .sort((a, b) => b.confidence - a.confidence || b.period_start.localeCompare(a.period_start))[0];
  if (!fallback) throw new Error(creatorId == null ? "No transition states available" : `No transition state found for creator_id=${creatorId}`);
  return fallback;
}

function numeric(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function loadCreator(creatorId: number, queryFn: QueryFn): Promise<CreatorRow> {
  const [creator] = await queryFn<CreatorRow>(`
    SELECT id AS creator_id, name AS creator_name, youtube_handle, focus
    FROM creators
    WHERE id = $1
  `, [creatorId]);
  if (!creator) throw new Error(`Creator not found: ${creatorId}`);
  if (!isEligibleCreatorForIntelligence(creator)) {
    throw new Error(`Creator is context-only for transition/STORM scoring: ${creatorEligibilityReason(creator) ?? "not eligible"}`);
  }
  return creator;
}
async function loadCalls(input: {
  readonly creatorId: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly queryFn: QueryFn;
}): Promise<readonly CallEvidenceRow[]> {
  return input.queryFn<CallEvidenceRow>(`
    SELECT
      c.id AS call_id,
      c.video_id,
      c.symbol,
      c.direction,
      c.call_date::text AS call_date,
      c.raw_quote,
      c.score,
      c.alpha_30d,
      c.return_30d,
      c.correct_direction,
      c.extraction_confidence,
      'calls'::text AS source_table,
      v.title AS video_title,
      v.youtube_video_id
    FROM calls c
    LEFT JOIN videos v ON v.id = c.video_id
    WHERE c.creator_id = $1
      AND c.call_date >= $2::timestamptz
      AND c.call_date < ($3::date + INTERVAL '1 day')
    ORDER BY c.score DESC NULLS LAST, c.id ASC
    LIMIT 80
  `, [input.creatorId, input.periodStart, input.periodEnd]);
}

async function loadRecentVideos(creatorId: number, queryFn: QueryFn): Promise<readonly StormRecentVideo[]> {
  return queryFn<StormRecentVideo>(`
    SELECT
      id AS video_id,
      youtube_video_id,
      title,
      published_at::text AS published_at,
      (transcript IS NOT NULL AND transcript <> '') AS transcript_available,
      'videos'::text AS source_table
    FROM videos
    WHERE creator_id = $1
    ORDER BY published_at DESC NULLS LAST, id DESC
    LIMIT 8
  `, [creatorId]);
}

function callSupportsState(call: StormSupportingCall, state: CreatorTransitionState): boolean {
  if (state === "HOT_STREAK" || state === "RECOVERING") return call.correct_direction === true || numeric(call.score) >= 25;
  if (state === "COLD_STREAK" || state === "DETERIORATING") return call.correct_direction === false || numeric(call.score) <= 15;
  if (state === "HIGH_VOLATILITY") return Math.abs(numeric(call.alpha_30d)) >= 10 || numeric(call.score) >= 35 || numeric(call.score) <= 10;
  if (state === "DIRECTIONAL_BIAS_RISK") return true;
  return true;
}

function callContradictsState(call: StormSupportingCall, state: CreatorTransitionState): boolean {
  if (state === "HOT_STREAK" || state === "RECOVERING") return call.correct_direction === false && numeric(call.score) <= 15;
  if (state === "COLD_STREAK" || state === "DETERIORATING") return call.correct_direction === true && numeric(call.score) >= 25;
  if (state === "DIRECTIONAL_BIAS_RISK") return call.correct_direction === true;
  if (state === "HIGH_VOLATILITY") return numeric(call.score) >= 20 && numeric(call.score) <= 35;
  return false;
}

export async function buildStormEvidencePack(input: {
  readonly transition: CreatorTransitionStateRecord;
  readonly queryFn?: QueryFn;
}): Promise<StormEvidencePack> {
  const queryFn = input.queryFn ?? defaultQuery;
  const creator = await loadCreator(input.transition.creator_id, queryFn);
  const calls = await loadCalls({
    creatorId: input.transition.creator_id,
    periodStart: input.transition.period_start,
    periodEnd: input.transition.period_end,
    queryFn,
  });
  const recentVideos = await loadRecentVideos(input.transition.creator_id, queryFn);
  const supporting = calls.filter((call) => callSupportsState(call, input.transition.state)).slice(0, 12);
  const contradicting = calls.filter((call) => callContradictsState(call, input.transition.state)).slice(0, 8);
  const quoteEvidence = supporting
    .filter((call) => call.raw_quote && call.raw_quote.trim().length > 0)
    .slice(0, 8)
    .map((call) => ({ call_id: call.call_id, quote: call.raw_quote ?? "", source_table: "calls" as const, confidence: call.extraction_confidence }));

  return {
    creator_id: creator.creator_id,
    creator_name: creator.creator_name,
    youtube_handle: creator.youtube_handle,
    selected_transition: input.transition,
    state: input.transition.state,
    confidence: input.transition.confidence,
    period_start: input.transition.period_start,
    period_end: input.transition.period_end,
    movement_drivers: input.transition.drivers,
    supporting_calls: supporting,
    contradicting_calls: contradicting,
    recent_videos: recentVideos,
    quote_evidence: quoteEvidence,
    market_context: [
      { label: "avg_score", value: input.transition.snapshot.avg_score, source_table_or_artifact: "transition_artifact" },
      { label: "avg_alpha_30d", value: input.transition.snapshot.avg_alpha_30d, source_table_or_artifact: "transition_artifact" },
      { label: "score_ready_calls", value: input.transition.snapshot.score_ready_calls, source_table_or_artifact: "transition_artifact" },
    ],
    context_sources: [
      { label: "selected_transition", source_type: "transition_artifact", source_id: `${input.transition.creator_id}:${input.transition.period_start}` },
      { label: "calls_in_period", source_type: "calls", source_id: input.transition.creator_id },
      ...recentVideos.slice(0, 3).map((video) => ({ label: video.title ?? "recent video", source_type: "videos" as const, source_id: video.video_id })),
    ],
    warnings: input.transition.warnings,
  };
}
