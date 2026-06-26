import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("Netlify alert send cron enters operating graph instead of direct sender", () => {
  const route = read("src/app/api/cron/alerts/send/route.ts");
  assert.match(route, /runAlertsOperatingGraph/);
  assert.match(route, /source:\s*"send"/);
  assert.doesNotMatch(route, /runAlertSend/);
  assert.doesNotMatch(route, /@\/lib\/alert-jobs/);
});

test("Netlify alert scan cron enters operating graph instead of direct scanner", () => {
  const route = read("src/app/api/cron/alerts/scan/route.ts");
  assert.match(route, /runAlertsOperatingGraph/);
  assert.match(route, /source:\s*"scan"/);
  assert.doesNotMatch(route, /runAlertScan/);
  assert.doesNotMatch(route, /@\/lib\/alert-jobs/);
});

test("alert cron operating helper executes bounded fail-closed proof without mutations", async () => {
  const mod = await import("../src/lib/workplane/alert-cron-operating");
  const runAlertsOperatingGraph = mod.runAlertsOperatingGraph;
  assert.equal(typeof runAlertsOperatingGraph, "function");

  const result = await runAlertsOperatingGraph({ source: "send", maxItems: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.source, "send");
  assert.equal(result.graph_status, "blocked");
  assert.equal(result.graph_fail_closed, true);
  assert.equal(result.alert_loop_reached, false);
  assert.equal(result.direct_execution_performed, false);
  assert.equal(result.direct_scan_or_send_disabled, true);
  assert.equal(result.send_disabled_in_graph_plan, true);
  assert.match(result.latest_receipt_path ?? "", /op-alerts-collect_receipts-/);
  assert.equal(result.mutation_flags.external_mutation_performed, false);
  assert.equal(result.mutation_flags.send_or_outreach_performed, false);
  assert.equal(result.mutation_flags.provider_mutation_performed, false);
  assert.equal(result.mutation_flags.db_write_performed, false);
  assert.ok(result.blockers.includes("workplane_status_unavailable"));
  assert.ok(result.blockers.includes("heartbeat_missing"));
});

test("alert cron operating helper invokes the alerts graph out-of-process without direct send/scan", () => {
  const helper = read("src/lib/workplane/alert-cron-operating.ts");
  assert.doesNotMatch(helper, /callscore-operating-graph|createCallscoreOperatingGraph|buildInitialOperatingState/);
  assert.match(helper, /execFile/);
  assert.match(helper, /src\/scripts\/callscore-operating-goal\.ts/);
  assert.match(helper, /--goal",\s*"alerts"/);
  assert.match(helper, /--dry-run/);
  assert.match(helper, /direct_execution_performed:\s*false/);
  assert.match(helper, /send_disabled_in_graph_plan/);
  assert.doesNotMatch(helper, /runAlertSend|runAlertScan|sendEmail|claimPendingAlerts/);
});
