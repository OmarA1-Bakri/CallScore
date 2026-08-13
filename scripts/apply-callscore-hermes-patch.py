#!/usr/bin/env python3
"""Verify or apply a CallScore-owned patch to a pinned Hermes runtime tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

SCHEMA = "callscore.hermes_runtime_patch.v1"
OWNER = "OmarA1-Bakri/CallScore"
GIT_EXECUTABLE = "/usr/bin/git"


def run_git(runtime_repo: Path, arguments: list[str]) -> tuple[int, str]:
    """Run the fixed system Git binary without a shell or PATH lookup."""
    read_fd, write_fd = os.pipe()
    try:
        argv = [GIT_EXECUTABLE, "-C", str(runtime_repo), *arguments]
        file_actions = [
            (os.POSIX_SPAWN_DUP2, write_fd, 1),
            (os.POSIX_SPAWN_DUP2, write_fd, 2),
            (os.POSIX_SPAWN_CLOSE, read_fd),
            (os.POSIX_SPAWN_CLOSE, write_fd),
        ]
        process_id = os.posix_spawn(
            GIT_EXECUTABLE,
            argv,
            os.environ.copy(),
            file_actions=file_actions,
        )
    finally:
        os.close(write_fd)
    with os.fdopen(read_fd, "rb") as output:
        captured = output.read().decode("utf-8", errors="replace")
    _, status = os.waitpid(process_id, 0)
    return os.waitstatus_to_exitcode(status), captured


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "schema",
        "owner",
        "upstream_repository",
        "upstream_commit",
        "upstream_tree",
        "patch_file",
        "patch_sha256",
        "target_files",
    }
    missing = sorted(required - data.keys())
    if missing:
        raise ValueError(f"manifest missing fields: {', '.join(missing)}")
    if data["schema"] != SCHEMA:
        raise ValueError(f"unsupported schema: {data['schema']}")
    if data["owner"] != OWNER:
        raise ValueError(f"unexpected owner: {data['owner']}")
    if data["upstream_repository"] != "NousResearch/hermes-agent":
        raise ValueError("unexpected upstream_repository")
    if not isinstance(data["target_files"], list) or not data["target_files"]:
        raise ValueError("target_files must be a non-empty list")
    for target in data["target_files"]:
        if set(target) != {"path", "before_sha256", "after_sha256"}:
            raise ValueError("each target file must contain path and before/after SHA-256")
        relative = Path(target["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"unsafe target path: {target['path']}")
    return data


def verify_bundle(manifest_path: Path, manifest: dict[str, Any]) -> Path:
    patch_path = (manifest_path.parent / manifest["patch_file"]).resolve()
    bundle_root = manifest_path.parent.resolve()
    if bundle_root not in patch_path.parents:
        raise ValueError("patch_file escapes manifest directory")
    if not patch_path.is_file():
        raise ValueError(f"patch file missing: {patch_path}")
    actual = sha256(patch_path)
    if actual != manifest["patch_sha256"]:
        raise ValueError(
            f"patch SHA-256 mismatch: expected {manifest['patch_sha256']}, got {actual}"
        )
    return patch_path


def target_state(runtime_repo: Path, manifest: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    states: list[dict[str, str]] = []
    for target in manifest["target_files"]:
        path = runtime_repo / target["path"]
        actual = sha256(path) if path.is_file() else "missing"
        if actual == target["before_sha256"]:
            state = "before"
        elif actual == target["after_sha256"]:
            state = "after"
        else:
            state = "unknown"
        states.append({"path": target["path"], "state": state, "sha256": actual})
    unique = {item["state"] for item in states}
    if unique == {"before"}:
        return "ready_to_apply", states
    if unique == {"after"}:
        return "already_applied", states
    return "mixed_or_unknown", states


def verify_git_anchor(runtime_repo: Path, manifest: dict[str, Any]) -> None:
    if len(str(manifest["upstream_commit"])) != 40:
        return
    returncode, output = run_git(runtime_repo, ["rev-parse", "HEAD", "HEAD^{tree}"])
    if returncode != 0:
        raise ValueError("runtime repo is not a readable Git worktree")
    anchors = output.splitlines()
    if len(anchors) != 2:
        raise ValueError("runtime repo returned an incomplete Git anchor")
    actual_commit, actual_tree = anchors
    if actual_commit != manifest["upstream_commit"]:
        raise ValueError(
            f"runtime HEAD mismatch: expected {manifest['upstream_commit']}, got {actual_commit}"
        )
    if actual_tree != manifest["upstream_tree"]:
        raise ValueError(
            f"runtime tree mismatch: expected {manifest['upstream_tree']}, got {actual_tree}"
        )


def git_apply(runtime_repo: Path, patch_path: Path, *, check: bool) -> None:
    command = ["apply"]
    if check:
        command.append("--check")
    command.extend(["--whitespace=error", str(patch_path)])
    returncode, output = run_git(runtime_repo, command)
    if returncode != 0:
        detail = output.strip()
        raise ValueError(f"git apply {'check ' if check else ''}failed: {detail}")


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, sort_keys=True, separators=(",", ":")))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--runtime-repo", type=Path)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--verify-manifest", action="store_true")
    action.add_argument("--check", action="store_true")
    action.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    try:
        manifest_path = args.manifest.resolve()
        manifest = load_manifest(manifest_path)
        patch_path = verify_bundle(manifest_path, manifest)
        base = {
            "ok": True,
            "owner": manifest["owner"],
            "schema": manifest["schema"],
            "upstream_commit": manifest["upstream_commit"],
            "upstream_tree": manifest["upstream_tree"],
            "patch_sha256": manifest["patch_sha256"],
            "target_paths": [target["path"] for target in manifest["target_files"]],
        }
        if args.verify_manifest:
            emit({**base, "state": "manifest_verified"})
            return 0
        if args.runtime_repo is None:
            raise ValueError("--runtime-repo is required for --check and --apply")
        runtime_repo = args.runtime_repo.resolve()
        if not runtime_repo.is_dir():
            raise ValueError(f"runtime repo missing: {runtime_repo}")
        verify_git_anchor(runtime_repo, manifest)
        state, targets = target_state(runtime_repo, manifest)
        if state == "mixed_or_unknown":
            raise ValueError(f"mixed_or_unknown target state: {json.dumps(targets, sort_keys=True)}")
        if state == "ready_to_apply":
            git_apply(runtime_repo, patch_path, check=True)
        if args.check or state == "already_applied":
            emit({**base, "state": state, "targets": targets})
            return 0
        git_apply(runtime_repo, patch_path, check=False)
        final_state, final_targets = target_state(runtime_repo, manifest)
        if final_state != "already_applied":
            raise ValueError(f"post-apply verification failed: {final_state}")
        emit({**base, "state": "applied", "targets": final_targets})
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
