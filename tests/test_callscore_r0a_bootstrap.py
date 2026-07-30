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
        for item, path in zip(manifest["mutable_inputs"], sorted(expected_names)):
            item["path"] = path
            item["capture_path"] = f"/srv/agents/worktrees/.r0a-input-captures-testnonce/{expected_names[path]}"
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
        invalid["mutable_inputs"][0]["capture_path"] = "relative"
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
        invalid["mutable_inputs"][0]["capture_path"] += "\u0000"
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
                MODULE.audit_trace_text('socket(AF_INET, SOCK_STREAM, IPPROTO_IP) = 3\n', [allowed], root)
            with self.assertRaises(ValueError):
                MODULE.audit_trace_text('socket(AF_UNIX, SOCK_STREAM, 0) = 3\n', [allowed], root)
            with self.assertRaises(ValueError):
                MODULE.audit_trace_text('openat(5, "relative", O_WRONLY|O_CREAT, 0666) = 6\n', [allowed], allowed)

    def test_trace_allows_write_under_allowlisted_root(self):
        with tempfile.TemporaryDirectory() as td:
            allowed = Path(td) / "allowed"
            allowed.mkdir()
            MODULE.audit_trace_text(f'openat(AT_FDCWD, "{allowed}/x", O_WRONLY|O_CREAT, 0666) = 3\n', [allowed], Path(td))

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
                Path(destination).write_bytes(b"intruder")
                return real_link(source, destination, **kwargs)

            with mock.patch.object(MODULE.os, "link", side_effect=race):
                with self.assertRaises(FileExistsError):
                    MODULE.atomic_write_new(output, b"new")
            self.assertEqual(output.read_bytes(), b"intruder")

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


if __name__ == "__main__":
    unittest.main()
