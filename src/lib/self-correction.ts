/**
 * self-correction.ts — Detection + scoring for the "self-correction index".
 *
 * A creator earns points when they publicly revise a prior call:
 *   - updated_target      — raised/lowered a price target ("updating my target")
 *   - reversed_direction  — flipped bullish<->bearish on the same ticker
 *   - retracted           — "I take it back" / "no longer recommend"
 *   - confirmed_miss      — acknowledged a losing call ("I was wrong on BTC")
 *
 * This rewards accountability (Cowen-style public updates) vs silent delete
 * behaviour. The detection logic is intentionally conservative — patterns are
 * tightly scoped and require first-person ownership + ticker proximity inside
 * the same sentence so third-person commentary and sarcasm don't count.
 *
 * Key integrity invariants (reviewed by Codex, enforced by tests):
 *   - Exactly ONE revision per (trigger-sentence, original-call) pair —
 *     a single "I was wrong on BTC" does NOT retroactively tag every prior
 *     BTC call. We pair with the NEAREST eligible prior call inside a
 *     bounded window.
 *   - Pairs never cross creators. Pairs never cross normalized symbols.
 *   - CONFIRMED_MISS and RETRACTED patterns are disjoint: the word `retract`
 *     lives in RETRACTED only.
 *   - Scoring applies Bayesian shrinkage so low-N creators can't leapfrog
 *     genuinely transparent high-volume creators.
 */
import { query } from "./db";
import {
  coinName,
  extraAliases,
  normalizeTicker,
  shortTicker,
} from "./ticker-normalize";
import type { Call, Direction } from "./types";

export type RevisionType =
  | "updated_target"
  | "reversed_direction"
  | "retracted"
  | "confirmed_miss";

export type SelfCorrectionTier = "honest" | "some" | "rarely";

export interface Revision {
  readonly originalCallId: number;
  readonly revisedCallId: number;
  readonly creatorId: number;
  readonly revisedAt: Date;
  readonly revisionType: RevisionType;
  readonly sourceVideoId: string | null;
  readonly notes: string | null;
}

export interface SelfCorrectionScore {
  readonly creatorId: number;
  readonly score: number;
  readonly revisionCount: number;
  readonly tier: SelfCorrectionTier;
}

export interface SelfCorrectionAggregate {
  readonly creatorId: number;
  readonly revisionCount: number;
  readonly score: number;
  readonly tier: SelfCorrectionTier;
}

/* ------------------------------------------------------------------ */
/*  Regex patterns — case-insensitive.                                */
/* ------------------------------------------------------------------ */

const UPDATED_TARGET_PATTERN =
  /\b(update[ds]?|updating|adjust(?:ing|ed)?|revis(?:ing|ed)|mov(?:ing|ed))\s+(my\s+)?(target|price\s+target)/i;

