import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const skillPaths = {
  "art-of-war-operations": "/srv/agents/hermes/skills/commerce/art-of-war-operations/SKILL.md",
  "callscore-autopilot": "/srv/agents/hermes/skills/callscore-autopilot/SKILL.md",
  "workplane-status": "/srv/agents/hermes/skills/devops/workplane-status/SKILL.md",
  "whop-automation": "/srv/agents/hermes/skills/commerce/whop-automation/SKILL.md",
  humanizer: "/srv/agents/hermes/skills/creative/humanizer/SKILL.md",
  xurl: "/srv/agents/hermes/skills/social-media/xurl/SKILL.md",
} as const;

const read = (path: string) => readFileSync(path, "utf8");
const skillText = Object.fromEntries(Object.entries(skillPaths).map(([name, path]) => [name, read(path)]));
const allSkillText = Object.values(skillText).join("\n");

const gates = ["PUBLISH_GATE", "SEND_GATE", "SPEND_GATE", "FINANCIAL_GATE", "PRODUCTION_GATE", "SECRET_GATE"];

for (const [name, text] of Object.entries(skillText)) {
  test(`${name} has canonical CallScore process`, () => {
    assert.match(text, /CANONICAL CALLSCORE PROCESS \(MANDATORY\)/);
    assert.match(text, /CONTROLLED_FULL/);
    assert.match(text, /\/opt\/crypto-tuber-ranked\/docs\/ops\/callscore-gtm-agent-registry\.json/);
    assert.match(text, /Workplane/);
    assert.match(text, /approval receipt/i);
    assert.match(text, /rollback path/i);
    for (const gate of gates) assert.match(text, new RegExp(gate), `${name} missing ${gate}`);
  });
}

test("Art of War cannot publish from dry-run alone and requires persona evidence", () => {
  const text = skillText["art-of-war-operations"];
  assert.match(text, /Never publish from dry-run alone/i);
  assert.match(text, /persona committee evidence/i);
  assert.match(text, /payload hash/i);
  assert.match(text, /TRUST_GATE/);
  assert.match(text, /DATA_POLICY_GATE/);
});

test("CallScore autopilot respects controlled-full and transcript cooldown", () => {
  const text = skillText["callscore-autopilot"];
  assert.match(text, /monitored transcript backlog/i);
  assert.match(text, /wait_for_laptop_collector_rate_limit_cooldown/);
  assert.match(text, /allowed=false/);
  assert.match(text, /never hammer transcript provider after HTTP 429/i);
  assert.match(text, /broad DB writes\/backfills\/recomputes/i);
});

test("Workplane status keeps dangerous production mutation fail-closed", () => {
  const text = skillText["workplane-status"];
  assert.match(text, /Report `CONTROLLED_FULL`/);
  assert.match(text, /monitored backlog/i);
  assert.match(text, /provider cooldown/i);
  assert.match(text, /production_mutation_allowed=false/);
  assert.match(text, /GTM registry/);
});

test("Whop automation requires full mutation gate pack", () => {
  const text = skillText["whop-automation"];
  for (const phrase of ["manifest", "diff", "rollback path", "approval receipt", "local auth", "explicit safe classification"]) {
    assert.match(text, new RegExp(phrase, "i"));
  }
  assert.match(text, /zero-dollar\/token-discount Pro renewal/i);
  assert.match(text, /No Whop mutation from dry-run or provider-health success alone/i);
});

test("humanizer and xurl invalidate approvals when payload or URL changes", () => {
  assert.match(skillText.humanizer, /new payload hash and invalidates prior approval/i);
  assert.match(skillText.humanizer, /Never convert evidence-safe copy into defamatory claims/i);
  assert.match(skillText.xurl, /if destination URL changes, invalidate approval/i);
  assert.match(skillText.xurl, /Do not post, reply, quote, DM, like, repost, follow, upload media, or delete without/i);
  assert.match(skillText.xurl, /unsafe redirects, non-canonical destinations, secret-bearing URLs/i);
});

test("stale Composio/Vercel/Neon references are superseded for CallScore", () => {
  const composioState = read("/srv/agents/hermes/skills/commerce/whop-automation/references/composio-integration-state.md");
  const whopReadme = read("/srv/whop-auto/plugin/agent_workflows/whop_auto/README.md");
  assert.match(composioState, /2026-06-15 CallScore supersession note/);
  assert.match(composioState, /Composio MCP is installed\/configured/i);
  assert.match(composioState, /Netlify is the CallScore production host/i);
  assert.match(composioState, /Local HH PostgreSQL plus HH Read API/i);
  assert.match(whopReadme, /CallScore canonical production note \(2026-06-15\)/);
  assert.match(whopReadme, /production hosting is Netlify/i);
});

test("canonical skill text contains no secret-like values", () => {
  const bearerHeader = ["Authorization", "Bearer"].join(":\\s*");
  const databaseUrl = ["postgres(?:ql)?", "\\/\\/"].join(":");
  const envAssignment = ["DATABASE_URL", "POSTGRES_URL", "WHOP_API_KEY"].map((name) => `${name}\\s*=`).join("|");
  const composioHeader = ["x-consumer-api-key", "[:=]\\s*[^\\s<]+"].join("\\s*");
  const checkoutTokenPrefix = ["ck", "sE", ""].join("_");
  const pattern = new RegExp([checkoutTokenPrefix, bearerHeader, databaseUrl, envAssignment, composioHeader].join("|"), "i");
  assert.doesNotMatch(allSkillText, pattern);
});
