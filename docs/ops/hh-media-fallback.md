# HH Media Fallback Transcript Path

Status: **safe scaffold implemented / blocked on local ASR tooling**

Purpose: allow HH to recover transcripts only when transcript-only caption fetch fails, without keeping raw media.

## Safety contract

- Transcript-only yt-dlp remains first path.
- Media fallback is audio-only, never full video by default.
- Limit 1 first, then 5, then 25 only after prior stage passes.
- Concurrency 1.
- Temp work root: `/tmp/callscore-media-work`.
- Cleanup runs in `finally`; audio and ASR sidecar files are deleted after each item.
- Disk guard default: at least 5 GB free.
- File guard default: `--max-filesize 200M`.
- Duration guard default: `duration <= 3600`.
- Logs contain no cookies, tokens, or connection strings.

## Command

```bash
cd /opt/crypto-tuber-ranked
set -a && source .env.hermes && set +a
npm run transcript:media-fallback -- --limit 1 --since-days 45 --dry-run
```

Write mode must only be used after ASR is installed and the dry canary passes:

```bash
npm run transcript:media-fallback -- --limit 1 --since-days 45 --write
```

## Current HH blocker

HH currently has `ffmpeg` and `yt-dlp`, but no local ASR runtime:

- `whisper`: missing
- `faster_whisper`: missing
- `torch`: missing

The media fallback canary therefore stops before download with `asr_unavailable`. This is intentional: HH must not download raw media if it cannot turn it into a transcript and delete it in the same bounded run.

## Required ASR install profile

Minimum CPU path:

- Python venv for ASR runtime;
- `openai-whisper` or `faster-whisper`;
- model storage for at least `base`/`small` model;
- enough CPU budget for ~1x-5x realtime transcription;
- 5+ GB free disk after Docker/images.

Preferred GPU path if available:

- CUDA-compatible torch/faster-whisper stack;
- explicit model cache directory outside repo;
- same cleanup and disk guard.

Do not enable daily HH media fallback until one-video and 5-video canaries pass.
