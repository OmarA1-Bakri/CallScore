#!/usr/bin/env python3
"""Evidence-only verifier contract for callscore.autonomy_implementation_report.v2.

This is a plan fixture. Production Phase J copies the predicates into
src/scripts/verify-callscore-autonomy-report.ts and keeps this fixture as the
cross-language oracle.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

PHASES = tuple("ABCDEFGHIJ")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def verify_artifact(ref: dict[str, Any], errors: list[str], label: str) -> None:
    path = Path(ref.get("path", ""))
    if not path.is_absolute():
        errors.append(f"{label}: path must be absolute")
        return
    if not path.is_file():
        errors.append(f"{label}: artifact missing: {path}")
        return
    data = path.read_bytes()
    if len(data) != ref.get("byte_length"):
        errors.append(f"{label}: byte_length mismatch")
    if sha256_bytes(data) != ref.get("sha256"):
        errors.append(f"{label}: sha256 mismatch")
    if ref.get("producer_agent_id") == ref.get("verifier_agent_id"):
        errors.append(f"{label}: producer and verifier must differ")


def verify_review_artifact(ref: dict[str, Any], expected_reviewer: str, expected_app_sha: str, errors: list[str], label: str) -> None:
    verify_artifact(ref, errors, label)
    path = Path(ref.get("path", ""))
    if not path.is_file():
        return
    try:
        review = load_json(path)
    except Exception as exc:  # noqa: BLE001 - verifier must report malformed evidence
        errors.append(f"{label}: review JSON invalid: {exc}")
        return
    if review.get("verdict") != "PASS":
        errors.append(f"{label}: review verdict is not PASS")
    if review.get("reviewer_agent_id") != expected_reviewer:
        errors.append(f"{label}: reviewer identity mismatch")
    if review.get("target_app_commit_sha") != expected_app_sha:
        errors.append(f"{label}: review target commit mismatch")


def verify_report(report: dict[str, Any], schema: dict[str, Any], args: argparse.Namespace) -> list[str]:
    errors: list[str] = []
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    for error in sorted(validator.iter_errors(report), key=lambda e: list(e.path)):
        errors.append(f"schema:{'/'.join(str(part) for part in error.path)}:{error.message}")

    if errors:
        return errors

    if report["producer_agent_id"] == report["verifier_agent_id"]:
        errors.append("report producer and verifier must differ")

    source = report["source_tuple"]
    expected = {
        "app_commit_sha": args.expected_app_sha,
        "workplane_commit_sha": args.expected_workplane_sha,
        "plan_commit_sha": args.expected_plan_sha,
        "plan_sha256": args.expected_plan_content_sha256,
        "manifest_sha256": args.expected_manifest_sha256,
    }
    for key, value in expected.items():
        if source.get(key) != value:
            errors.append(f"source_tuple.{key} mismatch")

    deployment_manifest = Path(args.deployment_manifest)
    if not deployment_manifest.is_file():
        errors.append("deployment manifest missing")
    else:
        deployment_bytes = deployment_manifest.read_bytes()
        deployment = report["deployment_tuple"]
        if sha256_bytes(deployment_bytes) != deployment["deployment_manifest_sha256"]:
            errors.append("deployment manifest hash mismatch")
        try:
            deployment_payload = json.loads(deployment_bytes)
            manifest_bindings = {
                "image_digest": "image_digest",
                "migration_version": "migration_version",
                "graph_version": "graph_version",
                "registry_sha256": "registry_sha256",
                "policy_sha256": "policy_sha256",
                "service_unit_sha256": "service_unit_sha256",
                "runtime_script_manifest_sha256": "runtime_script_manifest_sha256",
            }
            for report_key, manifest_key in manifest_bindings.items():
                if deployment.get(report_key) != deployment_payload.get(manifest_key):
                    errors.append(f"deployment manifest binding mismatch: {report_key}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"deployment manifest JSON invalid: {exc}")

    phases = report["phase_gates"]
    if tuple(sorted(phases.keys())) != PHASES:
        errors.append("phase gates must contain exactly A-J")

    for phase in PHASES:
        gate = phases[phase]
        if report["final_status"] == "PASS" and gate["status"] != "PASS":
            errors.append(f"phase {phase} is not PASS")
        for field in ("red_receipt", "green_receipt", "refactor_receipt"):
            verify_artifact(gate[field], errors, f"phase.{phase}.{field}")
        reviewer_ids = [review["reviewer_agent_id"] for review in gate["reviews"]]
        if len(set(reviewer_ids)) != 3:
            errors.append(f"phase {phase}: reviewer identities must be distinct")
        if report["producer_agent_id"] in reviewer_ids:
            errors.append(f"phase {phase}: report producer cannot be a phase reviewer")
        for index, review in enumerate(gate["reviews"]):
            if report["final_status"] == "PASS" and review["verdict"] != "PASS":
                errors.append(f"phase {phase}: review {index} is not PASS")
            verify_review_artifact(
                review["review_artifact"], review["reviewer_agent_id"], args.expected_app_sha,
                errors, f"phase.{phase}.review.{index}",
            )

    for index, ref in enumerate(report["receipts"]):
        verify_artifact(ref, errors, f"receipts.{index}")
    for index, blocker in enumerate(report["blockers"]):
        verify_artifact(blocker["evidence"], errors, f"blockers.{index}.evidence")

    activation = report["live_activation"]
    canary = report["canary"]
    if report["final_status"] == "PASS":
        if not activation["approved"] or not activation["approval_receipt"] or not activation["activation_receipt"]:
            errors.append("PASS requires approved live activation with approval and activation receipts")
        if canary["status"] != "PASS":
            errors.append("PASS requires a live provider-verified canary; BLOCKED_BY_GRAPH is not completion")
        for field in (
            "provider_operation_id", "external_object_id", "external_url", "execution_receipt",
            "provider_readback_receipt", "rollback_receipt", "task_router_receipt", "tool_inheritance_receipt",
        ):
            if canary.get(field) is None:
                errors.append(f"PASS canary missing {field}")
        if report["blockers"]:
            errors.append("PASS requires an empty blockers array")

    for field in (
        "approval_receipt", "activation_receipt",
    ):
        if activation.get(field):
            verify_artifact(activation[field], errors, f"live_activation.{field}")
    for field in (
        "execution_receipt", "provider_readback_receipt", "rollback_receipt",
        "task_router_receipt", "tool_inheritance_receipt",
    ):
        if canary.get(field):
            verify_artifact(canary[field], errors, f"canary.{field}")

    receipt_schema_expectations = {
        "task_router_receipt": "callscore.task_router_receipt.v1",
        "tool_inheritance_receipt": "callscore.tool_inheritance_receipt.v1",
    }
    for field, expected_schema in receipt_schema_expectations.items():
        ref = canary.get(field)
        if not ref:
            continue
        path = Path(ref["path"])
        if path.is_file():
            try:
                payload = load_json(path)
                if payload.get("schema") != expected_schema:
                    errors.append(f"canary.{field}: receipt schema mismatch")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{field} unreadable JSON: {exc}")

    operation_id = canary.get("provider_operation_id")
    readback = canary.get("provider_readback_receipt")
    rollback = canary.get("rollback_receipt")
    if isinstance(readback, dict):
        try:
            payload = load_json(Path(readback["path"]))
            if payload.get("schema") != "callscore.provider_readback_receipt.v1":
                errors.append("canary.provider_readback_receipt schema mismatch")
            if payload.get("operation_id") != operation_id or payload.get("status") != "PASS":
                errors.append("canary.provider_readback_receipt operation/status mismatch")
            if not payload.get("external_object_id") or not payload.get("external_url"):
                errors.append("canary.provider_readback_receipt missing external identity")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"canary.provider_readback_receipt unreadable JSON: {exc}")
    if isinstance(rollback, dict):
        try:
            payload = load_json(Path(rollback["path"]))
            if payload.get("schema") != "callscore.runtime_variant_rollback_receipt.v1" or payload.get("status") != "PASS":
                errors.append("canary.rollback_receipt schema/status mismatch")
            required = ("trigger_measurement_id", "prior_variant_id", "restored_variant_id", "promotion_event_id", "registry_version")
            if any(payload.get(key) in (None, "") for key in required):
                errors.append("canary.rollback_receipt missing bound rollback identity")
            if payload.get("prior_variant_id") == payload.get("restored_variant_id"):
                errors.append("canary.rollback_receipt does not change variant")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"canary.rollback_receipt unreadable JSON: {exc}")

    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True)
    parser.add_argument("--schema", required=True)
    parser.add_argument("--deployment-manifest", required=True)
    parser.add_argument("--expected-app-sha", required=True)
    parser.add_argument("--expected-workplane-sha", required=True)
    parser.add_argument("--expected-plan-sha", required=True)
    parser.add_argument("--expected-plan-content-sha256", required=True)
    parser.add_argument("--expected-manifest-sha256", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report_path = Path(args.report)
    schema_path = Path(args.schema)
    report_bytes = report_path.read_bytes()
    schema_bytes = schema_path.read_bytes()
    report = json.loads(report_bytes)
    schema = json.loads(schema_bytes)
    errors = verify_report(report, schema, args)
    receipt = {
        "schema": "callscore.autonomy_report_verification_receipt.v1",
        "status": "FAIL" if errors else "PASS",
        "report_sha256": sha256_bytes(report_bytes),
        "schema_sha256": sha256_bytes(schema_bytes),
        "verifier_script_sha256": sha256_bytes(Path(__file__).read_bytes()),
        "errors": errors,
    }
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, sort_keys=True))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
