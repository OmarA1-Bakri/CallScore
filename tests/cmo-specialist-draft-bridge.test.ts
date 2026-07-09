import * as assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const BRIDGE = "/srv/agents/hermes/scripts/callscore-cmo-specialist-draft-bridge.py";
const WRAPPER = "/srv/agents/hermes/scripts/callscore-genuine-social-packet.sh";

const scriptsExist = existsSync("/srv/agents/hermes/scripts");

test("CMO specialist draft bridge turns child-agent receipts into platform draft files", { skip: !scriptsExist }, () => {
  assert.equal(existsSync(BRIDGE), true, "specialist draft bridge must exist");
  const dir = mkdtempSync(join(tmpdir(), "callscore-cmo-bridge-"));
  const packet = join(dir, "genuine-social-packet.json");
  const fakeRunner = join(dir, "fake-child-runner.sh");
  writeFileSync(packet, JSON.stringify({
    ok: true,
    source: "test",
    facts: {
      raw_calls: 16356,
      public_calls_with_entry_price: 16078,
      ranked_creators: 93,
      top_10_leaderboard: [{ name: "Crypto Analyst", total_calls: 42, n: 12, avg_alpha_30d: 0.18, top_symbol: "BTC" }],
      evidence_summary: "16,078 price-backed calls across 93 ranked creators."
    },
    visual_asset: { required: true, png_b64_path: "/tmp/callscore-card.b64", sha256: "abc123", kind: "proof_card" }
  }, null, 2));
  writeFileSync(fakeRunner, `#!/usr/bin/env bash
set -euo pipefail
role="$1"; prompt="$2"; out="$3"
if grep -qi 'platform: x' "$prompt"; then
  text='Why do crypto creator receipts beat vibes? 16,078 price-backed calls across 93 ranked creators gives the market a scoreboard, not another opinion feed. call-score.com'
  schema='callscore.x.read_only_receipt.v1'
  platform='x'
else
  text='The thing about crypto creator accountability is that it only works when the record is public.\n\nCallScore is tracking 16,078 price-backed calls across 93 ranked creators, then turning that into a scoreboard people can inspect instead of another vibes thread.\n\nThat changes the conversation from who sounded confident to who left receipts.\n\ncall-score.com'
  schema='callscore.linkedin.read_only_receipt.v1'
  platform='linkedin'
fi
python3 - "$out" "$schema" "$platform" "$text" <<'PY'
import json, sys
out, schema, platform, text = sys.argv[1:]
obj = {
  "schema": schema,
  "status": "draft_ready",
  "mode": "read_only_verify",
  "final_decision": "draft_only_no_provider_mutation",
  "platform": platform,
  "draft": {"exact_copy": text},
  "public_publish_performed": False,
  "provider_mutation_performed": False,
  "external_mutation_performed": False,
}
open(out, 'w').write(json.dumps(obj, indent=2) + '\\n')
open(out + '.receipt.json', 'w').write(json.dumps({"schema":"callscore.child_agent_one_shot_receipt.v1","runner_status":"succeeded","canonical_json_valid":True,"output_file":out}, indent=2) + '\\n')
PY
`);
  chmodSync(fakeRunner, 0o755);

  const result = spawnSync("python3", [BRIDGE, packet, dir], {
    cwd: "/opt/crypto-tuber-ranked",
    env: { ...process.env, CALLSCORE_CHILD_AGENT_ONE_SHOT: fakeRunner, CALLSCORE_CMO_SPECIALIST_TIMEOUT_SECONDS: "15" },
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const xPath = join(dir, "cmo-x-draft.txt");
  const liPath = join(dir, "cmo-linkedin-draft.txt");
  assert.equal(existsSync(xPath), true, "X draft file should be written from child receipt");
  assert.equal(existsSync(liPath), true, "LinkedIn draft file should be written from child receipt");
  const x = readFileSync(xPath, "utf8").trim();
  assert.ok(x.length > 40 && x.length <= 280, `X draft must be non-empty and <=280 chars, got ${x.length}`);
  const receipt = JSON.parse(readFileSync(join(dir, "cmo-agent-draft-files.json"), "utf8"));
  assert.equal(receipt.status, "drafts_written");
  assert.equal(receipt.draft_files_written, true);
  assert.equal(receipt.public_copy_generated_by_child_specialists, true);
  assert.equal(receipt.public_publish_performed, false);
  assert.equal(receipt.provider_mutation_performed, false);
  assert.equal(receipt.external_mutation_performed, false);
});

test("CMO packet wrapper invokes specialist draft bridge before finalizer", { skip: !scriptsExist }, () => {
  assert.equal(existsSync(WRAPPER), true);
  const source = readFileSync(WRAPPER, "utf8");
  assert.match(source, /callscore-cmo-specialist-draft-bridge\.py/);
  assert.doesNotMatch(source, /TWITTER_CREATION_OF_A_POST|LINKEDIN_CREATE_LINKED_IN_POST|REDDIT_CREATE_REDDIT_POST|COMPOSIO_MULTI_EXECUTE_TOOL|run_composio_tool/);
  const bridgePos = source.indexOf("callscore-cmo-specialist-draft-bridge.py");
  const finalizerPos = source.indexOf("CALLSCORE_CMO_FINALIZER");
  assert.ok(bridgePos >= 0 && finalizerPos >= 0 && bridgePos < finalizerPos, "bridge must run before finalizer");
});
