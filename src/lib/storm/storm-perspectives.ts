import type { StormContradictionRecord, StormEvidencePack } from "./storm-schemas";

export function buildStormContradictions(pack: StormEvidencePack): readonly StormContradictionRecord[] {
  const contradictions: StormContradictionRecord[] = [];
  if (pack.selected_transition.snapshot.score_ready_calls < 5) {
    contradictions.push({
      contradiction: `${pack.state} but low sample size`,
      source_table_or_artifact: "transition_state_artifact",
      source_id: `${pack.creator_id}:${pack.period_start}`,
      severity: "medium",
      explanation: "The selected transition has fewer than five score-ready calls, so treat it as provisional.",
    });
  }
  if (pack.state === "DIRECTIONAL_BIAS_RISK" && pack.contradicting_calls.length > 0) {
    contradictions.push({
      contradiction: "Directional-bias risk but some recent calls were correct",
      source_table_or_artifact: "calls",
      source_id: pack.contradicting_calls[0].call_id,
      severity: "low",
      explanation: "A directional concentration signal does not mean every recent call was poor.",
    });
  }
  if (pack.state === "HIGH_VOLATILITY" && pack.selected_transition.snapshot.avg_score >= 25) {
    contradictions.push({
      contradiction: "High volatility but average score remains strong",
      source_table_or_artifact: "transition_state_artifact",
      source_id: `${pack.creator_id}:${pack.period_start}`,
      severity: "low",
      explanation: "Volatility can coexist with strong average outcomes; the story should focus on dispersion, not negative judgment.",
    });
  }
  if ((pack.state === "RECOVERING" || pack.state === "HOT_STREAK") && pack.supporting_calls.length <= 2) {
    contradictions.push({
      contradiction: `${pack.state} but only a small number of calls support the move`,
      source_table_or_artifact: "calls",
      source_id: pack.supporting_calls[0]?.call_id ?? null,
      severity: "medium",
      explanation: "The movement may be driven by one or two calls rather than broad consistency.",
    });
  }
  for (const call of pack.contradicting_calls.slice(0, 5)) {
    contradictions.push({
      contradiction: `Call ${call.call_id} complicates the ${pack.state} story`,
      source_table_or_artifact: "calls",
      source_id: call.call_id,
      severity: "medium",
      explanation: `${call.symbol} ${call.direction} had score ${call.score} and correct_direction=${call.correct_direction}.`,
    });
  }
  return contradictions;
}