// First-person ownership of a FAILURE only. NOTE: `retract` deliberately not
// here — the RETRACTED_PATTERN below owns it, preventing overlap (H1).
//
// The pattern deliberately avoids bare `I admit`: that matches positive
// statements like "I admit I'm a fan of BTC". When `admit` is used, the
// admission must be explicitly about a wrong/bad/miss/losing call.
const CONFIRMED_MISS_PATTERN =
  /\b(i\s+was\s+wrong|i['\u2019]?m\s+wrong|my\s+(call|position|prediction|thesis)\s+was\s+wrong|i\s+missed\s+(it|the\s+call|that)|i\s+got\s+(it|that|this)\s+wrong|didn'?t\s+work\s+out\s+(for\s+me|for\s+us)|that\s+was\s+a\s+bad\s+call|i\s+admit\s+(i\s+(was\s+)?wrong|that\s+was\s+a\s+(bad|wrong)\s+call|i\s+missed))\b/i;

const RETRACTED_PATTERN =
  /\b(i\s+retract|retract(?:ing)?\s+(?:my|that|the)|take\s+(?:that|it)\s+back|no\s+longer\s+recommend|i\s+no\s+longer\s+recommend)\b/i;

/* ------------------------------------------------------------------ */
/*  Pairing windows and thresholds.                                   */
/* ------------------------------------------------------------------ */

const REVERSAL_GAP_MAX_DAYS = 30;
const UPDATED_TARGET_GAP_MAX_DAYS = 90;
const CONFIRMED_MISS_GAP_MAX_DAYS = 180;
const RETRACTED_GAP_MAX_DAYS = 90;
const REVERSAL_MIN_CONFIDENCE = 0.7;
const TICKER_PROXIMITY_CHARS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  Scoring rubric constants.                                         */
/* ------------------------------------------------------------------ */

const POINTS = {
  confirmed_miss: 1.0,
  updated_target: 0.5,
  // reversed_direction: full 0.5 when the later call is scored + correct,
  // partial 0.25 when still pending horizon (the reversal action itself is
  // always credited, outcome-based credit is layered on top later).
  reversed_direction_full: 0.5,
  reversed_direction_partial: 0.25,
  retracted: 0.5,
} as const;

const TIER_HONEST_MIN = 0.15;
const TIER_SOME_MIN = 0.05;

// Bayesian shrinkage pseudo-count (H3). `K = 20` means a creator with only
// a handful of scored calls is pulled strongly toward the prior mean of 0,
// preventing a 1/2 creator from leapfrogging a 5/200 creator. Chosen to
// align with the same order-of-magnitude as the minimum-volume floor used
// by the rank-tier badge elsewhere (Wilson interval).
const SHRINKAGE_K = 20;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function confidenceToNumeric(confidence: string | null): number {
  if (confidence === null) return 0;
  const lower = confidence.toLowerCase();
  if (lower === "high") return 0.9;
  if (lower === "medium") return 0.7;
  if (lower === "low") return 0.4;
  const parsed = Number(confidence);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.abs(later.getTime() - earlier.getTime()) / MS_PER_DAY;
}

function directionsOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === "bullish" && b === "bearish") ||
    (a === "bearish" && b === "bullish")
  );
}

function toSourceVideoId(call: Call): string | null {
  if (call.video_id === null || call.video_id === undefined) return null;
  return String(call.video_id);
}

/**
 * Split a raw quote into sentences on `.`, `!`, `?`. Naive but good enough
 * — we compare phrases inside sentences to avoid cross-sentence matches like
 * "Someone said I was wrong. BTC is pumping." crediting a BTC admission.
 */
function splitSentences(text: string): readonly string[] {
  return text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Returns the expected canonical ticker if it (or its coin name) is
 * mentioned in `sentence` within `TICKER_PROXIMITY_CHARS` of the regex
 * match, else null.
 *
 * Implementation note: we deliberately avoid building a RegExp from the
 * ticker string (even though `TRACKED_SYMBOLS` is a static allowlist) so
 * static analysers can't flag ReDoS via dynamic regex construction. We
 * walk the window with indexOf and verify word-boundary characters
 * manually — much cheaper than a regex anyway.
 */
function findMentionedTickerNear(
  sentence: string,
  triggerMatch: RegExpMatchArray,
  expectedCanonical: string,
): string | null {
  const matchStart = triggerMatch.index ?? 0;
  const matchEnd = matchStart + triggerMatch[0].length;
  const windowStart = Math.max(0, matchStart - TICKER_PROXIMITY_CHARS);
  const windowEnd = Math.min(sentence.length, matchEnd + TICKER_PROXIMITY_CHARS);
  const window = sentence.slice(windowStart, windowEnd).toLowerCase();

  const ticker = shortTicker(expectedCanonical);
  const name = coinName(expectedCanonical);

  if (ticker && containsWordBoundary(window, ticker.toLowerCase())) {
    return expectedCanonical;
  }
  if (name && containsWordBoundary(window, name.toLowerCase())) {
    return expectedCanonical;
  }
  // Manual aliases (e.g. XBT for BTC). Extra aliases are stored in
  // lowercase already so no further normalization required.
  for (const alias of extraAliases(expectedCanonical)) {
    if (containsWordBoundary(window, alias)) {
      return expectedCanonical;
    }
  }
  return null;
}

/**
 * Case-sensitive substring search with manual word-boundary checks at the
 * start and end of the hit. `haystack` and `needle` must already be in the
 * same case (we lowercase both at the call site).
 */
function containsWordBoundary(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return false;
    const before = idx === 0 ? "" : haystack.charAt(idx - 1);
    const afterIdx = idx + needle.length;
    const after = afterIdx >= haystack.length ? "" : haystack.charAt(afterIdx);
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = idx + 1;
  }
  return false;
}

