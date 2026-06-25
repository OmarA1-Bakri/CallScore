/**
 * Markov report — pretty-print the transition matrix, top predictions,
 * backtest accuracy, and sparsity warnings.
 */
import type { TransitionMatrix, MarkovReport, CreatorPrediction, MatrixBacktestResult } from "../validation/markov-schema";
import { CREATOR_TRANSITION_STATES } from "./markov-schemas";

/**
 * Render a transition matrix as a formatted string.
 */
export function renderMatrix(matrix: TransitionMatrix): string {
  const lines: string[] = [];
  const stateLabels = matrix.states.map((s: string) => s.slice(0, 12).padEnd(12));

  lines.push(`Transition Matrix (${matrix.creator_count} creators, ${matrix.total_observations} obs, sparsity=${(matrix.sparsity_ratio * 100).toFixed(1)}%)`);
  lines.push(`Generated: ${matrix.generated_at}`);
  lines.push("");
  lines.push(`  ${"".padEnd(12)} ${stateLabels.join(" ")}`);
  lines.push(`  ${"".padEnd(12)} ${"-".repeat(stateLabels.length * 13)}`);

  for (let i = 0; i < matrix.matrix.length; i++) {
    const label = stateLabels[i];
    const row = matrix.matrix[i].map((v: number) => v > 0.01 ? v.toFixed(2).padStart(12) : "     ·      ").join("");
    lines.push(`  ${label} ${row}`);
  }

  return lines.join("\n");
}

/**
 * Render top-N transitions from the matrix (highest probability pairs).
 */
export function renderTopTransitions(matrix: TransitionMatrix, topN: number = 10): string {
  const transitions: { from: string; to: string; prob: number }[] = [];

  for (let i = 0; i < matrix.matrix.length; i++) {
    for (let j = 0; j < matrix.matrix[i].length; j++) {
      if (matrix.matrix[i][j] > 0.02) {
        transitions.push({
          from: matrix.states[i],
          to: matrix.states[j],
          prob: matrix.matrix[i][j],
        });
      }
    }
  }

  transitions.sort((a, b) => b.prob - a.prob);

  const lines = transitions.slice(0, topN).map(
    (t, idx) => `  ${(idx + 1).toString().padStart(2)}. ${t.from.padEnd(25)} → ${t.to.padEnd(25)} (${(t.prob * 100).toFixed(1)}%)`,
  );

  return lines.length > 0 ? lines.join("\n") : "  No transitions above 2% probability threshold.";
}

/**
 * Render backtest results.
 */
export function renderBacktest(report: MarkovReport): string {
  if (!report.backtest) return "  No backtest data available.";

  const lines: string[] = [];
  lines.push(`Backtest Accuracy: ${(report.backtest.overall_accuracy * 100).toFixed(1)}% (${report.backtest.total_predictions} predictions)`);
  lines.push("");

  const byState = [...report.backtest.by_state].sort(
    (a: MatrixBacktestResult, b: MatrixBacktestResult) => b.observations - a.observations,
  );
  for (const row of byState) {
    const pct = (row.accuracy * 100).toFixed(1);
    const label = row.state.padEnd(25);
    lines.push(`  ${label} ${pct.padStart(5)}%  (${row.observations} obs)`);
  }

  if (report.backtest.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of report.backtest.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return lines.join("\n");
}

/**
 * Render creator predictions.
 */
export function renderPredictions(predictions: CreatorPrediction[], topN: number = 5): string {
  if (predictions.length === 0) return "  No predictions available.";

  const sorted = [...predictions].sort(
    (a, b) => (b.stability_score ?? 0) - (a.stability_score ?? 0),
  );

  const lines: string[] = [];
  for (const pred of sorted.slice(0, topN)) {
    lines.push(`  ${pred.creator_name.padEnd(30)} current: ${pred.current_state.padEnd(22)} stability: ${(pred.stability_score ?? 0).toFixed(3)}`);
    for (const step of pred.predictions.slice(0, 2)) {
      const top = step.distribution[0];
      lines.push(`    +${step.step} step(s): ${top.state.padEnd(22)} (${(top.probability * 100).toFixed(1)}%)`);
    }
  }

  return lines.join("\n");
}

/**
 * Render the full Markov report.
 */
export function renderMarkovReport(report: MarkovReport): string {
  const lines: string[] = [];
  lines.push("=".repeat(72));
  lines.push("MARKOV TRAJECTORY REPORT");
  lines.push("=".repeat(72));
  lines.push(`Readiness: ${report.readiness}`);
  lines.push(`Creators: ${report.creator_count}`);
  lines.push(`Sparsity warnings: ${report.sparsity_warnings.length > 0 ? report.sparsity_warnings.join(", ") : "none"}`);
  lines.push("");
  lines.push(renderMatrix(report.matrix));
  lines.push("");
  lines.push("─".repeat(72));
  lines.push("Top Transitions");
  lines.push(renderTopTransitions(report.matrix, 8));
  lines.push("");
  lines.push("─".repeat(72));
  lines.push("Backtest");
  lines.push(renderBacktest(report));
  lines.push("");
  lines.push("─".repeat(72));
  lines.push("Predictions (most stable creators)");
  lines.push(renderPredictions(report.predictions, 5));

  return lines.join("\n");
}
