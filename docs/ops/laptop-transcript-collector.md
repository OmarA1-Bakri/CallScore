# Laptop Transcript Collector

Status: **implemented / HH-to-laptop SSH blocked until laptop authorizes key or operator runs script locally**

Purpose: collect YouTube captions from Omar's laptop over Tailscale without sending browser cookies to HH.

## Safety contract

- Cookies stay on laptop.
- HH receives only transcript result JSON and metadata.
- Transcript-only first: `yt-dlp --skip-download --write-auto-subs --write-subs`.
- Concurrency 1.
- Limit 1, then 5, then 25 only after prior step passes.
- Gap/sleep default: 20 seconds.
- No raw video or audio retained.
- Tailscale/SSH only.

## HH worklist

```bash
cd /opt/crypto-tuber-ranked
set -a && source .env.hermes && set +a
npm run transcript:worklist -- --limit 1 --since-days 45
```

## Laptop run

From Omar's laptop PowerShell:

```powershell
cd <repo-checkout-or-copied-scripts-dir>
.\scripts\windows\run-transcript-collector.ps1 -Limit 1 -Browser firefox -GapSeconds 20 -SinceDays 45 -HhHost hermes-agent-box -DryRun
.\scripts\windows\run-transcript-collector.ps1 -Limit 1 -Browser firefox -GapSeconds 20 -SinceDays 45 -HhHost hermes-agent-box -Write
```

Then 5-video test only after one-video canary passes:

```powershell
.\scripts\windows\run-transcript-collector.ps1 -Limit 5 -Browser firefox -GapSeconds 20 -SinceDays 45 -HhHost hermes-agent-box -Write
```

Then 25-video current-window catch-up only after 5-video test passes.

## HH ingest

Collector posts JSON through SSH to:

```bash
npm run transcript:ingest -- --input - --write
```

The ingest path validates video ids, stores transcript text, marks `transcript_status='available'`, clears `transcript_error`, and sets `calls_extracted=false` so normal extraction can process it.

## Current HH evidence

- `omarslaptop-1` is reachable over Tailscale by ping.
- HH non-interactive SSH to laptop is currently denied: `Permission denied (publickey,password)`.
- Operator can either run the PowerShell script locally on laptop or authorize an HH SSH key for Tailscale-only access.