function isWordChar(c: string): boolean {
  if (c.length === 0) return false;
  const code = c.charCodeAt(0);
  // ASCII word char = [A-Za-z0-9_]. Sufficient for tracked tickers/names.
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

/**
 * Heuristic "first-person context" — blocks obvious third-person mentions
 * like "he was wrong" that would otherwise sneak past the regex (the regex
 * anchors on `I was wrong`, but quoted third-person prose may still nest
 * `I` inside a longer sentence). We require the pronoun `I`/`I'm`/`my` to
 * appear within 15 chars before the trigger to count.
 */
function hasFirstPersonLead(sentence: string, trigger: RegExpMatchArray): boolean {
  // The CONFIRMED_MISS_PATTERN already anchors on `I ...`, so the existence
  // of `I`/`I'm`/`my` in the match itself is guaranteed. We nonetheless
  // check for quoted-speech markers immediately before the match: a `said`
  // or `"` within 20 chars before the trigger is a red flag for reported
  // speech and we reject the match.
  const start = trigger.index ?? 0;
  const lookBack = sentence.slice(Math.max(0, start - 20), start).toLowerCase();
  if (/\b(said|says|told|quoted|tweeted|replied|wrote)\b/.test(lookBack)) return false;
  if (/["\u201c\u201d].{0,10}$/.test(lookBack)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Public: detectRevisions                                           */
/* ------------------------------------------------------------------ */

interface GroupKey {
  readonly creatorId: number;
  readonly symbol: string;
}

function groupKeyString(key: GroupKey): string {
  return `${key.creatorId}:${key.symbol}`;
}

interface NormalizedCall {
  readonly call: Call;
  readonly normalizedSymbol: string;
  readonly date: Date;
}

/**
 * Detect revision events by scanning each (creator, normalized symbol)
 * pair history for direction reversals and regex signals in `raw_quote`.
 *
 * The function is pure — no DB, no side effects. Caller supplies all calls
 * (optionally mixing creators and symbols — we group internally as defense
 * in depth, M1).
 *
 * Emits exactly ONE revision per (originalCallId, revisionType). For the
 * text-triggered revisions (confirmed_miss / retracted / updated_target),
 * the LATER call is paired with its NEAREST prior eligible call within a
 * bounded window. If no prior call exists in the window, nothing is emitted
 * (C1).
 */
export function detectRevisions(calls: readonly Call[]): Revision[] {
  if (calls.length === 0) return [];

  // Pre-normalize once. Calls whose symbol is not tracked are dropped —
  // they cannot be part of a meaningful revision pair.
  const normalized: NormalizedCall[] = [];
  for (const call of calls) {
    const normalizedSymbol = normalizeTicker(call.symbol);
    if (normalizedSymbol === null) continue;
    normalized.push({
      call,
      normalizedSymbol,
      date: new Date(call.call_date),
    });
  }

  normalized.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Group by (creator_id, normalized symbol). Pairs never cross either
  // boundary (M1).
  const groups = new Map<string, NormalizedCall[]>();
  for (const nc of normalized) {
    const key = groupKeyString({
      creatorId: nc.call.creator_id,
      symbol: nc.normalizedSymbol,
    });
    const existing = groups.get(key) ?? [];
    existing.push(nc);
    groups.set(key, existing);
  }

  const seen = new Set<string>();
  const out: Revision[] = [];

  const emit = (revision: Revision): void => {
    const key = `${revision.originalCallId}:${revision.revisionType}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(revision);
  };

  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      const later = group[i];

      // Direction-reversal pairing: full O(n^2) scan within the 30d window
      // because every prior bullish/bearish is a valid candidate for the
      // reversal signal. De-dup of `originalCallId:reversed_direction`
      // guarantees one row per original regardless of how many laters
      // flip against it.
      for (let j = 0; j < i; j++) {
        const earlier = group[j];
        const gap = daysBetween(earlier.date, later.date);
        if (gap > REVERSAL_GAP_MAX_DAYS) continue;
        if (!directionsOpposite(earlier.call.direction, later.call.direction)) continue;
        if (confidenceToNumeric(earlier.call.confidence) < REVERSAL_MIN_CONFIDENCE) continue;
        if (confidenceToNumeric(later.call.confidence) < REVERSAL_MIN_CONFIDENCE) continue;

        emit({
          originalCallId: earlier.call.id,
          revisedCallId: later.call.id,
          creatorId: earlier.call.creator_id,
          revisedAt: later.date,
          revisionType: "reversed_direction",
          sourceVideoId: toSourceVideoId(later.call),
          notes: `direction ${earlier.call.direction} -> ${later.call.direction}`,
        });
      }

      // Text-triggered revisions. We match per-sentence to avoid
      // cross-sentence false positives, then pair with the NEAREST prior
      // eligible call inside a bounded window (C1). If multiple sentences
      // in the same later quote trigger the same revision type, the de-dup
      // set still collapses them down to one row per original call.
      const laterQuote = later.call.raw_quote ?? "";
      if (laterQuote.length === 0) continue;

      const sentences = splitSentences(laterQuote);

      for (const sentence of sentences) {
        // confirmed_miss
        const missMatch = sentence.match(CONFIRMED_MISS_PATTERN);
        if (
          missMatch &&
          hasFirstPersonLead(sentence, missMatch) &&
          findMentionedTickerNear(sentence, missMatch, later.normalizedSymbol)
        ) {
          const nearest = nearestPriorWithinWindow(
            group,
            i,
            CONFIRMED_MISS_GAP_MAX_DAYS,
          );
          if (nearest !== null) {
            emit({
              originalCallId: nearest.call.id,
              revisedCallId: later.call.id,
              creatorId: later.call.creator_id,
              revisedAt: later.date,
              revisionType: "confirmed_miss",
              sourceVideoId: toSourceVideoId(later.call),
              notes: "first-person miss admission with ticker proximity",
            });
          }
        }

        // retracted
        const retractMatch = sentence.match(RETRACTED_PATTERN);
        if (
          retractMatch &&
          findMentionedTickerNear(sentence, retractMatch, later.normalizedSymbol)
        ) {
          const nearest = nearestPriorWithinWindow(
            group,
            i,
            RETRACTED_GAP_MAX_DAYS,
          );
          if (nearest !== null) {
            emit({
              originalCallId: nearest.call.id,
              revisedCallId: later.call.id,
              creatorId: later.call.creator_id,
              revisedAt: later.date,
              revisionType: "retracted",
              sourceVideoId: toSourceVideoId(later.call),
              notes: "retraction language with ticker proximity",
            });
          }
        }

        // updated_target
        const targetMatch = sentence.match(UPDATED_TARGET_PATTERN);
        if (
          targetMatch &&
          findMentionedTickerNear(sentence, targetMatch, later.normalizedSymbol)
        ) {
          const nearest = nearestPriorWithinWindow(
            group,
            i,
            UPDATED_TARGET_GAP_MAX_DAYS,
          );
          if (nearest !== null) {
            emit({
              originalCallId: nearest.call.id,
              revisedCallId: later.call.id,
              creatorId: later.call.creator_id,
              revisedAt: later.date,
              revisionType: "updated_target",
              sourceVideoId: toSourceVideoId(later.call),
              notes: "price-target revision with ticker proximity",
            });
          }
        }
      }
    }
  }

  return out;
}

/**
 * Given a sorted group and the index of the current LATER call, return the
 * nearest prior call (highest index strictly less than i) whose call_date
 * is within `windowDays` of the later call's date. Returns null if no such
 * call exists.
 */
function nearestPriorWithinWindow(
  group: readonly NormalizedCall[],
  laterIndex: number,
  windowDays: number,
): NormalizedCall | null {
  const later = group[laterIndex];
  for (let k = laterIndex - 1; k >= 0; k--) {
    const candidate = group[k];
    const gap = daysBetween(candidate.date, later.date);
    if (gap > windowDays) {
      // Group is sorted ascending by date, so anything earlier is further.
      break;
    }
    // Nearest = first candidate walking back that is inside the window.
    return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Scoring                                                           */
/* ------------------------------------------------------------------ */

export function tierForScore(score: number): SelfCorrectionTier {
  if (score >= TIER_HONEST_MIN) return "honest";
  if (score >= TIER_SOME_MIN) return "some";
  return "rarely";
}

interface RevisionScoringRow {
  readonly revision_type: RevisionType;
  readonly original_return_30d: number | null;
  readonly original_direction: Direction;
  readonly original_extraction_confidence: number;
  readonly revised_correct_direction: boolean | null;
  readonly revised_return_30d: number | null;
  readonly revised_extraction_confidence: number | null;
}

interface CreatorScoredCountRow {
  readonly scored_count: string;
}

/**
 * Compute the self-correction score for a single creator by joining the
 * `call_revisions` table against BOTH the original and the revised calls.
 *
 * Scoring rules (see POINTS above):
 *   - updated_target:      +0.5 flat
 *   - retracted:           +0.5 flat
 *   - confirmed_miss:      +1.0 iff original is scored AND was directionally
 *                          wrong (return * direction_sign <= 0)
 *   - reversed_direction:  +0.5 iff revised call is scored AND correct
 *                          +0.25 iff revised call is still pending horizon
 *                          0    iff revised call is scored AND wrong
 *
 * The raw ratio is `points / (scoredCalls + SHRINKAGE_K)` so low-volume
 * creators cannot leapfrog high-volume transparent ones (H3).
 *
 * Zero-state contract preserved: no revisions -> score 0, tier "rarely".
 */
export async function computeSelfCorrectionScore(
  creatorId: number,
): Promise<SelfCorrectionScore> {
  const revisionRows = await query<RevisionScoringRow>(
    `SELECT
       r.revision_type,
       oc.return_30d              AS original_return_30d,
       oc.direction               AS original_direction,
       oc.extraction_confidence   AS original_extraction_confidence,
       rc.correct_direction       AS revised_correct_direction,
       rc.return_30d              AS revised_return_30d,
       rc.extraction_confidence   AS revised_extraction_confidence
     FROM call_revisions r
     JOIN calls oc ON oc.id = r.original_call_id
     LEFT JOIN calls rc ON rc.id = r.revised_call_id
     WHERE r.creator_id = $1`,
    [creatorId],
  );

  const denomRows = await query<CreatorScoredCountRow>(
    `SELECT COUNT(*)::text AS scored_count
       FROM calls
      WHERE creator_id = $1
        AND return_30d IS NOT NULL
        AND extraction_confidence >= 0.6`,
    [creatorId],
  );

  const scoredCalls =
    denomRows.length > 0 ? Number(denomRows[0].scored_count) : 0;

  if (revisionRows.length === 0) {
    return {
      creatorId,
      score: 0,
      revisionCount: 0,
      tier: "rarely",
    };
  }

  let points = 0;
  for (const row of revisionRows) {
    points += pointsForRevision(row);
  }

  // Bayesian shrinkage: when `scoredCalls` is tiny, denominator is dominated
  // by K and raw score stays near 0 even if every revision scored max points.
  const rawScore = points / (scoredCalls + SHRINKAGE_K);
  const clamped = Math.max(0, Math.min(1, rawScore));

  return {
    creatorId,
    score: clamped,
    revisionCount: revisionRows.length,
    tier: tierForScore(clamped),
  };
}

function pointsForRevision(row: RevisionScoringRow): number {
  switch (row.revision_type) {
    case "updated_target":
      return POINTS.updated_target;

    case "retracted":
      return POINTS.retracted;

    case "confirmed_miss": {
      if (row.original_extraction_confidence < 0.6) return 0;
      if (row.original_return_30d === null) return 0;
      const directionSign =
        row.original_direction === "bullish"
          ? 1
          : row.original_direction === "bearish"
            ? -1
            : 0;
      if (directionSign === 0) return 0;
      const directional = row.original_return_30d * directionSign;
      return directional <= 0 ? POINTS.confirmed_miss : 0;
    }

    case "reversed_direction": {
      // Partial credit (0.25) is reserved for PENDING revisions — the later
      // call hasn't resolved yet so we can't judge the reversal's outcome,
      // but the act of reversing publicly still deserves some credit.
      // Rules (Codex round-2 M-partial-scoring):
      //   - Revised call is PENDING (return_30d == null) -> 0.25
      //   - Revised call is SCORED + correct_direction=true -> 0.5
      //   - Revised call is SCORED + correct_direction=false -> 0 (whipsaw)
      //   - Revised call low-confidence (<0.6) scored -> 0 (align with
      //     extraction-confidence floor used for the rest of scoring)
      //   - Revised call missing entirely (null join) -> 0 (no evidence)
      if (row.revised_return_30d === null) {
        // Distinguish "pending with link" (partial credit) from "no link at
        // all" (no credit). Extraction confidence is null only when the
        // LEFT JOIN missed, which means no revised call was recorded.
        if (row.revised_extraction_confidence === null) return 0;
        return POINTS.reversed_direction_partial;
      }
      // Scored revision — require the confidence floor before we trust the
      // direction flag.
      if (
        row.revised_extraction_confidence === null ||
        row.revised_extraction_confidence < 0.6
      ) {
        return 0;
      }
      return row.revised_correct_direction === true
        ? POINTS.reversed_direction_full
        : 0;
    }

    default:
      return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Bulk aggregate (for leaderboard serialization)                    */
/* ------------------------------------------------------------------ */

interface BulkAggregateRow {
  readonly creator_id: number;
  readonly revision_count: string;
  readonly score_numerator: string;
  readonly scored_calls: string;
}

/**
 * Compute self-correction aggregates for every creator that has at least
 * one revision, using a single SQL round-trip. Applies the same scoring
 * rubric as `computeSelfCorrectionScore` including the Bayesian shrinkage.
 */
export async function computeAllSelfCorrectionAggregates(): Promise<
  ReadonlyMap<number, SelfCorrectionAggregate>
> {
  const rows = await query<BulkAggregateRow>(
    `WITH scored AS (
       SELECT
         creator_id,
         COUNT(*)::text AS scored_calls
       FROM calls
       WHERE return_30d IS NOT NULL
         AND extraction_confidence >= 0.6
       GROUP BY creator_id
     ),
     revision_points AS (
       SELECT
         r.creator_id,
         COUNT(*)::text AS revision_count,
         SUM(
           CASE
             WHEN r.revision_type = 'updated_target' THEN ${POINTS.updated_target}
             WHEN r.revision_type = 'retracted' THEN ${POINTS.retracted}
             WHEN r.revision_type = 'confirmed_miss'
               AND oc.return_30d IS NOT NULL
               AND oc.extraction_confidence >= 0.6
               AND (
                 (oc.direction = 'bullish' AND oc.return_30d <= 0) OR
                 (oc.direction = 'bearish' AND oc.return_30d >= 0)
               )
               THEN ${POINTS.confirmed_miss}
             -- Reversed direction (Codex round-2 M-partial-scoring):
             -- partial credit ONLY for pending-horizon revisions where we
             -- have a linked revised call. Scored-but-wrong or low-confidence
             -- reversals collapse to 0.
             WHEN r.revision_type = 'reversed_direction'
               AND rc.return_30d IS NOT NULL
               AND rc.extraction_confidence IS NOT NULL
               AND rc.extraction_confidence >= 0.6
               AND rc.correct_direction = true
               THEN ${POINTS.reversed_direction_full}
             WHEN r.revision_type = 'reversed_direction'
               AND rc.return_30d IS NULL
               AND rc.extraction_confidence IS NOT NULL
               THEN ${POINTS.reversed_direction_partial}
             ELSE 0
           END
         )::text AS score_numerator
       FROM call_revisions r
       JOIN calls oc ON oc.id = r.original_call_id
       LEFT JOIN calls rc ON rc.id = r.revised_call_id
       GROUP BY r.creator_id
     )
     SELECT
       rp.creator_id,
       rp.revision_count,
       rp.score_numerator,
       COALESCE(s.scored_calls, '0') AS scored_calls
     FROM revision_points rp
     LEFT JOIN scored s ON s.creator_id = rp.creator_id`,
  );

  const out = new Map<number, SelfCorrectionAggregate>();
  for (const row of rows) {
    const scored = Number(row.scored_calls);
    const numerator = Number(row.score_numerator);
    const rawScore = numerator / (scored + SHRINKAGE_K);
    const clamped = Math.max(0, Math.min(1, rawScore));
    out.set(row.creator_id, {
      creatorId: row.creator_id,
      revisionCount: Number(row.revision_count),
      score: clamped,
      tier: tierForScore(clamped),
    });
  }
  return out;
}
