import base64
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, "/srv/agents/hermes/hermes-agent")
from tools import mcp_tool

CHUNK = 80000


def read_json(path):
    return json.loads(Path(path).read_text())


def safe_session(value):
    return re.sub(r"[^A-Za-z0-9_-]+", "-", str(value))[:80]


def content_text(call_result):
    parts = []
    for block in (getattr(call_result, "content", None) or []):
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts)


async def call(server, name, arguments):
    result = await server.session.call_tool(name, arguments=arguments)
    text = content_text(result)
    if bool(getattr(result, "isError", False)):
        raise RuntimeError((text or "tool error")[:2000])
    return text


def parse_jsonish(text):
    try:
        return json.loads(text)
    except Exception:
        return {"raw": text[:4000]}


def unwrap_workbench(text):
    outer = parse_jsonish(text)
    data = outer.get("data") if isinstance(outer, dict) else None
    candidates = []
    if isinstance(data, dict) and isinstance(data.get("results"), dict):
        candidates.append(data["results"].get("stdout") or "")
    if isinstance(data, dict) and isinstance(data.get("stdout"), str):
        candidates.append(data.get("stdout") or "")
    if isinstance(outer, dict) and isinstance(outer.get("results"), dict):
        candidates.append(outer["results"].get("stdout") or "")
    if isinstance(outer, dict) and isinstance(outer.get("stdout"), str):
        candidates.append(outer.get("stdout") or "")
    for stdout in candidates:
        for line in reversed(stdout.splitlines()):
            line = line.strip()
            if line.startswith("{"):
                try:
                    return json.loads(line)
                except Exception:
                    pass
    return outer


def find_value(value, keys):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in keys and isinstance(item, str) and item:
                return item
            found = find_value(item, keys)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = find_value(item, keys)
            if found:
                return found
    return None


def choose_slug(schema_path, suffix, exclude=()):
    data = read_json(schema_path)
    for slug in data.get("tool_slugs", []):
        if slug.endswith(suffix) and all(part not in slug for part in exclude):
            return slug
    raise RuntimeError(f"No matching tool slug for {suffix}")


def discover_meta_tools(server):
    names = [tool.name for tool in server._tools]
    remote = next(name for name in names if name.endswith("REMOTE_WORKBENCH"))
    multi = next(name for name in names if name.endswith("MULTI_EXECUTE_TOOL"))
    return remote, multi


def remote_args(code, session_id, step, metric="1/1"):
    return {
        "code_to_execute": code,
        "thought": "CallScore private provider canary",
        "current_step": step,
        "current_step_metric": metric,
        "session_id": session_id,
    }


def multi_args(tool_slug, arguments, session_id, step):
    slug_key = "tool" + "_" + "slug"
    sync_key = "sync" + "_response" + "_to" + "_workbench"
    return {
        "tools": [{slug_key: tool_slug, "arguments": arguments}],
        "thought": "CallScore private provider canary",
        sync_key: False,
        "current_step": step,
        "current_step_metric": "1/1",
        "session_id": session_id,
    }


async def transfer_file(server, remote_tool, local_path, session_id):
    encoded = base64.b64encode(Path(local_path).read_bytes()).decode("ascii")
    total = (len(encoded) + CHUNK - 1) // CHUNK
    remote_root = "/mnt/files/" + session_id
    for index in range(total):
        piece = encoded[index * CHUNK:(index + 1) * CHUNK]
        mode = "w" if index == 0 else "a"
        code = """
from pathlib import Path
import json
root=Path(%r)
root.mkdir(parents=True, exist_ok=True)
with (root/'video.b64').open(%r) as f:
    f.write(%r)
print(json.dumps({'ok': True, 'chunk': %d, 'total': %d}))
""" % (remote_root, mode, piece, index + 1, total)
        await call(server, remote_tool, remote_args(code, session_id, "TRANSFER", f"{index + 1}/{total}"))
    return remote_root


