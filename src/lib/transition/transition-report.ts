import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PipelineGuardAudit } from "../pipeline-guard-audit";
import type { CreatorTransitionExclusion, CreatorTransitionStateRecord, TransitionBacktestReport, TransitionReportArtifacts } from "./transition-schemas";

export function stateDistribution(states: readonly CreatorTransitionStateRecord[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const state of states) distribution[state.state] = (distribution[state.state] ?? 0) + 1;
  return distribution;
}

function topStates(states: readonly CreatorTransitionStateRecord[], names: readonly string[], limit = 10): readonly CreatorTransitionStateRecord[] {
  const allowed = new Set(names);
  return states
    .filter((state) => allowed.has(state.state))
    .sort((a, b) => b.confidence - a.confidence || b.snapshot.score_ready_calls - a.snapshot.score_ready_calls)
    .slice(0, limit);
}

function stateLine(state: CreatorTransitionStateRecord): string {
  return `- ${state.creator_name} (${state.youtube_handle ?? "no handle"}) — ${state.state}, confidence ${state.confidence}, period ${state.period_start} to ${state.period_end}; drivers: ${state.drivers.join("; ") || "none recorded"}`;
}

export function renderTransitionReport(input: {
  readonly guard: PipelineGuardAudit;
  readonly artifacts: TransitionReportArtifacts;
}): string {
  const { guard, artifacts } = input;
  const distribution = stateDistribution(artifacts.states);
  const eligibleCreators = new Set(artifacts.snapshots.map((snapshot) => snapshot.creator_id)).size;
  const improving = topStates(artifacts.states, ["HOT_STREAK", "RECOVERING"]);
  const cooling = topStates(artifacts.states, ["COLD_STREAK", "DETERIORATING"]);
  const volatile = topStates(artifacts.states, ["HIGH_VOLATILITY"]);
  const bias = topStates(artifacts.states, ["DIRECTIONAL_BIAS_RISK"]);

  return `# Creator Transition Intelligence Report

## 1. Scope

Read-only creator trajectory report generated from CallScore raw calls. No DB writes, no public publishing, no UI changes.

## 2. Data source

- Primary: raw \`calls\` joined to \`creators\`.
- Explicitly not used: \`creator_stats.30d\`, raw verifier labels, stale daily closes.

## 3. Guard status

- overall_status: ${guard.overall_status}
- core_pipeline_status: ${guard.core_pipeline_status}
- transition_readiness: ${guard.transition_readiness}
- storm_readiness: ${guard.storm_readiness}
- public_publish_readiness: ${guard.public_publish_readiness}

## 4. Eligible creators

${eligibleCreators} creators produced eligible transition snapshots.

## 5. Excluded news/media/context creators

${artifacts.exclusions.length} creators excluded by creator eligibility policy.

${artifacts.exclusions.slice(0, 20).map((item: CreatorTransitionExclusion) => `- ${item.creator_name} (${item.youtube_handle ?? "no handle"}) — ${item.excluded_reason}`).join("\n") || "- None"}

## 6. State distribution

${Object.entries(distribution).sort((a, b) => b[1] - a[1]).map(([state, count]) => `- ${state}: ${count}`).join("\n") || "- No states generated"}

## 7. Strongest improving creators

${improving.map(stateLine).join("\n") || "- None detected in this run"}

## 8. Strongest cooling-off creators

${cooling.map(stateLine).join("\n") || "- None detected in this run"}

## 9. High-volatility creators

${volatile.map(stateLine).join("\n") || "- None detected in this run"}

## 10. Directional-bias-risk creators

${bias.map(stateLine).join("\n") || "- None detected in this run"}

## 11. Backtest summary

${artifacts.backtest.summary}

${artifacts.backtest.buckets.map((bucket) => `- ${bucket.state}: observations=${bucket.observations}, avg_next_score=${bucket.avg_next_score}, avg_next_win_rate=${bucket.avg_next_win_rate}`).join("\n") || "- No linked next-period buckets"}

## 12. Caveats

- This is descriptive transition intelligence, not a prediction product.
- Low-N periods are marked insufficient/provisional.
- News/media/context creators are excluded from creator reliability modelling.
- Daily closes are not required for this v1 report.

## 13. Recommended next action

Use the strongest state changes as candidates for STORM evidence packs and YouTube topic selection. Do not publish claims until evidence packs and public gates pass.
`;
}

export function writeTransitionArtifacts(outDir: string, guard: PipelineGuardAudit, artifacts: TransitionReportArtifacts): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "snapshots.json"), `${JSON.stringify(artifacts.snapshots, null, 2)}\n`);
  writeFileSync(join(outDir, "states.json"), `${JSON.stringify(artifacts.states, null, 2)}\n`);
  writeFileSync(join(outDir, "backtest.json"), `${JSON.stringify(artifacts.backtest, null, 2)}\n`);
  writeFileSync(join(outDir, "exclusions.json"), `${JSON.stringify(artifacts.exclusions, null, 2)}\n`);
  writeFileSync(join(outDir, "guard.json"), `${JSON.stringify(guard, null, 2)}\n`);
  writeFileSync(join(outDir, "report.md"), renderTransitionReport({ guard, artifacts }));
}
