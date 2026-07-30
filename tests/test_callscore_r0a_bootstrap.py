import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest import mock

import jsonschema

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "callscore-r0a-bootstrap.py"
SPEC = importlib.util.spec_from_file_location("callscore_r0a_bootstrap", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BootstrapTests(unittest.TestCase):
    def canonical_manifest(self):
        manifest = MODULE.example_manifest()
        manifest["plan"]["path"] = MODULE.PLAN_PATH
        manifest["prompt"]["path"] = MODULE.PROMPT_PATH
        for item, path in zip(manifest["hermes"]["anchor_files"], MODULE.EXPECTED_HERMES_ANCHORS):
            item["path"] = path
        for item, path in zip(manifest["review_inputs"], MODULE.EXPECTED_REVIEW_PATHS):
            item["path"] = path
        expected_names = dict(MODULE.EXPECTED_MUTABLE_INPUTS)
        manifest["capture_root"] = "/srv/agents/worktrees/.r0a-input-captures-testnonce"
        for item, path in zip(manifest["mutable_inputs"], sorted(expected_names)):
            item["path"] = path
            item.pop("capture_path", None)
            item["capture_name"] = expected_names[path]
            item["uid"] = str(item["uid"])
            item["gid"] = str(item["gid"])
        return manifest

    def test_strict_json_rejects_duplicate_keys(self):
        with self.assertRaises(ValueError):
            MODULE.load_json_strict(b'{"a":1,"a":2}')

    def test_canonical_bytes_reject_float_non_ascii_control_and_unsafe_integer(self):
        with self.assertRaises(ValueError):
            MODULE.canonical_bytes({"x": 1.5})
        with self.assertRaises(ValueError):
            MODULE.canonical_bytes({"x": "é"})
        with self.assertRaises(ValueError):
            MODULE.canonical_bytes({"path": "/tmp/bad\u0000path"})
        with self.assertRaises(ValueError):
            MODULE.canonical_bytes({"x": 9_007_199_254_740_992})

    def test_validate_manifest_requires_six_sorted_review_inputs(self):
        manifest = MODULE.example_manifest()
        MODULE.validate_manifest(manifest)
        manifest["review_inputs"] = manifest["review_inputs"][:3]
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(manifest)

    def test_validate_manifest_rejects_malformed_anchor_and_mutable_entries(self):
        manifest = MODULE.example_manifest()
        manifest["hermes"]["anchor_files"] = [{"path": "/tmp/x", "sha256": "bad"}]
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(manifest)

        manifest = MODULE.example_manifest()
        manifest["mutable_inputs"][0].pop("device_inode")
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(manifest)

    def test_validate_manifest_identity_requires_exact_canonical_paths(self):
        manifest = MODULE.example_manifest()
        with self.assertRaises(ValueError):
            MODULE.validate_manifest_identity(manifest)

        manifest = self.canonical_manifest()
        MODULE.validate_manifest(manifest)
        MODULE.validate_manifest_identity(manifest)

    def test_validate_spec_rejects_wrong_canonical_paths_and_unsorted_inputs(self):
        spec = json.loads((Path(__file__).resolve().parents[1] / "docs/ops/callscore-r0a/bootstrap/input-spec.json").read_text())
        MODULE.validate_spec(spec)

        wrong = json.loads(json.dumps(spec))
        wrong["plan_path"] = "/tmp/plan.md"
        with self.assertRaises(ValueError):
            MODULE.validate_spec(wrong)

        wrong = json.loads(json.dumps(spec))
        wrong["review_inputs"] = list(reversed(wrong["review_inputs"]))
        with self.assertRaises(ValueError):
            MODULE.validate_spec(wrong)

    def test_validate_create_paths_requires_one_canonical_nonce(self):
        nonce = "testnonce"
        args = MODULE.argparse.Namespace(
            spec=MODULE.SPEC_PATH,
            application_repo=MODULE.APPLICATION_REPO,
            workplane_repo=MODULE.WORKPLANE_REPO,
            hermes_repo=MODULE.HERMES_REPO,
            output=MODULE.WORKTREE_ROOT / f".r0a-input-manifest-{nonce}.json",
            capture_dir=MODULE.WORKTREE_ROOT / f".r0a-input-captures-{nonce}",
            hooks_dir=MODULE.WORKTREE_ROOT / f".r0a-empty-hooks-{nonce}",
        )
        self.assertEqual(MODULE.validate_create_paths(args), nonce)
        args.output = MODULE.WORKTREE_ROOT / ".r0a-input-manifest-othernonce.json"
        with self.assertRaises(ValueError):
            MODULE.validate_create_paths(args)

    def test_json_schema_matches_strict_validator_for_security_boundaries(self):
        schema_path = Path(__file__).resolve().parents[1] / "docs/ops/callscore-r0a/bootstrap/callscore-r0a-input-manifest-v1.schema.json"
        schema = json.loads(schema_path.read_text())
        validator = jsonschema.Draft202012Validator(schema)
        manifest = self.canonical_manifest()
        MODULE.validate_manifest(manifest)
        MODULE.validate_manifest_identity(manifest)
        validator.validate(manifest)

        invalid = json.loads(json.dumps(manifest))
        invalid["hermes"]["anchor_files"] = []
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(invalid)
        self.assertTrue(list(validator.iter_errors(invalid)))

        invalid = json.loads(json.dumps(manifest))
        invalid["capture_root"] = "relative"
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(invalid)
        self.assertTrue(list(validator.iter_errors(invalid)))

        invalid = json.loads(json.dumps(manifest))
        invalid["review_inputs"][1]["path"] = invalid["review_inputs"][0]["path"]
        invalid["review_inputs"][1]["sha256"] = "f" * 64
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(invalid)
        self.assertTrue(list(validator.iter_errors(invalid)))

        invalid = json.loads(json.dumps(manifest))
        invalid["mutable_inputs"][0]["capture_name"] += "\u0000"
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(invalid)
        self.assertTrue(list(validator.iter_errors(invalid)))

        invalid = json.loads(json.dumps(manifest))
        invalid["mutable_inputs"][0]["uid"] = 1000.0
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(invalid)
        self.assertTrue(list(validator.iter_errors(invalid)))

        invalid = json.loads(json.dumps(manifest))
        invalid["mutable_inputs"][0]["capture_path"] = "/srv/agents/worktrees/.r0a-input-captures-othernonce/agent-snapshot.service"
        with self.assertRaises(ValueError):
            MODULE.validate_manifest(invalid)
        self.assertTrue(list(validator.iter_errors(invalid)))

    def test_git_requires_empty_owner_only_hooks_dir(self):
        with tempfile.TemporaryDirectory() as td:
            hooks = Path(td) / "hooks"
            hooks.mkdir(mode=0o700)
            MODULE.validate_git_command(["/usr/bin/git", "-c", f"core.hooksPath={hooks}", "status"], hooks)
            with self.assertRaises(ValueError):
                MODULE.validate_git_command(["/usr/bin/git", "status"], hooks)
            with self.assertRaises(ValueError):
                MODULE.validate_git_command(["/usr/bin/git", "-c", f"core.hooksPath={hooks}", "-c", "core.hooksPath=/tmp/evil", "status"], hooks)
            with self.assertRaises(ValueError):
                MODULE.validate_git_command(["/usr/bin/git", "-c", f"core.hooksPath={hooks}", "--config-env=core.hooksPath=EVIL", "status"], hooks)
            (hooks / "bad").write_text("x")
            with self.assertRaises(ValueError):
                MODULE.validate_git_command(["/usr/bin/git", "-c", f"core.hooksPath={hooks}", "status"], hooks)

    def test_verify_repo_tuple_checks_head_tree_and_cleanliness(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            repo = root / "repo"
            hooks = root / "hooks"
            repo.mkdir()
            hooks.mkdir(mode=0o700)
            env = {**os.environ, "GIT_AUTHOR_NAME": "T", "GIT_AUTHOR_EMAIL": "t@example.test", "GIT_COMMITTER_NAME": "T", "GIT_COMMITTER_EMAIL": "t@example.test"}
            base = ["/usr/bin/git", "-C", str(repo), "-c", f"core.hooksPath={hooks}"]
            subprocess.run([*base, "init", "-q"], check=True, env=env)
            (repo / "file").write_text("one")
            subprocess.run([*base, "add", "file"], check=True, env=env)
            subprocess.run([*base, "commit", "-q", "-m", "one"], check=True, env=env)
            commit = subprocess.check_output([*base, "rev-parse", "HEAD"], text=True).strip()
            tree = subprocess.check_output([*base, "rev-parse", "HEAD^{tree}"], text=True).strip()
            MODULE.verify_repo_tuple(repo, {"commit": commit, "tree": tree}, hooks, require_clean=True)
            linked_repo = root / "linked-repo"
            linked_repo.symlink_to(repo, target_is_directory=True)
            with self.assertRaises((OSError, ValueError)):
                MODULE.verify_repo_tuple(linked_repo, {"commit": commit, "tree": tree}, hooks, require_clean=True)
            subprocess.run([*base, "config", "CoRe.AtTrIbUtEsFiLe", str(root / "attrs")], check=True)
            with self.assertRaises(ValueError):
                MODULE.verify_repo_tuple(repo, {"commit": commit, "tree": tree}, hooks, require_clean=True)
            subprocess.run([*base, "config", "--unset-all", "CoRe.AtTrIbUtEsFiLe"], check=True)
            subprocess.run([*base, "config", "extensions.worktreeConfig", "true"], check=True)
            subprocess.run([*base, "config", "--worktree", "filter.evil.clean", "/bin/true"], check=True)
            with self.assertRaises(ValueError):
                MODULE.verify_repo_tuple(repo, {"commit": commit, "tree": tree}, hooks, require_clean=True)
            subprocess.run([*base, "config", "--worktree", "--unset-all", "filter.evil.clean"], check=True)
            info_attributes = repo / ".git" / "info" / "attributes"
            info_attributes.write_text("*.txt filter=evil\n")
            with self.assertRaises(ValueError):
                MODULE.verify_repo_tuple(repo, {"commit": commit, "tree": tree}, hooks, require_clean=True)
            info_attributes.unlink()
            with self.assertRaises(ValueError):
                MODULE.verify_repo_tuple(repo, {"commit": "0" * 40, "tree": tree}, hooks, require_clean=True)

            (repo / ".gitattributes").write_text("*.txt filter=evil\n")
            subprocess.run([*base, "add", ".gitattributes"], check=True, env=env)
            subprocess.run([*base, "commit", "-q", "-m", "filter"], check=True, env=env)
            filtered_commit = subprocess.check_output([*base, "rev-parse", "HEAD"], text=True).strip()
            filtered_tree = subprocess.check_output([*base, "rev-parse", "HEAD^{tree}"], text=True).strip()
            with self.assertRaises(ValueError):
                MODULE.verify_repo_tuple(repo, {"commit": filtered_commit, "tree": filtered_tree}, hooks, require_clean=True)

            (repo / ".gitattributes").unlink()
            subprocess.run([*base, "add", "-u"], check=True, env=env)
            subprocess.run([*base, "commit", "-q", "-m", "remove filter"], check=True, env=env)
            clean_commit = subprocess.check_output([*base, "rev-parse", "HEAD"], text=True).strip()
            clean_tree = subprocess.check_output([*base, "rev-parse", "HEAD^{tree}"], text=True).strip()
            (repo / "file").write_text("dirty")
            with self.assertRaises(ValueError):
                MODULE.verify_repo_tuple(repo, {"commit": clean_commit, "tree": clean_tree}, hooks, require_clean=True)
    def test_trace_rejects_external_write_and_any_network(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            allowed = root / "allowed"
            allowed.mkdir()
            with self.assertRaises(ValueError):
                MODULE.audit_trace_text('openat(AT_FDCWD, "/etc/x", O_WRONLY|O_CREAT, 0666) = 3\n', [allowed], root)
            with self.assertRaises(ValueError):
                MODULE.audit_trace_text('creat("/etc/x", 0666) = 3\n', [allowed], root)
            with self.assertRaises(ValueError):
                MODULE.audit_trace_text('socket(AF_INET, SOCK_STREAM, IPPROTO_IP) = 3\n', [allowed], root)
            with self.assertRaises(ValueError):
                MODULE.audit_trace_text('socket(AF_UNIX, SOCK_STREAM, 0) = 3\n', [allowed], root)
            with self.assertRaises(ValueError):
                MODULE.audit_trace_text('openat(5, "relative", O_WRONLY|O_CREAT, 0666) = 6\n', [allowed], allowed)

    def test_trace_allows_write_under_allowlisted_root(self):
        with tempfile.TemporaryDirectory() as td:
            allowed = Path(td) / "allowed"
            allowed.mkdir()
            MODULE.audit_trace_text(f'openat(AT_FDCWD, "{allowed}/x", O_WRONLY|O_CREAT, 0666) = 3<{allowed}/x>\n', [allowed], Path(td))
            MODULE.audit_trace_text(f'write(5<{allowed}/x>, "x", 1) = 1\n', [allowed], Path(td))
            MODULE.audit_trace_text('write(1<pipe:[123]>, "ok", 2) = 2\n', [allowed], Path(td))

    def test_trace_requires_kernel_resolved_target_for_mutating_open(self):
        with tempfile.TemporaryDirectory() as td:
            allowed = Path(td) / "allowed"
            allowed.mkdir()
            trace = f'openat(AT_FDCWD, "{allowed}/x", O_WRONLY|O_CREAT, 0666) = 3\n'
            with self.assertRaises(ValueError):
                MODULE.audit_trace_text(trace, [allowed], Path(td))

    def test_trace_rejects_fd_only_writes_and_escape_syscalls(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            allowed = root / "allowed"
            allowed.mkdir()
            forbidden = [
                'write(7</etc/passwd>, "x", 1) = 1\n',
                'pwrite64(7</etc/passwd>, "x", 1, 0) = 1\n',
                'writev(7, [{iov_base="x", iov_len=1}], 1) = 1\n',
                'ptrace(PTRACE_ATTACH, 1) = 0\n',
                'unshare(CLONE_NEWNS) = 0\n',
                'setns(7, CLONE_NEWNS) = 0\n',
                'mount("none", "/tmp/x", "tmpfs", 0, NULL) = 0\n',
                'umount2("/tmp/x", MNT_DETACH) = 0\n',
                'bpf(BPF_MAP_CREATE, NULL, 0) = 3\n',
                'io_uring_setup(8, {}) = 3\n',
                'clone3({flags=CLONE_NEWUSER}, 88) = 42\n',
                'copy_file_range(4</tmp/in>, NULL, 5</etc/out>, NULL, 1, 0) = 1\n',
                'mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_SHARED, 7</etc/out>, 0) = 0x1\n',
                'keyctl(KEYCTL_READ, 1, NULL, 0) = 0\n',
            ]
            for trace in forbidden:
                with self.subTest(trace=trace), self.assertRaises(ValueError):
                    MODULE.audit_trace_text(trace, [allowed], root)

    def test_trace_rejects_cwd_shift_signals_and_extended_mutators(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            allowed = root / "allowed"
            allowed.mkdir()
            forbidden = [
                'chdir("/etc") = 0\ncreat("relative-after-chdir", 0600) = 3</etc/relative-after-chdir>\n',
                'fchdir(9</etc>) = 0\ncreat("relative-after-fchdir", 0600) = 3</etc/relative-after-fchdir>\n',
                'kill(1234, SIGTERM) = 0\n',
                'tkill(1234, SIGKILL) = 0\n',
                'tgkill(1234, 1235, SIGSTOP) = 0\n',
                'pidfd_send_signal(7, SIGTERM, NULL, 0) = 0\n',
                f'symlink("target", "{allowed}/link") = 0\n',
                'fchmodat2(AT_FDCWD, "/etc/x", 0600, 0) = 0\n',
                'futimesat(AT_FDCWD, "/etc/x", NULL) = 0\n',
                f'renameat(7</etc>, "passwd", AT_FDCWD<{allowed}>, "{allowed}/out") = 0\n',
                'ioctl(9</etc/passwd>, FS_IOC_SETFLAGS, [FS_IMMUTABLE_FL]) = 0\n',
                f'renameat2(AT_FDCWD<{allowed}>, "{allowed}/a", AT_FDCWD<{allowed}>, "{allowed}/b", {{BROKEN) = 0\n',
            ]
            for trace in forbidden:
                with self.subTest(trace=trace), self.assertRaises(ValueError):
                    MODULE.audit_trace_text(trace, [allowed], allowed)

    def test_prompt_defines_minimal_bootstrap_git_admin_and_failure_contracts(self):
        prompt = (SCRIPT.parents[1] / "docs/prompts/2026-07-30-callscore-r0a-maintenance-preparation-prompt.md").read_text()
        self.assertIn("/usr/bin/env -i HOME=/nonexistent PATH=/usr/bin:/bin", prompt)
        self.assertIn("R0A_GIT_ADMIN_ALLOWLIST", prompt)
        self.assertIn(".git/objects/", prompt)
        self.assertIn("new loose objects only", prompt)
        self.assertIn("failed nonce is never reused", prompt)
        self.assertIn(".r0a-control-$R0A_NONCE/failure-receipt.json", prompt)
        self.assertIn("bootstrap validator plus the committed Draft 2020-12 schema form the composite runtime boundary", prompt)
        self.assertIn("audit-trace --trace-prefix", prompt)
        self.assertIn('"HOME": "/nonexistent"', SCRIPT.read_text())

    def test_audit_trace_prefix_requires_owner_only_per_process_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            root.chmod(0o700)
            allowed = root / "allowed"
            allowed.mkdir(mode=0o700)
            prefix = root / "trace"
            (root / "trace.123").write_text(
                f'openat(AT_FDCWD<{allowed}>, "x", O_WRONLY|O_CREAT, 0600) = 3<{allowed}/x>\nexit_group(0) = ?\n'
            )
            MODULE.audit_trace_prefix(prefix, [allowed], allowed)
            (root / "trace.124").symlink_to(root / "trace.123")
            with self.assertRaises(OSError):
                MODULE.audit_trace_prefix(prefix, [allowed], allowed)

            (root / "trace.124").unlink()
            exact = root / "exact.lock"
            (root / "trace.125").write_text(
                f'openat(AT_FDCWD<{allowed}>, "{exact}", O_WRONLY|O_CREAT, 0600) = 4<{exact}>\nexit_group(0) = ?\n'
            )
            MODULE.audit_trace_prefix(prefix, [allowed], allowed, [exact])
            sibling = root / "unexpected"
            (root / "trace.126").write_text(
                f'openat(AT_FDCWD<{allowed}>, "{sibling}", O_WRONLY|O_CREAT, 0600) = 5<{sibling}>\nexit_group(0) = ?\n'
            )
            with self.assertRaises(ValueError):
                MODULE.audit_trace_prefix(prefix, [allowed], allowed, [exact])

    def test_trace_prefix_rejects_incomplete_or_failed_process_trace(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            root.chmod(0o700)
            allowed = root / "allowed"
            allowed.mkdir(mode=0o700)
            prefix = root / "trace"
            (root / "trace.123").write_text('read(0</dev/null>, "", 1) = 0\n')
            with self.assertRaises(ValueError):
                MODULE.audit_trace_prefix(prefix, [allowed], allowed)
            (root / "trace.123").write_text("exit_group(1) = ?\n")
            with self.assertRaises(ValueError):
                MODULE.audit_trace_prefix(prefix, [allowed], allowed)

    def test_failure_receipt_has_exact_create_only_contract(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            nonce = "testnonce"
            control = root / f".r0a-control-{nonce}"
            control.mkdir(mode=0o700)
            old_root = MODULE.WORKTREE_ROOT
            setattr(MODULE, "WORKTREE_ROOT", root)
            try:
                output = MODULE.write_failure_receipt(
                    control,
                    nonce,
                    "preworktree",
                    "bootstrap-unit-tests",
                    1,
                    "a" * 64,
                    "b" * 64,
                    "c" * 64,
                )
                receipt = MODULE.load_json_strict(output.read_bytes())
                self.assertEqual(
                    set(receipt),
                    {"schema", "nonce", "phase", "command_id", "exit_code", "bootstrap_sha256", "test_sha256", "manifest_schema_sha256"},
                )
                self.assertEqual(output.read_bytes(), MODULE.canonical_bytes(receipt))
                self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
                with self.assertRaises(FileExistsError):
                    MODULE.write_failure_receipt(control, nonce, "preworktree", "bootstrap-unit-tests", 1, "a" * 64, "b" * 64, "c" * 64)
            finally:
                setattr(MODULE, "WORKTREE_ROOT", old_root)

    def test_atomic_write_new_refuses_existing_path_and_symlink(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output = root / "manifest.json"
            MODULE.atomic_write_new(output, b"first")
            self.assertEqual(output.read_bytes(), b"first")
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                MODULE.atomic_write_new(output, b"second")

            target = root / "target"
            target.write_bytes(b"preserve")
            link = root / "link"
            link.symlink_to(target)
            with self.assertRaises(FileExistsError):
                MODULE.atomic_write_new(link, b"no")
            self.assertEqual(target.read_bytes(), b"preserve")

    def test_atomic_write_new_does_not_clobber_racing_destination(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            output = root / "output"
            real_link = os.link

            def race(source, destination, **kwargs):
                destination_fd = os.open(
                    destination,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                    0o600,
                    dir_fd=kwargs["dst_dir_fd"],
                )
                try:
                    os.write(destination_fd, b"intruder")
                finally:
                    os.close(destination_fd)
                return real_link(source, destination, **kwargs)

            with mock.patch.object(MODULE.os, "link", side_effect=race):
                with self.assertRaises(FileExistsError):
                    MODULE.atomic_write_new(output, b"new")
            self.assertEqual(output.read_bytes(), b"intruder")

    def test_atomic_write_new_rejects_parent_directory_substitution(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            expected = root / "expected"
            substitute = root / "substitute"
            displaced = root / "displaced"
            expected.mkdir()
            substitute.mkdir()
            output = expected / "manifest.json"
            real_verify = MODULE._verify_owned_directory

            def swap_after_verify(path, **kwargs):
                result = real_verify(path, **kwargs)
                expected.rename(displaced)
                substitute.rename(expected)
                return result

            with mock.patch.object(MODULE, "_verify_owned_directory", side_effect=swap_after_verify):
                with self.assertRaises(ValueError):
                    MODULE.atomic_write_new(output, b"new")
            self.assertFalse((expected / "manifest.json").exists())
            self.assertFalse((displaced / "manifest.json").exists())

    def test_read_regular_bytes_rejects_parent_directory_substitution(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            expected = root / "expected"
            substitute = root / "substitute"
            displaced = root / "displaced"
            expected.mkdir()
            substitute.mkdir()
            source = expected / "input"
            source.write_bytes(b"expected")
            (substitute / "input").write_bytes(b"substituted")
            real_assert = MODULE._assert_no_symlink_components

            def swap_after_check(path):
                result = real_assert(path)
                expected.rename(displaced)
                substitute.rename(expected)
                return result

            with mock.patch.object(MODULE, "_assert_no_symlink_components", side_effect=swap_after_check):
                with self.assertRaises(ValueError):
                    MODULE.read_regular_bytes(source)

    def test_prepare_private_dir_rejects_symlink_and_non_private_mode(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            private = root / "private"
            MODULE.prepare_private_dir(private)
            self.assertEqual(stat.S_IMODE(private.stat().st_mode), 0o700)
            with self.assertRaises(FileExistsError):
                MODULE.prepare_private_dir(private)

            public = root / "public"
            public.mkdir(mode=0o755)
            with self.assertRaises((ValueError, FileExistsError)):
                MODULE.prepare_private_dir(public)

            link = root / "linked"
            link.symlink_to(private, target_is_directory=True)
            with self.assertRaises((ValueError, FileExistsError)):
                MODULE.prepare_private_dir(link)

    def test_sha256_file_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            target = root / "target"
            target.write_bytes(b"bytes")
            link = root / "link"
            link.symlink_to(target)
            with self.assertRaises((OSError, ValueError)):
                MODULE.sha256_file(link)

    def test_capture_file_rejects_destination_escape_and_source_parent_symlink(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            private = root / "captures"
            MODULE.prepare_private_dir(private)
            source = root / "source"
            source.write_bytes(b"bytes")
            with self.assertRaises(ValueError):
                MODULE.capture_file(source, private / ".." / "escape")
            self.assertFalse((root / "escape").exists())

            real_parent = root / "real"
            real_parent.mkdir()
            (real_parent / "source").write_bytes(b"bytes")
            linked_parent = root / "linked"
            linked_parent.symlink_to(real_parent, target_is_directory=True)
            with self.assertRaises(ValueError):
                MODULE.capture_file(linked_parent / "source", private / "linked-capture")

    def test_build_manifest_hashes_reviews_and_captures_mutable_inputs(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            reviews = []
            for index in range(6):
                path = root / f"review-{index}.md"
                path.write_text(str(index))
                reviews.append({"path": str(path), "sha256": MODULE.sha256_file(path)})
            mutable = []
            for index in range(4):
                path = root / f"mutable-{index}"
                path.write_bytes(f"m{index}".encode())
                mutable.append({"path": str(path), "name": f"capture-{index}"})
            plan = root / "plan.md"
            prompt = root / "prompt.md"
            plan.write_text("plan")
            prompt.write_text("prompt")
            anchors = [
                {"path": item["path"], "sha256": item["sha256"]}
                for item in reviews[:3]
            ]
            manifest = MODULE.build_manifest(
                application_base={"commit": "a" * 40, "tree": "b" * 40},
                workplane_base={"commit": "c" * 40, "tree": "d" * 40},
                hermes={"commit": "e" * 40, "tree": "f" * 40, "anchor_files": anchors},
                plan={"path": str(plan), "sha256": MODULE.sha256_file(plan)},
                prompt={"path": str(prompt), "sha256": MODULE.sha256_file(prompt)},
                reviews=reviews,
                mutable_specs=mutable,
                capture_dir=root / "captures",
            )
            MODULE.validate_manifest(manifest)
            MODULE.validate_manifest_files(manifest)
            self.assertEqual(len(manifest["mutable_inputs"]), 4)
            self.assertTrue((root / "captures" / "capture-0").is_file())

    def test_prompt_pins_execution_path_dependency_loader_and_maintenance_home(self):
        prompt_path = Path(__file__).resolve().parents[1] / "docs/prompts/2026-07-30-callscore-r0a-maintenance-preparation-prompt.md"
        prompt = prompt_path.read_text()
        self.assertIn("/usr/bin/env -i HOME=/nonexistent PATH=/usr/bin:/bin", prompt)
        self.assertNotIn('npm --prefix "$APP_WORKTREE" run hygiene:secrets', prompt)
        self.assertIn(
            'python3 ops/hermes-state-maintenance/r0a_secret_scan.py --root "$APP_WORKTREE" --forbid-relative .tmp/.apify-token.local --require-gitignore-pattern .env --require-gitignore-pattern .env.local --require-gitignore-pattern .tmp/',
            prompt,
        )
        self.assertIn("Environment=HERMES_HOME=/var/lib/callscore-maintenance/state", prompt)
        self.assertIn("must not pass `--profile callscore`", prompt)
        plan_path = Path(__file__).resolve().parents[1] / "docs/plans/2026-07-30-callscore-full-system-recovery-and-activation.md"
        plan = plan_path.read_text()
        self.assertNotIn("hermes --profile callscore", plan)
        self.assertIn("Environment=HERMES_HOME=/var/lib/callscore-maintenance/state", plan)
        self.assertIn("/usr/local/bin/callscore-r1-maintenance optimize-storage --state-db /var/lib/callscore-maintenance/state/state.db --no-vacuum", plan)


if __name__ == "__main__":
    unittest.main()
