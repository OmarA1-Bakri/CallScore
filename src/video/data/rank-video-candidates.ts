import type { CreatorScore } from "../schemas/video.schemas";

export interface RankedVideoCandidate {
  readonly creator: CreatorScore;
  readonly contentScore: number;
  readonly factors: {
    readonly scoreDeltaWeight: number;
    readonly resolvedCallsWeight: number;
    readonly rankMovementWeight: number;
    readonly recencyWeight: number;
    readonly dataCompletenessWeight: number;
    readonly creatorRecognitionWeight: number;
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function recentCallRecency(candidate: CreatorScore, nowMs: number): number {
  const newest = candidate.recentCalls
    .map((call) => Date.parse(call.callDate))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (!newest) return 0;
  const ageDays = Math.max(0, (nowMs - newest) / 86_400_000);
  return clamp01(1 - ageDays / 14);
}

export function rankVideoCandidates(candidates: readonly CreatorScore[], now = new Date()): readonly RankedVideoCandidate[] {
  const nowMs = now.getTime();
  return candidates
    .map((creator) => {
      const factors = {
        scoreDeltaWeight: clamp01(Math.abs(creator.scoreDelta) / 25),
        resolvedCallsWeight: clamp01(creator.recentResolvedCalls / 10),
        rankMovementWeight: clamp01(Math.abs(creator.rankMovement) / 10),
        recencyWeight: recentCallRecency(creator, nowMs),
        dataCompletenessWeight: clamp01((creator.recentCalls.length + (creator.totalCalls > 0 ? 1 : 0) + (creator.winRate !== null ? 1 : 0)) / 5),
        creatorRecognitionWeight: clamp01(Math.log10(Math.max(10, creator.totalCalls + 10)) / 3),
      };
      const contentScore =
        factors.scoreDeltaWeight * 0.25 +
        factors.resolvedCallsWeight * 0.20 +
        factors.rankMovementWeight * 0.15 +
        factors.recencyWeight * 0.15 +
        factors.dataCompletenessWeight * 0.15 +
        factors.creatorRecognitionWeight * 0.10;
      return { creator, contentScore: Number(contentScore.toFixed(6)), factors };
    })
    .sort((a, b) => b.contentScore - a.contentScore || (a.creator.rank ?? 9999) - (b.creator.rank ?? 9999));
}
