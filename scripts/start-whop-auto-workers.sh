#!/usr/bin/env bash
# Safe whop-auto worker starter for CallScore HH.
#
# ytdlp singleton rule:
#   - crypto-tuber-ranked owns the only ytdlp-pot-provider on port 4416.
#   - crypto-tuber-ranked also owns the canonical data-pipeline hermes-worker.
#   - whop-auto must start only channel-agent-worker; starting whop-auto hermes-worker
#     resurrects a duplicate data-pipeline poller with the same worker id.
#   - --no-deps is required because channel-agent-worker depends_on ytdlp-pot-provider in
#     the shared compose file; without --no-deps, whop-auto can recreate a duplicate
#     whop-auto-ytdlp-pot-provider-1 container.
#   - --no-recreate is required so a safe-start attempt does not stop/recreate
#     already-running healthy whop-auto worker containers.
#
# This script never prints secrets and never runs docker compose down/restart.

set -euo pipefail

COMPOSE_FILE="/opt/crypto-tuber-ranked/docker-compose.yml"
REPO_DIR="/opt/crypto-tuber-ranked"
SINGLETON_CONTAINER="crypto-tuber-ranked-ytdlp-pot-provider-1"
DUPLICATE_CONTAINER="whop-auto-ytdlp-pot-provider-1"
PING_URL="http://127.0.0.1:4416/ping"
SAFE_SERVICES=(channel-agent-worker)

usage() {
  cat <<'USAGE'
Usage: start-whop-auto-workers.sh [--check|--start|--print-command]

--check          Verify singleton provider health and duplicate absence only.
--start          Start whop-auto workers with explicit services, --no-deps, and --no-recreate.
--print-command  Print the safe compose command without executing it.

Default: --start
USAGE
}

mode="--start"
if [[ "${1:-}" != "" ]]; then
  mode="$1"
fi

case "$mode" in
  --check|--start|--print-command|-h|--help) ;;
  *)
    usage >&2
    exit 64
    ;;
esac

if [[ "$mode" == "-h" || "$mode" == "--help" ]]; then
  usage
  exit 0
fi

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "ERROR: required file missing: $path" >&2
    exit 70
  fi
}

container_exists() {
  docker inspect "$1" >/dev/null 2>&1
}

container_health() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null
}

assert_duplicate_absent() {
  if container_exists "$DUPLICATE_CONTAINER"; then
    echo "ERROR: forbidden duplicate container exists: $DUPLICATE_CONTAINER" >&2
    exit 71
  fi
}

assert_singleton_healthy() {
  if ! container_exists "$SINGLETON_CONTAINER"; then
    echo "ERROR: singleton provider missing: $SINGLETON_CONTAINER" >&2
    exit 72
  fi

  local health
  health="$(container_health "$SINGLETON_CONTAINER")"
  if [[ "$health" != "healthy" ]]; then
    echo "ERROR: singleton provider not healthy: $SINGLETON_CONTAINER health=$health" >&2
    exit 73
  fi

  if ! curl -fsS --max-time 3 "$PING_URL" >/dev/null; then
    echo "ERROR: singleton provider ping failed: $PING_URL" >&2
    exit 74
  fi
}

assert_workers_running_after_start() {
  local service container state
  for service in "${SAFE_SERVICES[@]}"; do
    container="whop-auto-${service}-1"
    state="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)"
    if [[ "$state" != "running" ]]; then
      echo "ERROR: expected worker not running after safe start: $container state=${state:-missing}" >&2
      exit 75
    fi
  done
}

require_file "$COMPOSE_FILE"
assert_duplicate_absent
assert_singleton_healthy

if [[ "$mode" == "--check" ]]; then
  echo "OK: singleton provider healthy; whop-auto duplicate absent."
  exit 0
fi

if [[ "$mode" == "--print-command" ]]; then
  echo "cd $REPO_DIR && docker compose -f $COMPOSE_FILE -p whop-auto up -d --no-deps --no-recreate channel-agent-worker"
  exit 0
fi

cd "$REPO_DIR"
docker compose -f "$COMPOSE_FILE" -p whop-auto up -d --no-deps --no-recreate channel-agent-worker
assert_duplicate_absent
assert_workers_running_after_start
assert_singleton_healthy

echo "OK: whop-auto workers started safely without recreating ytdlp-pot-provider."
