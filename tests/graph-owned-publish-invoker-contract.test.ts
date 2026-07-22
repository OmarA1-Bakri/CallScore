import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const invokerPath = "/srv/agents/hermes/scripts/callscore-graph-owned-publish-invoker.sh";

test("graph-owned publish invoker carries the canonical package through the live graph boundary", { skip: !existsSync(invokerPath) }, () => {
  const source = readFileSync(invokerPath, "utf8");
  assert.match(source, /--canonical-package\)/);
  assert.match(source, /canonical_operational_package/);
  assert.match(source, /--canonical-operational-package-json/);
  assert.match(source, /canonical_operational_package_missing/);
});

test("graph-owned publish invoker hydrates png_path into the provider media gate", { skip: !existsSync(invokerPath) }, () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-publish-invoker-"));
  const bin = join(root, "bin");
  const receiptDir = join(root, ".tmp", "workflow-receipts", "artofwar_owned_public_execution");
  mkdirSync(bin, { recursive: true });
  mkdirSync(receiptDir, { recursive: true });

  const fakeNpm = join(bin, "npm");
  writeFileSync(fakeNpm, "#!/usr/bin/env bash\nprintf '%s\\n' '{\"status\":\"draft_ready\",\"blockers\":[],\"warnings\":[],\"mutation_flags\":{}}'\n");
  chmodSync(fakeNpm, 0o755);

  const mediaPath = join(root, "proof.png");
  writeFileSync(mediaPath, "png-test-fixture");
  const draftPath = join(root, "candidate.json");
  writeFileSync(draftPath, JSON.stringify({
    schema: "callscore.social_candidate.v2",
    content_type: "data_snapshot",
    x: {
      exact_copy: "I noticed fixed clocks make market calls comparable.",
      visual_required: true,
      growth_mechanics: { media_plan: "image" },
    },
    visual_asset: {
      required: true,
      png_path: mediaPath,
      mime: "image/png",
    },
  }));

  execFileSync("bash", [invokerPath, "--final-draft", draftPath, "--dry-run"], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      CALLSCORE_APP_DIR: root,
      CALLSCORE_EXECUTION_MODE: "read_only_verify",
    },
    stdio: "pipe",
  });

  const inputFile = readdirSync(receiptDir).find((name) => name.startsWith("graph-mutation-inputs-") && name.endsWith(".json"));
  assert.ok(inputFile, "expected graph mutation inputs receipt");
  const inputs = JSON.parse(readFileSync(join(receiptDir, inputFile), "utf8"));
  assert.equal(inputs.x_owned_publish_node.media_gate.local_path, mediaPath);
  assert.equal(inputs.x_owned_publish_node.media_gate.visual_asset_path, mediaPath);
});

function runLinkedInReceiptNormalizationFixture(graphOutput: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "callscore-publish-receipt-"));
  const bin = join(root, "bin");
  const receiptDir = join(root, "receipts");
  mkdirSync(bin, { recursive: true });
  mkdirSync(receiptDir, { recursive: true });

  const fakeNpm = join(bin, "npm");
  writeFileSync(fakeNpm, `#!/usr/bin/env bash\nprintf '%s\\n' '${JSON.stringify(graphOutput)}'\n`);
  chmodSync(fakeNpm, 0o755);

  const draftPath = join(root, "linkedin-candidate.json");
  writeFileSync(draftPath, JSON.stringify({
    schema: "callscore.social_candidate.v2",
    linkedin: { exact_copy: "Two clocks make research lineage explicit." },
  }));

  execFileSync("bash", [invokerPath, "--final-draft", draftPath, "--dry-run"], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      CALLSCORE_APP_DIR: root,
      CALLSCORE_RECEIPTS_DIR: receiptDir,
      CALLSCORE_EXECUTION_MODE: "read_only_verify",
    },
    stdio: "pipe",
  });

  const inputFile = readdirSync(receiptDir).find((name) => name.startsWith("graph-mutation-inputs-") && name.endsWith(".json"));
  const receiptFile = readdirSync(receiptDir).find((name) => name.endsWith("-publish-receipt.json"));
  assert.ok(inputFile, "expected graph mutation inputs receipt");
  assert.ok(receiptFile, "expected normalized publish receipt");
  return {
    inputs: JSON.parse(readFileSync(join(receiptDir, inputFile), "utf8")),
    receipt: JSON.parse(readFileSync(join(receiptDir, receiptFile), "utf8")),
  };
}

test("graph-owned publish invoker prefers the actual LinkedIn mutation receipt over an earlier media staging URL", { skip: !existsSync(invokerPath) }, () => {
  const graphReceiptPath = join(process.cwd(), "tests", "fixtures", "graph-owned-linkedin-receipt-with-staging-url-before-share.json");
  const { inputs, receipt } = runLinkedInReceiptNormalizationFixture({
    status: "ok",
    blockers: [],
    warnings: [],
    mutation_flags: {
      external_mutation_performed: true,
      provider_mutation_performed: true,
      public_publish_performed: true,
    },
    latest_receipt_path: graphReceiptPath,
  });

  const predictedId = inputs.linkedin_owned_publish_node.provider_execution_receipt_id;
  assert.notEqual(predictedId, "provider-exec-4867263124ac78b8");
  assert.equal(receipt.provider_results[0].provider_execution_receipt_id, "provider-exec-4867263124ac78b8");
  assert.equal(receipt.provider_results[0].external_object_id, "urn:li:share:7484283939977728000");
  assert.equal(receipt.provider_results[0].external_url, null);
  assert.equal(receipt.provider_execution_receipt_id, "provider-exec-4867263124ac78b8");
  assert.equal(receipt.external_object_id, "urn:li:share:7484283939977728000");
  assert.equal(receipt.external_url, null);
});

test("graph-owned publish invoker keeps the predicted provider execution ID when the graph returns no receipt", { skip: !existsSync(invokerPath) }, () => {
  const { inputs, receipt } = runLinkedInReceiptNormalizationFixture({
    status: "draft_ready",
    blockers: [],
    warnings: [],
    mutation_flags: {},
  });

  const predictedId = inputs.linkedin_owned_publish_node.provider_execution_receipt_id;
  assert.match(predictedId, /^provider-exec-[a-f0-9]{16}$/);
  assert.equal(receipt.provider_results[0].provider_execution_receipt_id, predictedId);
  assert.equal(receipt.provider_results[0].external_object_id, null);
  assert.equal(receipt.provider_results[0].external_url, null);
});
