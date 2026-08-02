#!/usr/bin/env python3
"""Evidence-only verifier contract for callscore.autonomy_implementation_report.v6.

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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker, ValidationError

PHASES = ("A0", *tuple("ABCDEFGHIJ"))
REVIEW_TYPES = ("contract", "implementation", "security")
EVIDENCE_VALIDATOR: Draft202012Validator | None = None
FROZEN_EVIDENCE: dict[Path, bytes] = {}
REVIEW_ATTESTATION_LEDGER: dict[str, dict[str, Any]] = {}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def artifact_paths(report: dict[str, Any]) -> set[Path]:
    """Collect every evidence path without trusting its semantic role."""
    paths: set[Path] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            candidate = value.get("path")
            if isinstance(candidate, str) and candidate:
                paths.add(Path(candidate).resolve(strict=False))
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(report)
    return paths


def frozen_json(path: Path) -> dict[str, Any]:
    """Parse semantics only from the exact byte snapshot captured before verification."""
    resolved = path.resolve(strict=False)
    data = FROZEN_EVIDENCE.get(resolved)
    if data is None:
        raise ValueError(f"path was not frozen: {resolved}")
    payload = json.loads(data)
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {resolved}")
    return payload


def verify_artifact(ref: dict[str, Any], errors: list[str], label: str) -> None:
    path = Path(ref.get("path", "")).resolve(strict=False)
    if not path.is_absolute():
        errors.append(f"{label}: path must be absolute")
        return
    if not path.is_file():
        errors.append(f"{label}: artifact missing: {path}")
        return
    data = FROZEN_EVIDENCE.get(path)
    if data is None:
        errors.append(f"{label}: artifact was not frozen before verification: {path}")
        return
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


def verify_raw_artifact(ref: dict[str, Any], errors: list[str], label: str) -> None:
    path = Path(ref.get("path", "")).resolve(strict=False)
    if not path.is_absolute() or not path.is_file():
        errors.append(f"{label}: raw artifact path must be absolute and present")
        return
    data = FROZEN_EVIDENCE.get(path)
    if data is None:
        errors.append(f"{label}: raw artifact was not frozen before verification")
        return
    if len(data) != ref.get("byte_length"):
        errors.append(f"{label}: raw byte_length mismatch")
    if sha256_bytes(data) != ref.get("sha256"):
        errors.append(f"{label}: raw sha256 mismatch")


def verify_json_receipt(
    ref: dict[str, Any], expected_schema: str, errors: list[str], label: str,
    required_fields: tuple[str, ...] = (),
) -> dict[str, Any] | None:
    verify_artifact(ref, errors, label)
    if ref.get("schema") != expected_schema:
        errors.append(f"{label}: expected schema {expected_schema}")
    path = Path(ref.get("path", "")).resolve(strict=False)
    if path not in FROZEN_EVIDENCE:
        return None
    try:
        payload = json.loads(FROZEN_EVIDENCE[path])
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{label}: invalid JSON: {exc}")
        return None
    if payload.get("schema") != expected_schema:
        errors.append(f"{label}: payload schema mismatch")
    if EVIDENCE_VALIDATOR is None:
        errors.append(f"{label}: evidence schema validator unavailable")
    else:
        for error in sorted(EVIDENCE_VALIDATOR.iter_errors(payload), key=lambda item: list(item.path)):
            errors.append(f"{label}:evidence-schema:{'/'.join(str(part) for part in error.path)}:{error.message}")
    if payload.get("producer_agent_id") != ref.get("producer_agent_id"):
        errors.append(f"{label}: producer identity differs between payload and artifact reference")
    if payload.get("verifier_agent_id") != ref.get("verifier_agent_id"):
        errors.append(f"{label}: verifier identity differs between payload and artifact reference")
    for field in required_fields:
        if payload.get(field) in (None, "", []):
            errors.append(f"{label}: missing {field}")
    return payload


def verify_review_artifact(
    ref: dict[str, Any], expected_reviewer: str, expected_phase: str,
    expected_review_type: str, expected_target: dict[str, Any], expected_subject_sha256: str,
    errors: list[str], label: str,
) -> None:
    review = verify_json_receipt(
        ref, "callscore.phase_review_receipt.v2", errors, label,
        ("reviewer_agent_id", "phase_id", "review_type", "verdict", "first_line", "target_tuple"),
    )
    path = Path(ref.get("path", ""))
    if review is None or not path.is_file():
        return
    if review.get("verdict") != "PASS":
        errors.append(f"{label}: review verdict is not PASS")
    if review.get("first_line") != "VERDICT: PASS":
        errors.append(f"{label}: literal first line is not VERDICT: PASS")
    if review.get("reviewer_agent_id") != expected_reviewer:
        errors.append(f"{label}: reviewer identity mismatch")
    if ref.get("producer_agent_id") != expected_reviewer:
        errors.append(f"{label}: review artifact producer is not the claimed reviewer")
    if review.get("phase_id") != expected_phase or review.get("review_type") != expected_review_type:
        errors.append(f"{label}: phase/review type mismatch")
    if review.get("target_tuple") != expected_target:
        errors.append(f"{label}: immutable target tuple mismatch")
    if review.get("reviewed_artifact_sha256") != [expected_subject_sha256]:
        errors.append(f"{label}: reviewed subject must be the exact phase bundle manifest")


def verify_review_execution_attestation(
    ref: dict[str, Any], expected_scope: str, expected_reviewer: str,
    expected_target: dict[str, Any], expected_subject_sha256: str,
    expected_review_output_sha256: str, errors: list[str], label: str,
) -> None:
    payload = verify_json_receipt(
        ref, "callscore.review_execution_attestation.v1", errors, label,
        ("status", "scope", "review_execution_id", "reviewer_agent_id", "hermes_session_id",
         "delegation_batch_id", "target_tuple", "reviewed_artifact_sha256",
         "review_output_sha256", "process_identity_sha256", "attested_by_role"),
    )
    if payload is None:
        return
    expected = {
        "status": "PASS", "scope": expected_scope, "reviewer_agent_id": expected_reviewer,
        "target_tuple": expected_target, "reviewed_artifact_sha256": expected_subject_sha256,
        "review_output_sha256": expected_review_output_sha256,
        "attested_by_role": "callscore-review-identity-attestor",
    }
    for key, value in expected.items():
        if payload.get(key) != value:
            errors.append(f"{label}: authenticated execution binding mismatch: {key}")
    if ref.get("producer_agent_id") != "callscore-review-identity-attestor":
        errors.append(f"{label}: attestation was not produced by the DB-authenticated identity role")
    ledger_row = REVIEW_ATTESTATION_LEDGER.get(str(payload.get("review_execution_id")))
    if ledger_row is None:
        errors.append(f"{label}: review execution is absent from the externally anchored DB attestation ledger")
    else:
        for key in (
            "scope", "reviewer_agent_id", "hermes_session_id", "delegation_batch_id",
            "target_tuple", "reviewed_artifact_sha256", "review_output_sha256",
            "process_identity_sha256", "verdict",
        ):
            expected_value = "PASS" if key == "verdict" else payload.get(key)
            if ledger_row.get(key) != expected_value:
                errors.append(f"{label}: DB attestation ledger mismatch: {key}")


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

    deployment_manifest = Path(args.deployment_manifest).resolve(strict=False)
    deployment_bytes = FROZEN_EVIDENCE.get(deployment_manifest)
    if deployment_bytes is None:
        errors.append("deployment manifest was not frozen")
    else:
        deployment = report["deployment_tuple"]
        if sha256_bytes(deployment_bytes) != args.expected_deployment_manifest_sha256:
            errors.append("deployment manifest does not match externally expected hash")
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
            if deployment_payload.get("phase_manifest_index_sha256") != args.expected_phase_manifest_index_sha256:
                errors.append("deployment manifest phase-manifest-index binding mismatch")

        except Exception as exc:  # noqa: BLE001
            errors.append(f"deployment manifest JSON invalid: {exc}")

    phases = report["phase_gates"]
    if set(phases.keys()) != set(PHASES):
        errors.append("phase gates must contain exactly A0-J")

    deployment = report["deployment_tuple"]
    phase_index_path = Path(args.phase_manifest_index).resolve(strict=False)
    phase_index_bytes = FROZEN_EVIDENCE.get(phase_index_path)
    phase_index: dict[str, Any] = {}
    if phase_index_bytes is None or sha256_bytes(phase_index_bytes) != args.expected_phase_manifest_index_sha256:
        errors.append("externally anchored phase manifest index missing or hash mismatch")
    else:
        try:
            phase_index = json.loads(phase_index_bytes)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"phase manifest index JSON invalid: {exc}")
    if phase_index.get("schema") != "callscore.phase_execution_manifest_index.v1" or set(phase_index.get("phases", {})) != set(PHASES):
        errors.append("phase manifest index schema/phase set mismatch")
    expected_repo_root = str(phase_index.get("repo_root", ""))
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
        phase_target = gate["target_tuple"]
        phase_spec = phase_index.get("phases", {}).get(phase, {})
        phase_manifest_path = Path(str(phase_spec.get("path", ""))).resolve(strict=False)
        phase_manifest_bytes = FROZEN_EVIDENCE.get(phase_manifest_path)
        if phase_manifest_bytes is None or sha256_bytes(phase_manifest_bytes) != phase_spec.get("sha256"):
            errors.append(f"phase {phase}: externally indexed phase manifest missing or hash mismatch")
        if phase_target.get("phase_manifest_sha256") != phase_spec.get("sha256"):
            errors.append(f"phase {phase}: report phase-manifest hash is not externally anchored")
        if gate["phase_id"] != phase or phase_target.get("phase_id") != phase:
            errors.append(f"phase {phase}: phase identity mismatch")
        if phase_target.get("plan_commit_sha") != args.expected_plan_sha:
            errors.append(f"phase {phase}: plan commit mismatch")
        if phase_target.get("phase_commit_sha") != phase_target.get("app_commit_sha"):
            errors.append(f"phase {phase}: phase commit must equal its app snapshot commit")
        if report["final_status"] == "PASS" and gate["status"] != "PASS":
            errors.append(f"phase {phase} is not PASS")
        for field in ("red_receipt", "green_receipt", "refactor_receipt"):
            stage = field.removesuffix("_receipt").upper()
            payload = verify_json_receipt(
                gate[field], "callscore.phase_test_receipt.v2", errors, f"phase.{phase}.{field}",
                ("phase_id", "stage", "status", "target_tuple", "command", "exit_code"),
            )
            if payload and (payload.get("phase_id") != phase or payload.get("stage") != stage
                            or payload.get("status") != "PASS" or payload.get("target_tuple") != phase_target):
                errors.append(f"phase {phase}.{field}: semantic binding mismatch")
            if payload:
                command = payload.get("command", [])
                if command != phase_spec.get("commands", {}).get(stage):
                    errors.append(f"phase {phase}.{field}: command does not match externally indexed phase command")
                if not command or not Path(command[0]).is_absolute() or not Path(command[0]).is_file() or not os.access(command[0], os.X_OK):
                    errors.append(f"phase {phase}.{field}: command executable must be absolute, present, and executable")
                elif sha256_bytes(FROZEN_EVIDENCE.get(Path(command[0]).resolve(strict=False), b"")) != payload.get("command_executable_sha256"):
                    errors.append(f"phase {phase}.{field}: command executable hash mismatch")
                if not Path(str(payload.get("cwd", ""))).is_absolute() or not Path(str(payload.get("cwd", ""))).is_dir():
                    errors.append(f"phase {phase}.{field}: cwd must be an absolute existing directory")
                if str(payload.get("cwd")) != expected_repo_root or payload.get("scope", {}).get("repo_root") != expected_repo_root:
                    errors.append(f"phase {phase}.{field}: cwd/scope repo root is not externally anchored")
                if payload.get("scope", {}).get("phase_manifest_sha256") != phase_target.get("phase_manifest_sha256"):
                    errors.append(f"phase {phase}.{field}: command scope is not bound to phase manifest")
                for stream in ("stdout", "stderr"):
                    raw_ref = payload.get(f"{stream}_artifact", {})
                    verify_raw_artifact(raw_ref, errors, f"phase.{phase}.{field}.{stream}_artifact")
                    if raw_ref.get("sha256") != payload.get(f"{stream}_sha256"):
                        errors.append(f"phase {phase}.{field}: {stream} digest/raw artifact mismatch")
                try:
                    started = datetime.fromisoformat(str(payload["started_at"]).replace("Z", "+00:00"))
                    finished = datetime.fromisoformat(str(payload["finished_at"]).replace("Z", "+00:00"))
                    if finished < started:
                        errors.append(f"phase {phase}.{field}: execution timestamps are reversed")
                except (KeyError, TypeError, ValueError):
                    errors.append(f"phase {phase}.{field}: execution timestamps are invalid")
                if stage == "RED" and payload.get("exit_code") == 0:
                    errors.append(f"phase {phase}.{field}: RED must preserve a nonzero expected failure")
                if stage in ("GREEN", "REFACTOR") and payload.get("exit_code") != 0:
                    errors.append(f"phase {phase}.{field}: {stage} requires exit 0")
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
                review["review_type"], phase_target, phase_target["phase_manifest_sha256"],
                errors, f"phase.{phase}.review.{index}",
            )
            verify_review_execution_attestation(
                review["review_execution_attestation"], "PHASE", review["reviewer_agent_id"],
                phase_target, phase_target["phase_manifest_sha256"], review["review_artifact"]["sha256"],
                errors, f"phase.{phase}.review.{index}.execution",
            )
            if review["phase_id"] != phase or review["target_tuple"] != phase_target:
                errors.append(f"phase {phase}: review {index} tuple mismatch")

    final_reviewer_ids = [review["reviewer_agent_id"] for review in report["final_reviews"]]
    final_review_types = [review["review_type"] for review in report["final_reviews"]]
    if len(set(final_reviewer_ids)) != 3 or set(final_review_types) != set(REVIEW_TYPES):
        errors.append("final reviews must have three distinct contract/implementation/security reviewers")
    if report["producer_agent_id"] in final_reviewer_ids:
        errors.append("report producer cannot be a final reviewer")
    for index, review in enumerate(report["final_reviews"]):
        ref = review["review_artifact"]
        payload = verify_json_receipt(
            ref, "callscore.final_review_receipt.v1", errors, f"final_review.{index}",
            ("review_type", "reviewer_agent_id", "verdict", "first_line", "target_tuple", "reviewed_artifact_sha256"),
        )
        if review.get("target_tuple") != expected_target or review.get("verdict") != "PASS" or review.get("first_line") != "VERDICT: PASS":
            errors.append(f"final review {index}: exact final target PASS binding mismatch")
        if ref.get("producer_agent_id") != review.get("reviewer_agent_id"):
            errors.append(f"final review {index}: artifact producer is not claimed reviewer")
        if payload and any(payload.get(key) != review.get(key) for key in ("review_type", "reviewer_agent_id", "verdict", "first_line", "target_tuple")):
            errors.append(f"final review {index}: payload/report binding mismatch")
        if payload and payload.get("reviewed_artifact_sha256") != [deployment["deployment_manifest_sha256"]]:
            errors.append(f"final review {index}: reviewed subject must be the exact deployment manifest")
        verify_review_execution_attestation(
            review["review_execution_attestation"], "FINAL", review["reviewer_agent_id"],
            expected_target, deployment["deployment_manifest_sha256"], review["review_artifact"]["sha256"],
            errors, f"final_review.{index}.execution",
        )

    canonical_receipt_schemas: set[str] = set()
    for index, ref in enumerate(report["receipts"]):
        payload = verify_json_receipt(
            ref, "callscore.canonical_operational_receipt_validation.v1", errors, f"receipts.{index}",
            ("status", "workflow_id", "subject_sha256", "receipt_schema", "receipt_artifact_id", "receipt_payload_sha256", "receipt_schema_sha256", "validated_at"),
        )
        if payload:
            if payload.get("status") != "PASS" or payload.get("workflow_id") != report["canary"].get("workflow_id") or payload.get("subject_sha256") != report["canary"].get("payload_sha256"):
                errors.append(f"receipts.{index}: canonical receipt exact subject binding mismatch")
            canonical_receipt_schemas.add(str(payload.get("receipt_schema")))
    if len(canonical_receipt_schemas) != len(report["receipts"]):
        errors.append("canonical receipt validations must have distinct receipt schemas")
    required_canonical_receipts = {
        "editorial_angle_receipt.v1", "platform_fit_receipt.v1", "visual_brief_receipt.v1",
        "visual_qa_receipt.v1", "copy_visual_coherence_receipt.v1", "same_shit_memory_receipt.v1",
    }
    if report["canary"].get("is_media"):
        required_canonical_receipts |= {
            "callscore.design_bundle_reference_receipt.v1", "callscore.website_design_alignment_receipt.v2",
            "callscore.branding_receipt.v2", "callscore.brand_lockup_occlusion_check.v1", "callscore.media_artifact_receipt.v2",
        }
    if report["canary"].get("is_youtube"):
        required_canonical_receipts |= {
            "youtube_script_receipt.v1", "youtube_packaging_receipt.v1", "youtube_thumbnail_receipt.v1",
            "youtube_publish_package_receipt.v1", "youtube_analytics_receipt.v1",
        }
    if report["final_status"] == "PASS" and canonical_receipt_schemas != required_canonical_receipts:
        errors.append("canonical receipt validation set does not exactly match canary media/YouTube class")
    for index, blocker in enumerate(report["blockers"]):
        verify_artifact(blocker["evidence"], errors, f"blockers.{index}.evidence")

    activation = report["live_activation"]
    canary = report["canary"]
    all_phase_gates_pass = all(
        phases[phase]["status"] == "PASS"
        and all(review["verdict"] == "PASS" for review in phases[phase]["reviews"])
        for phase in PHASES
    )
    if canary["status"] == "PASS" and not activation["approved"]:
        errors.append("canary PASS requires approved live activation")
    if report["final_status"] != "PASS" and activation["approved"] and canary["status"] == "PASS" and all_phase_gates_pass:
        errors.append("non-PASS report contradicts fully approved all-green evidence")
    if report["final_status"] == "PASS":
        if not activation["approved"] or not activation["approval_receipt"] or not activation["activation_receipt"]:
            errors.append("PASS requires approved live activation with approval and activation receipts")
        if canary["status"] != "PASS":
            errors.append("PASS requires a live provider-verified canary; BLOCKED_BY_GRAPH is not completion")
        for field in (
            "provider_operation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id", "external_url", "execution_receipt",
            "generation_id", "accepted_evaluation_id",
            "provider_readback_receipt", "provider_object_rollback_receipt", "runtime_variant_rollback_receipt",
            "task_router_receipt", "tool_inheritance_receipt",
        ):
            if canary.get(field) is None:
                errors.append(f"PASS canary missing {field}")
        if report["blockers"]:
            errors.append("PASS requires an empty blockers array")

    activation_specs = {
        "approval_receipt": "callscore.autonomy_activation_approval_receipt.v2",
        "activation_receipt": "callscore.autonomy_activation_receipt.v2",
    }
    activation_payloads: dict[str, dict[str, Any]] = {}
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
            if payload:
                activation_payloads[field] = payload
    approval_payload = activation_payloads.get("approval_receipt")
    activation_payload = activation_payloads.get("activation_receipt")
    if approval_payload and activation_payload:
        try:
            approved_at = datetime.fromisoformat(str(approval_payload["approved_at"]).replace("Z", "+00:00"))
            expires_at = datetime.fromisoformat(str(approval_payload["expires_at"]).replace("Z", "+00:00"))
            activated_at = datetime.fromisoformat(str(activation_payload["activated_at"]).replace("Z", "+00:00"))
            rollback_deadline = datetime.fromisoformat(str(activation["rollback_deadline"]).replace("Z", "+00:00"))
            if not (approved_at <= activated_at < expires_at and activated_at < rollback_deadline):
                errors.append("activation approval/activation/rollback timestamps are not causally ordered")
        except (KeyError, TypeError, ValueError):
            errors.append("activation timestamps are not parseable")
        if activation_payload.get("approval_receipt_sha256") != activation["approval_receipt"].get("sha256"):
            errors.append("activation receipt is not bound to exact approval receipt hash")
        if activation_payload.get("activated_at") != activation.get("activated_at"):
            errors.append("activation receipt/report activated_at mismatch")
        if activation["approval_receipt"].get("producer_agent_id") == activation["activation_receipt"].get("producer_agent_id"):
            errors.append("activation approval and activation execution producers must differ")

    canary_specs = {
        "execution_receipt": ("callscore.provider_execution_receipt.v2", ("status", "workflow_id", "operation_id", "generation_id", "accepted_evaluation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id", "publication_revision", "provider_state_version")),
        "provider_readback_receipt": ("callscore.provider_readback_receipt.v2", ("status", "workflow_id", "operation_id", "generation_id", "accepted_evaluation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id", "external_url", "visibility", "observed_at")),
        "provider_object_rollback_receipt": ("callscore.provider_object_rollback_receipt.v2", ("status", "report_id", "report_stream_id", "report_sequence_no", "deployment_manifest_sha256", "workflow_id", "operation_id", "generation_id", "accepted_evaluation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id", "external_url", "tested_disposition", "readback_after_rollback_sha256", "verified_at", "expires_at")),
        "runtime_variant_rollback_receipt": ("callscore.runtime_variant_rollback_receipt.v2", ("status", "report_id", "report_stream_id", "report_sequence_no", "deployment_manifest_sha256", "workflow_id", "experiment_id", "trigger_measurement_id", "trigger_generation_id", "prior_variant_id", "restored_variant_id", "promotion_event_id", "prior_registry_version", "restored_registry_version", "rollback_event_id", "verified_at", "expires_at")),
        "task_router_receipt": ("callscore.task_router_receipt.v2", ("status", "workflow_id", "router_decision_sha256")),
        "tool_inheritance_receipt": ("callscore.tool_inheritance_receipt.v2", ("status", "workflow_id", "delegation_id", "expected_capabilities_sha256", "observed_capabilities_sha256")),
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
        if payload and any(payload.get(key) != canary.get(key) for key in ("generation_id", "accepted_evaluation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id")):
            errors.append(f"canary {label}: report identity tuple mismatch")
    if execution and readback and provider_rollback:
        identity_fields = ("generation_id", "accepted_evaluation_id", "account_scope_hash", "action_name", "payload_sha256", "external_object_id")
        if any(execution.get(key) != readback.get(key) or execution.get(key) != provider_rollback.get(key) for key in identity_fields):
            errors.append("canary execution/readback/provider rollback identity mismatch")
        if readback.get("external_url") != canary.get("external_url") or readback.get("external_object_id") != canary.get("external_object_id"):
            errors.append("canary readback external identity mismatch")
        if provider_rollback.get("external_url") != canary.get("external_url") or provider_rollback.get("tested_disposition") not in ("DELETED", "REVERTED"):
            errors.append("canary provider rollback was not tested against the exact object")
        if str(readback.get("visibility", "")).lower() != "public" or not str(readback.get("external_url", "")).startswith("https://"):
            errors.append("canary independent readback does not prove a public URL")

    execution_ref = canary.get("execution_receipt")
    readback_ref = canary.get("provider_readback_receipt")
    if execution_ref and readback_ref and execution_ref.get("producer_agent_id") == readback_ref.get("producer_agent_id"):
        errors.append("provider execution and provider readback producers must differ")

    runtime_rollback = canary_payloads.get("runtime_variant_rollback_receipt")
    rollback_report_binding = {
        "report_id": report["report_id"],
        "report_stream_id": report["report_stream_id"],
        "report_sequence_no": report["sequence_no"],
        "deployment_manifest_sha256": deployment["deployment_manifest_sha256"],
    }
    for label, payload in (("provider", provider_rollback), ("runtime", runtime_rollback)):
        if payload and any(payload.get(key) != value for key, value in rollback_report_binding.items()):
            errors.append(f"{label} rollback is not bound to the exact report/deployment tuple")
        if payload:
            try:
                verified = datetime.fromisoformat(str(payload["verified_at"]).replace("Z", "+00:00"))
                expires = datetime.fromisoformat(str(payload["expires_at"]).replace("Z", "+00:00"))
                if verified >= expires:
                    errors.append(f"{label} rollback receipt is expired or temporally invalid")
            except (KeyError, TypeError, ValueError):
                errors.append(f"{label} rollback timestamps are invalid")
    if runtime_rollback and runtime_rollback.get("prior_variant_id") == runtime_rollback.get("restored_variant_id"):
        errors.append("runtime variant rollback does not change variant")
    if runtime_rollback and runtime_rollback.get("workflow_id") != workflow_id:
        errors.append("runtime rollback is unrelated to the canary workflow")
    if runtime_rollback and runtime_rollback.get("restored_registry_version", 0) <= runtime_rollback.get("prior_registry_version", 0):
        errors.append("runtime rollback registry versions are not monotonic")
    if runtime_rollback and runtime_rollback.get("trigger_generation_id") != canary.get("generation_id"):
        errors.append("runtime rollback trigger measurement is not bound to the canary generation")
    if runtime_rollback and runtime_rollback.get("promotion_event_id") == runtime_rollback.get("rollback_event_id"):
        errors.append("runtime rollback promotion and rollback events must be distinct")

    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True)
    parser.add_argument("--schema", required=True)
    parser.add_argument("--evidence-schema", required=True)
    parser.add_argument("--deployment-manifest", required=True)
    parser.add_argument("--phase-manifest-index", required=True)
    parser.add_argument("--review-attestation-ledger", required=True)
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
    parser.add_argument("--verifier-agent-id", required=True)
    parser.add_argument("--receipt-verifier-agent-id", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args()


def main() -> int:
    global EVIDENCE_VALIDATOR, FROZEN_EVIDENCE, REVIEW_ATTESTATION_LEDGER
    args = parse_args()
    verifier_script_path = Path(__file__).resolve()
    trust_exporter_path = verifier_script_path.with_name("export-autonomy-verifier-trust-v9.py")
    report_path = Path(args.report).resolve(strict=True)
    schema_path = Path(args.schema).resolve(strict=True)
    evidence_schema_path = Path(args.evidence_schema).resolve(strict=True)
    deployment_path = Path(args.deployment_manifest).resolve(strict=True)
    phase_index_path = Path(args.phase_manifest_index).resolve(strict=True)
    review_ledger_path = Path(args.review_attestation_ledger).resolve(strict=True)
    script_path = verifier_script_path
    output = Path(args.out).resolve(strict=False)
    report_bytes = report_path.read_bytes()
    schema_bytes = schema_path.read_bytes()
    evidence_schema_bytes = evidence_schema_path.read_bytes()
    deployment_bytes = deployment_path.read_bytes()
    phase_index_bytes = phase_index_path.read_bytes()
    review_ledger_bytes = review_ledger_path.read_bytes()
    script_bytes = script_path.read_bytes()
    trust_exporter_bytes = trust_exporter_path.read_bytes()
    report = json.loads(report_bytes)
    trust_export = subprocess.run(
        [sys.executable, str(trust_exporter_path),
         "--report-stream-id", str(report.get("report_stream_id", "")),
         "--sequence-no", str(report.get("sequence_no", ""))],
        check=False, capture_output=True, text=True,
    )
    if trust_export.returncode != 0:
        raise SystemExit("authenticated PostgreSQL verifier trust export failed")
    try:
        trust_bundle = json.loads(trust_export.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"authenticated PostgreSQL verifier trust export was invalid: {exc}") from exc
    if trust_bundle.get("schema") != "callscore.db_autonomy_verifier_trust_bundle.v1":
        raise SystemExit("authenticated PostgreSQL verifier trust export used wrong schema")
    if trust_bundle.get("report_stream_id") != report.get("report_stream_id") \
       or trust_bundle.get("report_sequence_no") != report.get("sequence_no"):
        raise SystemExit("authenticated PostgreSQL verifier trust export subject mismatch")
    if trust_bundle.get("app_commit_sha") != args.expected_app_sha \
       or trust_bundle.get("plan_commit_sha") != args.expected_plan_sha:
        raise SystemExit("CLI target differs from authenticated PostgreSQL trust anchor")
    args.expected_deployment_manifest_sha256 = trust_bundle.get("deployment_manifest_sha256")
    args.expected_phase_manifest_index_sha256 = trust_bundle.get("phase_manifest_index_sha256")
    if sha256_bytes(script_bytes) != trust_bundle.get("verifier_script_sha256"):
        raise SystemExit("verifier script differs from authenticated PostgreSQL trust anchor")
    if sha256_bytes(trust_exporter_bytes) != trust_bundle.get("trust_exporter_script_sha256"):
        raise SystemExit("trust exporter differs from authenticated PostgreSQL trust anchor")
    if sha256_bytes(schema_bytes) != trust_bundle.get("report_schema_sha256"):
        raise SystemExit("report schema differs from authenticated PostgreSQL trust anchor")
    if sha256_bytes(evidence_schema_bytes) != trust_bundle.get("evidence_schema_sha256"):
        raise SystemExit("evidence schema differs from authenticated PostgreSQL trust anchor")
    if sha256_bytes(deployment_bytes) != trust_bundle.get("deployment_manifest_sha256"):
        raise SystemExit("deployment manifest pre-freeze hash mismatch")
    if sha256_bytes(phase_index_bytes) != trust_bundle.get("phase_manifest_index_sha256"):
        raise SystemExit("phase manifest index pre-freeze hash mismatch")
    if sha256_bytes(review_ledger_bytes) != trust_bundle.get("review_attestation_ledger_sha256"):
        raise SystemExit("review attestation ledger pre-freeze hash mismatch")
    phase_index = json.loads(phase_index_bytes)
    review_ledger = json.loads(review_ledger_bytes)
    if phase_index.get("workplane_source_path") != trust_bundle.get("workplane_source_path"):
        raise SystemExit("phase manifest index Workplane source is not PostgreSQL-authenticated")
    phase_rows = phase_index.get("phases")
    if not isinstance(phase_rows, dict):
        raise SystemExit("phase manifest index phases missing")
    projected_phase_contract = {
        phase: {
            "workplane_task_id": row.get("workplane_task_id"),
            "execution_owner": row.get("execution_owner"),
            "commands": row.get("commands"),
        }
        for phase, row in phase_rows.items() if isinstance(row, dict)
    }
    if projected_phase_contract != trust_bundle.get("phase_execution_contract"):
        raise SystemExit("phase task/owner/command contract is not PostgreSQL-authenticated")
    if review_ledger.get("attestations") != trust_bundle.get("attestations"):
        raise SystemExit("review ledger differs from authenticated PostgreSQL review projection")
    REVIEW_ATTESTATION_LEDGER = {
        str(row["review_execution_id"]): row for row in trust_bundle.get("attestations", [])
    }
    evidence_paths = artifact_paths(report)
    evidence_paths.update({deployment_path, phase_index_path, review_ledger_path})
    for spec in phase_index.get("phases", {}).values():
        evidence_paths.add(Path(str(spec.get("path", ""))).resolve(strict=False))
        for command in spec.get("commands", {}).values():
            if command and Path(command[0]).is_absolute():
                evidence_paths.add(Path(command[0]).resolve(strict=False))
    # Capture each path once. Nested raw artifacts and command executables are
    # discovered from frozen bytes only, closing swap-validate-restore TOCTOU.
    FROZEN_EVIDENCE = {}
    queue = list(evidence_paths)
    while queue:
        path = queue.pop()
        if path in FROZEN_EVIDENCE:
            continue
        if not path.is_file():
            raise SystemExit(f"referenced evidence missing before verification: {path}")
        data = path.read_bytes()
        FROZEN_EVIDENCE[path] = data
        try:
            payload = json.loads(data)
        except Exception:
            continue
        for nested in artifact_paths(payload):
            if nested not in FROZEN_EVIDENCE:
                queue.append(nested)
        command = payload.get("command", []) if isinstance(payload, dict) else []
        if command and Path(command[0]).is_absolute():
            queue.append(Path(command[0]).resolve(strict=False))
    protected_paths = {
        report_path, schema_path, evidence_schema_path, deployment_path,
        phase_index_path, review_ledger_path, verifier_script_path, trust_exporter_path,
    }
    if output in protected_paths or output in FROZEN_EVIDENCE:
        raise SystemExit("--out must not alias an input or referenced evidence artifact")
    if output.exists():
        raise SystemExit("--out is create-only and must not already exist")
    schema = json.loads(schema_bytes)
    evidence_schema = json.loads(evidence_schema_bytes)
    EVIDENCE_VALIDATOR = Draft202012Validator(evidence_schema, format_checker=FormatChecker())
    errors = verify_report(report, schema, args)
    if args.verifier_agent_id == args.receipt_verifier_agent_id:
        errors.append("verification receipt producer and verifier must differ")
    frozen_evidence_manifest = json.dumps(
        [{"path": str(path), "sha256": sha256_bytes(data), "byte_length": len(data)}
         for path, data in sorted(FROZEN_EVIDENCE.items(), key=lambda item: str(item[0]))],
        separators=(",", ":"), sort_keys=True,
    ).encode("utf-8")
    final_review_execution_ids = [
        frozen_json(Path(review["review_execution_attestation"]["path"]))["review_execution_id"]
        for review in report.get("final_reviews", [])
    ]
    canary_execution_payload = frozen_json(Path(report["canary"]["execution_receipt"]["path"])) if report.get("canary") else {}
    receipt = {
        "schema": "callscore.autonomy_report_verification_receipt.v3",
        "status": "FAIL" if errors else "PASS",
        "report_id": report.get("report_id"),
        "report_sha256": sha256_bytes(report_bytes),
        "report_schema_sha256": sha256_bytes(schema_bytes),
        "evidence_schema_sha256": sha256_bytes(evidence_schema_bytes),
        "deployment_manifest_sha256": sha256_bytes(deployment_bytes),
        "phase_manifest_index_sha256": sha256_bytes(phase_index_bytes),
        "review_attestation_ledger_sha256": sha256_bytes(review_ledger_bytes),
        "trust_exporter_script_sha256": sha256_bytes(trust_exporter_bytes),
        "workplane_source_path": trust_bundle.get("workplane_source_path"),
        "final_review_execution_ids": final_review_execution_ids,
        "canary_generation_id": canary_execution_payload.get("generation_id"),
        "canary_accepted_evaluation_id": canary_execution_payload.get("accepted_evaluation_id"),
        "verifier_script_sha256": sha256_bytes(script_bytes),
        "frozen_evidence_manifest_sha256": sha256_bytes(frozen_evidence_manifest),
        "frozen_evidence_count": len(FROZEN_EVIDENCE),
        "report": str(report_path),
        "target_tuple": {
            "app_commit_sha": args.expected_app_sha,
            "workplane_commit_sha": args.expected_workplane_sha,
            "plan_commit_sha": args.expected_plan_sha,
            "graph_source_sha256": args.expected_graph_source_sha256,
            "migration_sha256": args.expected_migration_sha256,
            "runtime_script_manifest_sha256": args.expected_runtime_script_manifest_sha256,
            "image_digest": args.expected_image_digest,
            "prompt_manifest_sha256": args.expected_prompt_manifest_sha256,
        },
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "producer_agent_id": args.verifier_agent_id,
        "verifier_agent_id": args.receipt_verifier_agent_id,
        "errors": errors,
    }
    if not errors:
        assert EVIDENCE_VALIDATOR is not None
        try:
            EVIDENCE_VALIDATOR.validate(receipt)
        except ValidationError as exc:
            errors.append(f"verification receipt schema invalid: {exc.message}")
            receipt["status"] = "FAIL"
            receipt["errors"] = errors
    frozen_inputs = {
        report_path: sha256_bytes(report_bytes),
        schema_path: sha256_bytes(schema_bytes),
        evidence_schema_path: sha256_bytes(evidence_schema_bytes),
        deployment_path: sha256_bytes(deployment_bytes),
        phase_index_path: sha256_bytes(phase_index_bytes),
        review_ledger_path: sha256_bytes(review_ledger_bytes),
        script_path: sha256_bytes(script_bytes),
        trust_exporter_path: sha256_bytes(trust_exporter_bytes),
        **{path: sha256_bytes(data) for path, data in FROZEN_EVIDENCE.items()},
    }
    for path, expected_sha256 in frozen_inputs.items():
        if sha256_bytes(path.read_bytes()) != expected_sha256:
            raise SystemExit(f"input changed during verification: {path}")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    if json.loads(output.read_text(encoding="utf-8")) != receipt:
        raise SystemExit("verification receipt readback mismatch")
    print(json.dumps(receipt, sort_keys=True))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
