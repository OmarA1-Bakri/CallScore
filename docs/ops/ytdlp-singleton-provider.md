# ytdlp POT Provider Singleton Rule

CallScore HH uses exactly one bgutil ytdlp POT provider on port 4416.

Canonical owner:

- Compose project: `crypto-tuber-ranked`
- Container: `crypto-tuber-ranked-ytdlp-pot-provider-1`
- Health endpoint: `http://127.0.0.1:4416/ping`

Forbidden duplicate:

- Compose project: `whop-auto`
- Container: `whop-auto-ytdlp-pot-provider-1`

Do not start whop-auto with a broad compose command:

```bash
# FORBIDDEN for whop-auto: may recreate whop-auto-ytdlp-pot-provider-1
docker compose -f /opt/crypto-tuber-ranked/docker-compose.yml -p whop-auto up -d
```

Safe whop-auto worker startup:

```bash
/opt/crypto-tuber-ranked/scripts/start-whop-auto-workers.sh --start
```

Check-only verification:

```bash
/opt/crypto-tuber-ranked/scripts/start-whop-auto-workers.sh --check
```

The wrapper uses explicit service targets with `--no-deps` and `--no-recreate`:

```bash
docker compose -f /opt/crypto-tuber-ranked/docker-compose.yml -p whop-auto up -d --no-deps --no-recreate hermes-worker channel-agent-worker
```

`--no-deps` is required because `hermes-worker` and `channel-agent-worker` have `depends_on: ytdlp-pot-provider` in the shared compose file. Without `--no-deps`, Docker Compose can recreate the whop-auto provider dependency even when only worker services are named.

`--no-recreate` is required so the safe-start wrapper does not stop and recreate already-running healthy whop-auto worker containers while enforcing the singleton guard.

Never use `docker compose down` as part of this guard flow. Do not stop or restart the healthy singleton provider or running workers unless a separate operator-approved maintenance plan says so.
