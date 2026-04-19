/**
 * self-correction.ts — Detection + scoring for the "self-correction index".
 *
 * A creator earns points when they publicly revise a prior call:
 *   - updated_target      — raised/lowered a price target ("updating my target")
 *   - reversed_direction  — flipped bullish<->bearish on the same ticker
 *   - retracted           — "I take it back" / "no longer recommend"
 *   - confirmed_miss      — acknowledged a losing call ("I was wrong")
 *
 * This rewards accountability (Cowen-style public updates) vs silent delete
 * behaviour. The detection logic is intentionally conservative — patterns are
 * tightly scoped so false positives don't drown out real signal.
 */
import { query } from "./db";
import type { Call, Direction } from "./types";

export type RevisionType =
  | "updated_target"
  | "reversed_direction"
  | "retracted"
  | "confirmed_miss";

export type SelfCorrectionTier = "honest" | "some" | "rarely";

export interface Revision {
  readonly originalCallId: number;
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
/*  Regex patterns — case-insensitive, Unicode safe.                  */
/* ------------------------------------------------------------------ */

const UPDATED_TARGET_PATTERN =
  /\b(update[ds]?|updating|adjust(?:ing|ed)?|revis(?:ing|ed)|mov(?:ing|ed))\s+(my\s+)?(target|price\s+target)/i;

const CONFIRMED_MISS_PATTERN =
  /\b(i\s+was\s+wrong|admit|didn'?t\s+work\s+out|retract|bad\s+call|missed\s+(it|the\s+call))/i;

const RETRACTED_PATTERN =
  /\b(retract|take\s+(it\s+)?back|no\s+longer\s+recommend)/i;

const REVERSAL_GAP_MAX_DAYS = 30;
const UPDATED_TARGET_GAP_MAX_DAYS = 60;
const REVERSAL_MIN_CONFIDENCE = 0.7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  Scoring rubric constants (single source of truth).                */
/* ------------------------------------------------------------------ */

const POINTS: Readonly<Record<RevisionType, number>> = {
  confirmed_miss: 1.0,
  updated_target: 0.5,
  reversed_direction: 0.5,
  retracted: 0.5,
};

const TIER_HONEST_MIN = 0.15;
const TIER_SOME_MIN = 0.05;

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

/* ------------------------------------------------------------------ */
/*  Public: detectRevisions                                           */
/* ------------------------------------------------------------------ */

/**
 * Detect revision events by scanning each creator's call history for
 * same-ticker pairs and regex signals in `raw_quote`.
 *
 * The function is pure — it does NOT hit the database. The caller is
 * expected to supply all of a creator's calls ordered by `call_date`
 * ASC (insertion order is not assumed).
 *
 * Returns one Revision per (originalCallId, revisionType) pair; duplicate
 * matches against the same original are suppressed so the DB unique index
 * never rejects a row.
 */
export function detectRevisions(calls: readonly Call[]): Revision[] {
  if (calls.length === 0) return [];

  // Sort defensively so callers can pass unsorted arrays. We key the output
  // de-dup map on `${originalCallId}:${revisionType}` — the same unique pair
  // as the DB index.
  const sorted = [...calls].sort(
    (a, b) =>
      new Date(a.call_date).getTime() - new Date(b.call_date).getTime(),
  );

  const seen = new Set<string>();
  const out: Revision[] = [];

  const emit = (revision: Revision): void => {
    const key = `${revision.originalCallId}:${revision.revisionType}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(revision);
  };

  // Group by symbol for pairwise comparisons. Symbol already stores canonical
  // USDT form (e.g. BTCUSDT) so no further normalization is needed — callers
  // rely on the upstream `normalizeSymbol` in ai-extraction.ts.
  const bySymbol = new Map<string, Call[]>();
  for (const call of sorted) {
    const existing = bySymbol.get(call.symbol) ?? [];
    existing.push(call);
    bySymbol.set(call.symbol, existing);
  }

  for (const group of Array.from(bySymbol.values())) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      const later = group[i];
      const laterDate = new Date(later.call_date);
      const laterQuote = later.raw_quote ?? "";

      // Pair each later call with its earliest earlier call on the same
      // ticker. Inner loop iterates over predecessors (indices < i).
      for (let j = 0; j < i; j++) {
        const earlier = group[j];
        const earlierDate = new Date(earlier.call_date);
        const gap = daysBetween(earlierDate, laterDate);

        // reversed_direction
        if (
          gap <= REVERSAL_GAP_MAX_DAYS &&
          directionsOpposite(earlier.direction, later.direction) &&
          confidenceToNumeric(earlier.confidence) >= REVERSAL_MIN_CONFIDENCE &&
          confidenceToNumeric(later.confidence) >= REVERSAL_MIN_CONFIDENCE
        ) {
          emit({
            originalCallId: earlier.id,
            creatorId: earlier.creator_id,
            revisedAt: laterDate,
            revisionType: "reversed_direction",
            sourceVideoId: toSourceVideoId(later),
            notes: `direction ${earlier.direction} -> ${later.direction}`,
          });
        }

        // updated_target (wider window, requires quote evidence)
        if (
          gap <= UPDATED_TARGET_GAP_MAX_DAYS &&
          UPDATED_TARGET_PATTERN.test(laterQuote)
        ) {
          emit({
            originalCallId: earlier.id,
            creatorId: earlier.creator_id,
            revisedAt: laterDate,
            revisionType: "updated_target",
            sourceVideoId: toSourceVideoId(later),
            notes: "target revision language in later quote",
          });
        }

        // confirmed_miss — explicit acknowledgement in the later quote.
        if (CONFIRMED_MISS_PATTERN.test(laterQuote)) {
          emit({
            originalCallId: earlier.id,
            creatorId: earlier.creator_id,
            revisedAt: laterDate,
            revisionType: "confirmed_miss",
            sourceVideoId: toSourceVideoId(later),
            notes: "miss acknowledgement language in later quote",
          });
        }

        // retracted — explicit retraction language in the later quote.
        if (RETRACTED_PATTERN.test(laterQuote)) {
          emit({
            originalCallId: earlier.id,
            creatorId: earlier.creator_id,
            revisedAt: laterDate,
            revisionType: "retracted",
            sourceVideoId: toSourceVideoId(later),
            notes: "retraction language in later quote",
          });
        }
      }
    }
  }

  return out;
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
  readonly return_30d: number | null;
  readonly direction: Direction;
  readonly hit_target: boolean | null;
  readonly correct_direction: boolean | null;
  readonly score_qualifies: boolean;
}

interface CreatorScoredCountRow {
  readonly scored_count: string;
}

/**
 * Compute the self-correction score for a single creator from the
 * `call_revisions` table joined against the original calls.
 *
 * Zero-state contract: a creator with no revisions returns
 * `{score: 0, revisionCount: 0, tier: "rarely"}`.
 */
export async function computeSelfCorrectionScore(
  creatorId: number,
): Promise<SelfCorrectionScore> {
  // Pull each revision along with enough of the original call to decide
  // whether the rubric's conditional points apply.
  const revisionRows = await query<RevisionScoringRow>(
    `SELECT
       r.revision_type,
       oc.return_30d,
       oc.direction,
       oc.hit_target,
       oc.correct_direction,
       (oc.extraction_confidence >= 0.6
         AND oc.return_30d IS NOT NULL) AS score_qualifies
     FROM call_revisions r
     JOIN calls oc ON oc.id = r.original_call_id
     WHERE r.creator_id = $1`,
    [creatorId],
  );

  // Denominator: creator's scored call count (scored = has return_30d and
  // passes the extraction-confidence floor). Matches the public-methodology
  // "scored" gate closely enough for a ratio.
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

  if (revisionRows.length === 0 || scoredCalls === 0) {
    return {
      creatorId,
      score: 0,
      revisionCount: revisionRows.length,
      tier: "rarely",
    };
  }

  let points = 0;

  for (const row of revisionRows) {
    points += pointsForRevision(row);
  }

  const rawScore = points / scoredCalls;
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
    case "retracted":
      return POINTS[row.revision_type];

    case "confirmed_miss": {
      // Only award points when the original call was in fact a miss:
      // return_30d * direction_sign <= 0. Neutral-direction originals or
      // pending-horizon rows do not qualify.
      if (!row.score_qualifies || row.return_30d === null) return 0;
      const directionSign =
        row.direction === "bullish"
          ? 1
          : row.direction === "bearish"
            ? -1
            : 0;
      if (directionSign === 0) return 0;
      const directionalReturn = row.return_30d * directionSign;
      return directionalReturn <= 0 ? POINTS.confirmed_miss : 0;
    }

    case "reversed_direction": {
      // Reward only when the LATER call (the corrected view) ended up
      // hitting. We approximate "later call hit" via correct_direction on
      // the ORIGINAL call being false AND the revision itself being the
      // reversal — but that's fragile. Instead, require hit_target on
      // original to be false OR correct_direction false; i.e. the reversal
      // is validated because the original was indeed wrong.
      if (row.correct_direction === false || row.hit_target === false) {
        return POINTS.reversed_direction;
      }
      return 0;
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
 * one call. Used by the leaderboard query so the homepage and API share a
 * single trip to the DB.
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
             WHEN r.revision_type = 'reversed_direction'
               AND (oc.correct_direction = false OR oc.hit_target = false)
               THEN ${POINTS.reversed_direction}
             ELSE 0
           END
         )::text AS score_numerator
       FROM call_revisions r
       JOIN calls oc ON oc.id = r.original_call_id
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
    const rawScore = scored > 0 ? numerator / scored : 0;
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
