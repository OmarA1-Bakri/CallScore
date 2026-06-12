# Laptop Transcript Collector

Status: **rate-limit hardened / canonical near-term transcript path / run small daily batches only**

Purpose: collect YouTube captions from Omar's laptop over Tailscale without sending browser cookies to HH.

## Safety contract

- Cookies stay on laptop.
- HH receives only transcript result JSON and metadata.
- Transcript-only first: `yt-dlp --skip-download --write-auto-subs --write-subs`.
- Concurrency 1: the script processes one video at a time.
- Default batch limit: **5**.
- 25-video batches are disabled unless `-AllowLargeBatch` is passed explicitly.
- Default gap: randomized **45-90 seconds** between videos.
- Stop immediately on HTTP 429 or bot-verification evidence.
- Persist cooldown after 429/bot-verification/impersonation-warning threshold: randomized 12-24 hours.
- Do not retry the same terminally failed video for 24 hours.
- No raw video or audio retained.
- Tailscale/SSH only.

## Impersonation support

The collector checks yt-dlp impersonation support before requesting an impersonation target. On the laptop, verify/install support with:

```powershell
python -m pip install -U "yt-dlp[default,curl-cffi]"
yt-dlp --list-impersonate-targets
```

If impersonation targets remain unavailable, the collector logs the missing dependency and continues conservatively without repeated warning spam. Repeated impersonation warnings during a run trigger batch stop/cooldown.

## HH worklist

The HH worklist is bounded and ordered by transcript priority:

1. recent official creators;
2. recent provisional creators;
3. recent watchlist creators;
4. stale repair candidates;
5. excluded creators only for validation, never public ranking.

```bash
cd /opt/crypto-tuber-ranked
set -a && source .env.hermes && set +a
npm run transcript:worklist -- --limit 5 --since-days 45
```

## Laptop run

From Omar's laptop PowerShell:

```powershell
cd <repo-checkout-or-copied-scripts-dir>
.\scripts\windows\run-transcript-collector.ps1 -Limit 1 -Browser firefox -SinceDays 45 -HhHost omar@100.107.162.80 -HhPort 2222 -HhIdentityFile $env:USERPROFILE\.ssh\callscore_hh_ed25519 -DryRun
.\scripts\windows\run-transcript-collector.ps1 -Limit 1 -Browser firefox -SinceDays 45 -HhHost omar@100.107.162.80 -HhPort 2222 -HhIdentityFile $env:USERPROFILE\.ssh\callscore_hh_ed25519 -Write
```

Default small daily batch after a clean canary:

```powershell
.\scripts\windows\run-transcript-collector.ps1 -Limit 5 -Browser firefox -SinceDays 45 -HhHost omar@100.107.162.80 -HhPort 2222 -HhIdentityFile $env:USERPROFILE\.ssh\callscore_hh_ed25519 -Write
```

25-video current-window catch-up is not the default. Use only after clean stability is proven and no cooldown is active:

```powershell
.\scripts\windows\run-transcript-collector.ps1 -Limit 25 -AllowLargeBatch -Browser firefox -SinceDays 45 -HhHost omar@100.107.162.80 -HhPort 2222 -HhIdentityFile $env:USERPROFILE\.ssh\callscore_hh_ed25519 -Write
```

## Cooldown state

Default state file:

```text
%LOCALAPPDATA%\CallScore\transcript-collector-state.json
```

The state file stores:

- `cooldown_until_utc`;
- cooldown reason;
- per-video recent terminal failures.

Do not delete cooldown state just to force another large run. Clear it only after confirming the cooldown reason is obsolete and the next run is a 1- or 5-video bounded test.

## HH ingest

Collector posts JSON through SSH to:

```bash
npm run transcript:ingest -- --input - --write
```

The ingest path validates video ids, stores transcript text, marks `transcript_status='available'`, clears `transcript_error`, and sets `calls_extracted=false` so normal extraction can process it.

## Current HH evidence

- Laptop collector has produced and ingested real transcripts without moving cookies to HH.
- Latest larger run eventually hit HTTP 429; therefore daily operation is limited to small batches with cooldown and terminal-failure skip logic.
- Production calls/rankings are unaffected by collector state until normal extraction/scoring paths run under separate gates.

## Workplane runner mode

Status: **INSTALL_READY**.

The same canonical collector script now supports Hermes/workplane operation; no parallel runner is required.

```powershell
.\scripts\windows\run-transcript-collector.ps1 -Workplane -Limit 5 -Browser firefox -SinceDays 45 -HhHost omar@100.107.162.80 -HhPort 2222 -HhIdentityFile $env:USERPROFILE\.ssh\callscore_hh_ed25519 -Write
```

Workplane behavior:

- claims a pending `transcript_collect_laptop` job from HH with `npm run workplane:laptop-job -- claim`;
- applies the job payload but clamps default work to limit 5 unless `allow_large_batch=true` is present;
- uses a local lock file beside `%LOCALAPPDATA%\CallScore\transcript-collector-state.json` to prevent overlapping runs;
- pushes transcript/failure results to HH ingest;
- mirrors collector state to HH at `.tmp/laptop-collector/latest-state.json`;
- completes or fails the claimed job with `npm run workplane:laptop-job -- complete`;
- never sends cookies to HH.

HH-side status reads the mirrored state by default through:

```bash
npm run workplane:status -- --read-api-base https://ops-bridge.call-score.com/api/read
```

## Activation troubleshooting notes

Use spaced PowerShell switches. This is valid:

```powershell
.\scripts\windows\run-transcript-collector.ps1 -StatusOnly -HhHost omar@100.107.162.80 -HhPort 2222 -HhIdentityFile $env:USERPROFILE\.ssh\callscore_hh_ed25519
```

This is invalid and can route execution unexpectedly:

```powershell
.\scripts\windows\run-transcript-collector.ps1 -StatusOnly-HhHost hh
```

HH command surfaces:

```bash
npm run --silent workplane -- --read-api-base https://ops-bridge.call-score.com/api/read
npm run --silent workplane -- --status --json --read-api-base https://ops-bridge.call-score.com/api/read
npm run --silent workplane -- claim --worker-id laptop-smoke-test
npm run --silent workplane -- complete --job-id <id> --status succeeded --state-path .tmp/laptop-collector/latest-state.json
```

The collector uses `npm run --silent` for HH commands that are parsed as JSON. If a non-JSON banner or shell output is returned, the collector now fails with `non_json_output` and a short preview instead of a raw `ConvertFrom-Json` parser exception.

Current HH SSH note: HH listens on Tailscale `100.107.162.80` port `2222`, so laptop runner commands must pass `-HhPort 2222` unless a local SSH config alias maps the host and port.
