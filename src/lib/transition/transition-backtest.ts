import type { CreatorTransitionState, CreatorTransitionStateRecord, TransitionBacktestBucket, TransitionBacktestReport } from "./transition-schemas";

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

export function backtestTransitionStates(states: readonly CreatorTransitionStateRecord[]): TransitionBacktestReport {
  const byCreator = new Map<number, CreatorTransitionStateRecord[]>();
  for (const state of states) {
    const bucket = byCreator.get(state.creator_id) ?? [];
    bucket.push(state);
    byCreator.set(state.creator_id, bucket);
  }

  const buckets = new Map<CreatorTransitionState, { current: CreatorTransitionStateRecord[]; next: CreatorTransitionStateRecord[] }>();
  for (const bucket of byCreator.values()) {
    const sorted = [...bucket].sort((a, b) => a.period_start.localeCompare(b.period_start));
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index];
      const next = sorted[index + 1];
      const entry = buckets.get(current.state) ?? { current: [], next: [] };
      entry.current.push(current);
      entry.next.push(next);
      buckets.set(current.state, entry);
    }
  }

  const rows: TransitionBacktestBucket[] = Array.from(buckets.entries()).map(([state, entry]) => ({
    state,
    observations: entry.current.length,
    next_periods: entry.next.length,
    avg_next_win_rate: avg(entry.next.map((item) => item.snapshot.win_rate)),
    avg_next_score: avg(entry.next.map((item) => item.snapshot.avg_score)),
    avg_next_alpha_30d: avg(entry.next.map((item) => item.snapshot.avg_alpha_30d)),
    future_activity_rate: avg(entry.next.map((item) => item.snapshot.calls_count > 0 ? 1 : 0)),
  })).sort((a, b) => b.observations - a.observations || a.state.localeCompare(b.state));

  const meaningful = rows.filter((row) => row.next_periods >= 10);
  const summary = meaningful.length === 0
    ? "descriptive only: not enough next-period observations for a robust signal"
    : "weak signal: state buckets have next-period observations, but treat as descriptive until larger validation proves predictive value";

  return { summary, buckets: rows };
}
