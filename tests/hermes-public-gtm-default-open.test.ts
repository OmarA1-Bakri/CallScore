import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface RegistryEntry {
  channel: string;
  allowed_actions_now: string[];
  forbidden_actions: string[];
  required_gate: string;
  gate_status: string;
  required_receipt: string;
  receipt_path_pattern: string;
  current_status: string;
  next_safe_action: string;
  operator_action_required: string;
}

const registry = JSON.parse(readFileSync("docs/ops/callscore-gtm-agent-registry.json", "utf8")) as { gate_rules: Record<string, string>; entries: RegistryEntry[] };
const byChannel = new Map(registry.entries.map((entry) => [entry.channel, entry]));

const ownedPublicChannels = ["X / Twitter", "LinkedIn", "Discord", "Telegram", "YouTube / SEO", "Whop marketplace"];
const restrictedChannels = ["Gmail / email", "Reddit", "Crypto newsletters", "Creator partnerships", "Whop provider / entitlement", "Attio CRM", "PostHog analytics"];

const skillPaths = {
  "art-of-war-operations": "/srv/agents/hermes/skills/commerce/art-of-war-operations/SKILL.md",
  "callscore-autopilot": "/srv/agents/hermes/skills/callscore-autopilot/SKILL.md",
  "workplane-status": "/srv/agents/hermes/skills/devops/workplane-status/SKILL.md",
  "whop-automation": "/srv/agents/hermes/skills/commerce/whop-automation/SKILL.md",
  humanizer: "/srv/agents/hermes/skills/creative/humanizer/SKILL.md",
  xurl: "/srv/agents/hermes/skills/social-media/xurl/SKILL.md",
} as const;

const read = (path: string) => readFileSync(path, "utf8");

test("registry defines READY_PUBLIC_OWNED default-open policy", () => {
  assert.match(registry.gate_rules.READY_PUBLIC_OWNED, /Owned CallScore public organic/i);
  assert.match(registry.gate_rules.PUBLIC_MESSAGING_POLICY, /investment advice/i);
  assert.match(registry.gate_rules.POST_EXECUTION_RECEIPT, /Required after owned public execution/i);
});

test("owned public organic channels are ready by default with post-execution receipts", () => {
  for (const channel of ownedPublicChannels) {
    const entry = byChannel.get(channel)!;
    assert.equal(entry.gate_status, "ready_public_owned", channel);
    assert.equal(entry.current_status, "ready_public_owned", channel);
    assert.match(entry.required_gate, /READY_PUBLIC_OWNED/, channel);
    assert.match(entry.required_gate, /SECRET_GATE/, channel);
    assert.match(entry.required_receipt, /post-execution|publication|marketplace copy/i, channel);
    assert.match(entry.receipt_path_pattern, /artofwar_owned_public_execution|whop_activation_review/, channel);
    assert.ok(entry.allowed_actions_now.some((action) => /publish|post|public|copy/i.test(action)), channel);
  }
});

test("safe X and LinkedIn public posts do not require approval receipt", () => {
  for (const channel of ["X / Twitter", "LinkedIn"]) {
    const entry = byChannel.get(channel)!;
    assert.doesNotMatch(entry.operator_action_required, /Approve exact post/i, channel);
    assert.match(entry.operator_action_required, /None for safe owned organic post/i, channel);
    assert.match(entry.forbidden_actions.join(" "), /DMs|paid|mutation|named.*accusations|investment advice|guarantees/i, channel);
  }
});

test("restricted channels still require SEND, SPEND, FINANCIAL, PRODUCTION, or SECRET gates", () => {
  for (const channel of restrictedChannels) {
    const entry = byChannel.get(channel)!;
    assert.match(entry.required_gate, /SEND_GATE|SPEND_GATE|FINANCIAL_GATE|PRODUCTION_GATE|SECRET_GATE/, channel);
    assert.notEqual(entry.gate_status, "ready_public_owned", channel);
    assert.match(entry.forbidden_actions.join(" "), /without|secret|mutation|send|paid|write/i, channel);
  }
});

test("Hermes skills encode default-public owned GTM and restricted fail-closed lanes", () => {
  for (const [name, path] of Object.entries(skillPaths)) {
    const text = read(path);
    assert.match(text, /READY_PUBLIC_OWNED/, name);
    assert.match(text, /Owned CallScore public organic actions are `READY_PUBLIC_OWNED` by default/i, name);
    assert.match(text, /post-execution receipt is required/i, name);
    assert.match(text, /Approval remains required for paid spend/i, name);
    assert.match(text, /email sends, DMs, outreach/i, name);
    assert.match(text, /Whop pricing\/product\/payment\/customer/i, name);
    assert.match(text, /secret exposure/i, name);
  }
});

test("Art of War persona committee is quality control, not hard block", () => {
  const text = read(skillPaths["art-of-war-operations"]);
  assert.match(text, /persona committee quality scoring/i);
  assert.match(text, /quality control, not a hard blocker/i);
  assert.match(text, /Do not confuse dry-run with publish/i);
});

test("xurl allows owned public posts while blocking DMs and restricted actions", () => {
  const text = read(skillPaths.xurl);
  assert.match(text, /safe owned public posts/i);
  assert.match(text, /allow execution by default when READY_PUBLIC_OWNED criteria/i);
  assert.match(text, /For DMs, replies to named people, outreach, paid boosts/i);
  assert.match(text, /destination URL changes, generate a new payload hash and receipt/i);
});

test("humanizer can improve public copy but cannot remove safety constraints", () => {
  const text = read(skillPaths.humanizer);
  assert.match(text, /Humanize public owned-channel copy by default/i);
  assert.match(text, /Never remove risk, methodology, source, right-of-reply, investment-advice, or compliance constraints/i);
  assert.match(text, /new payload hash and requires a new receipt/i);
});

test("current X canary is publishable under default-public policy but not posted by tests", () => {
  const packet = read("docs/ops/2026-06-15-x-twitter-public-canary-approval-packet.md");
  assert.match(packet, /Status: publishable under READY_PUBLIC_OWNED/i);
  assert.match(packet, /Publishable under default-public policy: yes/i);
  assert.match(packet, /Payload hash: `6be1a693803db3fd746d06017449a2104ecbc1f9345f2c5a7739c0b7db2e3f42`/);
  assert.match(packet, /xurl post/);
  assert.match(packet, /Public action performed in this patch run: no/);
});
