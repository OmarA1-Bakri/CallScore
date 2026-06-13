# Transcript extraction waterfall

CallScore transcript acquisition is one bounded waterfall, not separate ad-hoc systems.

## Command

```bash
npm run transcript:extract -- --methods serpapi_transcript,hh_ytdlp_ejs_wpc --limit 1 --dry-run
```

`npm run backfill:transcripts` is the same implementation. Use `--write` only after reviewing target DB and bounded write set.

## Method IDs

| Method | Runs where | Writes how | Notes |
| --- | --- | --- | --- |
| `serpapi_transcript` | HH | `backfill-transcripts.ts` | Paid/quota-bearing. Requires SerpAPI env. |
| `hh_ytdlp` | HH | `backfill-transcripts.ts` | Existing yt-dlp caption path. Honors `YTDLP_*` env. |
| `hh_ytdlp_ejs_wpc` | HH | `backfill-transcripts.ts` | Prefers `/opt/callscore/yt-dlp-2026.6.9/bin/yt-dlp`; defaults EJS/remote components/player-client options. |
| `laptop_ytdlp` | laptop | `transcript:ingest` on HH | Firefox/chrome cookie runner. Cookies remain laptop-local. |
| `youtube_transcript_api_laptop` | laptop | artifact then `transcript:ingest` | Use only artifact mode; do not use stale script direct DB writes. |
| `media_asr_fallback` | HH | media fallback script | Limit 1 by default; requires ASR runtime and disk guards. |

Aliases accepted in `--methods`: `serpapi`, `yt-dlp`, `hh-ytdlp-ejs-wpc`, `laptop-yt-dlp`, `youtube-transcript-api`, `media-asr-fallback`.

## Safe default

Without `--methods`, legacy behavior is preserved:

- no flags: `hh_ytdlp`
- `--serpapi`: `serpapi_transcript,hh_ytdlp`
- `--no-yt-dlp`: no local provider unless `--methods` or `TRANSCRIPT_EXTRACTION_METHODS` is set

## Rules

- Keep outputs routed through `transcript:ingest` when extraction happens outside HH.
- External laptop/media methods are handoff boundaries: HH records/audits `pending_handoff`, not terminal `failed`.
- Do not direct-write from stale laptop/Python/Apify scripts.
- Keep batches bounded; use `--dry-run` first.
- Do not run paid, open-ended, or production-writing extraction without approval.
