param(
  [int]$Limit = 5,
  [ValidateSet("firefox", "chrome", "chromium", "edge")][string]$Browser = "firefox",
  [int]$MinGapSeconds = 45,
  [int]$MaxGapSeconds = 90,
  [int]$GapSeconds = 0,
  [int]$SinceDays = 45,
  [string]$HhHost = "hermes-agent-box",
  [int]$HhPort = 22,
  [string]$HhIdentityFile = "",
  [ValidateSet("native", "wsl")][string]$SshTransport = "native",
  [string]$WslDistro = "Ubuntu",
  [string]$WslUser = "omar",
  [string]$HhRepo = "/opt/crypto-tuber-ranked",
  [string]$StatePath = "",
  [string]$JobId = "",
  [string]$OutputJson = "",
  [int]$CooldownHours = 0,
  [int]$CooldownMinHours = 12,
  [int]$CooldownMaxHours = 24,
  [int]$WarningThreshold = 3,
  [string]$Impersonate = "chrome",
  [switch]$AllowLargeBatch,
  [switch]$NoImpersonate,
  [switch]$Workplane,
  [switch]$StatusOnly,
  [switch]$DryRun,
  [switch]$Write
)

$ErrorActionPreference = "Stop"
if ($Limit -lt 1 -or $Limit -gt 25) { throw "Limit must be 1..25" }
if ($Limit -gt 5 -and -not $AllowLargeBatch) { throw "Limit >5 requires -AllowLargeBatch; 25-video batches are gated until clean stability is proven" }
if ($Write -and $DryRun) { throw "Use either -Write or -DryRun" }
if ($GapSeconds -gt 0) { $MinGapSeconds = $GapSeconds; $MaxGapSeconds = $GapSeconds }
if ($CooldownHours -gt 0) { $CooldownMinHours = $CooldownHours; $CooldownMaxHours = $CooldownHours }
if ($MinGapSeconds -lt 1 -or $MaxGapSeconds -lt $MinGapSeconds) { throw "Gap bounds must satisfy 1 <= MinGapSeconds <= MaxGapSeconds" }
if ($CooldownMinHours -lt 1 -or $CooldownMaxHours -lt $CooldownMinHours) { throw "Cooldown bounds must satisfy 1 <= CooldownMinHours <= CooldownMaxHours" }
if ($HhPort -lt 1 -or $HhPort -gt 65535) { throw "HhPort must be 1..65535" }

function Invoke-TransportCommand([string]$Program, [string[]]$Args) {
  if ($SshTransport -eq "wsl") {
    & wsl.exe -d $WslDistro -u $WslUser -- $Program @Args
    return
  }
  & $Program @Args
}

function Convert-LocalPathForSshTransport([string]$Path) {
  if ($SshTransport -ne "wsl" -or -not $Path) { return $Path }
  $converted = (& wsl.exe -d $WslDistro -u $WslUser -- wslpath -a $Path 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $converted) {
    throw "wslpath_failed transport=$SshTransport"
  }
  return $converted
}

function Get-HhSshArgs([string]$RemoteCommand) {
  $sshArgs = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new")
  if ($HhIdentityFile) { $sshArgs += @("-i", (Convert-LocalPathForSshTransport $HhIdentityFile)) }
  if ($HhPort -ne 22) { $sshArgs += @("-p", [string]$HhPort) }
  $sshArgs += @($HhHost, $RemoteCommand)
  return $sshArgs
}

function Get-HhScpArgs([string]$LocalPath, [string]$RemotePath) {
  $scpArgs = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new")
  if ($HhIdentityFile) { $scpArgs += @("-i", (Convert-LocalPathForSshTransport $HhIdentityFile)) }
  if ($HhPort -ne 22) { $scpArgs += @("-P", [string]$HhPort) }
  $scpArgs += @((Convert-LocalPathForSshTransport $LocalPath), "${HhHost}:$RemotePath")
  return $scpArgs
}

function Get-HhScpFromArgs([string]$RemotePath, [string]$LocalPath) {
  $scpArgs = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new")
  if ($HhIdentityFile) { $scpArgs += @("-i", (Convert-LocalPathForSshTransport $HhIdentityFile)) }
  if ($HhPort -ne 22) { $scpArgs += @("-P", [string]$HhPort) }
  $scpArgs += @("${HhHost}:$RemotePath", (Convert-LocalPathForSshTransport $LocalPath))
  return $scpArgs
}

