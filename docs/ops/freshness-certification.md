# CallScore Freshness Certification

Last updated: 2026-06-11

## Canonical transcript path

CallScore uses **slow YT-DLP transcript extraction** as the canonical transcript path.

Required safety defaults:

- transcript batch limit: 25
- transcript concurrency: 1
- YT-DLP sleep interval: 20 seconds
- YT-DLP max sleep interval: 60 seconds
- retry cooldown after normal failures: 24 hours
- retry cooldown after provider/bot/rate-limit blocks: 7 days
- transcript lock: `/tmp/callscore-slow-ytdlp-transcripts.lock`
- daily pipeline lock: `/tmp/callscore-daily-pipeline.lock`

The transcript runner must fetch captions/subtitles only. It must not download videos, expand playlists, run high concurrency, or run unbounded historical backfills.

## Runtime credential gate

If YouTube bot verification blocks unauthenticated YT-DLP, provide exactly one approved runtime-only credential path. Do not commit or print cookie values.

Supported options:

```bash
YTDLP_COOKIES_PATH=/absolute/path/to/youtube-cookies.txt
YTDLP_COOKIES_FROM_BROWSER=<yt-dlp supported browser spec available to the worker>
YTDLP_COOKIES=<redacted Netscape cookie file content through secure runtime env>
```

After changing runtime env, restart only the affected CallScore worker/timer surface and rerun the transcript canary.

## Daily cadence

HH uses the systemd timer:

- timer: `callscore-daily-pipeline.timer`
- service: `callscore-daily-pipeline.service`
- schedule: daily around 03:20 local time with randomized delay
- environment: `/opt/crypto-tuber-ranked/.env.hermes` plus redacted runtime env

Service command:

```bash
cd /opt/crypto-tuber-ranked
npm run pipeline:daily -- \
  --write \
  --read-api-base https://ops-bridge.call-score.com/api/read \
  --transcript-limit 25 \
  --transcript-concurrency 1 \
  --transcript-gap-ms 20000 \
  --limit-creators 250 \
  --limit-videos 10 \
  --since-days 45 \
  --extract-limit 50 \
  --match-limit 500 \
  --match-batch-size 100
```

The daily runner performs bounded RSS discovery, slow transcript attempts, local extraction, price matching, scoring, and freshness self-check. Transcript failures are classified instead of silently accumulating.

## Operator certification command

Run with the production runtime env loaded:

```bash
cd /opt/crypto-tuber-ranked
set -a; . ./.env.hermes >/dev/null 2>&1; set +a
DATABASE_PROVIDER=postgres npm run freshness:check -- \
  --read-api-base https://ops-bridge.call-score.com/api/read
```

Expected certified state:

- `status = PASS`, or `WARN` only for an explicit non-blocking provider/cookie warning
- `dailyTimer.active = true`
- latest non-smoke job created/completed today
- latest video inserted/discovery attempt current
- latest transcript attempt within 24 hours
- latest transcript success current once YT-DLP cookies are working
- latest call insert/scoring/creator_stats update current after catch-up
- `unsafeSourceRanks = 0`
- read API `nativeBuckets = true`
- read API `leaderboardRowsEqualOfficial = true`

## Safe canary sequence

```bash
cd /opt/crypto-tuber-ranked
set -a; . ./.env.hermes >/dev/null 2>&1; set +a
DATABASE_PROVIDER=postgres npm run backfill:transcripts -- \
  --limit 1 \
  --concurrency 1 \
  --gap-ms 20000 \
  --retry-cooldown-hours 0 \
  --write \
  --audit-out .tmp/callscore-slow-ytdlp-canary/transcripts.jsonl
```

If the canary reports `bot_verification_required`, `po_token_required`,
`cookie_invalid_or_rotated`, `js_challenge_runtime_missing`, or `rate_limited`,
stop transcript catch-up and do not run a full backfill.

Current YT-DLP recovery controls are intentionally opt-in and redacted:

- `YTDLP_BIN` may point the host daily pipeline at an isolated current `yt-dlp` venv.
- `YTDLP_JS_RUNTIMES=node` enables the official JavaScript runtime path.
- `YTDLP_REMOTE_COMPONENTS=1` allows official EJS remote components when needed.
- `YTDLP_EXTRACTOR_ARGS` may be used for reviewed official YouTube extractor args
  such as `youtube:player_client=mweb`; never store static PO tokens casually.

If a fresh cookie is installed and the one-video canary still reports
`bot_verification_required`, treat the remaining gate as an authenticated
YouTube session/IP acceptance or reviewed PO-token provider issue. Do not escalate
to proxies, high concurrency, or large transcript jobs.

## Backlog drain policy

Drain in this order, capped by the daily transcript limit:

1. videos published or discovered in the last 30–45 days;
2. active official/provisional/watchlist creators;
3. retryable older backlog after cooldown;
4. excluded/stale creators only for audit validation.

Do not clear the historical transcript backlog with one large YT-DLP run.
