#!/usr/bin/env python3
"""Evidence-only verifier contract for callscore.autonomy_implementation_report.v3.

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

PHASES = ("A0", *tuple("ABCDEFGHIJ"))
REVIEW_TYPES = ("contract", "implementation", "security")


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
    try:
        payload = json.loads(data)
        if payload.get("schema") != ref.get("schema"):
            errors.append(f"{label}: reference schema does not match artifact payload")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{label}: evidence must be JSON: {exc}")


def verify_json_receipt(
    ref: dict[str, Any], expected_schema: str, errors: list[str], label: str,
    required_fields: tuple[str, ...] = (),
) -> dict[str, Any] | None:
    verify_artifact(ref, errors, label)
    if ref.get("schema") != expected_schema:
        errors.append(f"{label}: expected schema {expected_schema}")
    path = Path(ref.get("path", ""))
    if not path.is_file():
        return None
    try:
        payload = load_json(path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{label}: invalid JSON: {exc}")
        return None
    if payload.get("schema") != expected_schema:
        errors.append(f"{label}: payload schema mismatch")
    for field in required_fields:
        if payload.get(field) in (None, "", []):
            errors.append(f"{label}: missing {field}")
    return payload


def verify_review_artifact(
    ref: dict[str, Any], expected_reviewer: str, expected_phase: str,
    expected_review_type: str, expected_target: dict[str, Any], errors: list[str], label: str,
) -> None:
    review = verify_json_receipt(
        ref, "callscore.phase_review_receipt.v1", errors, label,
        ("reviewer_agent_id", "phase_id", "review_type", "verdict", "target_tuple"),
    )
    path = Path(ref.get("path", ""))
    if review is None or not path.is_file():
        return
    if review.get("verdict") != "PASS":
        errors.append(f"{label}: review verdict is not PASS")
    if review.get("reviewer_agent_id") != expected_reviewer:
        errors.append(f"{label}: reviewer identity mismatch")
    if review.get("phase_id") != expected_phase or review.get("review_type") != expected_review_type:
        errors.append(f"{label}: phase/review type mismatch")
    if review.get("target_tuple") != expected_target:
        errors.append(f"{label}: immutable target tuple mismatch")


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
                "app_commit_sha": "app_commit_sha",
                "workplane_commit_sha": "workplane_commit_sha",
                "plan_commit_sha": "plan_commit_sha",
                "image_digest": "image_digest",
                "migration_version": "migration_version",
                "migration_sha256": "migration_sha256",
                "graph_version": "graph_version",
                "graph_source_sha256": "graph_source_sha256",
                "registry_sha256": "registry_sha256",
                "policy_sha256": "policy_sha256",
                "prompt_manifest_sha256": "prompt_manifest_sha256",
                "service_unit_sha256": "service_unit_sha256",
                "runtime_script_manifest_sha256": "runtime_script_manifest_sha256",
            }
            for report_key, manifest_key in manifest_bindings.items():
                if deployment.get(report_key) != deployment_payload.get(manifest_key):
                    errors.append(f"deployment manifest binding mismatch: {report_key}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"deployment manifest JSON invalid: {exc}")

    phases = report["phase_gates"]
    if set(phases.keys()) != set(PHASES):
        errors.append("phase gates must contain exactly A0-J")

    deployment = report["deployment_tuple"]
    expected_target = {
        "app_commit_sha": args.expected_app_sha,
        "workplane_commit_sha": args.expected_workplane_sha,
        "plan_commit_sha": args.expected_plan_sha,
        "graph_source_sha256": args.expected_graph_source_sha256,
        "migration_sha256": args.expected_migration_sha256,
        "runtime_script_manifest_sha256": args.expected_runtime_script_manifest_sha256,
        "image_digest": args.expected_image_digest,
        "prompt_manifest_sha256": args.expected_prompt_manifest_sha256,
    }
    for key, value in expected_target.items():
        if deployment.get(key) != value:
            errors.append(f"deployment tuple external binding mismatch: {key}")

    for phase in PHASES:
        gate = phases[phase]
        if gate["phase_id"] != phase or gate["target_tuple"] != expected_target:
            errors.append(f"phase {phase}: phase/target tuple mismatch")
        if report["final_status"] == "PASS" and gate["status"] != "PASS":
            errors.append(f"phase {phase} is not PASS")
        for field in ("red_receipt", "green_receipt", "refactor_receipt"):
            stage = field.removesuffix("_receipt").upper()
            payload = verify_json_receipt(
                gate[field], "callscore.phase_test_receipt.v1", errors, f"phase.{phase}.{field}",
                ("phase_id", "stage", "status", "target_tuple", "command", "exit_code"),
            )
            if payload and (payload.get("phase_id") != phase or payload.get("stage") != stage
                            or payload.get("status") != "PASS" or payload.get("target_tuple") != expected_target):
                errors.append(f"phase {phase}.{field}: semantic binding mismatch")
        reviewer_ids = [review["reviewer_agent_id"] for review in gate["reviews"]]
        if len(set(reviewer_ids)) != 3:
            errors.append(f"phase {phase}: reviewer identities must be distinct")
        if report["producer_agent_id"] in reviewer_ids:
            errors.append(f"phase {phase}: report producer cannot be a phase reviewer")
        review_types = [review["review_type"] for review in gate["reviews"]]
        if set(review_types) != set(REVIEW_TYPES):
            errors.append(f"phase {phase}: reviews must be contract, implementation, and security")
        for index, review in enumerate(gate["reviews"]):
            if report["final_status"] == "PASS" and review["verdict"] != "PASS":
                errors.append(f"phase {phase}: review {index} is not PASS")
            verify_review_artifact(
                review["review_artifact"], review["reviewer_agent_id"], phase,
                review["review_type"], expected_target, errors, f"phase.{phase}.review.{index}",
            )
            if review["phase_id"] != phase or review["target_tuple"] != expected_target:
                errors.append(f"phase {phase}: review {index} tuple mismatch")

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
            "provider_readback_receipt", "provider_object_rollback_receipt", "runtime_variant_rollback_receipt",
            "task_router_receipt", "tool_inheritance_receipt",
        ):
            if canary.get(field) is None:
                errors.append(f"PASS canary missing {field}")
        if report["blockers"]:
            errors.append("PASS requires an empty blockers array")

    activation_specs = {
        "approval_receipt": "callscore.autonomy_activation_approval_receipt.v1",
        "activation_receipt": "callscore.autonomy_activation_receipt.v1",
    }
    for field, expected_schema in activation_specs.items():
        ref = activation.get(field)
        if ref:
            payload = verify_json_receipt(
                ref, expected_schema, errors, f"live_activation.{field}",
                ("status", "report_id", "target_tuple"),
            )
            if payload and (payload.get("status") != "PASS" or payload.get("report_id") != report["report_id"]
                            or payload.get("target_tuple") != expected_target):
                errors.append(f"live_activation.{field}: semantic binding mismatch")

    canary_specs = {
        "execution_receipt": ("callscore.provider_execution_receipt.v1", ("status", "workflow_id", "operation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id")),
        "provider_readback_receipt": ("callscore.provider_readback_receipt.v1", ("status", "workflow_id", "operation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id", "external_url", "visibility")),
        "provider_object_rollback_receipt": ("callscore.provider_object_rollback_receipt.v1", ("status", "workflow_id", "operation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id", "external_url", "tested_disposition")),
        "runtime_variant_rollback_receipt": ("callscore.runtime_variant_rollback_receipt.v1", ("status", "trigger_measurement_id", "prior_variant_id", "restored_variant_id", "promotion_event_id", "registry_version")),
        "task_router_receipt": ("callscore.task_router_receipt.v1", ("status", "workflow_id")),
        "tool_inheritance_receipt": ("callscore.tool_inheritance_receipt.v1", ("status", "workflow_id")),
    }
    canary_payloads: dict[str, dict[str, Any]] = {}
    for field, (expected_schema, required_fields) in canary_specs.items():
        ref = canary.get(field)
        if ref:
            payload = verify_json_receipt(ref, expected_schema, errors, f"canary.{field}", required_fields)
            if payload:
                canary_payloads[field] = payload
                if payload.get("status") != "PASS":
                    errors.append(f"canary.{field}: status is not PASS")

    operation_id = canary.get("provider_operation_id")
    workflow_id = canary.get("workflow_id")
    execution = canary_payloads.get("execution_receipt")
    readback = canary_payloads.get("provider_readback_receipt")
    provider_rollback = canary_payloads.get("provider_object_rollback_receipt")
    for label, payload in (("execution", execution), ("readback", readback), ("provider rollback", provider_rollback)):
        if payload and (payload.get("operation_id") != operation_id or payload.get("workflow_id") != workflow_id):
            errors.append(f"canary {label}: workflow/operation mismatch")
    if execution and readback and provider_rollback:
        identity_fields = ("account_scope_hash", "action_name", "payload_sha256", "external_object_id")
        if any(execution.get(key) != readback.get(key) or execution.get(key) != provider_rollback.get(key) for key in identity_fields):
            errors.append("canary execution/readback/provider rollback identity mismatch")
        if readback.get("external_url") != canary.get("external_url") or readback.get("external_object_id") != canary.get("external_object_id"):
            errors.append("canary readback external identity mismatch")
        if provider_rollback.get("external_url") != canary.get("external_url") or provider_rollback.get("tested_disposition") not in ("DELETED", "REVERTED"):
            errors.append("canary provider rollback was not tested against the exact object")

    runtime_rollback = canary_payloads.get("runtime_variant_rollback_receipt")
    if runtime_rollback and runtime_rollback.get("prior_variant_id") == runtime_rollback.get("restored_variant_id"):
        errors.append("runtime variant rollback does not change variant")

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
    parser.add_argument("--expected-graph-source-sha256", required=True)
    parser.add_argument("--expected-migration-sha256", required=True)
    parser.add_argument("--expected-runtime-script-manifest-sha256", required=True)
    parser.add_argument("--expected-image-digest", required=True)
    parser.add_argument("--expected-prompt-manifest-sha256", required=True)
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
