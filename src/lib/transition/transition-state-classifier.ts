import type { CreatorTransitionSnapshot, CreatorTransitionStateRecord } from "./transition-schemas";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function delta(current: number, previous?: number): number {
  return Number((current - (previous ?? current)).toFixed(4));
}

export function classifyTransitionSnapshot(
  snapshot: CreatorTransitionSnapshot,
  previous?: CreatorTransitionSnapshot,
  baseline?: CreatorTransitionSnapshot,
): CreatorTransitionStateRecord {
  const drivers: string[] = [];
  const warnings: string[] = [];
  const calls = snapshot.score_ready_calls;
  const baselineScore = baseline?.avg_score ?? snapshot.avg_score;
  const baselineWin = baseline?.win_rate ?? snapshot.win_rate;
  const scoreDelta = delta(snapshot.avg_score, previous?.avg_score);
  const winDelta = delta(snapshot.win_rate, previous?.win_rate);

  let state: CreatorTransitionStateRecord["state"] = "PROVISIONAL_SIGNAL";
  let confidence = 0.45;

  if (snapshot.calls_count === 0) {
    state = "STALE_OR_INACTIVE";
    confidence = 0.85;
    drivers.push("no calls in current period");
  } else if (calls < 5) {
    state = "INSUFFICIENT_DATA";
    confidence = 0.8;
    warnings.push("fewer than 5 score-ready calls");
  } else if ((snapshot.bullish_pct >= 0.85 || snapshot.bearish_pct >= 0.85) && snapshot.calls_count >= 8) {
    state = "DIRECTIONAL_BIAS_RISK";
    confidence = 0.78;
    drivers.push(`direction concentration bullish=${snapshot.bullish_pct}, bearish=${snapshot.bearish_pct}`);
  } else if (snapshot.score_stddev >= 18 || snapshot.alpha_spread >= 35) {
    state = "HIGH_VOLATILITY";
    confidence = 0.72;
    drivers.push(`score_stddev=${snapshot.score_stddev}, alpha_spread=${snapshot.alpha_spread}`);
  } else if (previous && previous.avg_score < baselineScore - 4 && scoreDelta >= 5) {
    state = "RECOVERING";
    confidence = 0.7;
    drivers.push(`avg_score improved ${scoreDelta} after weak prior period`);
  } else if (previous && scoreDelta <= -5 && winDelta <= -0.15) {
    state = "DETERIORATING";
    confidence = 0.72;
    drivers.push(`avg_score delta ${scoreDelta}, win_rate delta ${winDelta}`);
  } else if (snapshot.win_rate >= Math.max(0.55, baselineWin + 0.12) && snapshot.avg_score >= baselineScore + 5) {
    state = "HOT_STREAK";
    confidence = 0.75;
    drivers.push(`win_rate=${snapshot.win_rate}, avg_score=${snapshot.avg_score}`);
  } else if (snapshot.win_rate <= Math.min(0.3, baselineWin - 0.12) && snapshot.avg_score <= baselineScore - 5) {
    state = "COLD_STREAK";
    confidence = 0.75;
    drivers.push(`win_rate=${snapshot.win_rate}, avg_score=${snapshot.avg_score}`);
  } else if (calls >= 10) {
    state = "STABLE_PERFORMER";
    confidence = 0.64;
    drivers.push("enough score-ready calls with no extreme movement signal");
  } else {
    state = "PROVISIONAL_SIGNAL";
    confidence = 0.52;
    warnings.push("limited but usable activity signal");
  }

  if (snapshot.calls_count !== snapshot.score_ready_calls) warnings.push("some calls are not score-ready");
  if (snapshot.extraction_confidence_avg < 0.75) warnings.push("lower average extraction confidence");

  return {
    creator_id: snapshot.creator_id,
    creator_name: snapshot.creator_name,
    youtube_handle: snapshot.youtube_handle,
    period_start: snapshot.period_start,
    period_end: snapshot.period_end,
    state,
    confidence: clamp(confidence),
    drivers,
    warnings,
    snapshot,
  };
}

export function classifyTransitionSnapshots(snapshots: readonly CreatorTransitionSnapshot[]): readonly CreatorTransitionStateRecord[] {
  const byCreator = new Map<number, CreatorTransitionSnapshot[]>();
  for (const snapshot of snapshots) {
    const bucket = byCreator.get(snapshot.creator_id) ?? [];
    bucket.push(snapshot);
    byCreator.set(snapshot.creator_id, bucket);
  }
  const states: CreatorTransitionStateRecord[] = [];
  for (const bucket of byCreator.values()) {
    const sorted = [...bucket].sort((a, b) => a.period_start.localeCompare(b.period_start));
    const baseline = baselineSnapshot(sorted);
    sorted.forEach((snapshot, index) => {
      states.push(classifyTransitionSnapshot(snapshot, sorted[index - 1], baseline));
    });
  }
  return states.sort((a, b) => a.creator_id - b.creator_id || a.period_start.localeCompare(b.period_start));
}

function baselineSnapshot(snapshots: readonly CreatorTransitionSnapshot[]): CreatorTransitionSnapshot | undefined {
  if (snapshots.length === 0) return undefined;
  const ready = snapshots.filter((snapshot) => snapshot.score_ready_calls > 0);
  if (ready.length === 0) return snapshots[0];
  const totalReady = ready.reduce((sum, snapshot) => sum + snapshot.score_ready_calls, 0);
  const weighted = (field: "avg_score" | "win_rate") => ready.reduce((sum, snapshot) => sum + snapshot[field] * snapshot.score_ready_calls, 0) / totalReady;
  return { ...ready[0], avg_score: Number(weighted("avg_score").toFixed(4)), win_rate: Number(weighted("win_rate").toFixed(4)) };
}
