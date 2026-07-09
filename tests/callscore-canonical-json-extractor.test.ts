import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const extractor = join(repoRoot, "scripts/callscore-extract-canonical-json.py");

function runExtract(rawText: string, expectedSchema = "callscore.workflow_canonical_output.v1") {
  const dir = mkdtempSync(join(tmpdir(), "callscore-extract-"));
  const raw = join(dir, "run.raw.txt");
  const canonical = join(dir, "run.canonical.json");
  writeFileSync(raw, rawText);
  const args = [extractor, raw, canonical];
  if (expectedSchema) args.push(expectedSchema);
  const result = spawnSync("python3", args, { encoding: "utf8" });
  return { dir, raw, canonical, result, meta: JSON.parse(result.stdout || "{}") };
}

test("canonical extractor handles transcript before nested final JSON", () => {
  const nested = {
    schema: "callscore.workflow_canonical_output.v1",
    status: "draft_ready",
    normalized_status: "draft_ready",
    child_subagent_evidence: { used: true, observed: true },
    mutation_audit: { public_or_provider_mutation_performed: false },
  };
  const { result, canonical, meta } = runExtract(`reasoning\n${JSON.stringify(nested)}\ntrailing text\n`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(meta.canonical_json_valid, true);
  const parsed = JSON.parse(readFileSync(canonical, "utf8"));
  assert.deepEqual(parsed.child_subagent_evidence, { used: true, observed: true });
  assert.deepEqual(parsed.mutation_audit, { public_or_provider_mutation_performed: false });
});

test("canonical extractor chooses outer top-level when nested child also has schema/status without expected schema", () => {
  const top = {
    schema: "callscore.workflow_canonical_output.v1",
    status: "blocked",
    child_subagent_evidence: { schema: "callscore.child.v1", status: "pass" },
  };
  const { result, canonical } = runExtract(JSON.stringify(top), "");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(readFileSync(canonical, "utf8"));
  assert.equal(parsed.schema, "callscore.workflow_canonical_output.v1");
  assert.equal(parsed.child_subagent_evidence.schema, "callscore.child.v1");
});

test("canonical extractor chooses outer top-level with expected schema and nested child", () => {
  const top = {
    schema: "callscore.workflow_canonical_output.v1",
    status: "blocked",
    child_subagent_evidence: { schema: "callscore.child.v1", status: "pass" },
  };
  const { result, canonical } = runExtract(JSON.stringify(top));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(readFileSync(canonical, "utf8")).schema, "callscore.workflow_canonical_output.v1");
});

test("canonical extractor chooses last top-level canonical object among multiple candidates", () => {
  const first = { schema: "callscore.workflow_canonical_output.v1", status: "old" };
  const final = { schema: "callscore.workflow_canonical_output.v1", status: "ready", workflow_status: "ready" };
  const { result, canonical, meta } = runExtract(`${JSON.stringify(first)}\nnoise\n${JSON.stringify(final)}\n`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(meta.candidate_count, 2);
  assert.equal(JSON.parse(readFileSync(canonical, "utf8")).status, "ready");
});

test("canonical extractor ignores nested partial object after canonical output", () => {
  const final = { schema: "callscore.workflow_canonical_output.v1", status: "needs_review", normalized_status: "needs_review" };
  const { result, canonical } = runExtract(`${JSON.stringify(final)}\nfragment {"public_or_provider_mutation_performed":false}\n`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(readFileSync(canonical, "utf8")).schema, "callscore.workflow_canonical_output.v1");
});

test("canonical extractor accepts CallScore read-only domain receipts as runner outputs", () => {
  const receipt = {
    schema: "callscore.linkedin.read_only_receipt.v1",
    agent: "callscore-linkedin-agent",
    mode: "READ_ONLY_NO_PUBLISH_NO_PROVIDER_MUTATION",
    final_decision: { publication_readiness: "NOT_READY_TO_PUBLISH" },
    draft: { exact_copy: "Why do scored calls matter?" },
  };
  const { result, canonical, meta } = runExtract(JSON.stringify(receipt));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(meta.canonical_json_valid, true);
  const parsed = JSON.parse(readFileSync(canonical, "utf8"));
  assert.equal(parsed.schema, "callscore.linkedin.read_only_receipt.v1");
  assert.equal(parsed.workflow_status, "read_only_receipt");
});

test("canonical extractor accepts live X read-only review/status receipts", () => {
  const receipt = {
    schema: "callscore.x.read_only_review_receipt.v1",
    agent: "callscore-x-agent",
    mode: "READ_ONLY",
    provider_mutation_performed: false,
    public_publish_performed: false,
    recommended_x_asset: {
      draft_text_not_posted: "BTC is back near $63K, but creator calls still need receipts.",
    },
  };
  const { result, canonical, meta } = runExtract(JSON.stringify(receipt));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(meta.canonical_json_valid, true);
  const parsed = JSON.parse(readFileSync(canonical, "utf8"));
  assert.equal(parsed.schema, "callscore.x.read_only_review_receipt.v1");
  assert.equal(parsed.status, "read_only_receipt");
  assert.equal(parsed.workflow_status, "read_only_receipt");
});

test("canonical extractor removes stale out file on failed extraction", () => {
  const dir = mkdtempSync(join(tmpdir(), "callscore-extract-stale-"));
  const raw = join(dir, "run.raw.txt");
  const canonical = join(dir, "run.canonical.json");
  writeFileSync(raw, `raw text only {"public_or_provider_mutation_performed":false}`);
  writeFileSync(canonical, `{"schema":"old","status":"ready"}`);
  const result = spawnSync("python3", [extractor, raw, canonical, "callscore.workflow_canonical_output.v1"], { encoding: "utf8" });
  const meta = JSON.parse(result.stdout || "{}");
  assert.notEqual(result.status, 0);
  assert.equal(meta.canonical_json_found, false);
  assert.equal(existsSync(canonical), false);
});
