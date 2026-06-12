param(
  [int]$Limit = 1,
  [ValidateSet("firefox", "chrome", "chromium", "edge")][string]$Browser = "firefox",
  [int]$GapSeconds = 20,
  [int]$SinceDays = 45,
  [string]$HhHost = "hermes-agent-box",
  [string]$HhRepo = "/opt/crypto-tuber-ranked",
  [switch]$DryRun,
  [switch]$Write
)

$ErrorActionPreference = "Stop"
if ($Limit -lt 1 -or $Limit -gt 25) { throw "Limit must be 1..25" }
if ($Write -and $DryRun) { throw "Use either -Write or -DryRun" }

$worklistCmd = "cd $HhRepo && set -a && source .env.hermes && set +a && npm run transcript:worklist -- --limit $Limit --since-days $SinceDays"
$worklistRaw = ssh $HhHost $worklistCmd
$worklist = ($worklistRaw | Out-String | ConvertFrom-Json)
$items = @($worklist.items)
Write-Host "collector_worklist=$($items.Count) browser=$Browser mode=$(if ($Write) { 'WRITE' } else { 'DRY' })"

foreach ($item in $items) {
  $runDir = Join-Path $env:TEMP ("callscore-transcript-" + $item.youtube_video_id + "-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds())
  New-Item -ItemType Directory -Path $runDir | Out-Null
  try {
    $out = Join-Path $runDir "%(id)s.%(ext)s"
    & yt-dlp --cookies-from-browser $Browser --skip-download --no-playlist --write-auto-subs --write-subs --sub-langs "en.*" --sub-format "vtt" -o $out $item.youtube_url | Out-Null
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
    $payload = [pscustomobject]@{
      video_id = [int]$item.id
      youtube_video_id = [string]$item.youtube_video_id
      status = "failed"
      error = $_.Exception.Message
      provider = "laptop_collector_$Browser"
    } | ConvertTo-Json -Depth 5 -Compress
    if ($Write) {
      $payload | ssh $HhHost "cd $HhRepo && set -a && source .env.hermes && set +a && npm run transcript:ingest -- --input - --write"
    } else {
      Write-Host "would_mark_failed video_id=$($item.id) reason=$($_.Exception.Message)"
    }
  } finally {
    Remove-Item -LiteralPath $runDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds $GapSeconds
}
