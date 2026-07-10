import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const invokerPath = "/srv/agents/hermes/scripts/callscore-graph-owned-publish-invoker.sh";

test("graph-owned publish invoker carries the canonical package through the live graph boundary", () => {
  const source = readFileSync(invokerPath, "utf8");
  assert.match(source, /--canonical-package\)/);
  assert.match(source, /canonical_operational_package/);
  assert.match(source, /--canonical-operational-package-json/);
  assert.match(source, /canonical_operational_package_missing/);
});
