import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const builder = "/opt/crypto-tuber-ranked/scripts/callscore-build-public-output-pack.py";
const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

test("public output pack dedupes text and images with source map", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-pack-src-"));
  const out = mkdtempSync(join(tmpdir(), "callscore-pack-out-"));
  writeFileSync(join(root, "a.txt"), "SOURCE: one\nSame text\n");
  writeFileSync(join(root, "b.txt"), "SOURCE: two\nSame text\n");
  writeFileSync(join(root, "a.png"), png1x1);
  writeFileSync(join(root, "b.png"), png1x1);
  writeFileSync(join(root, "draft.json"), JSON.stringify({ schema: "x", x: { exact_copy: "Same text" }, visual_asset: { path: join(root, "a.png") } }));
  const result = spawnSync("python3", [builder, "--input", root, "--out-dir", out], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.unique_text, 1);
  assert.equal(parsed.unique_images, 1);
  assert.equal(existsSync(join(out, "source-map.json")), true);
  const sourceMap = JSON.parse(readFileSync(join(out, "source-map.json"), "utf8"));
  assert.ok(sourceMap.length >= 5);
});
