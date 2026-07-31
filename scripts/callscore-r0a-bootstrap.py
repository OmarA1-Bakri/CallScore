#!/usr/bin/env python3
"""Source-only bootstrap primitives for CallScore R0A.

This file intentionally uses only the Python standard library.  Its JSON
profile is an ASCII/string/integer subset of RFC 8785, so Python key sorting
is byte-identical to JCS for accepted values.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import unicodedata
from typing import Any

SCHEMA = "callscore.r0a_input_manifest.v1"
SPEC_SCHEMA = "callscore.r0a_bootstrap_spec.v1"
PLAN_PATH = "/opt/crypto-tuber-ranked/docs/plans/2026-07-30-callscore-full-system-recovery-and-activation.md"
PROMPT_PATH = "/opt/crypto-tuber-ranked/docs/prompts/2026-07-30-callscore-r0a-maintenance-preparation-prompt.md"
APPLICATION_REPO = Path("/opt/crypto-tuber-ranked")
WORKPLANE_REPO = Path("/srv/agents/repos/callscore-workplane")
HERMES_REPO = Path("/srv/agents/hermes/hermes-agent")
WORKTREE_ROOT = Path("/srv/agents/worktrees")
MINIMAL_ENV = {
    "HOME": "/nonexistent",
    "PATH": "/usr/bin:/bin",
    "LANG": "C.UTF-8",
    "LC_ALL": "C.UTF-8",
    "PYTHONDONTWRITEBYTECODE": "1",
}
SPEC_PATH = APPLICATION_REPO / "docs/ops/callscore-r0a/bootstrap/input-spec.json"
EXPECTED_HERMES_ANCHORS = (
    "/srv/agents/hermes/hermes-agent/gateway/status.py",
    "/srv/agents/hermes/hermes-agent/hermes_state.py",
    "/srv/agents/hermes/hermes-agent/tools/session_search_tool.py",
)
EXPECTED_REVIEW_PATHS = (
    "/opt/crypto-tuber-ranked/docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-implementation-timeout.json",
    "/opt/crypto-tuber-ranked/docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-security-fail.md",
    "/opt/crypto-tuber-ranked/docs/ops/callscore-r0a/input-reviews/deleg_1fb6fe24-specification-fail.md",
    "/opt/crypto-tuber-ranked/docs/ops/callscore-r0a/input-reviews/deleg_a7901f50-r0a-security-fail.md",
    "/opt/crypto-tuber-ranked/docs/ops/callscore-r0a/input-reviews/deleg_c26083f7-r0a-specification-fail.md",
    "/opt/crypto-tuber-ranked/docs/ops/callscore-r0a/input-reviews/deleg_e17283dc-r0a-implementation-fail.md",
)
EXPECTED_MUTABLE_INPUTS = (
    ("/etc/systemd/system/agent-snapshot.service", "agent-snapshot.service"),
    ("/etc/systemd/system/agent-snapshot.timer", "agent-snapshot.timer"),
    ("/usr/local/bin/agent-snapshot", "agent-snapshot"),
    ("/home/omar/.config/systemd/user/hermes-callscore-gateway.service", "hermes-callscore-gateway.service"),
)
HEX64 = re.compile(r"^[0-9a-f]{64}$")
WRITE_FLAGS = ("O_WRONLY", "O_RDWR", "O_CREAT", "O_TRUNC", "O_APPEND")
MUTATING_CALLS = (
    "creat(", "unlink(", "unlinkat(", "rename(", "renameat(", "renameat2(",
    "mkdir(", "mkdirat(", "rmdir(", "chmod(", "fchmodat(", "fchmodat2(", "chown(",
    "lchown(", "fchownat(", "symlink(", "symlinkat(", "link(", "linkat(",
    "truncate(", "mknod(", "mknodat(", "setxattr(", "lsetxattr(",
    "removexattr(", "lremovexattr(", "utime(", "utimes(", "lutimes(",
    "futimesat(", "utimensat(",
)
FD_MUTATING_CALLS = (
    "write(", "writev(", "pwrite64(", "pwritev(", "pwritev2(",
    "ftruncate(", "fallocate(", "fchmod(", "fchown(", "futimes(", "fsetxattr(",
    "fremovexattr(", "sendfile(", "copy_file_range(", "splice(",
)
ESCAPE_CALLS = (
    "ptrace(", "unshare(", "setns(", "mount(", "umount(", "umount2(",
    "pivot_root(", "chroot(", "bpf(", "io_uring_setup(",
    "io_uring_enter(", "io_uring_register(", "process_vm_writev(",
    "copy_file_range(", "splice(", "tee(", "vmsplice(",
    "move_mount(", "fsopen(", "fsmount(", "open_tree(", "pidfd_getfd(",
    "keyctl(", "add_key(", "request_key(", "process_vm_readv(",
    "kill(", "tkill(", "tgkill(", "pidfd_send_signal(",
)
SAFE_IOCTL_REQUESTS = frozenset({
    "FIOCLEX",
    "FIONCLEX",
    "TCGETS",
    "TCGETS2",
    "TIOCGWINSZ",
    "FIONREAD",
    "FS_IOC_GETFLAGS",
    "FS_IOC_GETVERSION",
})


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in pairs:
        if key in out:
            raise ValueError(f"duplicate JSON key: {key}")
        out[key] = value
    return out


def load_json_strict(data: bytes) -> Any:
    try:
        text = data.decode("utf-8", "strict")
    except UnicodeDecodeError as exc:
        raise ValueError("manifest is not strict UTF-8") from exc
    return json.loads(text, object_pairs_hook=_pairs, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(f"invalid constant: {x}")))


def _split_trace_args(value: str) -> list[str]:
    parts: list[str] = []
    start = 0
    quote = False
    escape = False
    round_depth = square_depth = curly_depth = angle_depth = 0
    for index, char in enumerate(value):
        if quote:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                quote = False
            continue
        if char == '"':
            quote = True
        elif char == "(":
            round_depth += 1
        elif char == ")":
            round_depth -= 1
        elif char == "[":
            square_depth += 1
        elif char == "]":
            square_depth -= 1
        elif char == "{":
            curly_depth += 1
        elif char == "}":
            curly_depth -= 1
        elif char == "<":
            angle_depth += 1
        elif char == ">":
            angle_depth -= 1
        elif char == "," and round_depth == square_depth == curly_depth == angle_depth == 0:
            parts.append(value[start:index].strip())
            start = index + 1
    if quote or any(depth != 0 for depth in (round_depth, square_depth, curly_depth, angle_depth)):
        raise ValueError("unbalanced strace argument list")
    parts.append(value[start:].strip())
    return parts


def _decode_trace_string(value: str) -> str:
    try:
        return bytes(value, "utf-8").decode("unicode_escape")
    except UnicodeDecodeError as exc:
        raise ValueError("trace contains invalid path escape") from exc


def _trace_arg_path(value: str) -> Path:
    match = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', value)
    if match is None:
        raise ValueError(f"unresolved strace path argument: {value}")
    return Path(_decode_trace_string(match.group(1)))


def _trace_dirfd_base(value: str, current_cwd: Path) -> Path:
    if value == "AT_FDCWD":
        return current_cwd
    cwd_match = re.fullmatch(r"AT_FDCWD<(.+)>", value)
    if cwd_match is not None:
        target = cwd_match.group(1).removesuffix(" (deleted)")
        if not target.startswith("/"):
            raise ValueError(f"non-path strace cwd annotation: {value}")
        return Path(target)
    match = re.fullmatch(r"-?\d+<(.+)>", value)
    if match is None:
        raise ValueError(f"unresolved strace dirfd: {value}")
    target = match.group(1).removesuffix(" (deleted)")
    if not target.startswith("/"):
        raise ValueError(f"non-path strace dirfd: {value}")
    return Path(target)


def _trace_int(value: str) -> int:
    token = value.strip()
    if re.fullmatch(r"(?:0[xX][0-9a-fA-F]+|[0-9]+)", token) is None:
        raise ValueError(f"unresolved strace integer: {value}")
    return int(token, 0)


def _validate_canonical_value(value: Any) -> None:
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, int) and not isinstance(value, bool):
        if not -(2**53 - 1) <= value <= 2**53 - 1:
            raise ValueError("integers must fit the RFC 8785 interoperable safe range")
        return
    if isinstance(value, float):
        raise ValueError("floats are forbidden in the restricted JCS profile")
    if isinstance(value, str):
        if not all(0x20 <= ord(ch) <= 0x7E for ch in value) or unicodedata.normalize("NFC", value) != value:
            raise ValueError("strings must be printable ASCII/NFC")
        return
    if isinstance(value, list):
        for item in value:
            _validate_canonical_value(item)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or not all(0x20 <= ord(ch) <= 0x7E for ch in key):
                raise ValueError("object keys must be printable ASCII strings")
            _validate_canonical_value(item)
        return
    raise ValueError(f"unsupported canonical type: {type(value).__name__}")


def canonical_bytes(value: Any) -> bytes:
    _validate_canonical_value(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("ascii")


def example_manifest() -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "application_base": {"commit": "a" * 40, "tree": "b" * 40},
        "workplane_base": {"commit": "c" * 40, "tree": "d" * 40},
        "hermes": {
            "commit": "e" * 40,
            "tree": "f" * 40,
            "anchor_files": [
                {"path": f"/hermes/{i}.py", "sha256": f"{i}" * 64}
                for i in range(2, 5)
            ],
        },
        "plan": {"path": "/docs/plan.md", "sha256": "0" * 64},
        "prompt": {"path": "/docs/prompt.md", "sha256": "1" * 64},
        "review_inputs": [{"path": f"/reviews/{i}.md", "sha256": f"{i}" * 64} for i in range(2, 8)],
        "capture_root": "/captures",
        "mutable_inputs": [
            {"path": f"/input/{i}", "capture_name": str(i), "sha256": "8" * 64, "device_inode": f"1:{i}", "mode": "0644", "uid": "1000", "gid": "1000"}
            for i in range(4)
        ],
    }


def _tuple(obj: Any, name: str) -> None:
    if not isinstance(obj, dict) or set(obj) != {"commit", "tree"}:
        raise ValueError(f"{name} must contain only commit/tree")
    for field in ("commit", "tree"):
        if not isinstance(obj[field], str) or not re.fullmatch(r"[0-9a-f]{40}", obj[field]):
            raise ValueError(f"invalid {name}.{field}")


def _hash_path(obj: Any, name: str, *, absolute: bool = False) -> None:
    if not isinstance(obj, dict) or set(obj) != {"path", "sha256"}:
        raise ValueError(f"invalid {name} shape")
    path = obj["path"]
    if not isinstance(path, str) or not path or (absolute and not Path(path).is_absolute()):
        raise ValueError(f"invalid {name}.path")
    if not isinstance(obj["sha256"], str) or not HEX64.fullmatch(obj["sha256"]):
        raise ValueError(f"invalid {name}.sha256")


def _require_sorted_unique(items: list[dict[str, Any]], name: str) -> None:
    paths = [item["path"] for item in items]
    if paths != sorted(paths) or len(set(paths)) != len(paths):
        raise ValueError(f"{name} must be unique and sorted by path")


def validate_manifest(obj: Any) -> None:
    required = {"schema", "application_base", "workplane_base", "hermes", "plan", "prompt", "review_inputs", "capture_root", "mutable_inputs"}
    if not isinstance(obj, dict) or set(obj) != required or obj.get("schema") != SCHEMA:
        raise ValueError("invalid top-level manifest shape/schema")
    _tuple(obj["application_base"], "application_base")
    _tuple(obj["workplane_base"], "workplane_base")
    hermes = obj["hermes"]
    if not isinstance(hermes, dict) or set(hermes) != {"commit", "tree", "anchor_files"}:
        raise ValueError("invalid Hermes boundary")
    _tuple({"commit": hermes["commit"], "tree": hermes["tree"]}, "hermes")
    if not isinstance(hermes["anchor_files"], list) or len(hermes["anchor_files"]) != 3:
        raise ValueError("exactly three Hermes anchors are required")
    for index, item in enumerate(hermes["anchor_files"]):
        _hash_path(item, f"hermes.anchor_files[{index}]", absolute=True)
    _require_sorted_unique(hermes["anchor_files"], "Hermes anchors")
    for name in ("plan", "prompt"):
        _hash_path(obj[name], name, absolute=True)
    reviews = obj["review_inputs"]
    if not isinstance(reviews, list) or len(reviews) != 6:
        raise ValueError("exactly six review inputs are required")
    for index, item in enumerate(reviews):
        _hash_path(item, f"review_inputs[{index}]", absolute=True)
    _require_sorted_unique(reviews, "review inputs")
    if not isinstance(obj["capture_root"], str) or not Path(obj["capture_root"]).is_absolute() or ".." in Path(obj["capture_root"]).parts:
        raise ValueError("invalid capture_root")
    mutable = obj["mutable_inputs"]
    if not isinstance(mutable, list) or len(mutable) != 4:
        raise ValueError("exactly four mutable inputs are required")
    mutable_required = {"path", "capture_name", "sha256", "device_inode", "mode", "uid", "gid"}
    for index, item in enumerate(mutable):
        if not isinstance(item, dict) or set(item) != mutable_required:
            raise ValueError(f"invalid mutable_inputs[{index}] shape")
        if not isinstance(item["path"], str) or not Path(item["path"]).is_absolute():
            raise ValueError(f"invalid mutable_inputs[{index}].path")
        if not isinstance(item["capture_name"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", item["capture_name"]):
            raise ValueError(f"invalid mutable_inputs[{index}].capture_name")
        if not isinstance(item["sha256"], str) or not HEX64.fullmatch(item["sha256"]):
            raise ValueError(f"invalid mutable_inputs[{index}].sha256")
        if not isinstance(item["device_inode"], str) or not re.fullmatch(r"[0-9]+:[0-9]+", item["device_inode"]):
            raise ValueError(f"invalid mutable_inputs[{index}].device_inode")
        if not isinstance(item["mode"], str) or not re.fullmatch(r"[0-7]{4}", item["mode"]):
            raise ValueError(f"invalid mutable_inputs[{index}].mode")
        for field in ("uid", "gid"):
            if not isinstance(item[field], str) or not re.fullmatch(r"0|[1-9][0-9]{0,9}", item[field]):
                raise ValueError(f"invalid mutable_inputs[{index}].{field}")
    _require_sorted_unique(mutable, "mutable inputs")
    capture_names = [item["capture_name"] for item in mutable]
    if len(set(capture_names)) != len(capture_names):
        raise ValueError("mutable capture names must be unique")
    _validate_canonical_value(obj)


def validate_manifest_identity(obj: dict[str, Any]) -> None:
    if obj["plan"]["path"] != PLAN_PATH or obj["prompt"]["path"] != PROMPT_PATH:
        raise ValueError("manifest document identity mismatch")
    if tuple(item["path"] for item in obj["hermes"]["anchor_files"]) != EXPECTED_HERMES_ANCHORS:
        raise ValueError("manifest Hermes anchor identity/order mismatch")
    if tuple(item["path"] for item in obj["review_inputs"]) != EXPECTED_REVIEW_PATHS:
        raise ValueError("manifest review identity/order mismatch")
    expected_names = dict(EXPECTED_MUTABLE_INPUTS)
    if set(item["path"] for item in obj["mutable_inputs"]) != set(expected_names):
        raise ValueError("manifest mutable input identity mismatch")
    capture_root = Path(obj["capture_root"])
    if capture_root.parent != Path("/srv/agents/worktrees") or not re.fullmatch(r"\.r0a-input-captures-[a-z0-9][a-z0-9-]{7,63}", capture_root.name):
        raise ValueError("manifest capture root is not canonical")
    for item in obj["mutable_inputs"]:
        source = item["path"]
        if item["capture_name"] != expected_names[source]:
            raise ValueError("manifest mutable capture identity mismatch")


def validate_spec(obj: Any) -> None:
    required = {"schema", "plan_path", "prompt_path", "hermes_anchor_files", "review_inputs", "mutable_inputs"}
    if not isinstance(obj, dict) or set(obj) != required or obj.get("schema") != SPEC_SCHEMA:
        raise ValueError("invalid bootstrap spec shape/schema")
    if obj["plan_path"] != PLAN_PATH or obj["prompt_path"] != PROMPT_PATH:
        raise ValueError("bootstrap spec document paths are not canonical")
    anchors = obj["hermes_anchor_files"]
    reviews = obj["review_inputs"]
    mutable = obj["mutable_inputs"]
    if not isinstance(anchors, list) or len(anchors) != len(EXPECTED_HERMES_ANCHORS):
        raise ValueError("invalid Hermes anchor set")
    if not isinstance(reviews, list) or len(reviews) != len(EXPECTED_REVIEW_PATHS):
        raise ValueError("invalid review input set")
    if not isinstance(mutable, list) or len(mutable) != len(EXPECTED_MUTABLE_INPUTS):
        raise ValueError("invalid mutable input set")
    for index, item in enumerate(anchors):
        _hash_path(item, f"hermes_anchor_files[{index}]", absolute=True)
    for index, item in enumerate(reviews):
        _hash_path(item, f"review_inputs[{index}]", absolute=True)
    if tuple(item["path"] for item in anchors) != EXPECTED_HERMES_ANCHORS:
        raise ValueError("Hermes anchor identity/order mismatch")
    if tuple(item["path"] for item in reviews) != EXPECTED_REVIEW_PATHS:
        raise ValueError("review input identity/order mismatch")
    actual_mutable: list[tuple[str, str]] = []
    for index, item in enumerate(mutable):
        if not isinstance(item, dict) or set(item) != {"path", "name"}:
            raise ValueError(f"invalid mutable_inputs[{index}] shape")
        if not isinstance(item["path"], str) or not isinstance(item["name"], str):
            raise ValueError(f"invalid mutable_inputs[{index}]")
        actual_mutable.append((item["path"], item["name"]))
    if tuple(actual_mutable) != EXPECTED_MUTABLE_INPUTS:
        raise ValueError("mutable input identity/order mismatch")
    _validate_canonical_value(obj)


def validate_git_command(argv: list[str], hooks: Path) -> None:
    if not argv or Path(argv[0]) != Path("/usr/bin/git"):
        raise ValueError("Git executable is not pinned to /usr/bin/git")
    if not hooks.is_absolute():
        raise ValueError("hooks path must be absolute")
    hooks_fd, _ = _open_stable_directory(hooks)
    try:
        info = os.fstat(hooks_fd)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700 or os.listdir(hooks_fd):
            raise ValueError("hooks directory must be owner-only, non-symlink and empty")
    finally:
        os.close(hooks_fd)
    required = f"core.hooksPath={hooks}"
    hook_values: list[str] = []
    for index, argument in enumerate(argv):
        if argument == "-c" and index + 1 < len(argv) and argv[index + 1].lower().startswith("core.hookspath="):
            hook_values.append(argv[index + 1])
        if argument.lower().startswith("--config-env=core.hookspath="):
            raise ValueError("Git config-env may not override core.hooksPath")
    if hook_values != [required]:
        raise ValueError("git command must contain exactly one pinned empty core.hooksPath")


def verify_repo_tuple(repo: Path, expected: dict[str, str], hooks: Path, *, require_clean: bool) -> None:
    if not repo.is_absolute() or not hooks.is_absolute():
        raise ValueError("repository and hooks paths must be absolute")
    repo_fd, _ = _open_stable_directory(repo)
    try:
        _verify_repo_tuple_open(repo, expected, hooks, require_clean=require_clean, repo_fd=repo_fd)
    finally:
        os.close(repo_fd)


def _verify_repo_tuple_open(repo: Path, expected: dict[str, str], hooks: Path, *, require_clean: bool, repo_fd: int) -> None:
    _tuple(expected, "repository")
    base = [
        "/usr/bin/git",
        "-C",
        f"/proc/self/fd/{repo_fd}",
        "-c",
        f"core.hooksPath={hooks}",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
    ]
    env = {
        "PATH": "/usr/bin:/bin",
        "HOME": "/nonexistent",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_PAGER": "/usr/bin/cat",
    }

    def run(*arguments: str, allowed_exit: tuple[int, ...] = (0,)) -> bytes:
        argv = [*base, *arguments]
        validate_git_command(argv, hooks)
        result = subprocess.run(argv, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, pass_fds=(repo_fd,))
        if result.returncode not in allowed_exit:
            raise subprocess.CalledProcessError(result.returncode, argv, result.stdout, result.stderr)
        return result.stdout

    commit = run("rev-parse", "--verify", "HEAD").decode("ascii").strip()
    tree = run("rev-parse", "--verify", "HEAD^{tree}").decode("ascii").strip()
    if commit != expected["commit"] or tree != expected["tree"]:
        raise ValueError(f"repository tuple mismatch: {repo}")
    config_names = run("config", "--includes", "--name-only", "--list", "-z").split(b"\0")
    for raw_name in config_names:
        name = raw_name.decode("utf-8", "strict").lower()
        if name.startswith("filter.") or name == "core.attributesfile":
            raise ValueError(f"external Git filter/attributes configuration is forbidden: {repo}")
    tree_paths = run("ls-tree", "-r", "-z", "--name-only", commit).split(b"\0")
    for raw_path in tree_paths:
        if not raw_path:
            continue
        path = raw_path.decode("utf-8", "strict")
        if Path(path).name != ".gitattributes":
            continue
        attributes = run("show", f"{commit}:{path}")
        for line in attributes.splitlines():
            content = line.split(b"#", 1)[0].lower()
            if re.search(rb"(?:^|[ \t])[-!]?filter(?:=|[ \t]|$)", content):
                raise ValueError(f"Git filter attribute is forbidden: {repo}:{path}")
    info_attribute_text = run("rev-parse", "--git-path", "info/attributes").decode("utf-8", "strict").strip()
    info_attributes = Path(info_attribute_text)
    if not info_attributes.is_absolute():
        info_attributes = repo / info_attributes
    try:
        info_attributes.lstat()
    except FileNotFoundError:
        pass
    else:
        for line in read_regular_bytes(info_attributes).splitlines():
            if line.split(b"#", 1)[0].strip():
                raise ValueError(f"Git info/attributes must be empty: {repo}")
    if require_clean and run("status", "--porcelain=v1", "-z", "--untracked-files=all"):
        raise ValueError(f"repository is not clean: {repo}")


def _inside(path: Path, roots: list[Path]) -> bool:
    if not path.is_absolute():
        return False
    candidate = Path(os.path.normpath(os.fspath(path)))
    _assert_no_symlink_components(candidate)
    for root in roots:
        if not root.is_absolute():
            raise ValueError(f"write root must be absolute: {root}")
        lexical_root = Path(os.path.normpath(os.fspath(root)))
        _assert_no_symlink_components(lexical_root)
        if candidate == lexical_root or lexical_root in candidate.parents:
            return True
    return False


def _allowed_write(path: Path, roots: list[Path], exact_paths: list[Path]) -> bool:
    if _inside(path, roots):
        return True
    if not path.is_absolute():
        return False
    candidate = Path(os.path.normpath(os.fspath(path)))
    _assert_no_symlink_components(candidate)
    for exact in exact_paths:
        if not exact.is_absolute():
            raise ValueError("write allowlist path is not absolute")
        normal_exact = Path(os.path.normpath(os.fspath(exact)))
        _assert_no_symlink_components(normal_exact)
        if candidate == normal_exact:
            return True
    return False


def audit_trace_text(
    text: str,
    allowed_write_roots: list[Path],
    cwd: Path,
    allowed_write_paths: list[Path] | None = None,
    allowed_fixture_roots: list[Path] | None = None,
) -> None:
    allowed_write_paths = allowed_write_paths or []
    allowed_fixture_roots = allowed_fixture_roots or []
    network_calls = (
        "socket(", "socketpair(", "connect(", "bind(", "listen(", "accept(", "accept4(",
        "sendto(", "sendmsg(", "sendmmsg(", "recvfrom(", "recvmsg(", "recvmmsg(", "shutdown(",
        "getsockname(", "getpeername(", "getsockopt(", "setsockopt(",
    )
    current_cwd = Path(os.path.normpath(os.fspath(cwd)))
    shared_mappings: list[tuple[int, int]] = []
    for line in text.splitlines():
        stripped_line = line.lstrip()
        if any(stripped_line.startswith(call) for call in network_calls) or re.search(
            r"\d+<(?:socket|TCP|TCPv6|UDP|UDPv6|UNIX(?:-[A-Z]+)?|NETLINK)(?:[:<\[])", line
        ) is not None:
            raise ValueError("network syscall attempted")
        ioctl_match = re.match(r"\s*ioctl\((.*)\)\s+=", line)
        if ioctl_match is not None:
            ioctl_args = _split_trace_args(ioctl_match.group(1))
            if len(ioctl_args) < 2 or ioctl_args[1] not in SAFE_IOCTL_REQUESTS:
                raise ValueError(f"mutating or unknown ioctl attempted: {line}")
            continue
        symlink_match = re.match(r"\s*(symlink|symlinkat)\((.*)\)\s+=", line)
        if symlink_match is not None:
            symlink_args = _split_trace_args(symlink_match.group(2))
            if symlink_match.group(1) == "symlink":
                if len(symlink_args) < 2:
                    raise ValueError(f"truncated symlink trace: {line}")
                destination = _trace_arg_path(symlink_args[1])
                if not destination.is_absolute():
                    destination = current_cwd / destination
            else:
                if len(symlink_args) < 3:
                    raise ValueError(f"truncated symlinkat trace: {line}")
                destination = _trace_arg_path(symlink_args[2])
                if not destination.is_absolute():
                    destination = _trace_dirfd_base(symlink_args[1], current_cwd) / destination
            destination = Path(os.path.normpath(os.fspath(destination)))
            if not allowed_fixture_roots or not _inside(destination, allowed_fixture_roots):
                raise ValueError(f"symlink creation outside disposable fixture root: {destination}")
            continue
        clone_escape = (stripped_line.startswith("clone(") or stripped_line.startswith("clone3(")) and (
            "CLONE_NEW" in line or "CLONE_UNTRACED" in line
        )
        if any(stripped_line.startswith(call) for call in ESCAPE_CALLS) or clone_escape:
            raise ValueError(f"process/kernel escape syscall attempted: {line}")
        if re.match(r"\s*chdir\(", line) is not None:
            target_match = re.search(r'chdir\("((?:[^"\\]|\\.)*)"\)', line)
            if target_match is None:
                raise ValueError(f"unresolved cwd change: {line}")
            raw_target = bytes(target_match.group(1), "utf-8").decode("unicode_escape")
            target = Path(raw_target)
            if not target.is_absolute():
                target = current_cwd / target
            target = Path(os.path.normpath(os.fspath(target)))
            if re.search(r"=\s*0(?:\s|$)", line):
                current_cwd = target
            continue
        if stripped_line.startswith("fchdir("):
            target_match = re.search(r"fchdir\(\d+<([^>]+)>\)", line)
            if target_match is None:
                raise ValueError(f"unresolved fd cwd change: {line}")
            target = Path(target_match.group(1).removesuffix(" (deleted)"))
            if not target.is_absolute():
                raise ValueError(f"unresolved fd cwd change: {target}")
            if re.search(r"=\s*0(?:\s|$)", line):
                current_cwd = target
            continue
        mmap_match = re.match(r"\s*mmap2?\((.*)\)\s+=\s*(\S+)", line)
        if mmap_match is not None:
            mmap_args = _split_trace_args(mmap_match.group(1))
            if len(mmap_args) < 4:
                raise ValueError(f"truncated mmap trace: {line}")
            if "MAP_SHARED" in mmap_args[3]:
                if "PROT_WRITE" in mmap_args[2]:
                    raise ValueError(f"shared writable mapping attempted: {line}")
                if mmap_match.group(2) != "-1":
                    start = _trace_int(mmap_match.group(2))
                    length = _trace_int(mmap_args[1])
                    if length <= 0:
                        raise ValueError(f"invalid shared mapping length: {line}")
                    shared_mappings.append((start, start + length))
            continue
        protection_match = re.match(r"\s*(?:pkey_)?mprotect\((.*)\)\s+=", line)
        if protection_match is not None:
            protection_args = _split_trace_args(protection_match.group(1))
            if len(protection_args) < 3:
                raise ValueError(f"truncated mprotect trace: {line}")
            if "PROT_WRITE" in protection_args[2]:
                start = _trace_int(protection_args[0])
                end = start + _trace_int(protection_args[1])
                if any(start < mapped_end and mapped_start < end for mapped_start, mapped_end in shared_mappings):
                    raise ValueError(f"shared mapping made writable: {line}")
            continue
        munmap_match = re.match(r"\s*munmap\((.*)\)\s+=\s*0(?:\s|$)", line)
        if munmap_match is not None:
            munmap_args = _split_trace_args(munmap_match.group(1))
            if len(munmap_args) < 2:
                raise ValueError(f"truncated munmap trace: {line}")
            start = _trace_int(munmap_args[0])
            end = start + _trace_int(munmap_args[1])
            remaining: list[tuple[int, int]] = []
            for mapped_start, mapped_end in shared_mappings:
                if end <= mapped_start or start >= mapped_end:
                    remaining.append((mapped_start, mapped_end))
                    continue
                if mapped_start < start:
                    remaining.append((mapped_start, start))
                if end < mapped_end:
                    remaining.append((end, mapped_end))
            shared_mappings = remaining
            continue
        mremap_match = re.match(r"\s*mremap\((.*)\)\s+=", line)
        if mremap_match is not None and shared_mappings:
            mremap_args = _split_trace_args(mremap_match.group(1))
            if len(mremap_args) < 2:
                raise ValueError(f"truncated mremap trace: {line}")
            start = _trace_int(mremap_args[0])
            end = start + _trace_int(mremap_args[1])
            if any(start < mapped_end and mapped_start < end for mapped_start, mapped_end in shared_mappings):
                raise ValueError(f"shared mapping remap attempted: {line}")
            continue
        fd_mutating = any(stripped_line.startswith(call) for call in FD_MUTATING_CALLS)
        if fd_mutating:
            fd_match = re.search(r"(?:^|\s)(?:write|writev|pwrite64|pwritev|pwritev2|ftruncate|fallocate|fchmod|fchown|fsetxattr|fremovexattr|sendfile|copy_file_range|splice)\((\d+)(?:<(.+?)>)?,\s", line)
            if not fd_match:
                raise ValueError(f"unresolved inherited write fd: {line}")
            fd_number = int(fd_match.group(1))
            fd_target = fd_match.group(2)
            if fd_target is None:
                raise ValueError(f"unresolved inherited write fd: {line}")
            if fd_target.startswith("/dev/null<"):
                fd_target = "/dev/null"
            if fd_target == "/dev/null":
                continue
            if fd_target.startswith("pipe:[") and fd_number in (1, 2):
                continue
            if not fd_target.startswith("/") or not _allowed_write(Path(fd_target), allowed_write_roots, allowed_write_paths):
                raise ValueError(f"write fd outside allowlist: {fd_target}")
            continue
        mutating = any(stripped_line.startswith(call) for call in MUTATING_CALLS) or (
            (stripped_line.startswith("open(") or stripped_line.startswith("openat(") or stripped_line.startswith("openat2("))
            and any(flag in line for flag in WRITE_FLAGS)
        )
        if not mutating:
            continue
        if (("open(" in line or "openat(" in line or "openat2(" in line or "creat(" in line)
                and any(flag in line for flag in WRITE_FLAGS + ("creat(",))):
            failed_result = re.search(r"=\s*-1\b", line) is not None
            result_fd = re.search(r"=\s*(\d+)(?:<(.+)>)?\s*$", line)
            if result_fd is None and not failed_result:
                raise ValueError(f"mutating open result is unresolved: {line}")
            actual_target = result_fd.group(2) if result_fd is not None else None
            if actual_target is None and not failed_result:
                raise ValueError(f"mutating open has no kernel-resolved target: {line}")
            if actual_target is not None and actual_target.startswith("/dev/null<"):
                actual_target = "/dev/null"
            if actual_target == "/dev/null":
                continue
            if actual_target is not None:
                actual_target = actual_target.removesuffix(" (deleted)")
                if not actual_target.startswith("/") or not _allowed_write(Path(actual_target), allowed_write_roots, allowed_write_paths):
                    raise ValueError(f"mutating open resolved outside allowlist: {actual_target}")
        call_match = re.match(r"\s*([a-zA-Z0-9_]+)\((.*)\)\s+=", line)
        at_pairs = {
            "openat": ((0, 1),),
            "openat2": ((0, 1),),
            "mkdirat": ((0, 1),),
            "mknodat": ((0, 1),),
            "unlinkat": ((0, 1),),
            "fchmodat": ((0, 1),),
            "fchmodat2": ((0, 1),),
            "fchownat": ((0, 1),),
            "futimesat": ((0, 1),),
            "utimensat": ((0, 1),),
            "renameat": ((0, 1), (2, 3)),
            "renameat2": ((0, 1), (2, 3)),
            "linkat": ((0, 1), (2, 3)),
        }
        if call_match is not None and call_match.group(1) in at_pairs:
            args = _split_trace_args(call_match.group(2))
            for dirfd_index, path_index in at_pairs[call_match.group(1)]:
                if max(dirfd_index, path_index) >= len(args):
                    raise ValueError(f"truncated dirfd mutator: {line}")
                candidate = _trace_arg_path(args[path_index])
                if not candidate.is_absolute():
                    candidate = _trace_dirfd_base(args[dirfd_index], current_cwd) / candidate
                candidate = Path(os.path.normpath(os.fspath(candidate)))
                if not _allowed_write(candidate, allowed_write_roots, allowed_write_paths):
                    raise ValueError(f"write outside dirfd allowlist: {candidate}")
            continue
        matches = re.findall(r'"((?:[^"\\]|\\.)*)"', line)
        if not matches:
            raise ValueError(f"unresolved mutating syscall: {line}")
        relative_count = 0
        for match in matches:
            raw = bytes(match, "utf-8").decode("unicode_escape")
            candidate = Path(raw)
            if not candidate.is_absolute():
                relative_count += 1
                candidate = current_cwd / candidate
            if not _allowed_write(candidate, allowed_write_roots, allowed_write_paths):
                raise ValueError(f"write outside allowlist: {candidate}")
        at_style = any(stripped_line.startswith(call) for call in ("openat(", "openat2(", "unlinkat(", "renameat(", "renameat2(", "mkdirat(", "fchmodat(", "fchmodat2(", "fchownat(", "futimesat(", "symlinkat(", "linkat("))
        if at_style and relative_count > line.count("AT_FDCWD"):
            raise ValueError(f"unresolved relative dirfd in mutating syscall: {line}")


def _assert_no_symlink_components(path: Path) -> None:
    absolute = path.absolute()
    current = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            return
        if stat.S_ISLNK(info.st_mode):
            raise ValueError(f"symlink path component forbidden: {current}")


def _open_stable_parent(path: Path, *, expected_identity: tuple[int, int] | None = None) -> tuple[int, tuple[int, int]]:
    parent = path.parent
    before = parent.stat(follow_symlinks=False)
    before_identity = (before.st_dev, before.st_ino)
    if expected_identity is not None and before_identity != expected_identity:
        raise ValueError(f"parent identity drift: {parent}")
    _assert_no_symlink_components(parent)
    fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        after = parent.stat(follow_symlinks=False)
        after_identity = (after.st_dev, after.st_ino)
        if (opened.st_dev, opened.st_ino) != before_identity or after_identity != before_identity:
            raise ValueError(f"parent identity drift: {parent}")
        return fd, before_identity
    except BaseException:
        os.close(fd)
        raise


def _open_stable_directory(path: Path, *, expected_identity: tuple[int, int] | None = None) -> tuple[int, tuple[int, int]]:
    if not path.is_absolute() or ".." in path.parts or path.name in {"", ".", ".."}:
        raise ValueError("directory path must be absolute and lexically normalised")
    parent_fd, _ = _open_stable_parent(path)
    try:
        before = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
        identity = (before.st_dev, before.st_ino)
        if expected_identity is not None and identity != expected_identity:
            raise ValueError(f"directory identity drift: {path}")
        fd = os.open(path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=parent_fd)
        try:
            opened = os.fstat(fd)
            after = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
            if (opened.st_dev, opened.st_ino) != identity or (after.st_dev, after.st_ino) != identity:
                raise ValueError(f"directory identity drift: {path}")
            return fd, identity
        except BaseException:
            os.close(fd)
            raise
    finally:
        os.close(parent_fd)


def read_regular_bytes(path: Path) -> bytes:
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("input path must be absolute and lexically normalised")
    parent_fd, parent_identity = _open_stable_parent(path)
    fd = os.open(path.name, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"input is not a regular file: {path}")
        chunks: list[bytes] = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns
        ):
            raise ValueError(f"input changed during read: {path}")
        path_stat = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
        if (after.st_dev, after.st_ino) != (path_stat.st_dev, path_stat.st_ino):
            raise ValueError(f"input path identity drift: {path}")
        lexical_parent = path.parent.stat(follow_symlinks=False)
        if (lexical_parent.st_dev, lexical_parent.st_ino) != parent_identity:
            raise ValueError(f"input parent identity drift: {path.parent}")
        return b"".join(chunks)
    finally:
        os.close(fd)
        os.close(parent_fd)


def _verify_private_file(path: Path) -> None:
    parent_fd, _ = _open_stable_parent(path)
    fd = os.open(path.name, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        info = os.fstat(fd)
        readback = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
        if (info.st_dev, info.st_ino) != (readback.st_dev, readback.st_ino):
            raise ValueError(f"private file identity drift: {path}")
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError(f"file is not an owner-only regular file: {path}")
    finally:
        os.close(fd)
        os.close(parent_fd)


def _verify_owned_directory(path: Path, *, exact_mode: int | None = None) -> None:
    fd, _ = _open_stable_directory(path)
    try:
        info = os.fstat(fd)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
            raise ValueError(f"directory is not owned by the current uid: {path}")
        mode = stat.S_IMODE(info.st_mode)
        if exact_mode is not None and mode != exact_mode:
            raise ValueError(f"directory mode must be {exact_mode:04o}: {path}")
        if mode & 0o022:
            raise ValueError(f"directory is group/world writable: {path}")
    finally:
        os.close(fd)


def prepare_private_dir(path: Path) -> tuple[int, int]:
    if not path.is_absolute() or ".." in path.parts or path.name in {"", ".", ".."}:
        raise ValueError("private directory path must be absolute and lexically normalised")
    parent_fd, parent_identity = _open_stable_parent(path)
    try:
        parent_info = os.fstat(parent_fd)
        parent_mode = stat.S_IMODE(parent_info.st_mode)
        if not stat.S_ISDIR(parent_info.st_mode) or parent_info.st_uid != os.getuid() or parent_mode & 0o022:
            raise ValueError(f"private directory parent is not safely owned: {path.parent}")
        os.mkdir(path.name, mode=0o700, dir_fd=parent_fd)
        child_fd = os.open(path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=parent_fd)
        try:
            info = os.fstat(child_fd)
            readback = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
            if (info.st_dev, info.st_ino) != (readback.st_dev, readback.st_ino):
                raise ValueError(f"private directory identity drift: {path}")
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
                raise ValueError(f"private directory is not owner-only: {path}")
            if os.listdir(child_fd):
                raise ValueError(f"private directory must be empty: {path}")
            lexical_parent = path.parent.stat(follow_symlinks=False)
            lexical_child = path.stat(follow_symlinks=False)
            if (lexical_parent.st_dev, lexical_parent.st_ino) != parent_identity or (lexical_child.st_dev, lexical_child.st_ino) != (info.st_dev, info.st_ino):
                raise ValueError(f"private directory identity drift: {path}")
            return (info.st_dev, info.st_ino)
        finally:
            os.close(child_fd)
    finally:
        os.close(parent_fd)


def atomic_write_new(path: Path, data: bytes, *, mode: int = 0o600, expected_parent_identity: tuple[int, int] | None = None) -> None:
    if not path.is_absolute():
        raise ValueError("output path must be absolute")
    parent_identity = expected_parent_identity
    if parent_identity is None:
        parent_info = path.parent.stat(follow_symlinks=False)
        parent_identity = (parent_info.st_dev, parent_info.st_ino)
    _verify_owned_directory(path.parent)
    directory_fd, _ = _open_stable_parent(path, expected_identity=parent_identity)
    try:
        try:
            os.stat(path.name, dir_fd=directory_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise FileExistsError(path)
        temp_name = f".{path.name}.tmp-{os.getpid()}"
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(temp_name, flags, mode, dir_fd=directory_fd)
        try:
            view = memoryview(data)
            while view:
                written = os.write(fd, view)
                if written <= 0:
                    raise OSError("short write")
                view = view[written:]
            os.fsync(fd)
        except BaseException:
            os.close(fd)
            try:
                os.unlink(temp_name, dir_fd=directory_fd)
            except FileNotFoundError:
                pass
            raise
        else:
            os.close(fd)
        temp_info = os.stat(temp_name, dir_fd=directory_fd, follow_symlinks=False)
        try:
            os.link(temp_name, path.name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd, follow_symlinks=False)
        except BaseException:
            try:
                os.unlink(temp_name, dir_fd=directory_fd)
            except FileNotFoundError:
                pass
            os.fsync(directory_fd)
            raise
        destination_info = os.stat(path.name, dir_fd=directory_fd, follow_symlinks=False)
        lexical_parent = path.parent.stat(follow_symlinks=False)
        destination_matches = (destination_info.st_dev, destination_info.st_ino) == (temp_info.st_dev, temp_info.st_ino)
        parent_matches = (lexical_parent.st_dev, lexical_parent.st_ino) == parent_identity
        if not destination_matches or not parent_matches:
            if destination_matches:
                os.unlink(path.name, dir_fd=directory_fd)
            os.unlink(temp_name, dir_fd=directory_fd)
            os.fsync(directory_fd)
            raise ValueError(f"output identity drift: {path}")
        os.fsync(directory_fd)
        os.unlink(temp_name, dir_fd=directory_fd)
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def capture_file(source: Path, destination: Path, *, destination_parent_identity: tuple[int, int] | None = None) -> dict[str, Any]:
    if not source.is_absolute() or not destination.is_absolute():
        raise ValueError("capture paths must be absolute")
    if ".." in source.parts or ".." in destination.parts or destination.name in {"", ".", ".."}:
        raise ValueError("capture paths must be lexically normalised")
    _verify_owned_directory(destination.parent, exact_mode=0o700)
    destination_parent_fd, destination_identity = _open_stable_parent(destination, expected_identity=destination_parent_identity)
    source_parent_fd, source_parent_identity = _open_stable_parent(source)
    fd = os.open(source.name, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=source_parent_fd)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"mutable input is not a regular file: {source}")
        chunks: list[bytes] = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns
        ):
            raise ValueError(f"input drift while reading: {source}")
        path_stat = os.stat(source.name, dir_fd=source_parent_fd, follow_symlinks=False)
        if (after.st_dev, after.st_ino) != (path_stat.st_dev, path_stat.st_ino):
            raise ValueError(f"input path identity drift: {source}")
        lexical_source_parent = source.parent.stat(follow_symlinks=False)
        if (lexical_source_parent.st_dev, lexical_source_parent.st_ino) != source_parent_identity:
            raise ValueError(f"mutable input parent identity drift: {source.parent}")
        data = b"".join(chunks)
        atomic_write_new(destination, data, expected_parent_identity=destination_identity)
        return {"path": str(source), "capture_path": str(destination), "sha256": hashlib.sha256(data).hexdigest(), "device_inode": f"{after.st_dev}:{after.st_ino}", "mode": f"{stat.S_IMODE(after.st_mode):04o}", "uid": after.st_uid, "gid": after.st_gid}
    finally:
        os.close(fd)
        os.close(source_parent_fd)
        os.close(destination_parent_fd)


def sha256_file(path: Path) -> str:
    if not path.is_absolute():
        raise ValueError("hashed path must be absolute")
    parent_fd, parent_identity = _open_stable_parent(path)
    fd = os.open(path.name, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"hashed input is not a regular file: {path}")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns
        ):
            raise ValueError(f"hashed input changed during read: {path}")
        path_stat = os.stat(path.name, dir_fd=parent_fd, follow_symlinks=False)
        if (after.st_dev, after.st_ino) != (path_stat.st_dev, path_stat.st_ino):
            raise ValueError(f"hashed input path identity drift: {path}")
        lexical_parent = path.parent.stat(follow_symlinks=False)
        if (lexical_parent.st_dev, lexical_parent.st_ino) != parent_identity:
            raise ValueError(f"hashed input parent identity drift: {path.parent}")
        return digest.hexdigest()
    finally:
        os.close(fd)
        os.close(parent_fd)


def validate_manifest_files(obj: dict[str, Any]) -> None:
    static_items = [obj["plan"], obj["prompt"], *obj["review_inputs"], *obj["hermes"]["anchor_files"]]
    for item in static_items:
        if sha256_file(Path(item["path"])) != item["sha256"]:
            raise ValueError(f"manifest file hash mismatch: {item['path']}")
    for item in obj["mutable_inputs"]:
        capture = Path(obj["capture_root"]) / item["capture_name"]
        _verify_owned_directory(capture.parent, exact_mode=0o700)
        _verify_private_file(capture)
        if sha256_file(capture) != item["sha256"]:
            raise ValueError(f"mutable capture hash mismatch: {capture}")


def build_manifest(*, application_base: dict[str, str], workplane_base: dict[str, str], hermes: dict[str, Any], plan: dict[str, str], prompt: dict[str, str], reviews: list[dict[str, str]], mutable_specs: list[dict[str, str]], capture_dir: Path) -> dict[str, Any]:
    if len(reviews) != 6 or len(mutable_specs) != 4:
        raise ValueError("six reviews and four mutable inputs are required")
    capture_dir_identity = prepare_private_dir(capture_dir)
    for item in reviews:
        if sha256_file(Path(item["path"])) != item["sha256"]:
            raise ValueError(f"review hash mismatch: {item['path']}")
    for item in (plan, prompt):
        if sha256_file(Path(item["path"])) != item["sha256"]:
            raise ValueError(f"document hash mismatch: {item['path']}")
    for item in hermes.get("anchor_files", []):
        if sha256_file(Path(item["path"])) != item["sha256"]:
            raise ValueError(f"Hermes anchor hash mismatch: {item['path']}")
    mutable = []
    for item in mutable_specs:
        captured = capture_file(
            Path(item["path"]),
            capture_dir / item["name"],
            destination_parent_identity=capture_dir_identity,
        )
        captured["capture_name"] = Path(captured.pop("capture_path")).name
        captured["uid"] = str(captured["uid"])
        captured["gid"] = str(captured["gid"])
        mutable.append(captured)
    manifest = {
        "schema": SCHEMA,
        "application_base": application_base,
        "workplane_base": workplane_base,
        "hermes": hermes,
        "plan": plan,
        "prompt": prompt,
        "review_inputs": sorted(reviews, key=lambda item: item["path"]),
        "capture_root": str(capture_dir),
        "mutable_inputs": sorted(mutable, key=lambda item: item["path"]),
    }
    validate_manifest(manifest)
    return manifest


def validate_create_paths(args: argparse.Namespace) -> str:
    if args.spec != SPEC_PATH:
        raise ValueError("bootstrap spec path is not canonical")
    if args.application_repo != APPLICATION_REPO or args.workplane_repo != WORKPLANE_REPO or args.hermes_repo != HERMES_REPO:
        raise ValueError("repository path is not canonical")
    for path in (args.output, args.capture_dir, args.hooks_dir):
        if not path.is_absolute() or ".." in path.parts or path.parent != WORKTREE_ROOT:
            raise ValueError("bootstrap output/control path is not canonical")
    match = re.fullmatch(r"\.r0a-empty-hooks-([a-z0-9][a-z0-9-]{7,63})", args.hooks_dir.name)
    if not match:
        raise ValueError("hooks path has no valid R0A nonce")
    nonce = match.group(1)
    if args.output.name != f".r0a-input-manifest-{nonce}.json" or args.capture_dir.name != f".r0a-input-captures-{nonce}":
        raise ValueError("bootstrap paths do not share one nonce")
    return nonce


def audit_trace_prefix(
    trace_prefix: Path,
    allowed_write_roots: list[Path],
    cwd: Path,
    allowed_write_paths: list[Path] | None = None,
    allowed_fixture_roots: list[Path] | None = None,
) -> None:
    allowed_write_paths = allowed_write_paths or []
    allowed_fixture_roots = allowed_fixture_roots or []
    if not trace_prefix.is_absolute() or not cwd.is_absolute() or not allowed_write_roots or any(not root.is_absolute() for root in allowed_write_roots) or any(not path.is_absolute() for path in allowed_write_paths) or any(not root.is_absolute() for root in allowed_fixture_roots):
        raise ValueError("trace audit paths must be absolute")
    parent_fd, _ = _open_stable_directory(trace_prefix.parent)
    try:
        parent_info = os.fstat(parent_fd)
        if parent_info.st_uid != os.getuid() or stat.S_IMODE(parent_info.st_mode) != 0o700:
            raise ValueError("trace parent must be owner-only")
        pattern = re.compile(re.escape(trace_prefix.name) + r"\.[1-9][0-9]*")
        names = sorted(name for name in os.listdir(parent_fd) if pattern.fullmatch(name))
        if not names:
            raise ValueError("no per-process trace files found")
        for name in names:
            fd = os.open(name, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=parent_fd)
            try:
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_size > 64 * 1024 * 1024:
                    raise ValueError("invalid trace file")
                chunks: list[bytes] = []
                while True:
                    chunk = os.read(fd, 1024 * 1024)
                    if not chunk:
                        break
                    chunks.append(chunk)
                text = b"".join(chunks).decode("utf-8", "strict")
            finally:
                os.close(fd)
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            if not lines or re.fullmatch(r"(?:exit|exit_group)\(0\)\s+=\s+\?", lines[-1]) is None:
                raise ValueError(f"trace shard did not complete successfully: {name}")
            audit_trace_text(text, allowed_write_roots, cwd, allowed_write_paths, allowed_fixture_roots)
    finally:
        os.close(parent_fd)


def run_audited_command(
    trace_prefix: Path,
    cwd: Path,
    allowed_write_roots: list[Path],
    allowed_write_paths: list[Path],
    env_overrides: list[str],
    command: list[str],
    allowed_fixture_roots: list[Path] | None = None,
) -> tuple[Path, Path]:
    allowed_fixture_roots = allowed_fixture_roots or []
    if not trace_prefix.is_absolute() or not cwd.is_absolute() or not command:
        raise ValueError("audited command paths and argv are required")
    executable = Path(command[0])
    if not executable.is_absolute():
        raise ValueError("audited executable must be absolute")
    resolved_executable = executable.resolve(strict=True)
    _assert_no_symlink_components(resolved_executable)
    executable_info = resolved_executable.stat(follow_symlinks=False)
    if not stat.S_ISREG(executable_info.st_mode):
        raise ValueError("audited executable must resolve to a regular file")
    command = [str(resolved_executable), *command[1:]]
    if any("\x00" in arg or any(ord(char) < 0x20 for char in arg) for arg in command):
        raise ValueError("audited argv contains control characters")
    env = dict(MINIMAL_ENV)
    for binding in env_overrides:
        key, separator, value = binding.partition("=")
        if separator != "=" or key not in {"TMPDIR", "PYTHONPYCACHEPREFIX"} or not value.startswith("/") or "\x00" in value or "\n" in value:
            raise ValueError("invalid audited environment override")
        env[key] = value
    parent_fd, _ = _open_stable_directory(trace_prefix.parent)
    stdout_path = trace_prefix.with_name(trace_prefix.name + "-stdout.bin")
    stderr_path = trace_prefix.with_name(trace_prefix.name + "-stderr.bin")
    output_fds: list[int] = []
    try:
        parent_info = os.fstat(parent_fd)
        if parent_info.st_uid != os.getuid() or stat.S_IMODE(parent_info.st_mode) != 0o700:
            raise ValueError("audited trace parent must be owner-only")
        if any(name.startswith(trace_prefix.name + ".") for name in os.listdir(parent_fd)):
            raise FileExistsError("audited trace prefix already exists")
        for output_path in (stdout_path, stderr_path):
            fd = os.open(
                output_path.name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                0o600,
                dir_fd=parent_fd,
            )
            output_fds.append(fd)
        previous_umask = os.umask(0o077)
        try:
            completed = subprocess.run(
                [
                    "/usr/bin/strace", "-ff", "-qq", "-s", "4096", "-yy",
                    "-e", "trace=all", "-o", str(trace_prefix), *command,
                ],
                cwd=cwd,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=output_fds[0],
                stderr=output_fds[1],
                close_fds=True,
                check=False,
            )
        finally:
            os.umask(previous_umask)
    finally:
        for fd in output_fds:
            os.close(fd)
        os.close(parent_fd)
    executable_post = resolved_executable.stat(follow_symlinks=False)
    if (executable_info.st_dev, executable_info.st_ino, executable_info.st_mode, executable_info.st_uid, executable_info.st_gid) != (
        executable_post.st_dev, executable_post.st_ino, executable_post.st_mode, executable_post.st_uid, executable_post.st_gid
    ):
        raise ValueError("audited executable identity drifted")
    audit_trace_prefix(
        trace_prefix,
        allowed_write_roots,
        cwd,
        [*allowed_write_paths, stdout_path, stderr_path],
        allowed_fixture_roots,
    )
    if completed.returncode != 0:
        raise ValueError(f"audited command failed with exit {completed.returncode}")
    _verify_private_file(stdout_path)
    _verify_private_file(stderr_path)
    return stdout_path, stderr_path


def verify_pins(bindings: list[str]) -> None:
    if not bindings:
        raise ValueError("at least one immutable pin is required")
    seen: set[Path] = set()
    for binding in bindings:
        expected, separator, raw_path = binding.partition("=")
        path = Path(raw_path)
        if separator != "=" or HEX64.fullmatch(expected) is None or not path.is_absolute() or path in seen:
            raise ValueError("invalid immutable pin")
        if sha256_file(path) != expected:
            raise ValueError(f"immutable pin mismatch: {path}")
        seen.add(path)


def write_failure_receipt(
    control_root: Path,
    nonce: str,
    phase: str,
    command_id: str,
    exit_code: int,
    bootstrap_sha256: str,
    test_sha256: str,
    schema_sha256: str,
) -> Path:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{7,63}", nonce):
        raise ValueError("invalid failure nonce")
    if control_root != WORKTREE_ROOT / f".r0a-control-{nonce}":
        raise ValueError("failure control root is not canonical")
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}", phase) or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,127}", command_id):
        raise ValueError("invalid failure phase/command id")
    if not isinstance(exit_code, int) or isinstance(exit_code, bool) or exit_code < 1 or exit_code > 255:
        raise ValueError("invalid failure exit code")
    for value in (bootstrap_sha256, test_sha256, schema_sha256):
        if not HEX64.fullmatch(value):
            raise ValueError("invalid failure receipt hash")
    control_fd, identity = _open_stable_directory(control_root)
    try:
        info = os.fstat(control_fd)
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError("failure control root must be owner-only")
    finally:
        os.close(control_fd)
    receipt = {
        "schema": "callscore.r0a_failure_receipt.v1",
        "nonce": nonce,
        "phase": phase,
        "command_id": command_id,
        "exit_code": exit_code,
        "bootstrap_sha256": bootstrap_sha256,
        "test_sha256": test_sha256,
        "manifest_schema_sha256": schema_sha256,
    }
    output = control_root / "failure-receipt.json"
    atomic_write_new(output, canonical_bytes(receipt), expected_parent_identity=identity)
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate")
    validate.add_argument("--manifest", type=Path, required=True)
    canon = sub.add_parser("canonicalize")
    canon.add_argument("--input", type=Path, required=True)
    canon.add_argument("--output", type=Path, required=True)
    audit = sub.add_parser("audit-trace")
    audit.add_argument("--trace-prefix", type=Path, required=True)
    audit.add_argument("--allowed-write-root", type=Path, action="append", required=True)
    audit.add_argument("--allowed-write-path", type=Path, action="append", default=[])
    audit.add_argument("--allowed-fixture-root", type=Path, action="append", default=[])
    audit.add_argument("--cwd", type=Path, required=True)
    audited_run = sub.add_parser("run-audited")
    audited_run.add_argument("--trace-prefix", type=Path, required=True)
    audited_run.add_argument("--allowed-write-root", type=Path, action="append", required=True)
    audited_run.add_argument("--allowed-write-path", type=Path, action="append", default=[])
    audited_run.add_argument("--allowed-fixture-root", type=Path, action="append", default=[])
    audited_run.add_argument("--cwd", type=Path, required=True)
    audited_run.add_argument("--env", action="append", default=[])
    audited_run.add_argument("argv", nargs=argparse.REMAINDER)
    pins = sub.add_parser("verify-pins")
    pins.add_argument("--pin", action="append", required=True)
    failure = sub.add_parser("write-failure-receipt")
    failure.add_argument("--control-root", type=Path, required=True)
    failure.add_argument("--nonce", required=True)
    failure.add_argument("--phase", required=True)
    failure.add_argument("--command-id", required=True)
    failure.add_argument("--exit-code", type=int, required=True)
    failure.add_argument("--bootstrap-sha256", required=True)
    failure.add_argument("--test-sha256", required=True)
    failure.add_argument("--schema-sha256", required=True)
    create = sub.add_parser("create")
    create.add_argument("--spec", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    create.add_argument("--capture-dir", type=Path, required=True)
    create.add_argument("--hooks-dir", type=Path, required=True)
    create.add_argument("--application-repo", type=Path, required=True)
    create.add_argument("--workplane-repo", type=Path, required=True)
    create.add_argument("--hermes-repo", type=Path, required=True)
    create.add_argument("--application-commit", required=True)
    create.add_argument("--application-tree", required=True)
    create.add_argument("--workplane-commit", required=True)
    create.add_argument("--workplane-tree", required=True)
    create.add_argument("--hermes-commit", required=True)
    create.add_argument("--hermes-tree", required=True)
    create.add_argument("--plan-sha256", required=True)
    create.add_argument("--prompt-sha256", required=True)
    args = parser.parse_args()
    if args.command == "verify-pins":
        verify_pins(args.pin)
        return 0
    if args.command == "run-audited":
        command = args.argv[1:] if args.argv and args.argv[0] == "--" else args.argv
        stdout_path, stderr_path = run_audited_command(
            args.trace_prefix,
            args.cwd,
            args.allowed_write_root,
            args.allowed_write_path,
            args.env,
            command,
            args.allowed_fixture_root,
        )
        print(stdout_path)
        print(stderr_path)
        return 0
    if args.command == "audit-trace":
        audit_trace_prefix(args.trace_prefix, args.allowed_write_root, args.cwd, args.allowed_write_path, args.allowed_fixture_root)
        return 0
    if args.command == "write-failure-receipt":
        output = write_failure_receipt(
            args.control_root,
            args.nonce,
            args.phase,
            args.command_id,
            args.exit_code,
            args.bootstrap_sha256,
            args.test_sha256,
            args.schema_sha256,
        )
        print(output)
        return 0
    if args.command == "create":
        validate_create_paths(args)
        spec = load_json_strict(read_regular_bytes(args.spec))
        validate_spec(spec)
        application_base = {"commit": args.application_commit, "tree": args.application_tree}
        workplane_base = {"commit": args.workplane_commit, "tree": args.workplane_tree}
        hermes_tuple = {"commit": args.hermes_commit, "tree": args.hermes_tree}
        verify_repo_tuple(args.application_repo, application_base, args.hooks_dir, require_clean=True)
        verify_repo_tuple(args.workplane_repo, workplane_base, args.hooks_dir, require_clean=False)
        verify_repo_tuple(args.hermes_repo, hermes_tuple, args.hooks_dir, require_clean=True)
        obj = build_manifest(
            application_base=application_base,
            workplane_base=workplane_base,
            hermes={"commit": args.hermes_commit, "tree": args.hermes_tree, "anchor_files": spec["hermes_anchor_files"]},
            plan={"path": spec["plan_path"], "sha256": args.plan_sha256},
            prompt={"path": spec["prompt_path"], "sha256": args.prompt_sha256},
            reviews=spec["review_inputs"],
            mutable_specs=spec["mutable_inputs"],
            capture_dir=args.capture_dir,
        )
        validate_manifest_identity(obj)
        validate_manifest_files(obj)
        payload = canonical_bytes(obj)
        atomic_write_new(args.output, payload)
        print(hashlib.sha256(payload).hexdigest())
        return 0
    input_path = args.manifest if args.command == "validate" else args.input
    if args.command == "validate":
        _verify_private_file(input_path)
    input_bytes = read_regular_bytes(input_path)
    obj = load_json_strict(input_bytes)
    if args.command == "validate":
        validate_manifest(obj)
        validate_manifest_identity(obj)
        validate_manifest_files(obj)
        if input_bytes != canonical_bytes(obj):
            raise ValueError("manifest bytes are not canonical")
    else:
        payload = canonical_bytes(obj)
        atomic_write_new(args.output, payload)
        print(hashlib.sha256(payload).hexdigest())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
