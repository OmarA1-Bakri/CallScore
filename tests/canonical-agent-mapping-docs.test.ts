import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const base = join(process.cwd(), "docs/ops/canonical-agent-mapping");
const sourcePath = join(base, "callscore_canonical_agent_mapping.source.json");
const reportPath = join(base, "callscore_canonical_agent_mapping.md");
const matrixPath = join(base, "callscore_agent_role_matrix.md");
const flowsPath = join(base, "callscore_channel_flows.md");
const learningPath = join(base, "callscore_learning_cluster.md");

test("canonical agent mapping documentation lives in repo source as machine-readable JSON plus Markdown", () => {
  for (const path of [sourcePath, reportPath, matrixPath, flowsPath, learningPath]) {
    assert.equal(existsSync(path), true, `${path} must exist in repo source`);
  }
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  assert.equal(source.schema, "callscore.canonical_agent_mapping.v1");
  assert.equal(source.canonical_rules.documentation_rule, "All documentation is Markdown. Flow diagrams are Mermaid. Machine-readable source of truth comes first.");
  assert.equal(source.new_agent_summary.existing_agents, 44);
  assert.equal(source.new_agent_summary.proposed_new_required, 7);
  assert.equal(source.new_agent_summary.total_mapped, 51);
  assert.equal(source.agents.length, 51);
});

test("canonical Markdown docs use Mermaid flows and do not canonize HTML/PNG/SVG documentation", () => {
  const report = readFileSync(reportPath, "utf8");
  const flows = readFileSync(flowsPath, "utf8");
  const learning = readFileSync(learningPath, "utf8");
  assert.match(report, /Machine-readable first/);
  assert.match(flows, /```mermaid/);
  assert.match(learning, /```mermaid/);
  assert.doesNotMatch(report, /\.html|\.png|\.svg/i);
  assert.doesNotMatch(flows, /\.html|\.png|\.svg/i);
});
