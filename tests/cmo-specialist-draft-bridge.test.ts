import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const WRAPPER = "/srv/agents/hermes/scripts/callscore-genuine-social-packet.sh";

const scriptsExist = existsSync("/srv/agents/hermes/scripts");

test("CMO packet wrapper does not author platform copy through non-graph specialist bridge", { skip: !scriptsExist }, () => {
  assert.equal(existsSync(WRAPPER), true);
  const source = readFileSync(WRAPPER, "utf8");
  assert.doesNotMatch(source, /callscore-cmo-specialist-draft-bridge\.py/);
  assert.doesNotMatch(source, /CALLSCORE_CMO_SPECIALIST_DRAFT_BRIDGE/);
  assert.doesNotMatch(source, /drafts_written_by_child_specialists/);
  assert.doesNotMatch(source, /TWITTER_CREATION_OF_A_POST|LINKEDIN_CREATE_LINKED_IN_POST|REDDIT_CREATE_REDDIT_POST|COMPOSIO_MULTI_EXECUTE_TOOL|run_composio_tool/);
  assert.match(source, /npm run operating:goal/);
  assert.match(source, /blocked_missing_agent_platform_drafts/);
});
