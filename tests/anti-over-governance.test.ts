import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  discoverFinalRuntimeAgents,
  renderAntiOverGovernanceAuditMarkdown,
  runAntiOverGovernanceAudit,
} from "../src/lib/autonomy/anti-over-governance-audit";

const soulsPath = join(process.cwd(), "docs/ops/callscore-channel-head-souls.yaml");
const soulsYaml = readFileSync(soulsPath, "utf8");
const now = "2026-06-21T15:00:00.000Z";

test("anti-over-governance audit discovers the final runtime agents from canonical souls config", () => {
  const agents = discoverFinalRuntimeAgents(soulsYaml);

  assert.equal(agents.length, 51);
  assert.equal(new Set(agents.map((agent) => agent.agentId)).size, 51);
  assert.ok(agents.every((agent) => agent.agentId.startsWith("callscore-")));
  assert.ok(agents.every((agent) => agent.className.length > 0));
  assert.ok(agents.every((agent) => agent.ownerSurface.length > 0));
  assert.ok(agents.every((agent) => agent.safeScenario.length > 0));
});

test("anti-over-governance audit allows every healthy routine agent fixture without founder or unnecessary non-founder gates", () => {
  const agents = discoverFinalRuntimeAgents(soulsYaml);
  const report = runAntiOverGovernanceAudit({ agents, now });

  assert.equal(report.safeResults.length, 51);
  assert.equal(report.safeResults.some((result) => result.proposedActionType === "publish_owned_public"), true);
  assert.equal(report.safeResults.every((result) => result.finalVerdict === "PASS"), true);
  assert.equal(report.safeResults.every((result) => result.founderRequired === false), true);
  assert.equal(report.safeResults.every((result) => result.nonFounderReviewRequired === false), true);

  for (const result of report.safeResults) {
    assert.notEqual(result.decision, "request_gate", result.agentId);
    assert.notEqual(result.decision, "escalate_non_founder_review", result.agentId);
    assert.notEqual(result.decision, "suppress", result.agentId);
    assert.notEqual(result.decision, "wait", result.agentId);
    assert.deepEqual(result.governanceGatesTriggered, [], result.agentId);
  }
});

test("anti-over-governance audit keeps restricted scenarios fail-closed", () => {
  const report = runAntiOverGovernanceAudit({ agents: discoverFinalRuntimeAgents(soulsYaml), now });

  assert.deepEqual(report.restrictedResults.map((result) => result.scenario), [
    "whop_financial_customer_payment_mutation",
    "provider_spend",
    "db_deploy_infra_mutation",
    "credentials_or_secrets",
    "outreach_or_sends",
  ]);
  for (const result of report.restrictedResults) {
    assert.notEqual(result.decision, "act", result.scenario);
    assert.equal(result.finalVerdict, "PASS", result.scenario);
    assert.ok(result.governanceGatesTriggered.length >= 1, result.scenario);
    assert.equal(result.founderRequired, false, result.scenario);
  }
});

test("anti-over-governance audit markdown includes required agent and restricted-scenario tables", () => {
  const report = runAntiOverGovernanceAudit({ agents: discoverFinalRuntimeAgents(soulsYaml), now });
  const markdown = renderAntiOverGovernanceAuditMarkdown(report);

  assert.match(markdown, /# CallScore Anti-Over-Governance Audit/);
  assert.match(markdown, /\| Agent \| Safe scenario \| Decision \| Governance gates triggered \| founder_required \| non_founder_review_required \| Final verdict \|/);
  assert.match(markdown, /\| Restricted scenario \| Decision \| Governance gates triggered \| founder_required \| Final verdict \|/);
  assert.equal((markdown.match(/\| callscore-/g) ?? []).length, 51);
  assert.match(markdown, /whop_financial_customer_payment_mutation/);
  assert.match(markdown, /provider_spend/);
  assert.match(markdown, /db_deploy_infra_mutation/);
  assert.match(markdown, /credentials_or_secrets/);
  assert.match(markdown, /outreach_or_sends/);
});
