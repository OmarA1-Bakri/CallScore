#!/usr/bin/env python3
"""Verify or apply a CallScore-owned patch to a pinned Hermes runtime tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import sys
import tempfile
import zlib
from pathlib import Path
from typing import Any

SCHEMA = "callscore.hermes_runtime_patch.v1"
OWNER = "OmarA1-Bakri/CallScore"
OID_PATTERN = re.compile(r"^[0-9a-f]{40}$")
HUNK_PATTERN = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def git_directories(runtime_repo: Path) -> tuple[Path, Path]:
    marker = runtime_repo / ".git"
    if marker.is_dir():
        git_dir = marker
    elif marker.is_file():
        text = marker.read_text(encoding="utf-8").strip()
        if not text.startswith("gitdir: "):
            raise ValueError("runtime repo has an invalid .git marker")
        git_dir = (runtime_repo / text[8:]).resolve()
    else:
        raise ValueError("runtime repo is not a readable Git worktree")
    common_marker = git_dir / "commondir"
    common_dir = (
        (git_dir / common_marker.read_text(encoding="utf-8").strip()).resolve()
        if common_marker.is_file()
        else git_dir
    )
    return git_dir, common_dir


def read_ref(git_dir: Path, common_dir: Path, reference: str) -> str:
    for root in (git_dir, common_dir):
        path = root / reference
        if path.is_file():
            value = path.read_text(encoding="ascii").strip()
            if OID_PATTERN.fullmatch(value):
                return value
    packed_refs = common_dir / "packed-refs"
    if packed_refs.is_file():
        for line in packed_refs.read_text(encoding="ascii").splitlines():
            if line.startswith(("#", "^")):
                continue
            parts = line.split(" ", 1)
            if len(parts) == 2 and parts[1] == reference and OID_PATTERN.fullmatch(parts[0]):
                return parts[0]
    raise ValueError(f"runtime repo cannot resolve Git ref: {reference}")


def head_oid(git_dir: Path, common_dir: Path) -> str:
    value = (git_dir / "HEAD").read_text(encoding="ascii").strip()
    if OID_PATTERN.fullmatch(value):
        return value
    if value.startswith("ref: "):
        return read_ref(git_dir, common_dir, value[5:])
    raise ValueError("runtime repo HEAD is malformed")


def packed_object_offset(index_path: Path, object_id: bytes) -> int | None:
    data = index_path.read_bytes()
    if len(data) < 8 + (256 * 4) or data[:4] != b"\xfftOc":
        raise ValueError(f"unsupported Git pack index: {index_path.name}")
    version = struct.unpack(">I", data[4:8])[0]
    if version != 2:
        raise ValueError(f"unsupported Git pack index version: {version}")
    fanout = struct.unpack(">256I", data[8:8 + (256 * 4)])
    count = fanout[-1]
    names_start = 8 + (256 * 4)
    names_end = names_start + (count * 20)
    if len(data) < names_end + (count * 8):
        raise ValueError(f"truncated Git pack index: {index_path.name}")
    low = fanout[object_id[0] - 1] if object_id[0] else 0
    high = fanout[object_id[0]]
    while low < high:
        middle = (low + high) // 2
        candidate = data[names_start + (middle * 20):names_start + ((middle + 1) * 20)]
        if candidate < object_id:
            low = middle + 1
        else:
            high = middle
    candidate = data[names_start + (low * 20):names_start + ((low + 1) * 20)]
    if low >= count or candidate != object_id:
        return None
    offsets_start = names_end + (count * 4)
    encoded = struct.unpack(">I", data[offsets_start + (low * 4):offsets_start + ((low + 1) * 4)])[0]
    if encoded & 0x80000000:
        large_index = encoded & 0x7fffffff
        large_start = offsets_start + (count * 4)
        position = large_start + (large_index * 8)
        if len(data) < position + 8:
            raise ValueError(f"truncated large-offset table: {index_path.name}")
        return struct.unpack(">Q", data[position:position + 8])[0]
    return encoded


def read_packed_commit(pack_path: Path, offset: int) -> bytes:
    with pack_path.open("rb") as handle:
        if handle.read(4) != b"PACK":
            raise ValueError(f"invalid Git pack: {pack_path.name}")
        handle.seek(offset)
        first = handle.read(1)
        if not first:
            raise ValueError(f"truncated Git pack object: {pack_path.name}")
        byte = first[0]
        object_type = (byte >> 4) & 0x07
        size = byte & 0x0f
        shift = 4
        while byte & 0x80:
            next_byte = handle.read(1)
            if not next_byte:
                raise ValueError(f"truncated Git pack object header: {pack_path.name}")
            byte = next_byte[0]
            size |= (byte & 0x7f) << shift
            shift += 7
        if object_type != 1:
            raise ValueError("pinned Git commit is stored as an unsupported delta object")
        decompressor = zlib.decompressobj()
        output = bytearray()
        while not decompressor.eof:
            chunk = handle.read(65536)
            if not chunk:
                raise ValueError(f"truncated packed Git commit: {pack_path.name}")
            output.extend(decompressor.decompress(chunk))
        if len(output) != size:
            raise ValueError(f"packed Git commit size mismatch: {pack_path.name}")
        return bytes(output)


def read_commit(common_dir: Path, oid: str) -> bytes:
    object_id = bytes.fromhex(oid)
    loose = common_dir / "objects" / oid[:2] / oid[2:]
    if loose.is_file():
        inflated = zlib.decompress(loose.read_bytes())
        header, separator, content = inflated.partition(b"\0")
        if not separator or header != f"commit {len(content)}".encode("ascii"):
            raise ValueError("pinned Git object is not a valid commit")
    else:
        content = b""
        for index_path in sorted((common_dir / "objects/pack").glob("*.idx")):
            offset = packed_object_offset(index_path, object_id)
            if offset is not None:
                content = read_packed_commit(index_path.with_suffix(".pack"), offset)
                break
        if not content:
            raise ValueError(f"runtime repo cannot read Git commit: {oid}")
    return content


def git_anchor(runtime_repo: Path) -> tuple[str, str]:
    """Read HEAD and its tree from loose or packed Git objects without a process."""
    git_dir, common_dir = git_directories(runtime_repo)
    commit = head_oid(git_dir, common_dir)
    content = read_commit(common_dir, commit)
    first_line = content.split(b"\n", 1)[0]
    if not first_line.startswith(b"tree "):
        raise ValueError("runtime Git commit has no tree")
    tree = first_line[5:].decode("ascii")
    if not OID_PATTERN.fullmatch(tree):
        raise ValueError("runtime Git commit tree is malformed")
    return commit, tree


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
    for field in ("upstream_commit", "upstream_tree"):
        if not isinstance(data[field], str) or not OID_PATTERN.fullmatch(data[field]):
            raise ValueError(f"{field} must be a 40-character hexadecimal Git object ID")

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


def safe_target_path(runtime_repo: Path, relative_value: str) -> Path:
    """Return a regular target inside the runtime without following symlinks."""
    relative = Path(relative_value)
    destination = runtime_repo / relative
    current = runtime_repo
    for component in relative.parts:
        current = current / component
        if current.is_symlink():
            raise ValueError(f"unsafe target path: {relative_value}")
    root = runtime_repo.resolve()
    parent = destination.parent.resolve()
    if parent != root and root not in parent.parents:
        raise ValueError(f"unsafe target path: {relative_value}")
    if destination.exists() and not destination.is_file():
        raise ValueError(f"unsafe target path: {relative_value}")
    return destination


def target_state(runtime_repo: Path, manifest: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    states: list[dict[str, str]] = []
    for target in manifest["target_files"]:
        path = safe_target_path(runtime_repo, target["path"])
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
    actual = git_anchor(runtime_repo)
    expected = (manifest["upstream_commit"], manifest["upstream_tree"])
    if actual != expected:
        raise ValueError(
            "runtime Git anchor mismatch: "
            f"actual commit={actual[0]} tree={actual[1]}"
        )


def parse_patch(patch_path: Path) -> dict[str, list[tuple[int, list[str]]]]:
    """Parse the bounded text-only unified diff carried by the manifest."""
    lines = patch_path.read_text(encoding="utf-8").splitlines(keepends=True)
    patches: dict[str, list[tuple[int, list[str]]]] = {}
    index = 0
    current_path = ""
    while index < len(lines):
        line = lines[index]
        if line.startswith("+++ b/"):
            current_path = line[6:].rstrip("\n")
            patches.setdefault(current_path, [])
            index += 1
            continue
        match = HUNK_PATTERN.match(line)
        if match:
            if not current_path:
                raise ValueError("patch hunk appears before a target path")
            old_start = int(match.group(1))
            body: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].startswith(("@@ ", "diff --git ")):
                if lines[index].startswith("\\ No newline at end of file"):
                    index += 1
                    continue
                if not lines[index].startswith((" ", "+", "-")):
                    raise ValueError(f"unsupported patch line for {current_path}")
                body.append(lines[index])
                index += 1
            patches[current_path].append((old_start, body))
            continue
        index += 1
    if not patches or any(not hunks for hunks in patches.values()):
        raise ValueError("patch contains no applicable text hunks")
    return patches


def patched_content(original: str, hunks: list[tuple[int, list[str]]], path: str) -> str:
    source = original.splitlines(keepends=True)
    output: list[str] = []
    cursor = 0
    for old_start, body in hunks:
        start = old_start - 1
        if start < cursor or start > len(source):
            raise ValueError(f"invalid or overlapping patch hunk for {path}")
        output.extend(source[cursor:start])
        cursor = start
        for patch_line in body:
            prefix, content = patch_line[0], patch_line[1:]
            if prefix in (" ", "-"):
                if cursor >= len(source) or source[cursor] != content:
                    raise ValueError(f"patch context mismatch for {path}")
                if prefix == " ":
                    output.append(source[cursor])
                cursor += 1
            elif prefix == "+":
                output.append(content)
    output.extend(source[cursor:])
    return "".join(output)


def apply_patch(
    runtime_repo: Path,
    patch_path: Path,
    manifest: dict[str, Any],
    *,
    check: bool,
) -> None:
    patches = parse_patch(patch_path)
    expected_paths = {target["path"] for target in manifest["target_files"]}
    if set(patches) != expected_paths:
        raise ValueError("patch paths do not exactly match manifest target_files")
    replacements: dict[Path, str] = {}
    for relative, hunks in patches.items():
        destination = safe_target_path(runtime_repo, relative)
        candidate = patched_content(destination.read_text(encoding="utf-8"), hunks, relative)
        expected_hash = next(
            target["after_sha256"] for target in manifest["target_files"]
            if target["path"] == relative
        )
        if hashlib.sha256(candidate.encode()).hexdigest() != expected_hash:
            raise ValueError(f"patched content hash mismatch for {relative}")
        replacements[destination] = candidate
    if not check:
        for destination, candidate in replacements.items():
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{destination.name}.",
                dir=destination.parent,
            )
            temporary = Path(temporary_name)
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    handle.write(candidate)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chmod(temporary, destination.stat().st_mode & 0o777)
                os.replace(temporary, destination)
            finally:
                if temporary.exists():
                    temporary.unlink()


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
        state, targets = target_state(runtime_repo, manifest)
        if state == "mixed_or_unknown":
            raise ValueError(f"mixed_or_unknown target state: {json.dumps(targets, sort_keys=True)}")
        if state == "ready_to_apply":
            verify_git_anchor(runtime_repo, manifest)
            apply_patch(runtime_repo, patch_path, manifest, check=True)
        if args.check or state == "already_applied":
            emit({**base, "state": state, "targets": targets})
            return 0
        apply_patch(runtime_repo, patch_path, manifest, check=False)
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
