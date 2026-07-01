#!/usr/bin/env python3
"""Index the crypto-tuber-ranked repo into codebase-memory via MCP JSON-RPC.
Spawned by git hooks or startup scripts. Idempotent — safe to call repeatedly."""

from __future__ import annotations
import json
import os
import subprocess
import sys
import time

REPO = os.environ.get("CALLSCORE_APP_DIR", "/opt/crypto-tuber-ranked")
MCP_BIN = os.environ.get("CODEBASE_MEMORY_MCP_BIN", "/home/omar/.local/bin/codebase-memory-mcp")
LOG = os.environ.get("CODEBASE_MEMORY_LOG", "/dev/null")

def log(msg: str) -> None:
    with open(LOG, "a") if LOG != "/dev/null" else open(os.devnull, "w") as f:
        f.write(f"[index-codebase] {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {msg}\n")

def main() -> int:
    if not os.path.exists(REPO):
        log(f"REPO {REPO} not found — skipping")
        return 0
    if not os.path.exists(MCP_BIN):
        log(f"MCP binary {MCP_BIN} not found — skipping")
        return 0

    log(f"Starting index of {REPO}")

    proc = subprocess.Popen(
        [MCP_BIN],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    assert proc.stdin and proc.stdout

    def rpc(method: str, params: dict | None = None) -> dict:
        req = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})
        proc.stdin.write(req.encode() + b"\n")
        proc.stdin.flush()
        raw = proc.stdout.readline()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            log(f"RPC parse error for {method}: {raw[:200]}")
            return {"error": {"message": f"parse failure: {raw[:200]}"}}

    # Initialize MCP session
    init = rpc("initialize", {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "callscore-index-hook", "version": "1.0"},
    })
    if "error" in init:
        log(f"Initialize failed: {init['error']}")
        proc.terminate()
        return 1

    # Notify initialized
    rpc("notifications/initialized")

    # Index the repo
    call = rpc("tools/call", {
        "name": "index_repository",
        "arguments": {"repo_path": REPO, "mode": "fast"},
    })
    if "error" in call:
        log(f"Index failed: {call['error']}")
        proc.terminate()
        return 1

    result = call.get("result", {}).get("content", [{}])[0].get("text", "ok")
    log(f"Index complete: {result}")
    proc.terminate()
    return 0

if __name__ == "__main__":
    sys.exit(main())
