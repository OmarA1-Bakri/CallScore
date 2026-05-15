#!/usr/bin/env python3
"""
hermes-worker-wrapper.py
Safe wrapper for the pipeline worker.
- Parses .env.local with python-dotenv (no special-char issues in bash)
- Fixes DNS to IPv4-first
- Restarts worker automatically
- Logs to .tmp/hermes-worker.log
"""

import os, sys, subprocess, time

PROJECT_DIR = "/mnt/c/Users/albak/xdev/crypto-tuber-ranked"
LOG_PATH = os.path.join(PROJECT_DIR, ".tmp", "hermes-worker.log")

os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)

def log(msg: str):
    line = f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {msg}\n"
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line)
    print(line, end="")

def load_env():
    env_path = os.path.join(PROJECT_DIR, ".env.local")
    if not os.path.exists(env_path):
        log(f"WARNING: .env.local not found at {env_path}")
        return
    try:
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path, override=True)
            log("Loaded .env.local via python-dotenv")
        except ImportError:
            # Fallback: manual parse
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    os.environ[k] = v
            log("Loaded .env.local via manual parse")
    except Exception as e:
        log(f"ERROR loading .env.local: {e}")
        sys.exit(1)

def main():
    os.environ["DNS_RESULT_ORDER"] = "ipv4first"
    load_env()
    os.chdir(PROJECT_DIR)

    # Verify DB URL is set
    db_url = os.environ.get("NEON_DATABASE_URL")
    if not db_url:
        log("ERROR: NEON_DATABASE_URL not set after loading .env.local")
        sys.exit(1)
    log(f"DB URL present (starts with {db_url[:25]}...)")

    while True:
        log("Starting hermes-worker...")
        node = os.popen("which node").read().strip() or "node"
        cmd = [
            node,
            "--dns-result-order=ipv4first",
            "--import", "tsx",
            "src/scripts/hermes-worker.ts",
            "--max-jobs", "10000",
        ]
        env = dict(os.environ)
        env["DNS_RESULT_ORDER"] = "ipv4first"
        log(f"CMD: {' '.join(cmd)}")
        proc = subprocess.Popen(cmd, env=env, cwd=PROJECT_DIR)
        ret = proc.wait()
        log(f"Worker exited with code {ret}, restarting in 5s...")
        time.sleep(5)

if __name__ == "__main__":
    main()
