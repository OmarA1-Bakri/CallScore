#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 4 or sys.argv[3] not in {"scalar", "csv"}:
        print("Usage: callscore-read-active-json.py <active.json> <key> <scalar|csv>", file=sys.stderr)
        return 64
    path, key, mode = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    value = json.loads(path.read_text()).get(key)
    if value is None:
        return 0
    if mode == "csv":
        if isinstance(value, list):
            sys.stdout.write(",".join(str(item) for item in value if item is not None))
            return 0
        if isinstance(value, str):
            sys.stdout.write(value)
            return 0
        print(f"Expected string or list for {key}", file=sys.stderr)
        return 65
    if isinstance(value, bool):
        sys.stdout.write("true" if value else "false")
    elif isinstance(value, (dict, list)):
        sys.stdout.write(json.dumps(value, separators=(",", ":")))
    else:
        sys.stdout.write(str(value))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