function Invoke-HhSsh([string]$RemoteCommand) {
  $sshArgs = Get-HhSshArgs $RemoteCommand
  Invoke-TransportCommand "ssh" $sshArgs
  if ($LASTEXITCODE -ne 0) { throw "hh_ssh_failed exit=$LASTEXITCODE transport=$SshTransport host=$HhHost port=$HhPort" }
}

function Copy-FileToHH([string]$LocalPath, [string]$RemotePath) {
  $scpArgs = Get-HhScpArgs $LocalPath $RemotePath
  Invoke-TransportCommand "scp" $scpArgs
  if ($LASTEXITCODE -ne 0) { throw "hh_scp_failed exit=$LASTEXITCODE transport=$SshTransport host=$HhHost port=$HhPort" }
}

function Copy-FileFromHH([string]$RemotePath, [string]$LocalPath) {
  $scpArgs = Get-HhScpFromArgs $RemotePath $LocalPath
  Invoke-TransportCommand "scp" $scpArgs
  if ($LASTEXITCODE -ne 0) { throw "hh_scp_failed exit=$LASTEXITCODE transport=$SshTransport host=$HhHost port=$HhPort" }
}

function Get-RepoRoot {
  if ($PSScriptRoot) { return (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }
  return (Get-Location).Path
}

function Resolve-RepoRelativePath([string]$Path) {
  if (-not $Path) { return $Path }
  if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
  return (Join-Path (Get-RepoRoot) $Path)
}

function Write-Utf8NoBomFile([string]$Path, [string]$Text) {
  $resolvedPath = Resolve-RepoRelativePath $Path
  $dir = Split-Path -Parent $resolvedPath
  if ($dir) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($resolvedPath, $Text, $utf8NoBom)
}

function Copy-StringToHH([string]$Payload, [string]$RemotePath) {
  $tmpFile = Join-Path $env:TEMP ("callscore-hh-payload-" + [Guid]::NewGuid().ToString("N") + ".json")
  try {
    Write-Utf8NoBomFile $tmpFile $Payload
    Copy-FileToHH $tmpFile $RemotePath
  } finally {
    Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-HhJsonCommand([string]$RemoteCommand, [string]$Label) {
  $fileName = "json-" + [Guid]::NewGuid().ToString("N") + ".json"
  $remoteRel = ".tmp/laptop-collector/$fileName"
  $remoteAbs = "$HhRepo/$remoteRel"
  $localFile = Join-Path $env:TEMP ("callscore-hh-json-" + [Guid]::NewGuid().ToString("N") + ".json")
  try {
    Invoke-HhSsh "cd $HhRepo && mkdir -p .tmp/laptop-collector && set -a && source .env.hermes && set +a && $RemoteCommand > $remoteRel"
    Copy-FileFromHH $remoteAbs $localFile
    return Get-Content -LiteralPath $localFile -Raw
  } finally {
    Remove-Item -LiteralPath $localFile -Force -ErrorAction SilentlyContinue
    try { Invoke-HhSsh "rm -f $remoteAbs" | Out-Null } catch { }
  }
}

function Invoke-HhIngestPayload([string]$Payload) {
  $fileName = "ingest-" + [Guid]::NewGuid().ToString("N") + ".json"
  $remoteRel = ".tmp/laptop-collector/inbox/$fileName"
  $remoteAbs = "$HhRepo/$remoteRel"
  Invoke-HhSsh "cd $HhRepo && mkdir -p .tmp/laptop-collector/inbox"
  Copy-StringToHH $Payload $remoteAbs
  $remoteCommand = "cd $HhRepo && set -a && source .env.hermes && set +a && npm run transcript:ingest -- --input $remoteRel --write; status=`$?; rm -f $remoteRel; exit `$status"
  Invoke-HhSsh $remoteCommand
}

function Get-DefaultStatePath {
  if ($StatePath) { return $StatePath }
  $root = $env:LOCALAPPDATA
  if (-not $root) { $root = $env:TEMP }
  return (Join-Path $root "CallScore\transcript-collector-state.json")
}

$StatePath = Get-DefaultStatePath
$stateDir = Split-Path -Parent $StatePath
if ($stateDir) { New-Item -ItemType Directory -Path $stateDir -Force | Out-Null }
$LockPath = "$StatePath.lock"

function Acquire-CollectorLock {
  if (Test-Path -LiteralPath $LockPath) {
    try {
      $existing = Get-Content -LiteralPath $LockPath -Raw | ConvertFrom-Json
      if ($existing.pid -and (Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue)) {
        throw "collector_overlap lock=$LockPath pid=$($existing.pid)"
      }
    } catch {
      if ($_.Exception.Message -match "collector_overlap") { throw }
    }
  }
  $lockJson = [pscustomobject]@{ pid = $PID; started_at_utc = [DateTimeOffset]::UtcNow.ToString("o"); job_id = $JobId } |
    ConvertTo-Json -Compress
  Write-Utf8NoBomFile $LockPath $lockJson
}

function Release-CollectorLock {
  Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
}

trap {
  Release-CollectorLock
  throw $_
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath)) {
    return [pscustomobject]@{ cooldown_until_utc = $null; video_failures = @{}; last_run_utc = $null }
  }
  try { return (Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json) }
  catch { return [pscustomobject]@{ cooldown_until_utc = $null; video_failures = @{}; last_run_utc = $null } }
}

function Set-StateProperty($state, [string]$name, $value) {
  $state | Add-Member -Force -NotePropertyName $name -NotePropertyValue $value
}

function Write-State($state, [switch]$PreserveLastRunUtc) {
  if (-not $PreserveLastRunUtc) {
    Set-StateProperty $state "last_run_utc" ([DateTimeOffset]::UtcNow.ToString("o"))
  }
  Write-Utf8NoBomFile $StatePath ($state | ConvertTo-Json -Depth 10)
}

function ConvertFrom-StrictJson($raw, [string]$label) {
  $text = ($raw | Out-String).Trim()
  if (-not $text) { throw "$label returned empty_output" }
  if (-not ($text.StartsWith("{") -or $text.StartsWith("["))) {
    $preview = ($text.Substring(0, [Math]::Min(240, $text.Length)) -replace "\r?\n", " ")
    throw "$label returned non_json_output preview=$preview"
  }
  try { return ($text | ConvertFrom-Json) }
  catch {
    $preview = ($text.Substring(0, [Math]::Min(240, $text.Length)) -replace "\r?\n", " ")
    throw "$label returned invalid_json_output error=$($_.Exception.Message) preview=$preview"
  }
}

function Get-VideoFailures($state) {
  if ($null -eq $state.video_failures) {
    $state | Add-Member -Force -NotePropertyName video_failures -NotePropertyValue ([pscustomobject]@{})
  }
  return $state.video_failures
}

function Summarize-FailureDetail([string]$detail, [int]$maxLength = 240) {
  $lines = @($detail -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $actionable = @($lines | Where-Object {
    $_ -notmatch '(?i)^Traceback' -and
    $_ -notmatch '(?i)^File "' -and
    $_ -notmatch '^\^+' -and
    $_ -notmatch '(?i)^During handling' -and
    $_ -notmatch '(?i)^The above exception'
  })
  if ($actionable.Count -gt 0) {
    $start = [Math]::Max(0, $actionable.Count - 4)
    $text = ($actionable[$start..($actionable.Count - 1)] -join " | ")
  } else {
    $text = ($detail -replace '\r?\n', " ").Trim()
  }
  if (-not $text) { return "empty_error_detail" }
  return $text.Substring(0, [Math]::Min($maxLength, $text.Length))
}

function Set-VideoFailure($state, [string]$youtubeVideoId, [string]$reason, [string]$detail) {
  $failures = Get-VideoFailures $state
  $entry = [pscustomobject]@{
    reason = $reason
    failed_at_utc = [DateTimeOffset]::UtcNow.ToString("o")
    detail_preview = Summarize-FailureDetail $detail 240
  }
  $failures | Add-Member -Force -NotePropertyName $youtubeVideoId -NotePropertyValue $entry
}

function Get-DynamicPropertyValue($object, [string]$name) {
  if ($null -eq $object) { return $null }
  $property = $object.PSObject.Properties[$name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

function Should-SkipVideo($state, [string]$youtubeVideoId) {
  $failures = Get-VideoFailures $state
  $failure = Get-DynamicPropertyValue $failures $youtubeVideoId
  if ($null -eq $failure) { return $false }
  try {
    $failedAt = [DateTimeOffset]::Parse($failure.failed_at_utc)
    return $failedAt.UtcDateTime -gt [DateTimeOffset]::UtcNow.AddHours(-24).UtcDateTime
  } catch { return $true }
}

function Publish-StateToHH($state, [switch]$PreserveRunMetrics) {
  if ($PreserveRunMetrics) {
    Set-StateProperty $state "last_statusonly_utc" ([DateTimeOffset]::UtcNow.ToString("o"))
  } else {
    Set-StateProperty $state "last_job_id" $JobId
    Set-StateProperty $state "last_mode" $(if ($Workplane) { "workplane" } elseif ($Write) { "write" } else { "dry_run" })
    Set-StateProperty $state "last_limit" $Limit
    Set-StateProperty $state "last_gap_min_seconds" $MinGapSeconds
    Set-StateProperty $state "last_gap_max_seconds" $MaxGapSeconds
    Set-StateProperty $state "last_attempted_count" $attempted
    Set-StateProperty $state "last_success_count" $succeeded
    Set-StateProperty $state "last_failure_count" $failed
    Set-StateProperty $state "last_terminal_failure" $terminalFailure
  }
  Write-State $state -PreserveLastRunUtc:$PreserveRunMetrics
  if ($OutputJson) {
    Write-Utf8NoBomFile $OutputJson ($state | ConvertTo-Json -Depth 10)
  }
  if ($HhHost -and $HhRepo) {
    Invoke-HhSsh "cd $HhRepo && mkdir -p .tmp/laptop-collector"
    Copy-FileToHH $StatePath "$HhRepo/.tmp/laptop-collector/latest-state.json"
  }
}

function Complete-WorkplaneJob([string]$status) {
  if (-not $JobId) { return }
  Invoke-HhSsh "cd $HhRepo && set -a && source .env.hermes && set +a && npm run --silent workplane -- complete --job-id $JobId --status $status --state-path .tmp/laptop-collector/latest-state.json" | Out-Host
}

function Claim-WorkplaneJob {
  if (-not $Workplane -or $JobId) { return }
  $runner = "laptop-$($env:COMPUTERNAME)-$PID"
  $claimRaw = Invoke-HhJsonCommand "npm run --silent workplane -- claim --worker-id $runner" "workplane claim"
  $claim = ConvertFrom-StrictJson $claimRaw "workplane claim"
  if (-not $claim.claimed) {
    Write-Host "collector_workplane_claim=false"
    Release-CollectorLock
    exit 0
  }
  $script:JobId = [string]$claim.job.id
  $payload = $claim.job.payload
  if ($payload.limit) { $script:Limit = [Math]::Min([int]$payload.limit, 5) }
  if ($payload.allow_large_batch -eq $true -and $payload.limit) { $script:Limit = [Math]::Min([int]$payload.limit, 25); $script:AllowLargeBatch = $true }
  if ($payload.browser) { $script:Browser = [string]$payload.browser }
  if ($payload.since_days) { $script:SinceDays = [int]$payload.since_days }
  if ($payload.min_gap_seconds) { $script:MinGapSeconds = [int]$payload.min_gap_seconds }
  if ($payload.max_gap_seconds) { $script:MaxGapSeconds = [int]$payload.max_gap_seconds }
  Write-Host "collector_workplane_claim=true job_id=$JobId limit=$Limit"
}

function Start-Cooldown($state, [string]$reason) {
  $hours = Get-Random -Minimum $CooldownMinHours -Maximum ($CooldownMaxHours + 1)
  Set-StateProperty $state "cooldown_until_utc" ([DateTimeOffset]::UtcNow.AddHours($hours).ToString("o"))
  Set-StateProperty $state "cooldown_reason" $reason
  Write-State $state
  Write-Host "collector_cooldown=true reason=$reason hours=$hours until=$($state.cooldown_until_utc)"
}

function Classify-Failure([string]$text) {
  if ($text -match "(?i)(HTTP\s*(Error\s*)?429|429\s*Too\s*Many\s*Requests|Too\s*Many\s*Requests)") { return "rate_limited" }
  if ($text -match "(?i)(bot_verification_required|not a bot|Sign in to confirm|confirm\s+you.?re\s+not\s+a\s+bot)") { return "bot_verification_required" }
  if ($text -match "(?i)impersonation_warning_threshold") { return "impersonation_warning_threshold" }
  if ($text -match "(?i)(impersonation.*not available|no impersonate target|curl_cffi|requested but no impersonation target)") { return "impersonation_unavailable" }
  if ($text -match "(?i)(no_captions|no subtitles|no automatic captions|There are no subtitles)") { return "no_captions" }
  if ($text -match "(?i)(Premieres|upcoming|live stream|This live event)") { return "live_or_upcoming" }
  if ($text -match "(?i)(private video|video is unavailable|removed by the uploader|account has been terminated|login required)") { return "private_or_deleted" }
  if ($text -match "(?i)transcript_too_short") { return "transcript_too_short" }
  if ($text -match "(?i)(timed out|timeout|connection.*reset|connection.*closed|Incomplete data received)") { return "transient_network" }
  if ($text -match "(?is)(traceback\s+\(most recent call last\)|yt[_-]?dlp\.|ExtractorError|AttributeError|KeyError|TypeError|System\.Management\.Automation\.(RuntimeException|MethodInvocationException))") { return "collector_tool_error" }
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
  $cleanDetail = Summarize-FailureDetail $detail 500
  $payload = [pscustomobject]@{
    video_id = [int]$item.id
    youtube_video_id = [string]$item.youtube_video_id
    status = "failed"
    error = $reason
    detail = $cleanDetail
    provider = "laptop_collector_$Browser"
  } | ConvertTo-Json -Depth 5 -Compress
  if ($Write) {
    Invoke-HhIngestPayload $payload
  } else {
    Write-Host "would_mark_failed video_id=$($item.id) reason=$reason"
  }
}

Acquire-CollectorLock
$attempted = 0
$succeeded = 0
$failed = 0
$terminalFailure = $null
$state = Read-State

if ($StatusOnly) {
  Publish-StateToHH $state -PreserveRunMetrics
  Release-CollectorLock
  exit 0
}

if ($state.cooldown_until_utc) {
  try {
    $until = [DateTimeOffset]::Parse($state.cooldown_until_utc)
    if ($until.UtcDateTime -gt [DateTimeOffset]::UtcNow.UtcDateTime) {
      Write-Host "collector_skip=true reason=cooldown until=$($state.cooldown_until_utc) state=$StatePath"
      Publish-StateToHH $state
      Release-CollectorLock
      exit 0
    }
  } catch { }
}

Claim-WorkplaneJob

$impersonationArgs = @()
if (Test-ImpersonationSupport $Impersonate) {
  $impersonationArgs = @("--impersonate", $Impersonate)
  Write-Host "collector_impersonation=enabled target=$Impersonate"
} elseif (-not $NoImpersonate) {
  Write-Host "collector_impersonation=unavailable target=$Impersonate action='python -m pip install -U ""yt-dlp[default,curl-cffi]""'"
}

$worklistRaw = Invoke-HhJsonCommand "npm run --silent transcript:worklist -- --limit $Limit --since-days $SinceDays" "transcript:worklist"
$worklist = ConvertFrom-StrictJson $worklistRaw "transcript:worklist"
$items = @($worklist.items)
Write-Host "collector_worklist=$($items.Count) browser=$Browser mode=$(if ($Write) { 'WRITE' } else { 'DRY' }) limit=$Limit gap=${MinGapSeconds}-${MaxGapSeconds}s state=$StatePath"

foreach ($item in $items) {
  $attempted += 1
  if (Should-SkipVideo $state ([string]$item.youtube_video_id)) {
    Write-Host "collector_skip_video=true youtube_video_id=$($item.youtube_video_id) reason=recent_failure_24h"
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
      Invoke-HhIngestPayload $payload
    } else {
      Write-Host "would_ingest video_id=$($item.id) youtube_video_id=$($item.youtube_video_id) chars=$($text.Trim().Length)"
    }
    $succeeded += 1
  } catch {
    $detail = $_.Exception.Message
    $reason = Classify-Failure $detail
    $failed += 1
    Set-VideoFailure $state ([string]$item.youtube_video_id) $reason $detail
    Write-State $state
    Send-Failure $item $reason $detail
    if ($reason -in @("rate_limited", "bot_verification_required", "impersonation_warning_threshold")) {
      Start-Cooldown $state $reason
      $terminalFailure = $reason
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

Publish-StateToHH $state
Complete-WorkplaneJob $(if ($terminalFailure) { "failed" } else { "succeeded" })
Release-CollectorLock
