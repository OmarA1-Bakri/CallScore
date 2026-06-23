# Private YouTube Upload Canary Runbook

## Current state

The local video pipeline is proven. The Composio file bridge is implemented and tested locally.

Live private YouTube upload was not executed by this review pass because the execution environment blocked direct credential/env sourcing and the large MCP remote-workbench upload script before it could run.

## Preconditions

- Latest local video job has `qa-report.json` with `ok: true`.
- `COMPOSIO_API_KEY` is available in the runtime environment used by the CLI.
- YouTube toolkit connection is active in Composio.
- Upload privacy is `private` for the first canary.

## Bridge local MP4 into Composio file object

```bash
cd /opt/crypto-tuber-ranked
set -a
. /opt/crypto-tuber-ranked/.env.hermes
set +a
npm run video:bridge -- artifacts/video-jobs/<jobId>/state.json
```

Expected output artifact:

```text
artifacts/video-jobs/<jobId>/composio-file-bridge.json
```

Expected file object shape:

```json
{
  "name": "video.mp4",
  "mimetype": "video/mp4",
  "s3key": "..."
}
```

## Private upload canary

```bash
cd /opt/crypto-tuber-ranked
set -a
. /opt/crypto-tuber-ranked/.env.hermes
set +a
VIDEO_AUTO_PUBLISH=true VIDEO_YOUTUBE_PRIVACY=private npm run video:publish -- artifacts/video-jobs/<jobId>/state.json
```

Expected result:

- `publish-result.json` contains a YouTube video ID.
- Video privacy remains `private`.
- Thumbnail may be skipped unless `VIDEO_COMPOSIO_THUMBNAIL_URL` is set, because `YOUTUBE_UPDATE_THUMBNAIL` requires `thumbnailUrl`.

## Known blocker

The current direct bridge uses Composio file API via `COMPOSIO_API_KEY`. If `.env.hermes` contains an expired key but Hermes MCP still works through profile config, run the private canary through a Hermes MCP executor adapter or rotate/update the local Composio key without printing it.
