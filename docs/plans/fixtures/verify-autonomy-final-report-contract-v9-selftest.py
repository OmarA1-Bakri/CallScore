#!/usr/bin/env python3
"""Generate a valid v9 report, then prove adversarial variants fail closed."""
from __future__ import annotations

import copy
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent
VERIFIER = FIXTURES / "verify-autonomy-final-report-contract-v9.py"
REPORT_SCHEMA = FIXTURES / "callscore-autonomy-implementation-report-v8.schema.json"
EVIDENCE_SCHEMA = FIXTURES / "autonomy-evidence-receipts-v4.schema.json"
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


def raw_ref(path: Path) -> dict:
    data = path.read_bytes()
    return {
        "path": str(path.resolve()), "sha256": hashlib.sha256(data).hexdigest(),
        "byte_length": len(data), "media_type": "text/plain",
    }


def receipt(root: Path, name: str, payload: dict, producer: str, verifier: str) -> dict:
    body = {**payload, "producer_agent_id": producer, "verifier_agent_id": verifier}
    path = dump(root / name, body)
    return ref(path, str(body["schema"]), producer, verifier)


def build(root: Path) -> tuple[dict, Path, dict, Path, Path]:
    target = {
        "app_commit_sha": APP, "workplane_commit_sha": WORKPLANE, "plan_commit_sha": PLAN,
        "graph_source_sha256": "1" * 64, "migration_sha256": "2" * 64,
        "runtime_script_manifest_sha256": "3" * 64, "image_digest": "sha256:" + "4" * 64,
        "prompt_manifest_sha256": "5" * 64,
    }
    phase_gates: dict[str, dict] = {}
    phase_index_payload = {
        "schema": "callscore.phase_execution_manifest_index.v1", "repo_root": str(root.resolve()),
        "workplane_source_path": "/srv/agents/repos/callscore-workplane/runtime/kanban/autonomy-v9-selftest.json",
        "phases": {},
    }
    review_ledger_rows: list[dict] = []
    for phase in PHASES:
        phase_commands = {
            "RED": ["/usr/bin/false"], "GREEN": ["/usr/bin/true"], "REFACTOR": ["/usr/bin/true"],
        }
        phase_manifest_path = dump(root / f"phase-{phase}-manifest.json", {
            "schema": "callscore.phase_execution_manifest.v1", "phase_id": phase,
            "repo_root": str(root.resolve()), "commands": phase_commands,
        })
        phase_manifest_sha256 = hashlib.sha256(phase_manifest_path.read_bytes()).hexdigest()
        phase_index_payload["phases"][phase] = {
            "path": str(phase_manifest_path.resolve()), "sha256": phase_manifest_sha256,
            "commands": phase_commands,
            "workplane_task_id": f"selftest-{phase}", "execution_owner": f"owner-{phase}",
        }
        phase_target = {
            "phase_id": phase, "app_commit_sha": APP, "workplane_commit_sha": WORKPLANE,
            "plan_commit_sha": PLAN, "phase_commit_sha": APP, "phase_manifest_sha256": phase_manifest_sha256,
        }
        stages: dict[str, dict] = {}
        for stage in ("RED", "GREEN", "REFACTOR"):
            producer = f"phase-{phase}-{stage.lower()}-runner"
            executable = Path("/usr/bin/false" if stage == "RED" else "/usr/bin/true")
            stdout_path = root / f"{phase}-{stage}.stdout"
            stderr_path = root / f"{phase}-{stage}.stderr"
            stdout_path.write_bytes(f"{phase}:{stage}:stdout\n".encode())
            stderr_path.write_bytes(f"{phase}:{stage}:stderr\n".encode())
            body = {
                "schema": "callscore.phase_test_receipt.v2", "phase_id": phase, "stage": stage,
                "status": "PASS", "target_tuple": phase_target,
                "command": [str(executable)],
                "command_executable_sha256": hashlib.sha256(executable.read_bytes()).hexdigest(),
                "cwd": str(root.resolve()),
                "scope": {"repo_root": str(root.resolve()), "test_selector": f"phase:{phase}:{stage}",
                          "phase_manifest_sha256": phase_target["phase_manifest_sha256"]},
                "normalization": {"algorithm": "identity-bytes", "version": "1", "line_endings": "preserved"},
                "exit_code": 1 if stage == "RED" else 0,
                "started_at": "2026-08-02T00:00:00Z", "finished_at": "2026-08-02T00:00:01Z",
                "stdout_sha256": raw_ref(stdout_path)["sha256"], "stderr_sha256": raw_ref(stderr_path)["sha256"],
                "stdout_artifact": raw_ref(stdout_path), "stderr_artifact": raw_ref(stderr_path),
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
                "reviewed_artifact_sha256": [phase_target["phase_manifest_sha256"]],
            }
            artifact = receipt(root, f"{phase}-{review_type}-review.json", body, reviewer, "phase-review-verifier")
            attestation_body = {
                "schema": "callscore.review_execution_attestation.v1", "status": "PASS", "scope": "PHASE",
                "review_execution_id": uid(), "reviewer_agent_id": reviewer,
                "hermes_session_id": f"session-{phase}-{review_type}", "delegation_batch_id": f"batch-{phase}",
                "delegation_task_ordinal": REVIEW_TYPES.index(review_type), "target_tuple": phase_target,
                "reviewed_artifact_sha256": phase_target["phase_manifest_sha256"],
                "review_output_sha256": artifact["sha256"], "process_identity_sha256": "d" * 64,
                "attested_by_role": "callscore-review-identity-attestor",
            }
            attestation = receipt(root, f"{phase}-{review_type}-attestation.json", attestation_body, "callscore-review-identity-attestor", "review-identity-trust-verifier")
            review_ledger_rows.append({
                key: ("PASS" if key == "verdict" else attestation_body[key])
                for key in ("review_execution_id", "scope", "reviewer_agent_id", "hermes_session_id",
                            "delegation_batch_id", "target_tuple", "reviewed_artifact_sha256",
                            "review_output_sha256", "process_identity_sha256", "verdict")
            })
            reviews.append({
                "phase_id": phase, "review_type": review_type, "reviewer_agent_id": reviewer,
                "verdict": "PASS", "first_line": "VERDICT: PASS", "target_tuple": phase_target,
                "review_artifact": artifact, "review_execution_attestation": attestation,
            })
        phase_gates[phase] = {"phase_id": phase, "target_tuple": phase_target, "status": "PASS", **stages, "reviews": reviews}

    phase_index_path = dump(root / "phase-manifest-index.json", phase_index_payload)
    deployment_payload = {
        **target, "migration_version": "025-callscore-autonomous-supervisor", "graph_version": "v1",
        "registry_sha256": "6" * 64, "policy_sha256": "7" * 64, "service_unit_sha256": "8" * 64,
        "phase_manifest_index_sha256": hashlib.sha256(phase_index_path.read_bytes()).hexdigest(),
    }
    deployment_path = dump(root / "deployment.json", deployment_payload)
    deployment = {**deployment_payload, "deployment_manifest_sha256": hashlib.sha256(deployment_path.read_bytes()).hexdigest()}

    final_reviews = []
    for review_type in REVIEW_TYPES:
        reviewer = f"final-{review_type}-reviewer"
        body = {
            "schema": "callscore.final_review_receipt.v1", "review_type": review_type,
            "reviewer_agent_id": reviewer, "verdict": "PASS", "first_line": "VERDICT: PASS",
            "target_tuple": target, "reviewed_artifact_sha256": [deployment["deployment_manifest_sha256"]],
        }
        artifact = receipt(root, f"final-{review_type}.json", body, reviewer, "final-review-verifier")
        attestation_body = {
            "schema": "callscore.review_execution_attestation.v1", "status": "PASS", "scope": "FINAL",
            "review_execution_id": uid(), "reviewer_agent_id": reviewer,
            "hermes_session_id": f"session-final-{review_type}", "delegation_batch_id": "batch-final",
            "delegation_task_ordinal": REVIEW_TYPES.index(review_type), "target_tuple": target,
            "reviewed_artifact_sha256": deployment["deployment_manifest_sha256"],
            "review_output_sha256": artifact["sha256"], "process_identity_sha256": "e" * 64,
            "attested_by_role": "callscore-review-identity-attestor",
        }
        attestation = receipt(root, f"final-{review_type}-attestation.json", attestation_body, "callscore-review-identity-attestor", "review-identity-trust-verifier")
        review_ledger_rows.append({
            key: ("PASS" if key == "verdict" else attestation_body[key])
            for key in ("review_execution_id", "scope", "reviewer_agent_id", "hermes_session_id",
                        "delegation_batch_id", "target_tuple", "reviewed_artifact_sha256",
                        "review_output_sha256", "process_identity_sha256", "verdict")
        })
        final_reviews.append({
            "review_type": review_type, "reviewer_agent_id": reviewer, "verdict": "PASS",
            "first_line": "VERDICT: PASS", "target_tuple": target, "review_artifact": artifact,
            "review_execution_attestation": attestation,
        })

    review_ledger_path = dump(root / "review-attestation-ledger.json", {
        "schema": "callscore.db_review_attestation_ledger.v1", "attestations": review_ledger_rows,
    })

    report_id, workflow_id, operation_id = uid(), uid(), uid()
    report_stream_id, report_sequence_no = "autonomy-final", 1
    generation_id, accepted_evaluation_id = uid(), uid()
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
        "generation_id": generation_id, "accepted_evaluation_id": accepted_evaluation_id,
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
        "report_id": report_id, "report_stream_id": report_stream_id,
        "report_sequence_no": report_sequence_no,
        "deployment_manifest_sha256": deployment["deployment_manifest_sha256"],
        "external_url": "https://example.com/public/1", "tested_disposition": "DELETED",
        "readback_after_rollback_sha256": "f" * 64,
        "verified_at": "2026-08-02T01:21:00Z", "expires_at": "2026-08-02T03:00:00Z",
    }, "provider-rollback-worker", "trust-reviewer")
    runtime_rollback = receipt(root, "runtime-rollback.json", {
        "schema": "callscore.runtime_variant_rollback_receipt.v2", "status": "PASS",
        "report_id": report_id, "report_stream_id": report_stream_id,
        "report_sequence_no": report_sequence_no,
        "deployment_manifest_sha256": deployment["deployment_manifest_sha256"],
        "workflow_id": workflow_id, "experiment_id": uid(), "trigger_measurement_id": uid(),
        "trigger_generation_id": generation_id,
        "prior_variant_id": uid(), "restored_variant_id": uid(), "promotion_event_id": uid(),
        "prior_registry_version": 1, "restored_registry_version": 2, "rollback_event_id": uid(),
        "verified_at": "2026-08-02T01:22:00Z", "expires_at": "2026-08-02T03:00:00Z",
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
        "schema": "callscore.autonomy_implementation_report.v8", "report_id": report_id,
        "report_stream_id": report_stream_id, "sequence_no": report_sequence_no,
        "generated_at": "2026-08-02T01:30:00Z", "final_status": "PASS",
        "producer_agent_id": "report-producer", "verifier_agent_id": "report-verifier",
        "source_tuple": {"app_commit_sha": APP, "workplane_commit_sha": WORKPLANE, "plan_commit_sha": PLAN, "plan_sha256": "4" * 64, "manifest_sha256": "5" * 64},
        "deployment_tuple": deployment, "phase_gates": phase_gates, "final_reviews": final_reviews,
        "live_activation": {"approved": True, "approval_receipt": approval, "activated_at": "2026-08-02T01:10:00Z", "activation_receipt": activation, "rollback_deadline": "2026-08-02T03:00:00Z"},
        "canary": {
            "status": "PASS", "workflow_id": workflow_id, "provider_operation_id": operation_id,
            "generation_id": generation_id, "accepted_evaluation_id": accepted_evaluation_id,
            "account_scope_hash": "d" * 64, "action_name": "create", "payload_sha256": "e" * 64,
            "is_media": False, "is_youtube": False, "external_object_id": "external-1",
            "external_url": "https://example.com/public/1", "execution_receipt": execution,
            "provider_readback_receipt": readback, "provider_object_rollback_receipt": provider_rollback,
            "runtime_variant_rollback_receipt": runtime_rollback, "task_router_receipt": router,
            "tool_inheritance_receipt": tool,
        },
        "receipts": canonical, "blockers": [],
    }
    return report, deployment_path, target, phase_index_path, review_ledger_path


def invoke(root: Path, label: str, report: dict, deployment_path: Path, target: dict,
           phase_index_path: Path, review_ledger_path: Path) -> subprocess.CompletedProcess[str]:
    report_path = dump(root / f"{label}.json", report)
    out_path = root / f"{label}-verification.json"
    command = [
        sys.executable, str(VERIFIER), "--report", str(report_path), "--schema", str(REPORT_SCHEMA),
        "--evidence-schema", str(EVIDENCE_SCHEMA), "--deployment-manifest", str(deployment_path),
        "--phase-manifest-index", str(phase_index_path),
        "--review-attestation-ledger", str(review_ledger_path),
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
    global VERIFIER
    with tempfile.TemporaryDirectory(prefix="callscore-v9-verifier-selftest-") as directory:
        root = Path(directory)
        report, deployment_path, target, phase_index_path, review_ledger_path = build(root)
        VERIFIER = root / "verify-autonomy-final-report-contract-v9.py"
        shutil.copy2(FIXTURES / "verify-autonomy-final-report-contract-v9.py", VERIFIER)
        trust_config = {
            "deployment_manifest": str(deployment_path), "phase_manifest_index": str(phase_index_path),
            "review_attestation_ledger": str(review_ledger_path), "report_schema": str(REPORT_SCHEMA),
            "evidence_schema": str(EVIDENCE_SCHEMA), "app_commit_sha": APP, "plan_commit_sha": PLAN,
        }
        dump(root / "selftest-trust-config.json", trust_config)
        (root / "export-autonomy-verifier-trust-v9.py").write_text(
            """#!/usr/bin/env python3
import hashlib,json,sys
from pathlib import Path
here=Path(__file__).resolve().parent
cfg=json.loads((here/'selftest-trust-config.json').read_text())
def h(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
ledger=json.loads(Path(cfg['review_attestation_ledger']).read_text())
phase_index=json.loads(Path(cfg['phase_manifest_index']).read_text())
phase_contract={p:{'workplane_task_id':v['workplane_task_id'],'execution_owner':v['execution_owner'],'commands':v['commands']} for p,v in phase_index['phases'].items()}
payload={'schema':'callscore.db_autonomy_verifier_trust_bundle.v1','report_stream_id':sys.argv[sys.argv.index('--report-stream-id')+1],'report_sequence_no':int(sys.argv[sys.argv.index('--sequence-no')+1]),'app_commit_sha':cfg['app_commit_sha'],'plan_commit_sha':cfg['plan_commit_sha'],'deployment_manifest_sha256':h(cfg['deployment_manifest']),'phase_manifest_index_sha256':h(cfg['phase_manifest_index']),'review_attestation_ledger_sha256':h(cfg['review_attestation_ledger']),'report_schema_sha256':h(cfg['report_schema']),'evidence_schema_sha256':h(cfg['evidence_schema']),'verifier_script_sha256':h(here/'verify-autonomy-final-report-contract-v9.py'),'trust_exporter_script_sha256':h(__file__),'workplane_source_path':phase_index['workplane_source_path'],'phase_execution_contract':phase_contract,'attestations':ledger['attestations']}
print(json.dumps(payload,separators=(',',':'),sort_keys=True))
""",
            encoding="utf-8",
        )
        cases: list[tuple[str, dict, int]] = [("valid", report, 0)]
        bad_phase = copy.deepcopy(report)
        bad_phase["phase_gates"]["A"]["green_receipt"]["sha256"] = "0" * 64
        cases.append(("bad-phase-hash", bad_phase, 1))
        bad_phase_subject = copy.deepcopy(report)
        phase_review = bad_phase_subject["phase_gates"]["A"]["reviews"][0]
        phase_payload = json.loads(Path(phase_review["review_artifact"]["path"]).read_text())
        phase_payload["reviewed_artifact_sha256"] = ["0" * 64]
        phase_file = dump(root / "bad-phase-subject.json", phase_payload)
        phase_review["review_artifact"] = ref(phase_file, phase_payload["schema"], phase_payload["producer_agent_id"], phase_payload["verifier_agent_id"])
        cases.append(("wrong-phase-review-subject", bad_phase_subject, 1))
        bad_final_subject = copy.deepcopy(report)
        final_review = bad_final_subject["final_reviews"][0]
        final_payload = json.loads(Path(final_review["review_artifact"]["path"]).read_text())
        final_payload["reviewed_artifact_sha256"] = ["0" * 64]
        final_file = dump(root / "bad-final-subject.json", final_payload)
        final_review["review_artifact"] = ref(final_file, final_payload["schema"], final_payload["producer_agent_id"], final_payload["verifier_agent_id"])
        cases.append(("wrong-final-review-subject", bad_final_subject, 1))
        invented = copy.deepcopy(report)
        invented_review = invented["final_reviews"][0]
        invented_payload = json.loads(Path(invented_review["review_artifact"]["path"]).read_text())
        invented_payload["reviewer_agent_id"] = "invented-independent-reviewer"
        invented_payload["producer_agent_id"] = "invented-independent-reviewer"
        invented_file = dump(root / "invented-reviewer.json", invented_payload)
        invented_review["reviewer_agent_id"] = "invented-independent-reviewer"
        invented_review["review_artifact"] = ref(invented_file, invented_payload["schema"], "invented-independent-reviewer", invented_payload["verifier_agent_id"])
        cases.append(("invented-reviewer-without-attestation", invented, 1))

        forged = copy.deepcopy(report)
        forged_review = forged["final_reviews"][0]
        forged_review_payload = json.loads(Path(forged_review["review_artifact"]["path"]).read_text())
        forged_review_payload["reviewer_agent_id"] = "invented-independent-reviewer"
        forged_review_payload["producer_agent_id"] = "invented-independent-reviewer"
        forged_review_file = dump(root / "invented-reviewer-matching-review.json", forged_review_payload)
        forged_review["reviewer_agent_id"] = "invented-independent-reviewer"
        forged_review["review_artifact"] = ref(
            forged_review_file, forged_review_payload["schema"], "invented-independent-reviewer", forged_review_payload["verifier_agent_id"]
        )
        forged_att_payload = json.loads(Path(forged_review["review_execution_attestation"]["path"]).read_text())
        forged_att_payload["reviewer_agent_id"] = "invented-independent-reviewer"
        forged_att_payload["review_output_sha256"] = forged_review["review_artifact"]["sha256"]
        forged_att_file = dump(root / "invented-reviewer-matching-attestation.json", forged_att_payload)
        forged_review["review_execution_attestation"] = ref(
            forged_att_file, forged_att_payload["schema"], forged_att_payload["producer_agent_id"], forged_att_payload["verifier_agent_id"]
        )
        cases.append(("invented-reviewer-with-caller-authored-attestation", forged, 1))

        coherent_phase = copy.deepcopy(report)
        coherent_gate = coherent_phase["phase_gates"]["A"]
        coherent_gate["target_tuple"]["phase_manifest_sha256"] = "9" * 64
        for stage in ("red", "green", "refactor"):
            receipt_key = f"{stage}_receipt"
            receipt_payload = json.loads(Path(coherent_gate[receipt_key]["path"]).read_text())
            receipt_payload["phase_manifest_sha256"] = "9" * 64
            receipt_file = dump(root / f"coherent-phase-{stage}.json", receipt_payload)
            coherent_gate[receipt_key] = ref(
                receipt_file, receipt_payload["schema"], receipt_payload["producer_agent_id"], receipt_payload["verifier_agent_id"]
            )
        coherent_subject = ["9" * 64] + [
            coherent_gate[f"{stage}_receipt"]["sha256"] for stage in ("red", "green", "refactor")
        ]
        for index, review in enumerate(coherent_gate["reviews"]):
            review_payload = json.loads(Path(review["review_artifact"]["path"]).read_text())
            review_payload["reviewed_artifact_sha256"] = coherent_subject
            review_file = dump(root / f"coherent-phase-review-{index}.json", review_payload)
            review["review_artifact"] = ref(
                review_file, review_payload["schema"], review_payload["producer_agent_id"], review_payload["verifier_agent_id"]
            )
            att_payload = json.loads(Path(review["review_execution_attestation"]["path"]).read_text())
            att_payload["reviewed_artifact_sha256"] = coherent_subject
            att_payload["review_output_sha256"] = review["review_artifact"]["sha256"]
            att_file = dump(root / f"coherent-phase-attestation-{index}.json", att_payload)
            review["review_execution_attestation"] = ref(
                att_file, att_payload["schema"], att_payload["producer_agent_id"], att_payload["verifier_agent_id"]
            )
        cases.append(("coherent-phase-manifest-forgery", coherent_phase, 1))
        rawless = copy.deepcopy(report)
        raw_ref_receipt = rawless["phase_gates"]["A"]["red_receipt"]
        rawless_payload = json.loads(Path(raw_ref_receipt["path"]).read_text())
        rawless_payload.pop("stdout_artifact")
        rawless_file = dump(root / "rawless-phase-evidence.json", rawless_payload)
        rawless["phase_gates"]["A"]["red_receipt"] = ref(rawless_file, rawless_payload["schema"], rawless_payload["producer_agent_id"], rawless_payload["verifier_agent_id"])
        cases.append(("rawless-phase-evidence", rawless, 1))
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
        stale_runtime = copy.deepcopy(report)
        stale_path = Path(stale_runtime["canary"]["runtime_variant_rollback_receipt"]["path"])
        stale_payload = json.loads(stale_path.read_text())
        stale_payload["report_sequence_no"] = 2
        stale_file = dump(root / "runtime-rollback-stale-report.json", stale_payload)
        stale_runtime["canary"]["runtime_variant_rollback_receipt"] = ref(stale_file, stale_payload["schema"], stale_payload["producer_agent_id"], stale_payload["verifier_agent_id"])
        cases.append(("runtime-rollback-stale-report", stale_runtime, 1))
        results = []
        for label, payload, expected_exit in cases:
            completed = invoke(root, label, payload, deployment_path, target, phase_index_path, review_ledger_path)
            passed = (completed.returncode == expected_exit)
            results.append({"case": label, "exit_code": completed.returncode, "expected_exit_code": expected_exit, "passed": passed})
        caller_phase_index = json.loads(phase_index_path.read_text())
        caller_phase_index["caller_authored_extra_root"] = "forged"
        caller_phase_index_path = dump(root / "caller-authored-phase-index.json", caller_phase_index)
        completed = invoke(root, "caller-authored-phase-index", report, deployment_path, target, caller_phase_index_path, review_ledger_path)
        results.append({"case": "caller-authored-phase-index", "exit_code": completed.returncode, "expected_exit_code": 1, "passed": completed.returncode == 1})
        caller_ledger = json.loads(review_ledger_path.read_text())
        caller_ledger["attestations"].append({**caller_ledger["attestations"][0], "review_execution_id": uid(), "reviewer_agent_id": "invented-reviewer", "delegation_id": uid(), "review_artifact_sha256": "f" * 64})
        caller_ledger_path = dump(root / "caller-authored-review-ledger.json", caller_ledger)
        completed = invoke(root, "caller-authored-review-ledger", report, deployment_path, target, phase_index_path, caller_ledger_path)
        results.append({"case": "caller-authored-review-ledger", "exit_code": completed.returncode, "expected_exit_code": 1, "passed": completed.returncode == 1})
        alias_report = dump(root / "output-alias.json", report)
        alias_before = hashlib.sha256(alias_report.read_bytes()).hexdigest()
        alias_command = [
            sys.executable, str(VERIFIER), "--report", str(alias_report), "--schema", str(REPORT_SCHEMA),
            "--evidence-schema", str(EVIDENCE_SCHEMA), "--deployment-manifest", str(deployment_path),
            "--phase-manifest-index", str(phase_index_path),
            "--review-attestation-ledger", str(review_ledger_path),
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
        raw_alias = Path(report["phase_gates"]["A"]["red_receipt"]["path"])
        raw_payload = json.loads(raw_alias.read_text())
        raw_output = Path(raw_payload["stdout_artifact"]["path"])
        raw_before = hashlib.sha256(raw_output.read_bytes()).hexdigest()
        raw_alias_command = alias_command.copy()
        raw_alias_command[-1] = str(raw_output)
        raw_alias_completed = subprocess.run(raw_alias_command, text=True, capture_output=True)
        raw_unchanged = hashlib.sha256(raw_output.read_bytes()).hexdigest() == raw_before
        results.append({"case": "raw-evidence-output-alias", "exit_code": raw_alias_completed.returncode, "expected_exit_code": 1,
                        "evidence_unchanged": raw_unchanged, "passed": raw_alias_completed.returncode == 1 and raw_unchanged})
        print(json.dumps({"schema": "callscore.autonomy_verifier_selftest.v9", "results": results, "all_passed": all(row["passed"] for row in results)}, sort_keys=True))
        return 0 if all(row["passed"] for row in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
