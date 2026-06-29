import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const planPath = join(process.cwd(), "docs/plans/callscore-agent-upgrade-hard-gates-and-loops.md");

test("canonical agent upgrade plan defines hard gates and evaluator loops", () => {
  assert.equal(existsSync(planPath), true, "agent upgrade plan must exist");
  const plan = readFileSync(planPath, "utf8");
  for (const required of [
    "Hard gates",
    "Evaluator loops",
    "TDD workflow",
    "No publication gate redesign",
    "learning_event.v1",
    "visual_qa_receipt.v1",
    "platform_fit_receipt.v1",
    "agent_performance_ledger.v1",
  ]) {
    assert.match(plan, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${required} missing`);
  }
});