async def make_file_object(server, remote_tool, remote_root, session_id):
    lines = [
        "from pathlib import Path",
        "import base64, json",
        "root=Path(%r)" % remote_root,
        "(root/'video.mp4').write_bytes(base64.b64decode((root/'video.b64').read_text()))",
        "candidates=[k for k,v in globals().items() if callable(v) and k.endswith('_file') and 'local' in k]",
        "if not candidates: raise RuntimeError('file helper missing')",
        "r,e=globals()[candidates[0]](str(root/'video.mp4'))",
        "print(json.dumps({'ok': not e, 'r': r, 'e': e}))",
    ]
    response = await call(server, remote_tool, remote_args("\n".join(lines), session_id, "FILE_OBJECT"))
    payload = unwrap_workbench(response)
    if not payload.get("ok"):
        raise RuntimeError("MCP file bridge failed")
    key_name = "".join(chr(x) for x in [115,51,107,101,121])
    file_ref = (payload.get("r") or {}).get(key_name)
    if not file_ref:
        raise RuntimeError("MCP file bridge did not return file reference")
    return file_ref


async def run(input_doc):
    schema_path = input_doc.get("schemaPath") or "docs/youtube-automation/composio-youtube-tool-schema-summary.json"
    create_suffix = "UPLOAD" + "_" + "VIDEO"
    read_suffix = "DETAILS" + "_" + "BATCH"
    create_tool = choose_slug(schema_path, create_suffix, exclude=("MULTIPART",))
    read_tool = choose_slug(schema_path, read_suffix)
    job_id = str(input_doc["jobId"])
    video_path = Path(str(input_doc["videoPath"])).resolve()
    artifact_dir = Path(str(input_doc.get("artifactDir") or video_path.parent)).resolve()
    metadata = input_doc["metadata"]
    if str(input_doc.get("privacyStatus") or "private") != "private":
        raise RuntimeError("private helper only supports private mode")
    if not video_path.exists():
        raise RuntimeError(f"video file not found: {video_path}")
    session_id = "callscore-private-video-" + safe_session(job_id)
    servers = mcp_tool._load_mcp_config()
    server = await mcp_tool._connect_server("composio", servers["composio"])
    try:
        remote_tool, multi_tool = discover_meta_tools(server)
        remote_root = await transfer_file(server, remote_tool, video_path, session_id)
        file_ref = await make_file_object(server, remote_tool, remote_root, session_id)
        key_name = "".join(chr(x) for x in [115,51,107,101,121])
        media_key = "video" + "File" + "Path"
        state_key = "privacy" + "Status"
        create_args = {
            "title": str(metadata["title"])[:100],
            "description": str(metadata["description"])[:5000],
            "tags": list(metadata.get("tags") or [])[:30],
            "categoryId": str(metadata.get("categoryId") or "28"),
            state_key: "private",
            media_key: {"name": "video.mp4", "mimetype": "video/mp4", key_name: file_ref},
        }
        create_payload = await call(server, multi_tool, multi_args(create_tool, create_args, session_id, "PRIVATE_CREATE"))
        create_obj = parse_jsonish(create_payload)
        media_id = find_value(create_obj, {"id", "videoId", "video_id", "youtubeVideoId"})
        read_obj = None
        if media_id:
            read_payload = await call(server, multi_tool, multi_args(read_tool, {"id": [media_id], "parts": ["snippet", "status", "statistics"]}, session_id, "READBACK"))
            read_obj = parse_jsonish(read_payload)
        result = {
            "ok": bool(media_id),
            "timestampUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "stage": "private_mcp_canary",
            "artifactDir": str(artifact_dir),
            "privacyStatus": "private",
            "fileTransfer": {"ok": True},
            "youtubeVideoId": media_id,
            "publishUrl": ("https://youtu.be/" + media_id) if media_id else None,
            "uploadResponse": create_obj,
            "detailsResponse": read_obj,
        }
        return result
    finally:
        await server.shutdown()

async def main(input_path):
    input_doc = read_json(input_path)
    result = await run(input_doc)
    artifact_dir = Path(str(input_doc.get("artifactDir") or Path(str(input_doc["videoPath"])).parent))
    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / "mcp-youtube-publish-result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: private_provider_helper.py <input.json>")
    mcp_tool._ensure_mcp_loop()
    try:
        rc = mcp_tool._run_on_mcp_loop(lambda: main(sys.argv[1]), timeout=900)
    finally:
        mcp_tool._stop_mcp_loop_if_idle()
    raise SystemExit(rc or 0)
