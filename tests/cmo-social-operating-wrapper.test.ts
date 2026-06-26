import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const WRAPPER = "/srv/agents/hermes/scripts/callscore-genuine-social-packet.sh";
const IMPL = "/srv/agents/hermes/scripts/callscore-genuine-social-packet-impl.sh";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("genuine social packet cron script is a revenue_now draft-only operating wrapper", () => {
  assert.equal(existsSync(WRAPPER), true);
  assert.equal(existsSync(IMPL), true, "current data/visual implementation should be preserved as rollback impl");
  const wrapper = read(WRAPPER);
  assert.match(wrapper, /callscore-genuine-social-packet-impl\.sh/);
  assert.match(wrapper, /npm run operating:goal --/);
  assert.match(wrapper, /--goal\s+revenue_now/);
  assert.match(wrapper, /--draft-only/);
  assert.match(wrapper, /--social-packet-json/);
  assert.match(wrapper, /npm run workplane:status -- --json/);
  assert.match(wrapper, /npm run agents:heartbeat -- --dry-run/);
  assert.match(wrapper, /--workplane-status-json/);
  assert.match(wrapper, /--heartbeat-json/);
  assert.match(wrapper, /callscore\.genuine_social_operating_packet\.v1/);
});

test("genuine social packet implementation remains data and visual only", () => {
  const impl = read(IMPL);
  assert.match(impl, /DATA \+ VISUAL ONLY/);
  assert.match(impl, /ZERO COPY IN PACKET/);
  assert.doesNotMatch(impl, /TWITTER_CREATION_OF_A_POST|LINKEDIN_CREATE_LINKED_IN_POST|REDDIT_CREATE_REDDIT_POST/);
});
