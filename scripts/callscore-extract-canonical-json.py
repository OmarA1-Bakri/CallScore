#!/usr/bin/env python3
import json
import pathlib
import sys
from json import JSONDecoder

CANONICAL_STATUS_FIELDS = ("status", "workflow_status", "runner_status", "normalized_status")


def candidate_score(obj: dict, expected_schema: str | None) -> int:
    score = 0
    schema = obj.get("schema")
    if schema:
        score += 10
    if expected_schema and schema == expected_schema:
        score += 30
    if obj.get("status") or obj.get("workflow_status"):
        score += 10
    if obj.get("normalized_status"):
        score += 4
    if obj.get("workflow_id"):
        score += 4
    if obj.get("runner_status"):
        score += 2
    return score


def scan_candidates(text: str) -> list[tuple[int, int, dict]]:
    decoder = JSONDecoder()
    candidates: list[tuple[int, int, dict]] = []
    for start, ch in enumerate(text):
        if ch != "{":
            continue
        try:
            value, end_rel = decoder.raw_decode(text[start:])
        except Exception:
            continue
        if not isinstance(value, dict):
            continue
        has_schema = isinstance(value.get("schema"), str) and bool(value.get("schema"))
        has_statusish = any(k in value for k in CANONICAL_STATUS_FIELDS)
        if has_schema and has_statusish:
            candidates.append((start, start + end_rel, value))
    return candidates


def is_nested(candidate: tuple[int, int, dict], all_candidates: list[tuple[int, int, dict]]) -> bool:
    start, end, _obj = candidate
    for other_start, other_end, _other in all_candidates:
        if other_start <= start and end <= other_end and (other_start, other_end) != (start, end):
            return True
    return False


def select_candidate(candidates: list[tuple[int, int, dict]], expected_schema: str | None = None):
    if not candidates:
        return None
    indexed = list(enumerate(candidates))
    ranked = sorted(
        indexed,
        key=lambda item: (
            0 if is_nested(item[1], candidates) else 1,
            1 if expected_schema and item[1][2].get("schema") == expected_schema else 0,
            candidate_score(item[1][2], expected_schema),
            item[1][1] - item[1][0],
            item[1][0],
        ),
    )
    return ranked[-1]


def validate(obj: dict, expected_schema: str | None):
    errors: list[str] = []
    if not obj.get("schema"):
        errors.append("schema_missing")
    elif expected_schema and obj.get("schema") != expected_schema:
        errors.append(f"schema_mismatch:{obj.get('schema')}")
    if not (obj.get("status") or obj.get("workflow_status") or obj.get("runner_status")):
        errors.append("status_missing")
    return errors


def main(argv):
    if len(argv) < 3:
        print("usage: callscore-extract-canonical-json.py <raw.txt> <canonical.json> [schema]", file=sys.stderr)
        return 2
    raw_path = pathlib.Path(argv[1])
    out_path = pathlib.Path(argv[2])
    expected_schema = argv[3] if len(argv) > 3 else None
    try:
        out_path.unlink()
    except FileNotFoundError:
        pass
    text = raw_path.read_text(errors="replace") if raw_path.exists() else ""
    candidates = scan_candidates(text)
    selected = select_candidate(candidates, expected_schema)
    result = {
        "schema": "callscore.canonical_json_extraction.v1",
        "raw_output_path": str(raw_path),
        "canonical_json_path": str(out_path),
        "canonical_json_found": False,
        "canonical_json_valid": False,
        "schema_errors": [],
        "selected_candidate_index": None,
        "candidate_count": len(candidates),
        "workflow_status": "failed",
    }
    if selected is None:
        result["schema_errors"].append("no_canonical_json_candidate_found")
        print(json.dumps(result, sort_keys=True))
        return 1
    selected_index, selected_tuple = selected
    _start, _end, obj = selected_tuple
    errors = validate(obj, expected_schema)
    result.update(
        {
            "canonical_json_found": True,
            "canonical_json_valid": len(errors) == 0,
            "schema_errors": errors,
            "selected_candidate_index": selected_index,
            "workflow_status": obj.get("workflow_status") or obj.get("normalized_status") or obj.get("status") or "failed",
        }
    )
    if not errors:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(obj, indent=2, sort_keys=True) + "\n")
    print(json.dumps(result, sort_keys=True))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
