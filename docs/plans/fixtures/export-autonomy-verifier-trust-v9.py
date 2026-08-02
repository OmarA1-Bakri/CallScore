#!/usr/bin/env python3
"""Read the final-report trust bundle from PostgreSQL authority.

The verifier invokes this fixed sibling executable. The database function is
SECURITY DEFINER, read-only, and grants execution only to the report-verifier
role. DATABASE_URL is consumed by psql without being printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

STREAM_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-stream-id", required=True)
    parser.add_argument("--sequence-no", required=True, type=int)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not STREAM_RE.fullmatch(args.report_stream_id) or args.sequence_no < 1:
        raise SystemExit("invalid trust-export subject")
    if not os.environ.get("DATABASE_URL"):
        raise SystemExit("DATABASE_URL is required for authenticated trust export")
    sql = (
        "SELECT callscore_plan_contract.export_autonomy_verifier_trust_bundle("
        ":'report_stream_id', :sequence_no)::text"
    )
    command = [
        "/usr/bin/psql", "-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-At",
        "--set", f"report_stream_id={args.report_stream_id}",
        "--set", f"sequence_no={args.sequence_no}",
        "-c", sql,
    ]
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        raise SystemExit("authenticated PostgreSQL trust export failed")
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"authenticated PostgreSQL trust export returned invalid JSON: {exc}") from exc
    if payload.get("schema") != "callscore.db_autonomy_verifier_trust_bundle.v1":
        raise SystemExit("authenticated PostgreSQL trust export returned wrong schema")
    sys.stdout.write(json.dumps(payload, separators=(",", ":"), sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
