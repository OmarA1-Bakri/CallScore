#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

PATTERNS = (
    "http 429",
    "usage limit has been reached",
    "creditsdepleted",
    "too many requests",
)


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def format_time(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: callscore-record-provider-cooldown.py <raw-output> <state-json> <run-id>", file=sys.stderr)
        return 64
    raw_path, state_path, run_id = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    text = raw_path.read_text(errors="replace").lower() if raw_path.exists() else ""
    if not any(pattern in text for pattern in PATTERNS):
        return 0
    now = parse_time(os.environ.get("CALLSCORE_NOW_UTC") or format_time(datetime.now(timezone.utc)))
    seconds = max(300, int(os.environ.get("CALLSCORE_PROVIDER_COOLDOWN_SECONDS", "3600")))
    until = now + timedelta(seconds=seconds)
    source_runs = [run_id]
    if state_path.exists():
        try:
            existing = json.loads(state_path.read_text())
            existing_until = parse_time(str(existing.get("until_utc", "")))
            until = max(until, existing_until)
            source_runs = list(dict.fromkeys([*(existing.get("source_runs") or []), run_id]))
        except Exception:
            pass
    receipt = {
        "schema": "callscore.channel_head_provider_cooldown.v1",
        "created_at_utc": format_time(now),
        "until_utc": format_time(until),
        "reason": "HTTP_429_usage_limit_reached",
        "source_runs": source_runs,
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = state_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    temporary.replace(state_path)
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
