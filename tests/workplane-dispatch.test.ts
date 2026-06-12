import test from "node:test";
import assert from "node:assert/strict";
import { routeWorkplaneCommand } from "../src/scripts/workplane";

test("workplane dispatcher routes status aliases to status JSON", () => {
  assert.deepEqual(routeWorkplaneCommand([]), { mode: "status", args: [] });
  assert.deepEqual(routeWorkplaneCommand(["--status", "--json", "--read-api-base", "https://example.test/api/read"]), { mode: "status", args: ["--read-api-base", "https://example.test/api/read"] });
  assert.deepEqual(routeWorkplaneCommand(["status", "--json"]), { mode: "status", args: [] });
});

test("workplane dispatcher routes laptop claim and complete commands", () => {
  assert.deepEqual(routeWorkplaneCommand(["claim", "--worker-id", "laptop-smoke"]), { mode: "laptop_job", args: ["claim", "--worker-id", "laptop-smoke"] });
  assert.deepEqual(routeWorkplaneCommand(["complete", "--job-id", "1", "--status", "succeeded"]), { mode: "laptop_job", args: ["complete", "--job-id", "1", "--status", "succeeded"] });
});

test("workplane dispatcher rejects unsupported commands with useful error", () => {
  assert.throws(() => routeWorkplaneCommand(["bogus"]), /unsupported_workplane_command:bogus/);
});
