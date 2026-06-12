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
