param(
  [int]$Limit = 5,
  [ValidateSet("firefox", "chrome", "chromium", "edge")][string]$Browser = "firefox",
  [int]$MinGapSeconds = 45,
  [int]$MaxGapSeconds = 90,
  [int]$GapSeconds = 0,
  [int]$SinceDays = 45,
  [string]$HhHost = "hermes-agent-box",
  [string]$HhRepo = "/opt/crypto-tuber-ranked",
  [string]$StatePath = "",
  [int]$CooldownMinHours = 12,
  [int]$CooldownMaxHours = 24,
  [int]$WarningThreshold = 3,
  [string]$Impersonate = "chrome",
  [switch]$AllowLargeBatch,
  [switch]$NoImpersonate,
  [switch]$DryRun,
  [switch]$Write
)

$ErrorActionPreference = "Stop"
if ($Limit -lt 1 -or $Limit -gt 25) { throw "Limit must be 1..25" }
if ($Limit -gt 5 -and -not $AllowLargeBatch) { throw "Limit >5 requires -AllowLargeBatch; 25-video batches are gated until clean stability is proven" }
if ($Write -and $DryRun) { throw "Use either -Write or -DryRun" }
if ($GapSeconds -gt 0) { $MinGapSeconds = $GapSeconds; $MaxGapSeconds = $GapSeconds }
if ($MinGapSeconds -lt 1 -or $MaxGapSeconds -lt $MinGapSeconds) { throw "Gap bounds must satisfy 1 <= MinGapSeconds <= MaxGapSeconds" }
if ($CooldownMinHours -lt 1 -or $CooldownMaxHours -lt $CooldownMinHours) { throw "Cooldown bounds must satisfy 1 <= CooldownMinHours <= CooldownMaxHours" }

function Get-DefaultStatePath {
  if ($StatePath) { return $StatePath }
  $root = $env:LOCALAPPDATA
  if (-not $root) { $root = $env:TEMP }
  return (Join-Path $root "CallScore\transcript-collector-state.json")
}

$StatePath = Get-DefaultStatePath
$stateDir = Split-Path -Parent $StatePath
if ($stateDir) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) {
    return [pscustomobject]@{ cooldown_until_utc = $null; video_failures = @{}; last_run_utc = $null }
  }
  try { return (Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json) }
  catch { return [pscustomobject]@{ cooldown_until_utc = $null; video_failures = @{}; last_run_utc = $null } }
}

