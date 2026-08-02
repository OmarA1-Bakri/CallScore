#!/usr/bin/env python3
"""Generate a valid v5 report, then prove adversarial variants fail closed."""
from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent
VERIFIER = FIXTURES / "verify-autonomy-final-report-contract-v6.py"
REPORT_SCHEMA = FIXTURES / "callscore-autonomy-implementation-report-v5.schema.json"
EVIDENCE_SCHEMA = FIXTURES / "autonomy-evidence-receipts-v1.schema.json"
PHASES = ("A0", *tuple("ABCDEFGHIJ"))
REVIEW_TYPES = ("contract", "implementation", "security")
H = "a" * 64
APP = "a" * 40
WORKPLANE = "b" * 40
PLAN = "c" * 40


def uid() -> str:
    return str(uuid.uuid4())


def dump(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8")
    return path


def ref(path: Path, schema: str, producer: str, verifier: str) -> dict:
    data = path.read_bytes()
    return {
        "artifact_id": uid(), "schema": schema, "path": str(path.resolve()),
        "sha256": hashlib.sha256(data).hexdigest(), "byte_length": len(data),
        "producer_agent_id": producer, "verifier_agent_id": verifier,
    }


def receipt(root: Path, name: str, payload: dict, producer: str, verifier: str) -> dict:
    body = {**payload, "producer_agent_id": producer, "verifier_agent_id": verifier}
    path = dump(root / name, body)
    return ref(path, str(body["schema"]), producer, verifier)


def build(root: Path) -> tuple[dict, Path, dict]:
    target = {
        "app_commit_sha": APP, "workplane_commit_sha": WORKPLANE, "plan_commit_sha": PLAN,
        "graph_source_sha256": "1" * 64, "migration_sha256": "2" * 64,
        "runtime_script_manifest_sha256": "3" * 64, "image_digest": "sha256:" + "4" * 64,
        "prompt_manifest_sha256": "5" * 64,
    }
    deployment_payload = {
        **target, "migration_version": "025-callscore-autonomous-supervisor", "graph_version": "v1",
        "registry_sha256": "6" * 64, "policy_sha256": "7" * 64, "service_unit_sha256": "8" * 64,
    }
    deployment_path = dump(root / "deployment.json", deployment_payload)
    deployment = {**deployment_payload, "deployment_manifest_sha256": hashlib.sha256(deployment_path.read_bytes()).hexdigest()}
    phase_gates: dict[str, dict] = {}
    for phase in PHASES:
        phase_target = {
            "phase_id": phase, "app_commit_sha": APP, "workplane_commit_sha": WORKPLANE,
            "plan_commit_sha": PLAN, "phase_commit_sha": APP, "phase_manifest_sha256": "9" * 64,
        }
        stages: dict[str, dict] = {}
        for stage in ("RED", "GREEN", "REFACTOR"):
            producer = f"phase-{phase}-{stage.lower()}-runner"
            body = {
                "schema": "callscore.phase_test_receipt.v2", "phase_id": phase, "stage": stage,
                "status": "PASS", "target_tuple": phase_target,
                "command": ["/usr/bin/false" if stage == "RED" else "/usr/bin/true"],
                "exit_code": 1 if stage == "RED" else 0,
                "started_at": "2026-08-02T00:00:00Z", "finished_at": "2026-08-02T00:00:01Z",
                "stdout_sha256": H, "stderr_sha256": "b" * 64,
                "controlled_result_code": "expected_red" if stage == "RED" else "passed",
            }
            stages[f"{stage.lower()}_receipt"] = receipt(root, f"{phase}-{stage}.json", body, producer, "phase-receipt-verifier")
        reviews = []
        for review_type in REVIEW_TYPES:
            reviewer = f"phase-{phase}-{review_type}-reviewer"
            body = {
                "schema": "callscore.phase_review_receipt.v2", "phase_id": phase,
                "review_type": review_type, "reviewer_agent_id": reviewer, "verdict": "PASS",
                "first_line": "VERDICT: PASS", "target_tuple": phase_target,
                "reviewed_artifact_sha256": [H],
            }
            artifact = receipt(root, f"{phase}-{review_type}-review.json", body, reviewer, "phase-review-verifier")
            reviews.append({
                "phase_id": phase, "review_type": review_type, "reviewer_agent_id": reviewer,
                "verdict": "PASS", "first_line": "VERDICT: PASS", "target_tuple": phase_target,
                "review_artifact": artifact,
            })
        phase_gates[phase] = {"phase_id": phase, "target_tuple": phase_target, "status": "PASS", **stages, "reviews": reviews}

    final_reviews = []
    for review_type in REVIEW_TYPES:
        reviewer = f"final-{review_type}-reviewer"
        body = {
            "schema": "callscore.final_review_receipt.v1", "review_type": review_type,
            "reviewer_agent_id": reviewer, "verdict": "PASS", "first_line": "VERDICT: PASS",
            "target_tuple": target, "reviewed_artifact_sha256": [deployment["deployment_manifest_sha256"]],
        }
        artifact = receipt(root, f"final-{review_type}.json", body, reviewer, "final-review-verifier")
        final_reviews.append({
            "review_type": review_type, "reviewer_agent_id": reviewer, "verdict": "PASS",
            "first_line": "VERDICT: PASS", "target_tuple": target, "review_artifact": artifact,
        })

    report_id, workflow_id, operation_id = uid(), uid(), uid()
    approval = receipt(root, "activation-approval.json", {
        "schema": "callscore.autonomy_activation_approval_receipt.v2", "status": "PASS",
        "report_id": report_id, "target_tuple": target, "approved_at": "2026-08-02T01:00:00Z",
        "expires_at": "2026-08-02T02:00:00Z",
    }, "activation-approver", "activation-approval-verifier")
    activation = receipt(root, "activation.json", {
        "schema": "callscore.autonomy_activation_receipt.v2", "status": "PASS", "report_id": report_id,
        "target_tuple": target, "approval_receipt_sha256": approval["sha256"],
        "activated_at": "2026-08-02T01:10:00Z", "fence_version": 1,
    }, "deployment-operator", "activation-verifier")
    provider_identity = {
        "status": "PASS", "workflow_id": workflow_id, "operation_id": operation_id,
        "account_scope_hash": "d" * 64, "action_name": "create", "payload_sha256": "e" * 64,
        "external_object_id": "external-1",
    }
    execution = receipt(root, "execution.json", {
        "schema": "callscore.provider_execution_receipt.v2", **provider_identity,
        "publication_revision": 0, "provider_state_version": 1,
    }, "provider-worker", "provider-execution-verifier")
    readback = receipt(root, "readback.json", {
        "schema": "callscore.provider_readback_receipt.v2", **provider_identity,
        "external_url": "https://example.com/public/1", "visibility": "public", "observed_at": "2026-08-02T01:20:00Z",
    }, "provider-readback", "trust-reviewer")
    provider_rollback = receipt(root, "provider-rollback.json", {
        "schema": "callscore.provider_object_rollback_receipt.v2", **provider_identity,
        "external_url": "https://example.com/public/1", "tested_disposition": "DELETED",
        "readback_after_rollback_sha256": "f" * 64,
    }, "provider-rollback-worker", "trust-reviewer")
    runtime_rollback = receipt(root, "runtime-rollback.json", {
        "schema": "callscore.runtime_variant_rollback_receipt.v2", "status": "PASS",
        "workflow_id": workflow_id, "experiment_id": uid(), "trigger_measurement_id": uid(),
        "prior_variant_id": uid(), "restored_variant_id": uid(), "promotion_event_id": uid(),
        "prior_registry_version": 1, "restored_registry_version": 2, "rollback_event_id": uid(),
    }, "runtime-rollback-worker", "trust-reviewer")
    router = receipt(root, "router.json", {
        "schema": "callscore.task_router_receipt.v2", "status": "PASS", "workflow_id": workflow_id,
        "router_decision_sha256": "1" * 64,
    }, "task-router", "router-verifier")
    tool = receipt(root, "tool.json", {
        "schema": "callscore.tool_inheritance_receipt.v2", "status": "PASS", "workflow_id": workflow_id,
        "delegation_id": uid(), "expected_capabilities_sha256": "2" * 64, "observed_capabilities_sha256": "2" * 64,
    }, "child-launcher", "tool-verifier")
    canonical = []
    for index, schema_name in enumerate((
        "editorial_angle_receipt.v1", "platform_fit_receipt.v1", "visual_brief_receipt.v1",
        "visual_qa_receipt.v1", "copy_visual_coherence_receipt.v1", "same_shit_memory_receipt.v1",
    )):
        body = {
            "schema": "callscore.canonical_operational_receipt_validation.v1", "status": "PASS",
            "workflow_id": workflow_id, "subject_sha256": "e" * 64, "receipt_schema": schema_name,
            "receipt_artifact_id": uid(), "receipt_payload_sha256": f"{index + 1:x}" * 64,
            "receipt_schema_sha256": "3" * 64, "validated_at": "2026-08-02T01:15:00Z",
        }
        canonical.append(receipt(root, f"canonical-{index}.json", body, f"canonical-{index}-producer", "canonical-receipt-verifier"))

    report = {
        "schema": "callscore.autonomy_implementation_report.v5", "report_id": report_id,
        "generated_at": "2026-08-02T01:30:00Z", "final_status": "PASS",
        "producer_agent_id": "report-producer", "verifier_agent_id": "report-verifier",
        "source_tuple": {"app_commit_sha": APP, "workplane_commit_sha": WORKPLANE, "plan_commit_sha": PLAN, "plan_sha256": "4" * 64, "manifest_sha256": "5" * 64},
        "deployment_tuple": deployment, "phase_gates": phase_gates, "final_reviews": final_reviews,
        "live_activation": {"approved": True, "approval_receipt": approval, "activated_at": "2026-08-02T01:10:00Z", "activation_receipt": activation, "rollback_deadline": "2026-08-02T03:00:00Z"},
        "canary": {
            "status": "PASS", "workflow_id": workflow_id, "provider_operation_id": operation_id,
            "account_scope_hash": "d" * 64, "action_name": "create", "payload_sha256": "e" * 64,
            "is_media": False, "is_youtube": False, "external_object_id": "external-1",
            "external_url": "https://example.com/public/1", "execution_receipt": execution,
            "provider_readback_receipt": readback, "provider_object_rollback_receipt": provider_rollback,
            "runtime_variant_rollback_receipt": runtime_rollback, "task_router_receipt": router,
            "tool_inheritance_receipt": tool,
        },
        "receipts": canonical, "blockers": [],
    }
    return report, deployment_path, target


def invoke(root: Path, label: str, report: dict, deployment_path: Path, target: dict) -> subprocess.CompletedProcess[str]:
    report_path = dump(root / f"{label}.json", report)
    out_path = root / f"{label}-verification.json"
    command = [
        sys.executable, str(VERIFIER), "--report", str(report_path), "--schema", str(REPORT_SCHEMA),
        "--evidence-schema", str(EVIDENCE_SCHEMA), "--deployment-manifest", str(deployment_path),
        "--expected-app-sha", target["app_commit_sha"], "--expected-workplane-sha", target["workplane_commit_sha"],
        "--expected-plan-sha", target["plan_commit_sha"], "--expected-plan-content-sha256", "4" * 64,
        "--expected-manifest-sha256", "5" * 64, "--expected-graph-source-sha256", target["graph_source_sha256"],
        "--expected-migration-sha256", target["migration_sha256"],
        "--expected-runtime-script-manifest-sha256", target["runtime_script_manifest_sha256"],
        "--expected-image-digest", target["image_digest"],
        "--expected-prompt-manifest-sha256", target["prompt_manifest_sha256"],
        "--verifier-agent-id", "report-verifier", "--receipt-verifier-agent-id", "verification-receipt-reviewer",
        "--out", str(out_path),
    ]
    return subprocess.run(command, text=True, capture_output=True)


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="callscore-v6-verifier-selftest-") as directory:
        root = Path(directory)
        report, deployment_path, target = build(root)
        cases: list[tuple[str, dict, int]] = [("valid", report, 0)]
        bad_phase = copy.deepcopy(report)
        bad_phase["phase_gates"]["A"]["green_receipt"]["sha256"] = "0" * 64
        cases.append(("bad-phase-hash", bad_phase, 1))
        bad_runtime = copy.deepcopy(report)
        runtime_path = Path(bad_runtime["canary"]["runtime_variant_rollback_receipt"]["path"])
        runtime_payload = json.loads(runtime_path.read_text())
        runtime_payload["restored_registry_version"] = "two"
        mutated_runtime_path = dump(root / "runtime-rollback-mutated.json", runtime_payload)
        bad_runtime["canary"]["runtime_variant_rollback_receipt"] = ref(mutated_runtime_path, runtime_payload["schema"], runtime_payload["producer_agent_id"], runtime_payload["verifier_agent_id"])
        cases.append(("ill-typed-runtime-rollback", bad_runtime, 1))
        unrelated = copy.deepcopy(report)
        unrelated_path = Path(unrelated["canary"]["runtime_variant_rollback_receipt"]["path"])
        unrelated_payload = json.loads(unrelated_path.read_text())
        unrelated_payload["workflow_id"] = uid()
        unrelated_file = dump(root / "runtime-rollback-unrelated.json", unrelated_payload)
        unrelated["canary"]["runtime_variant_rollback_receipt"] = ref(unrelated_file, unrelated_payload["schema"], unrelated_payload["producer_agent_id"], unrelated_payload["verifier_agent_id"])
        cases.append(("unrelated-runtime-rollback", unrelated, 1))
        results = []
        for label, payload, expected_exit in cases:
            completed = invoke(root, label, payload, deployment_path, target)
            passed = (completed.returncode == expected_exit)
            results.append({"case": label, "exit_code": completed.returncode, "expected_exit_code": expected_exit, "passed": passed})
        alias_report = dump(root / "output-alias.json", report)
        alias_before = hashlib.sha256(alias_report.read_bytes()).hexdigest()
        alias_command = [
            sys.executable, str(VERIFIER), "--report", str(alias_report), "--schema", str(REPORT_SCHEMA),
            "--evidence-schema", str(EVIDENCE_SCHEMA), "--deployment-manifest", str(deployment_path),
            "--expected-app-sha", target["app_commit_sha"], "--expected-workplane-sha", target["workplane_commit_sha"],
            "--expected-plan-sha", target["plan_commit_sha"], "--expected-plan-content-sha256", "4" * 64,
            "--expected-manifest-sha256", "5" * 64, "--expected-graph-source-sha256", target["graph_source_sha256"],
            "--expected-migration-sha256", target["migration_sha256"],
            "--expected-runtime-script-manifest-sha256", target["runtime_script_manifest_sha256"],
            "--expected-image-digest", target["image_digest"], "--expected-prompt-manifest-sha256", target["prompt_manifest_sha256"],
            "--verifier-agent-id", "report-verifier", "--receipt-verifier-agent-id", "verification-receipt-reviewer",
            "--out", str(alias_report),
        ]
        alias_completed = subprocess.run(alias_command, text=True, capture_output=True)
        alias_unchanged = hashlib.sha256(alias_report.read_bytes()).hexdigest() == alias_before
        results.append({"case": "output-alias", "exit_code": alias_completed.returncode, "expected_exit_code": 1, "report_unchanged": alias_unchanged, "passed": alias_completed.returncode == 1 and alias_unchanged})
        print(json.dumps({"schema": "callscore.autonomy_verifier_selftest.v6", "results": results, "all_passed": all(row["passed"] for row in results)}, sort_keys=True))
        return 0 if all(row["passed"] for row in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
