#!/usr/bin/env python3
"""Install or verify the repo-owned CallScore Hermes gateway unit.

The installer deliberately never starts, stops, restarts, enables, or disables
services. Runtime activation remains a separately reviewed operator action.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pwd
import sys
import tempfile
from pathlib import Path

DEFAULT_SOURCE = Path("ops/systemd/hermes-callscore-gateway.service")
SYSTEMCTL_EXECUTABLE = "/usr/bin/systemctl"


def login_home() -> Path:
    """Return the OS account home, independent of profile-scoped HOME."""
    return Path(pwd.getpwuid(os.getuid()).pw_dir)


DEFAULT_DESTINATION = login_home() / ".config/systemd/user/hermes-callscore-gateway.service"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def emit(payload: dict[str, object], *, error: bool = False) -> None:
    stream = sys.stderr if error else sys.stdout
    print(json.dumps(payload, sort_keys=True, separators=(",", ":")), file=stream)


def validate_source(path: Path) -> bytes:
    if not path.is_file():
        raise ValueError(f"source unit missing: {path}")
    data = path.read_bytes()
    text = data.decode("utf-8")
    required = (
        "WorkingDirectory=/opt/crypto-tuber-ranked",
        "ExecStartPre=/usr/bin/python3 /opt/crypto-tuber-ranked/scripts/apply-callscore-hermes-patch.py",
        "--manifest /opt/crypto-tuber-ranked/ops/hermes-runtime-patches/bitwarden-zero-ttl-cache/manifest.json",
        "--runtime-repo /srv/agents/hermes/hermes-agent --apply",
        'Environment="HERMES_HOME=/srv/agents/hermes/profiles/callscore"',
        "ExecStart=/home/omar/.local/bin/callscore gateway run --accept-hooks",
    )
    missing = [value for value in required if value not in text]
    if missing:
        raise ValueError(f"source unit missing required contract: {missing[0]}")
    forbidden = ("ExecStart=/usr/bin/docker", "ExecStartPre=/bin/sh", "EnvironmentFile=")
    found = [value for value in forbidden if value in text]
    if found:
        raise ValueError(f"source unit contains forbidden contract: {found[0]}")
    return data


def destination_state(destination: Path, source_data: bytes) -> tuple[str, str | None]:
    if not destination.exists():
        return "missing", None
    if not destination.is_file() or destination.is_symlink():
        return "unsafe_destination", None
    installed = destination.read_bytes()
    if installed == source_data:
        return "current", digest(installed)
    return "drifted", digest(installed)


def install_atomic(destination: Path, source_data: bytes) -> None:
    destination.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        dir=destination.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(source_data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def daemon_reload() -> None:
    read_fd, write_fd = os.pipe()
    try:
        argv = [SYSTEMCTL_EXECUTABLE, "--user", "daemon-reload"]
        file_actions = [
            (os.POSIX_SPAWN_DUP2, write_fd, 1),
            (os.POSIX_SPAWN_DUP2, write_fd, 2),
            (os.POSIX_SPAWN_CLOSE, read_fd),
            (os.POSIX_SPAWN_CLOSE, write_fd),
        ]
        process_id = os.posix_spawn(
            SYSTEMCTL_EXECUTABLE,
            argv,
            os.environ.copy(),
            file_actions=file_actions,
        )
    finally:
        os.close(write_fd)
    with os.fdopen(read_fd, "rb") as output:
        captured = output.read().decode("utf-8", errors="replace")
    _, status = os.waitpid(process_id, 0)
    if os.waitstatus_to_exitcode(status) != 0:
        detail = captured.strip()
        raise ValueError(f"systemd user daemon-reload failed: {detail}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    parser.add_argument("--no-daemon-reload", action="store_true")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true")
    action.add_argument("--install", action="store_true")
    args = parser.parse_args()

    try:
        source = args.source.resolve()
        destination = args.destination.expanduser().absolute()
        source_data = validate_source(source)
        expected_sha256 = digest(source_data)
        state, actual_sha256 = destination_state(destination, source_data)
        payload = {
            "ok": state == "current",
            "state": state,
            "source": str(source),
            "destination": str(destination),
            "expected_sha256": expected_sha256,
            "actual_sha256": actual_sha256,
            "service_mutation_performed": False,
        }

        if args.check:
            emit(payload, error=state != "current")
            return 0 if state == "current" else 1
        if state == "unsafe_destination":
            raise ValueError(f"refusing unsafe destination: {destination}")
        if state != "current":
            install_atomic(destination, source_data)
        if not args.no_daemon_reload:
            daemon_reload()
        final_state, final_sha256 = destination_state(destination, source_data)
        if final_state != "current":
            raise ValueError(f"post-install verification failed: {final_state}")
        emit(
            {
                **payload,
                "ok": True,
                "state": "already_current" if state == "current" else "installed",
                "actual_sha256": final_sha256,
                "daemon_reload_performed": not args.no_daemon_reload,
            }
        )
        return 0
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        emit({"ok": False, "state": "error", "error": str(exc)}, error=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
