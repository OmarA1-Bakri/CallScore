import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validCanonicalOperationalPackage } from "./helpers/canonical-operational-package-fixture";

const repoRoot = process.cwd();
const evaluator = join(repoRoot, "src/scripts/callscore-evaluate-canonical-package.ts");
const builder = "/srv/agents/hermes/scripts/callscore-build-canonical-social-package.py";
const payload = { exact_copy: "Receipt-backed canonical package CLI test." };

type PackageDocument = ReturnType<typeof validCanonicalOperationalPackage>;

function evaluate(
  packageDocument: unknown,
  expectedChannel = "x",
  expectedPayloadHash = validCanonicalOperationalPackage("x", payload).approved_payload_hash,
  evaluationNow = (packageDocument as { created_at?: string })?.created_at ?? "2026-07-28T16:00:40.000Z",
) {
  const directory = mkdtempSync(join(tmpdir(), "callscore-canonical-evaluator-"));
  const packagePath = join(directory, "package.json");
  writeFileSync(packagePath, `${JSON.stringify(packageDocument)}\n`);
  const result = spawnSync("node", [
    "--import", "tsx", evaluator,
    "--package", packagePath,
    "--expected-channel", expectedChannel,
    "--expected-payload-hash", expectedPayloadHash,
    "--evaluation-now", evaluationNow,
  ], { cwd: repoRoot, encoding: "utf8" });
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 1, `expected exactly one JSON evaluation; stderr=${result.stderr}`);
  return { result, evaluation: JSON.parse(lines[0]) as { status?: string; blockers?: string[] } };
}

function freshPackage(): PackageDocument {
  return validCanonicalOperationalPackage("x", payload);
}

test("Hermes canonical social builder invokes the repository evaluator CLI bound to the runtime evaluator", () => {
  const builderSource = readFileSync(builder, "utf8");
  assert.match(builderSource, /callscore-evaluate-canonical-package\.ts/);
  assert.match(builderSource, /"--package"/);
  assert.match(builderSource, /"--expected-channel"/);
  assert.match(builderSource, /"--expected-payload-hash"/);
  assert.match(builderSource, /"--evaluation-now"/);

  const evaluatorSource = readFileSync(evaluator, "utf8");
  assert.match(evaluatorSource, /evaluateCanonicalOperationalPackage/);
  const approvedPackage = freshPackage();
  const approved = evaluate(approvedPackage, "x", approvedPackage.approved_payload_hash);
  assert.equal(approved.result.status, 0, approved.result.stderr);
  assert.equal(approved.evaluation.status, "approved");
  assert.deepEqual(approved.evaluation.blockers, []);
});

test("canonical package evaluator CLI fails closed on binding and receipt/media evidence defects", () => {
  const cases: Array<{ name: string; packageDocument: unknown; expectedChannel?: string; expectedPayloadHash?: string; evaluationNow?: string; blocker: string }> = [];

  const channelMismatch = freshPackage();
  cases.push({ name: "mismatched channel", packageDocument: channelMismatch, expectedChannel: "linkedin", blocker: "canonical_package_channel_mismatch" });

  const payloadMismatch = freshPackage();
  cases.push({ name: "mismatched payload", packageDocument: payloadMismatch, expectedPayloadHash: `sha256:${"f".repeat(64)}`, blocker: "canonical_package_payload_hash_mismatch" });

  const stale = freshPackage();
  const staleEvaluationNow = stale.created_at;
  stale.created_at = "2026-07-20T00:00:00.000Z";
  cases.push({ name: "stale package", packageDocument: stale, evaluationNow: staleEvaluationNow, blocker: "canonical_package_stale" });

  const malformed = freshPackage() as PackageDocument & { receipts: Array<Record<string, unknown>> };
  malformed.receipts[0] = { ...malformed.receipts[0], evidence_hash: "malformed" };
  cases.push({ name: "malformed receipt", packageDocument: malformed, blocker: "canonical_operational_package_evaluation_failed" });

  const wrongOwner = freshPackage();
  wrongOwner.receipts = wrongOwner.receipts.map((receipt) => receipt.schema === "platform_fit_receipt.v1"
    ? { ...receipt, agent_id: "callscore-cmo-head" }
    : receipt);
  cases.push({ name: "wrong receipt owner", packageDocument: wrongOwner, blocker: "receipt_wrong_owner_platform_fit_receipt.v1" });

  const missingReceipt = freshPackage();
  missingReceipt.receipts = missingReceipt.receipts.filter((receipt) => receipt.schema !== "visual_qa_receipt.v1");
  cases.push({ name: "missing receipt", packageDocument: missingReceipt, blocker: "missing_visual_qa_receipt.v1" });

  const missingMedia = freshPackage();
  delete (missingMedia as unknown as Record<string, unknown>).media_artifact;
  cases.push({ name: "missing media evidence", packageDocument: missingMedia, blocker: "missing_canonical_media_artifact" });

  for (const scenario of cases) {
    const packageDocument = scenario.packageDocument as { approved_payload_hash: string };
    const outcome = evaluate(
      scenario.packageDocument,
      scenario.expectedChannel ?? "x",
      scenario.expectedPayloadHash ?? packageDocument.approved_payload_hash,
      scenario.evaluationNow,
    );
    assert.notEqual(outcome.result.status, 0, `${scenario.name} must fail closed`);
    assert.equal(outcome.evaluation.status, "blocked", scenario.name);
    assert.ok(outcome.evaluation.blockers?.includes(scenario.blocker), `${scenario.name}: ${JSON.stringify(outcome.evaluation)}`);
  }
});
