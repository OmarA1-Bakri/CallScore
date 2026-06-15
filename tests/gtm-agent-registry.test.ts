import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type RegistryEntry = {
  channel: string;
  surface_type: string;
  primary_owner_agent: string;
  supporting_agents: string[];
  canonical_repo_or_path: string;
  connected_app_or_provider: string;
  workplane_jobs: string[];
  allowed_actions_now: string[];
  forbidden_actions: string[];
  required_gate: string;
  gate_status: string;
  required_receipt: string;
  receipt_path_pattern: string;
  rollback_path: string;
  current_status: string;
  next_safe_action: string;
  operator_action_required: string;
  evidence: string[];
};

type Registry = { entries: RegistryEntry[] };

const registry = JSON.parse(readFileSync("docs/ops/callscore-gtm-agent-registry.json", "utf8")) as Registry;
const byChannel = new Map(registry.entries.map((entry) => [entry.channel, entry]));

const requiredChannels = [
  "X / Twitter",
  "LinkedIn",
  "Gmail / email",
  "Discord",
  "Telegram",
  "Reddit",
  "YouTube / SEO",
  "Crypto newsletters",
  "Creator partnerships",
  "Whop marketplace",
  "Whop provider / entitlement",
  "Attio CRM",
  "PostHog analytics",
  "Hugging Face",
  "Composio hub",
  "Art of War campaign engine",
  "Workplane / Hermes governance",
  "Automation registry / health checks",
];

test("registry contains every required GTM channel", () => {
  for (const channel of requiredChannels) {
    assert.ok(byChannel.has(channel), `missing channel: ${channel}`);
  }
});

test("every registry row has owner, gate, receipt, rollback, and evidence", () => {
  for (const entry of registry.entries) {
    assert.ok(entry.primary_owner_agent, `${entry.channel} missing owner`);
    assert.ok(entry.required_gate, `${entry.channel} missing gate`);
    assert.ok(entry.required_receipt, `${entry.channel} missing receipt`);
    assert.ok(entry.receipt_path_pattern, `${entry.channel} missing receipt pattern`);
    assert.ok(entry.rollback_path, `${entry.channel} missing rollback`);
    assert.ok(entry.evidence.length > 0, `${entry.channel} missing evidence`);
  }
});

test("owned public channels are READY_PUBLIC_OWNED while outreach channels require send gates", () => {
  for (const channel of ["X / Twitter", "LinkedIn", "Discord", "Telegram", "Whop marketplace", "YouTube / SEO"]) {
    assert.match(byChannel.get(channel)!.required_gate, /READY_PUBLIC_OWNED/);
  }
  for (const channel of ["Gmail / email", "Reddit", "Crypto newsletters", "Creator partnerships"]) {
    assert.match(byChannel.get(channel)!.required_gate, /SEND_GATE/);
  }
});

test("Whop financial/provider mutation stays fail-closed", () => {
  const provider = byChannel.get("Whop provider / entitlement")!;
  assert.match(provider.required_gate, /FINANCIAL_GATE/);
  assert.match(provider.required_gate, /PRODUCTION_GATE/);
  assert.equal(provider.gate_status, "fail_closed");
  assert.ok(provider.forbidden_actions.some((action) => /pricing|payment|mutation/i.test(action)));
});

test("registry allows safe owned posts but keeps restricted sends, spend, and mutations gated", () => {
  const ownedPublic = new Set(["X / Twitter", "LinkedIn", "Discord", "Telegram", "Whop marketplace", "YouTube / SEO"]);
  const restrictedUnsafe = /\b(send email|send message|send live|DM live|paid|spend|provider write|mutation|pricing change|payment change)\b/i;
  for (const entry of registry.entries) {
    for (const action of entry.allowed_actions_now) {
      if (ownedPublic.has(entry.channel) && /publish|post|public|copy/i.test(action)) continue;
      if (/draft|prepare|read-only|inventory|plan/i.test(action)) continue;
      assert.doesNotMatch(action, restrictedUnsafe, `${entry.channel} unsafe allowed action: ${action}`);
    }
    if (/send|spend|mutation|payment|pricing|provider/i.test(entry.forbidden_actions.join(" "))) {
      assert.match(entry.required_gate, /SEND_GATE|SPEND_GATE|FINANCIAL_GATE|PRODUCTION_GATE|SECRET_GATE/, `${entry.channel} dangerous lane lacks restricted gate`);
    }
  }
});

test("canonical paths use CallScore, Whop Auto, and Art of War sources", () => {
  assert.equal(byChannel.get("Workplane / Hermes governance")!.canonical_repo_or_path, "/opt/crypto-tuber-ranked");
  assert.equal(byChannel.get("Whop provider / entitlement")!.canonical_repo_or_path, "/srv/whop-auto");
  assert.equal(byChannel.get("Art of War campaign engine")!.canonical_repo_or_path, "/srv/agents/repos/Claude_Code_Automations");
});
