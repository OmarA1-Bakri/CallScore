import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/windows/run-transcript-collector.ps1", "utf8");

test("laptop collector defaults to small jittered batches with gated large runs", () => {
  assert.match(script, /\[int\]\$Limit = 5/);
  assert.match(script, /\[int\]\$MinGapSeconds = 45/);
  assert.match(script, /\[int\]\$MaxGapSeconds = 90/);
  assert.match(script, /\[switch\]\$AllowLargeBatch/);
  assert.match(script, /Limit >5 requires -AllowLargeBatch/);
  assert.match(script, /Get-Random -Minimum \$MinGapSeconds -Maximum \(\$MaxGapSeconds \+ 1\)/);
});

test("laptop collector detects 429 and bot verification, persists cooldown, and stops batch", () => {
  assert.match(script, /HTTP\\s\*\(Error\\s\*\)\?429/);
  assert.match(script, /Too\\s\*Many\\s\*Requests/);
  assert.match(script, /bot_verification_required/);
  assert.match(script, /Start-Cooldown \$state \$reason/);
  assert.match(script, /\$stopBatch = \$true/);
  assert.match(script, /if \(\$stopBatch\) \{ break \}/);
});

test("laptop collector avoids retry hammering and keeps transcript-only yt-dlp mode", () => {
  assert.match(script, /Should-SkipVideo/);
  assert.match(script, /recent_terminal_failure/);
  assert.match(script, /--skip-download/);
  assert.match(script, /--no-playlist/);
  assert.match(script, /--write-auto-subs/);
  assert.doesNotMatch(script, /--download-archive\s+.*retry/i);
});

test("laptop collector has impersonation dependency guardrails", () => {
  assert.match(script, /--list-impersonate-targets/);
  assert.match(script, /yt-dlp\[default,curl-cffi\]/);
  assert.match(script, /--impersonate/);
  assert.match(script, /impersonation_warning_threshold/);
});


test("laptop collector exposes workplane claim, lock, and HH state publication", () => {
  assert.match(script, /\[switch\]\$Workplane/);
  assert.match(script, /\[string\]\$JobId/);
  assert.match(script, /Acquire-CollectorLock/);
  assert.match(script, /workplane -- claim/);
  assert.match(script, /workplane -- complete/);
  assert.match(script, /\.tmp\/laptop-collector\/latest-state\.json/);
});

test("laptop collector keeps strict JSON command boundaries", () => {
  assert.match(script, /ConvertFrom-StrictJson/);
  assert.match(script, /non_json_output/);
  assert.match(script, /npm run --silent workplane -- claim/);
  assert.match(script, /npm run --silent transcript:worklist/);
  assert.doesNotMatch(script, /workplane -- --status/);
});

test("status-only publishes state and exits before claim or transcript worklist", () => {
  const statusOnlyIndex = script.indexOf("if ($StatusOnly)");
  const claimIndex = script.indexOf("\nClaim-WorkplaneJob\n");
  const worklistIndex = script.indexOf("$worklistCmd");
  assert.ok(statusOnlyIndex > 0, "missing StatusOnly branch");
  assert.ok(claimIndex > statusOnlyIndex, "StatusOnly must run before workplane claim");
  assert.ok(worklistIndex > statusOnlyIndex, "StatusOnly must run before transcript worklist");
  const statusOnlyBlock = script.slice(statusOnlyIndex, claimIndex);
  assert.match(statusOnlyBlock, /Publish-StateToHH \$state/);
  assert.match(statusOnlyBlock, /exit 0/);
  assert.doesNotMatch(statusOnlyBlock, /transcript:worklist/);
});