function Write-State($state) {
  $state.last_run_utc = [DateTimeOffset]::UtcNow.ToString("o")
  $state | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Get-VideoFailures($state) {
  if ($null -eq $state.video_failures) {
    $state | Add-Member -Force -NotePropertyName video_failures -NotePropertyValue ([pscustomobject]@{})
  }
  return $state.video_failures
}

function Set-VideoFailure($state, [string]$youtubeVideoId, [string]$reason) {
  $failures = Get-VideoFailures $state
  $entry = [pscustomobject]@{ reason = $reason; failed_at_utc = [DateTimeOffset]::UtcNow.ToString("o") }
  $failures | Add-Member -Force -NotePropertyName $youtubeVideoId -NotePropertyValue $entry
}

function Should-SkipVideo($state, [string]$youtubeVideoId) {
  $failures = Get-VideoFailures $state
  $failure = $failures.$youtubeVideoId
  if ($null -eq $failure) { return $false }
  if ($failure.reason -notin @("rate_limited", "bot_verification_required", "impersonation_warning_threshold")) { return $false }
  try {
    $failedAt = [DateTimeOffset]::Parse($failure.failed_at_utc)
    return $failedAt.UtcDateTime -gt [DateTimeOffset]::UtcNow.AddHours(-24).UtcDateTime
  } catch { return $true }
}

function Start-Cooldown($state, [string]$reason) {
  $hours = Get-Random -Minimum $CooldownMinHours -Maximum ($CooldownMaxHours + 1)
  $state.cooldown_until_utc = [DateTimeOffset]::UtcNow.AddHours($hours).ToString("o")
  $state.cooldown_reason = $reason
  Write-State $state
  Write-Host "collector_cooldown=true reason=$reason hours=$hours until=$($state.cooldown_until_utc)"
}

function Classify-Failure([string]$text) {
  if ($text -match "(?i)(HTTP\s*(Error\s*)?429|429\s*Too\s*Many\s*Requests|Too\s*Many\s*Requests)") { return "rate_limited" }
  if ($text -match "(?i)(bot_verification_required|not a bot|Sign in to confirm|confirm\s+you.?re\s+not\s+a\s+bot)") { return "bot_verification_required" }
  if ($text -match "(?i)(impersonation.*not available|no impersonate target|curl_cffi|requested but no impersonation target)") { return "impersonation_unavailable" }
  if ($text -match "(?i)no_captions") { return "no_captions" }
  return "transcript_failed"
}

function Test-ImpersonationSupport([string]$target) {
  if ($NoImpersonate -or -not $target) { return $false }
  try {
    $targets = (& yt-dlp --list-impersonate-targets 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { return $false }
    return $targets -match [regex]::Escape($target)
  } catch { return $false }
}

function Send-Failure($item, [string]$reason, [string]$detail) {
  $payload = [pscustomobject]@{
    video_id = [int]$item.id
    youtube_video_id = [string]$item.youtube_video_id
    status = "failed"
    error = $reason
    detail = ($detail -replace "\r?\n", " ").Substring(0, [Math]::Min(500, ($detail -replace "\r?\n", " ").Length))
    provider = "laptop_collector_$Browser"
  } | ConvertTo-Json -Depth 5 -Compress
  if ($Write) {
    $payload | ssh $HhHost "cd $HhRepo && set -a && source .env.hermes && set +a && npm run transcript:ingest -- --input - --write"
  } else {
    Write-Host "would_mark_failed video_id=$($item.id) reason=$reason"
  }
}

$state = Read-State
if ($state.cooldown_until_utc) {
  try {
    $until = [DateTimeOffset]::Parse($state.cooldown_until_utc)
    if ($until.UtcDateTime -gt [DateTimeOffset]::UtcNow.UtcDateTime) {
      Write-Host "collector_skip=true reason=cooldown until=$($state.cooldown_until_utc) state=$StatePath"
      exit 0
    }
  } catch { }
}

$impersonationArgs = @()
if (Test-ImpersonationSupport $Impersonate) {
  $impersonationArgs = @("--impersonate", $Impersonate)
  Write-Host "collector_impersonation=enabled target=$Impersonate"
} elseif (-not $NoImpersonate) {
  Write-Host "collector_impersonation=unavailable target=$Impersonate action='python -m pip install -U ""yt-dlp[default,curl-cffi]""'"
}

$worklistCmd = "cd $HhRepo && set -a && source .env.hermes && set +a && npm run transcript:worklist -- --limit $Limit --since-days $SinceDays"
$worklistRaw = ssh $HhHost $worklistCmd
$worklist = ($worklistRaw | Out-String | ConvertFrom-Json)
$items = @($worklist.items)
Write-Host "collector_worklist=$($items.Count) browser=$Browser mode=$(if ($Write) { 'WRITE' } else { 'DRY' }) limit=$Limit gap=${MinGapSeconds}-${MaxGapSeconds}s state=$StatePath"

foreach ($item in $items) {
  if (Should-SkipVideo $state ([string]$item.youtube_video_id)) {
    Write-Host "collector_skip_video=true youtube_video_id=$($item.youtube_video_id) reason=recent_terminal_failure"
    continue
  }

  $runDir = Join-Path $env:TEMP ("callscore-transcript-" + $item.youtube_video_id + "-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
  New-Item -ItemType Directory -Path $runDir | Out-Null
  $stopBatch = $false
  try {
    $out = Join-Path $runDir "%(id)s.%(ext)s"
    $ytArgs = @(
      "--cookies-from-browser", $Browser,
      "--skip-download",
      "--no-playlist",
      "--write-auto-subs",
      "--write-subs",
      "--sub-langs", "en.*",
      "--sub-format", "vtt",
      "-o", $out,
      $item.youtube_url
    )
    if ($impersonationArgs.Count -gt 0) { $ytArgs = $impersonationArgs + $ytArgs }
    $ytOutput = (& yt-dlp @ytArgs 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw $ytOutput }
    $warningCount = ([regex]::Matches($ytOutput, "(?im)^\s*WARNING:")).Count
    if ($warningCount -ge $WarningThreshold -or $ytOutput -match "(?i)impersonation.*(not available|requested)") {
      throw "impersonation_warning_threshold: $ytOutput"
    }
    $caption = Get-ChildItem $runDir -Filter "*.vtt" | Select-Object -First 1
    if (-not $caption) { throw "no_captions" }
    $text = Get-Content $caption.FullName -Raw
    $text = $text -replace "WEBVTT.*?(\r?\n){2}", " " -replace "\d\d:\d\d:\d\d\.\d+ --> .*", " " -replace "<[^>]+>", " " -replace "\s+", " "
    if ($text.Trim().Length -lt 50) { throw "transcript_too_short" }
    $payload = [pscustomobject]@{
      video_id = [int]$item.id
      youtube_video_id = [string]$item.youtube_video_id
      status = "available"
      transcript = $text.Trim()
      provider = "laptop_collector_$Browser"
      source = "yt-dlp_captions"
    } | ConvertTo-Json -Depth 5 -Compress
    if ($Write) {
      $payload | ssh $HhHost "cd $HhRepo && set -a && source .env.hermes && set +a && npm run transcript:ingest -- --input - --write"
    } else {
      Write-Host "would_ingest video_id=$($item.id) youtube_video_id=$($item.youtube_video_id) chars=$($text.Trim().Length)"
    }
  } catch {
    $detail = $_.Exception.Message
    $reason = Classify-Failure $detail
    Set-VideoFailure $state ([string]$item.youtube_video_id) $reason
    Write-State $state
    Send-Failure $item $reason $detail
    if ($reason -in @("rate_limited", "bot_verification_required", "impersonation_warning_threshold")) {
      Start-Cooldown $state $reason
      $stopBatch = $true
    }
  } finally {
    Remove-Item -LiteralPath $runDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  if ($stopBatch) { break }
  $sleepSeconds = Get-Random -Minimum $MinGapSeconds -Maximum ($MaxGapSeconds + 1)
  Write-Host "collector_sleep_seconds=$sleepSeconds"
  Start-Sleep -Seconds $sleepSeconds
}

Write-State $state
