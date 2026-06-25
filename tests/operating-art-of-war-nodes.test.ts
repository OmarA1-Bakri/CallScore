import * as assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "node:test";

import { buildInitialOperatingState } from "../src/lib/workplane/callscore-operating-graph";
import { readArtOfWarCampaignContext } from "../src/lib/workplane/node-wrappers/art-of-war-nodes";
import { cmoRevenueGoalLoopNode } from "../src/lib/workplane/node-wrappers/cmo-revenue-nodes";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function createArtOfWarRuntime(input: { killSwitchEngaged?: boolean; preflightOk?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "callscore-artofwar-runtime-"));
  const live = join(root, "live");
  const dashboard = join(live, "dashboard");
  mkdirSync(dashboard, { recursive: true });
  writeFileSync(join(root, ".keep"), "runtime root for tests\n");
  writeFileSync(join(live, ".keep"), "live runtime dir\n", { flag: "w" });
  writeFileSync(join(dashboard, ".keep"), "dashboard runtime dir\n", { flag: "w" });

  writeJson(join(live, "kill-switch.json"), {
    schema_version: "callscore_artofwar_kill_switch.v1",
    global_engaged: input.killSwitchEngaged ?? false,
    channels: {},
  });
  writeJson(join(live, "phase-10a-preflight.json"), {
    schema_version: "callscore_artofwar_phase10a_preflight.v1",
    ok: input.preflightOk ?? true,
    failures: input.preflightOk === false ? ["netlify_credentials_missing"] : [],
  });
  writeJson(join(live, "channel-activation-registry.json"), {
    schema_version: "callscore_artofwar_channel_activation_registry.v1",
    blocked_channels: ["email_send"],
    channels: {
      netlify_draft_report_deploy: { active: true, status: "active_bounded_autonomy" },
      social_posting: { active: false, status: "dry_run_ready" },
    },
  });
  writeJson(join(live, "final-autonomy-status.json"), {
    schema_version: "callscore_artofwar_final_autonomy_status.v1",
    mode: "FULL_AUTONOMOUS_BOUNDED_OWNED_GTM",
    overall_status: "controlled_full_with_bounded_owned_gtm_ready",
  });
  writeJson(join(dashboard, "system-dashboard.json"), {
    schema_version: "callscore_artofwar_dashboard.v1",
    generated_at: "2026-06-25T12:58:39Z",
    status: { overall_status: "controlled_full_with_bounded_owned_gtm_ready" },
  });
  return root;
}

describe("Art of War operating context", () => {
  test("reads safe campaign context from an external Art of War runtime path", () => {
    const root = createArtOfWarRuntime();
    const context = readArtOfWarCampaignContext({ runtimeRoot: root });

    assert.equal(context.available, true);
    assert.equal(context.context?.runtime_root, root);
    assert.equal(context.context?.kill_switch_engaged, false);
    assert.equal(context.context?.preflight_ok, true);
    assert.deepEqual(context.blockers, []);
    assert.equal(context.context?.overall_status, "controlled_full_with_bounded_owned_gtm_ready");
    assert.deepEqual(context.context?.active_channels, ["netlify_draft_report_deploy"]);
    assert.deepEqual(context.context?.blocked_channels, ["email_send"]);
  });

  test("returns precise blocker when Art of War runtime path is missing", async () => {
    const missingRoot = join(tmpdir(), `missing-artofwar-${Date.now()}`);
    const patch = await cmoRevenueGoalLoopNode(
      buildInitialOperatingState({ goal: "revenue_now", campaignId: "missing-artofwar", testFixtures: true }),
      { configurable: { artOfWarRuntimeRoot: missingRoot, thread_id: "missing-artofwar-test" } },
    );
    const result = patch.node_results?.at(-1);

    assert.equal(result?.status, "blocked");
    assert.equal(result?.blockers.includes("art_of_war_runtime_not_available"), true);
    assert.equal(result?.detail.art_of_war_context_available, false);
  });

  test("revenue lane blocks when Art of War kill switch is engaged", async () => {
    const root = createArtOfWarRuntime({ killSwitchEngaged: true });
    const patch = await cmoRevenueGoalLoopNode(
      buildInitialOperatingState({ goal: "revenue_now", campaignId: "kill-switch-artofwar", testFixtures: true }),
      { configurable: { artOfWarRuntimeRoot: root, thread_id: "kill-switch-artofwar-test" } },
    );
    const result = patch.node_results?.at(-1);

    assert.equal(result?.status, "blocked");
    assert.equal(result?.blockers.includes("art_of_war_kill_switch_engaged"), true);
    assert.equal(result?.mutation_flags.external_mutation_performed, false);
  });

  test("revenue review packet includes Art of War context without copying runtime state into app repo", async () => {
    const root = createArtOfWarRuntime();
    const patch = await cmoRevenueGoalLoopNode(
      buildInitialOperatingState({ goal: "revenue_now", campaignId: "healthy-artofwar", testFixtures: true }),
      { configurable: { artOfWarRuntimeRoot: root, thread_id: "healthy-artofwar-test" } },
    );
    const result = patch.node_results?.at(-1);

    assert.equal(result?.status, "ok");
    assert.equal(result?.detail.art_of_war_context_available, true);
    assert.equal(result?.detail.art_of_war_kill_switch_engaged, false);
    assert.ok(result?.artifact_path);

    const packet = JSON.parse(readFileSync(result!.artifact_path!, "utf8")) as {
      art_of_war_context: { runtime_root: string; kill_switch_engaged: boolean; preflight_ok: boolean };
      art_of_war_blockers: string[];
    };
    assert.equal(packet.art_of_war_context.runtime_root, root);
    assert.equal(packet.art_of_war_context.kill_switch_engaged, false);
    assert.equal(packet.art_of_war_context.preflight_ok, true);
    assert.deepEqual(packet.art_of_war_blockers, []);
  });
});
