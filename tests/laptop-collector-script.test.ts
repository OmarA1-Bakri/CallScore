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
  assert.match(script, /Get-DynamicPropertyValue/);
  assert.match(script, /PSObject\.Properties\[\$name\]/);
  assert.doesNotMatch(script, /\$failure = \$failures\.\$youtubeVideoId/);
  assert.match(script, /recent_failure_24h/);
  assert.match(script, /detail_preview/);
  assert.match(script, /--skip-download/);
  assert.match(script, /--no-playlist/);
  assert.match(script, /--write-auto-subs/);
  assert.doesNotMatch(script, /--download-archive\s+.*retry/i);
});

test("laptop collector classifies non-rate-limit transcript failures", () => {
  assert.match(script, /live_or_upcoming/);
  assert.match(script, /private_or_deleted/);
  assert.match(script, /transcript_too_short/);
  assert.match(script, /transient_network/);
  assert.match(script, /collector_tool_error/);
  assert.match(script, /Traceback/);
  assert.match(script, /Summarize-FailureDetail/);
  assert.match(script, /no automatic captions/);
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
  assert.match(script, /\[int\]\$HhPort = 22/);
  assert.match(script, /\[string\]\$HhIdentityFile = ""/);
  assert.match(script, /Get-HhSshArgs/);
  assert.match(script, /Get-HhScpArgs/);
  assert.match(script, /Get-HhScpFromArgs/);
  assert.match(script, /Copy-FileToHH/);
  assert.match(script, /Copy-FileFromHH/);
  assert.match(script, /Invoke-HhJsonCommand/);
  assert.match(script, /Invoke-HhIngestPayload/);
  assert.match(script, /Write-Utf8NoBomFile/);
  assert.match(script, /New-Item -ItemType Directory -Path \$dir -Force/);
  assert.match(script, /UTF8Encoding\(\$false\)/);
  assert.match(script, /BatchMode=yes/);
  assert.match(script, /StrictHostKeyChecking=accept-new/);
  assert.match(script, /-i", \$HhIdentityFile/);
  assert.match(script, /-p", \[string\]\$HhPort/);
  assert.match(script, /-P", \[string\]\$HhPort/);
  assert.match(script, /Acquire-CollectorLock/);
  assert.match(script, /workplane -- claim/);
  assert.match(script, /workplane -- complete/);
  assert.match(script, /\.tmp\/laptop-collector\/latest-state\.json/);
  assert.match(script, /npm run --silent transcript:worklist -- --limit \$Limit --since-days \$SinceDays/);
});

test("laptop collector keeps strict JSON command boundaries", () => {
  assert.match(script, /ConvertFrom-StrictJson/);
  assert.match(script, /non_json_output/);
  assert.match(script, /Write-Utf8NoBomFile \$StatePath/);
  assert.match(script, /Write-Utf8NoBomFile \$OutputJson/);
  assert.match(script, /npm run --silent workplane -- claim/);
  assert.match(script, /npm run --silent transcript:worklist/);
  assert.doesNotMatch(script, /workplane -- --status/);
  assert.doesNotMatch(script, /Set-Content -LiteralPath \$StatePath -Encoding UTF8/);
  assert.doesNotMatch(script, /Set-Content -LiteralPath \$OutputJson -Encoding UTF8/);
});

test("status-only publishes state and exits before claim or transcript worklist", () => {
  const statusOnlyIndex = script.indexOf("if ($StatusOnly)");
  const claimIndex = script.indexOf("\nClaim-WorkplaneJob\n");
  const worklistIndex = script.indexOf("$worklistRaw");
  assert.ok(statusOnlyIndex > 0, "missing StatusOnly branch");
  assert.ok(claimIndex > statusOnlyIndex, "StatusOnly must run before workplane claim");
  assert.ok(worklistIndex > statusOnlyIndex, "StatusOnly must run before transcript worklist");
  const statusOnlyBlock = script.slice(statusOnlyIndex, claimIndex);
  assert.match(statusOnlyBlock, /Publish-StateToHH \$state -PreserveRunMetrics/);
  assert.match(script, /last_statusonly_utc/);
  assert.match(script, /if \(\$PreserveRunMetrics\)/);
  assert.match(script, /PreserveLastRunUtc/);
  assert.match(script, /Write-State \$state -PreserveLastRunUtc:\$PreserveRunMetrics/);
  assert.match(statusOnlyBlock, /exit 0/);
  assert.doesNotMatch(statusOnlyBlock, /transcript:worklist/);
});


test("laptop collector resolves output JSON repo-relative for SSH execution", () => {
  assert.match(script, /function Get-RepoRoot/);
  assert.match(script, /function Resolve-RepoRelativePath/);
  assert.match(script, /\[System\.IO\.Path\]::IsPathRooted\(\$Path\)/);
  assert.match(script, /Join-Path \(Get-RepoRoot\) \$Path/);
  assert.match(script, /\$resolvedPath = Resolve-RepoRelativePath \$Path/);
  assert.match(script, /WriteAllText\(\$resolvedPath, \$Text, \$utf8NoBom\)/);
});
