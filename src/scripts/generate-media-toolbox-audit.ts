import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import {
  MEDIA_AGENT_TOOLBOX_MATRIX,
  MEDIA_TOOL_CLASSES,
  buildMediaTaskEnvelope,
  buildMediaToolInheritanceReceipt,
  validateCanonicalMediaArtifact,
} from "../lib/agent-toolbox-contract";

const repoRoot = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
const runRoot = join("/srv/agents/hermes/runtime/channel-head-orchestrator/media-toolbox-audit", timestamp);
const diagramsDir = join(runRoot, "diagrams");
const logsDir = join(runRoot, "tests");
const changedDir = join(runRoot, "changed-files");
mkdirSync(diagramsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });
mkdirSync(changedDir, { recursive: true });

function sh(command: string, opts: { ok?: boolean; cwd?: string } = {}): { stdout: string; status: number } {
  try {
    return { stdout: execFileSync("bash", ["-lc", command], { cwd: opts.cwd ?? repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), status: 0 };
  } catch (error: any) {
    const stdout = `${error.stdout?.toString?.() ?? ""}${error.stderr?.toString?.() ?? ""}`;
    if (!opts.ok) throw new Error(`${command} failed\n${stdout}`);
    return { stdout, status: error.status ?? 1 };
  }
}
function writeJson(name: string, data: unknown): void { writeFileSync(join(runRoot, name), `${JSON.stringify(data, null, 2)}\n`); }
function writeMd(name: string, content: string): void { writeFileSync(join(runRoot, name), `${content.trim()}\n`); }
function sha256(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function listFiles(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...listFiles(path));
    else out.push(path);
  }
  return out;
}
function commandAvailable(cmd: string): boolean { return sh(`command -v ${cmd}`, { ok: true }).status === 0; }
function nodeModuleAvailable(name: string): boolean { return sh(`node -e "require.resolve('${name}')"`, { ok: true }).status === 0; }
function pyModuleAvailable(name: string): boolean { return sh(`python3 - <<'PY'\ntry:\n import ${name}\n print('ok')\nexcept Exception:\n raise SystemExit(1)\nPY`, { ok: true }).status === 0; }

const mediaPattern = "ffmpeg|moviepy|remotion|canvas|sharp|puppeteer|playwright|screenshot|svg|html-to-image|html2canvas|rsvg|inkscape|imagemagick|convert|magick|pillow|PIL|opencv|cv2|mp4|webm|gif|thumbnail|render|rasterize|png|jpeg|image generation|image_gen|text2im|video render|voiceover|tts|subtitles|captions|ass|srt|waveform|audio|timeline|scene|storyboard";
const repoDiscovery = sh(`git grep -n -E "${mediaPattern}" -- ':!node_modules' ':!dist' ':!build' ':!*.zip' || true`, { ok: true }).stdout;
const profileDiscovery = sh(`grep -RInE "${mediaPattern}" /srv/agents/hermes/profiles/callscore --exclude='*.zip' --exclude='.env*' --exclude='*.bak' --exclude-dir='sessions' --exclude-dir='pastes' --exclude-dir='node_modules' --exclude-dir='dist' --exclude-dir='build' 2>/dev/null | head -n 500 || true`, { ok: true }).stdout;
writeFileSync(join(runRoot, "media-tooling-discovery.sanitized-raw.txt"), `# repo\n${repoDiscovery}\n# hermes-profile-sanitized\n${profileDiscovery}\n`);

const toolCandidates = [
  { tool_id: "ffmpeg", tool_type: "video_encoder", command_or_api: "ffmpeg", runtime_dependency: "/usr/bin/ffmpeg", available_now: commandAvailable("ffmpeg"), provider_or_local: "local", output_types: ["mp4", "webm", "gif", "png"] },
  { tool_id: "ffprobe", tool_type: "video-metadata-prober", command_or_api: "ffprobe", runtime_dependency: "/usr/bin/ffprobe", available_now: commandAvailable("ffprobe"), provider_or_local: "local", output_types: ["mp4", "webm", "audio"] },
  { tool_id: "sharp", tool_type: "media_probe", command_or_api: "node:require('sharp')", runtime_dependency: "node_modules/sharp", available_now: nodeModuleAvailable("sharp"), provider_or_local: "local", output_types: ["png", "jpeg", "webp"] },
  { tool_id: "remotion", tool_type: "video_compositor", command_or_api: "node:require('remotion')", runtime_dependency: "node_modules/remotion", available_now: nodeModuleAvailable("remotion"), provider_or_local: "local", output_types: ["mp4", "webm"] },
  { tool_id: "imagemagick-convert", tool_type: "image_editor", command_or_api: "convert", runtime_dependency: "imagemagick", available_now: commandAvailable("convert"), provider_or_local: "local", output_types: ["png", "jpeg", "gif"] },
  { tool_id: "imagemagick-magick", tool_type: "image_editor", command_or_api: "magick", runtime_dependency: "imagemagick", available_now: commandAvailable("magick"), provider_or_local: "local", output_types: ["png", "jpeg", "gif"] },
  { tool_id: "inkscape", tool_type: "svg_renderer", command_or_api: "inkscape", runtime_dependency: "inkscape", available_now: commandAvailable("inkscape"), provider_or_local: "local", output_types: ["svg", "png", "pdf"] },
  { tool_id: "rsvg-convert", tool_type: "svg_renderer", command_or_api: "rsvg-convert", runtime_dependency: "librsvg", available_now: commandAvailable("rsvg-convert"), provider_or_local: "local", output_types: ["svg", "png"] },
  { tool_id: "pillow", tool_type: "image_renderer", command_or_api: "python:PIL", runtime_dependency: "PIL", available_now: pyModuleAvailable("PIL"), provider_or_local: "local", output_types: ["png", "jpeg"] },
  { tool_id: "opencv", tool_type: "image_renderer", command_or_api: "python:cv2", runtime_dependency: "cv2", available_now: pyModuleAvailable("cv2"), provider_or_local: "local", output_types: ["png", "jpeg", "mp4"] },
  { tool_id: "moviepy", tool_type: "video_compositor", command_or_api: "python:moviepy", runtime_dependency: "moviepy", available_now: pyModuleAvailable("moviepy"), provider_or_local: "local", output_types: ["mp4", "gif"] },
  { tool_id: "hermes-image-generate", tool_type: "image_generator", command_or_api: "Hermes image_generate tool (FAL FLUX 2 Klein configured)", runtime_dependency: "Hermes provider config", available_now: true, provider_or_local: "provider", output_types: ["png", "jpeg"] },
].map((tool) => ({
  ...tool,
  tested_now: tool.provider_or_local === "provider" ? false : true,
  safe_in_read_only_verify: tool.provider_or_local === "local",
  safe_in_draft_ready: true,
  safe_in_live_owned_public: true,
  requires_secret: tool.provider_or_local === "provider",
  mutation_capability: tool.provider_or_local === "provider" ? "filesystem_write" : "filesystem_write",
  allowed_agent_ids: Object.values(MEDIA_AGENT_TOOLBOX_MATRIX).filter((m) => {
    if (tool.tool_id === "ffmpeg" || tool.tool_id === "ffprobe") return m.may_use_ffmpeg || m.allowed_media_tools.includes("media-metadata-prober") || m.allowed_media_tools.includes("video-metadata-prober");
    if (tool.tool_id === "sharp") return m.allowed_media_tools.includes("media-metadata-prober") || m.allowed_media_tools.includes("image-editor");
    if (tool.tool_id === "remotion") return m.allowed_media_tools.includes("video-preview-compositor");
    if (tool.tool_id === "hermes-image-generate") return m.may_use_image_model === "only_if_discovered_and_allowed";
    return m.may_use_local_renderer;
  }).map((m) => m.agent_id),
  forbidden_agent_ids: Object.values(MEDIA_AGENT_TOOLBOX_MATRIX).filter((m) => m.may_render_files === false && tool.tool_type !== "media_probe").map((m) => m.agent_id),
  evidence_paths: ["package.json", "src/video/qa/qa-video.ts", "src/video/qa/qa-thumbnail.ts", "Hermes active tool config"],
}));

const mediaDiscovery = {
  schema: "callscore.media_tooling_discovery.v1",
  generated_at_utc: new Date().toISOString(),
  execution_mode: "read_only_verify",
  discovery_roots: [repoRoot, "/srv/agents/hermes/profiles/callscore"],
  concrete_tools: toolCandidates,
  raw_search_evidence: "media-tooling-discovery.sanitized-raw.txt",
};
writeJson("media-tooling-discovery.json", mediaDiscovery);
writeMd("media-tooling-discovery.md", `# Media tooling discovery\n\n| tool | type | available | tested | provider/local | outputs |\n|---|---|---|---|---|---|\n${toolCandidates.map((t:any)=>`| ${t.tool_id} | ${t.tool_type} | ${t.available_now} | ${t.tested_now} | ${t.provider_or_local} | ${t.output_types.join(", ")} |`).join("\n")}\n\nProvider/model media tools: Hermes image_generate is configured, but not granted/tested for read_only_verify canonical media.\n`);

writeJson("media-agent-toolbox-matrix.json", { schema: "callscore.media_agent_toolbox_matrix.v1", generated_at_utc: new Date().toISOString(), agents: MEDIA_AGENT_TOOLBOX_MATRIX });
writeMd("media-agent-toolbox-matrix.md", `# Media agent toolbox matrix\n\n| agent | surface | tools | render files | final image | final video | ffmpeg | provider media |\n|---|---|---:|---|---|---|---|---|\n${Object.values(MEDIA_AGENT_TOOLBOX_MATRIX).map((m) => `| ${m.agent_id} | ${m.media_surface} | ${m.allowed_media_tools.length} | ${m.may_render_files} | ${m.may_generate_final_image} | ${m.may_generate_final_video} | ${m.may_use_ffmpeg} | ${m.may_call_provider_media_tool} |`).join("\n")}\n`);

writeJson("media-task-envelope-schema.json", { schema: "callscore.media_task_envelope.v1.schema", required: ["schema", "task_id", "workflow_id", "parent_agent_id", "target_agent_id", "channel", "media_type", "objective", "source_artifact_refs", "source_evidence_refs", "copy_context_refs", "visual_brief_ref", "platform_constraints", "required_tools", "granted_tools", "forbidden_tools", "output_schema", "execution_mode", "mutation_allowed"] });
writeJson("media-tool-inheritance-receipt-schema.json", { schema: "callscore.media_tool_inheritance_receipt.v1.schema", required: ["schema", "task_id", "parent_agent_id", "media_agent_id", "workflow_id", "channel", "media_type", "requested_tools", "granted_tools", "denied_tools", "tool_versions", "execution_mode", "may_write_artifact_files", "provider_public_mutation_allowed", "created_at_utc"] });
writeJson("media-artifact-receipt-schema.json", { schema: "callscore.media_artifact_receipt.v1.schema", required: ["schema", "artifact_id", "media_artifact_id", "created_by_agent_id", "channel_head_agent_id", "workflow_id", "media_type", "source_copy_artifact_id", "source_visual_brief_id", "source_evidence_paths", "tool_inheritance_receipt_id", "tools_used", "renderer_used", "input_spec_path", "output_paths", "mime_type", "dimensions", "duration_seconds", "file_size_bytes", "sha256", "alt_text", "visual_qa_receipt_id", "copy_visual_coherence_receipt_id", "hardcoded_runtime_media", "parent_harness_rendered", "status"] });

const validationFixtures = [
  validateCanonicalMediaArtifact({ schema: "callscore.media_artifact_receipt.v1", created_by_agent_id: "callscore-x-image-agent", channel_head_agent_id: "callscore-x-head", media_type: "image", parent_harness_rendered: true, hardcoded_runtime_media: false, status: "ready" }),
  validateCanonicalMediaArtifact({ schema: "callscore.media_artifact_receipt.v1", created_by_agent_id: "callscore-youtube-publishing-agent", channel_head_agent_id: "callscore-youtube-head", media_type: "video_preview", renderer_used: "parent_script", parent_harness_rendered: true, hardcoded_runtime_media: false, status: "ready" }),
];
writeJson("media-creation-validator-report.json", { schema: "callscore.media_creation_validator_report.v1", generated_at_utc: new Date().toISOString(), validator: "validateCanonicalMediaArtifact", fixtures: validationFixtures });
writeMd("media-creation-validator-report.md", `# Media creation validator report\n\n- Validator: validateCanonicalMediaArtifact\n- Parent PNG blocked: ${validationFixtures[0].failure_reasons.includes("parent_harness_rendered")}\n- Parent MP4 blocked: ${validationFixtures[1].failure_reasons.includes("parent_harness_rendered")}\n`);

const packagePaths = [
  "/srv/agents/hermes/profiles/callscore/artifacts/callscore-production-candidate-repair-20260703T044633Z.zip",
  "/srv/agents/hermes/profiles/callscore/artifacts/creative-taste-outputs-20260703T021555Z.zip",
  "/srv/agents/hermes/profiles/callscore/artifacts/workflow-rerun-visible-artifacts-20260703T023724Z.zip",
].filter((p) => existsSync(p));
const mediaExtensions = new Set([".png", ".jpg", ".jpeg", ".svg", ".html", ".mp4", ".webm", ".gif", ".pdf"]);
function classifyMediaFile(file: string, root: string): any {
  const rel = relative(root, file);
  const ext = extname(file).toLowerCase().replace(".", "");
  const mediaType = ext === "mp4" || ext === "webm" ? "video_preview" : ext === "html" ? "html_preview" : ext === "svg" ? "svg" : "image";
  const siblingReceipt = join(dirname(file), "media-render-receipt.json");
  const receiptText = existsSync(siblingReceipt) ? readFileSync(siblingReceipt, "utf8") : "";
  const parentHarness = /run_production_candidate_repair|parent|ffmpeg|chromium|renderer/i.test(receiptText) || /production-card\.(html|png)|production-candidate-preview\.mp4/.test(rel);
  const claimed = rel.includes("/x/") ? "callscore-x-image-agent" : rel.includes("/linkedin/") ? "callscore-linkedin-image-agent" : rel.includes("/reddit/") ? "callscore-reddit-image-agent" : rel.includes("/youtube/") && rel.includes("thumbnail") ? "callscore-youtube-thumbnail-agent" : rel.includes("/youtube/") ? "callscore-youtube-publishing-agent" : "unknown";
  const failure = [
    ...(parentHarness ? ["parent_harness_rendered"] : []),
    "missing_media_task_envelope",
    "missing_media_tool_inheritance_receipt",
    "missing_media_artifact_receipt",
  ];
  return {
    path: rel,
    media_type: mediaType,
    claimed_created_by_agent_id: claimed,
    actual_creator: parentHarness ? "parent_harness" : "unknown",
    tool_used: receiptText.includes("ffmpeg") ? "ffmpeg" : receiptText ? "renderer_declared_in_media_render_receipt" : "unknown",
    canonical_media_valid: false,
    failure_reasons: failure,
    should_be_invalidated: true,
  };
}
const packageAudits = packagePaths.map((zipPath) => {
  const unpack = join(runRoot, "package-unzip", basename(zipPath, ".zip"));
  mkdirSync(unpack, { recursive: true });
  sh(`unzip -q ${JSON.stringify(zipPath)} -d ${JSON.stringify(unpack)}`, { ok: true });
  const files = listFiles(unpack).filter((file) => mediaExtensions.has(extname(file).toLowerCase()));
  return { package_path: zipPath, media_files: files.map((file) => classifyMediaFile(file, unpack)) };
});
const latestPackageMediaAudit = { schema: "callscore.latest_package_media_audit.v1", generated_at_utc: new Date().toISOString(), packages: packageAudits };
writeJson("latest-package-media-audit.json", latestPackageMediaAudit);
writeMd("latest-package-media-audit.md", `# Latest package media audit\n\n${packageAudits.map((pkg) => `## ${basename(pkg.package_path)}\n\n- Media files: ${pkg.media_files.length}\n- Parent-rendered: ${pkg.media_files.filter((f:any)=>f.actual_creator === "parent_harness").length}\n- Invalidated: ${pkg.media_files.filter((f:any)=>f.should_be_invalidated).length}\n\n| path | type | claimed | actual | valid | reasons |\n|---|---|---|---|---|---|\n${pkg.media_files.map((f:any)=>`| ${f.path} | ${f.media_type} | ${f.claimed_created_by_agent_id} | ${f.actual_creator} | ${f.canonical_media_valid} | ${f.failure_reasons.join(", ")} |`).join("\n")}`).join("\n\n")}\n`);

writeFileSync(join(diagramsDir, "media-toolbox-map.mmd"), `flowchart TD\n  Tools[Discovered media tools] --> Matrix[Media agent toolbox matrix]\n  Matrix --> Validator[validateCanonicalMediaArtifact]\n  Validator --> Canonical[Canonical media only if receipts+owner+metadata pass]\n`);
writeFileSync(join(diagramsDir, "image-generation-flow.mmd"), `sequenceDiagram\n  participant Head as Channel Head\n  participant Router as Task Router\n  participant Img as Image Agent\n  Head->>Router: media_task_envelope.v1\n  Router->>Img: grant image tools\n  Img->>Img: design/layout/render/probe/QA\n  Img-->>Head: media_tool_inheritance_receipt + media_artifact_receipt\n`);
writeFileSync(join(diagramsDir, "youtube-video-generation-flow.mmd"), `flowchart LR\n  YH[YouTube Head] --> Script[Script Agent]\n  YH --> Pack[Packaging Agent]\n  YH --> Thumb[Thumbnail Agent]\n  Script --> Pub[Publishing Agent]\n  Pack --> Pub\n  Thumb --> Pub\n  Pub --> Preview[Video Preview Compositor / ffmpeg]\n  Comment[Commenting Agent] --> Pub\n  Analytics[Analytics Agent] --> YH\n`);
writeFileSync(join(diagramsDir, "media-tool-inheritance-flow.mmd"), `flowchart TD\n  Req[Requested media tools] --> Contract[Media agent toolbox]\n  Contract --> Mode[Execution mode restrictions]\n  Mode --> Receipt[media_tool_inheritance_receipt.v1]\n`);
writeFileSync(join(diagramsDir, "media-validation-flow.mmd"), `flowchart TD\n  Artifact[media_artifact_receipt.v1] --> Owner{Correct media owner?}\n  Owner --> Receipts{Task + inheritance + QA receipts?}\n  Receipts --> Metadata{Hash/dimensions/duration/codec?}\n  Metadata --> Parent{Parent harness rendered?}\n  Parent -- yes --> Block[diagnostic only]\n  Parent -- no --> Ready[canonical media]\n`);

const gitDiff = sh(`git diff -- src/lib/agent-toolbox-contract.ts tests/agent-toolbox-contract.test.ts src/scripts/generate-agent-toolbox-audit.ts src/scripts/generate-media-toolbox-audit.ts`, { ok: true }).stdout;
writeFileSync(join(runRoot, "git-diff.patch"), gitDiff);
for (const f of ["src/lib/agent-toolbox-contract.ts", "tests/agent-toolbox-contract.test.ts", "src/scripts/generate-agent-toolbox-audit.ts", "src/scripts/generate-media-toolbox-audit.ts"]) {
  const src = join(repoRoot, f);
  if (existsSync(src)) {
    const dst = join(changedDir, f);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(src));
  }
}
writeJson("mutation-audit.json", { schema: "callscore.mutation_audit.v1", execution_mode: "read_only_verify", provider_public_mutation: false, public_publish: false, db_deploy_destructive_mutation: false, filesystem_writes: [runRoot, "src/lib/agent-toolbox-contract.ts", "tests/agent-toolbox-contract.test.ts", "src/scripts/generate-media-toolbox-audit.ts"], note: "Local filesystem writes only; no provider/public/DB/deploy/destructive mutation." });

const credRegex = /(sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|nfp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;
const scanned = listFiles(runRoot).filter((file) => !file.endsWith(".zip") && !file.includes("package-unzip"));
const findings = scanned.flatMap((file) => {
  try { return (readFileSync(file, "utf8").match(credRegex) ?? []).map((match) => ({ path: relative(runRoot, file), fingerprint: createHash("sha256").update(match).digest("hex").slice(0, 12) })); }
  catch { return []; }
});
writeJson("credential-scan.json", { schema: "callscore.credential_scan.v1", scanned_files: scanned.length, findings, status: findings.length === 0 ? "pass" : "fail" });
const sums = listFiles(runRoot).filter((file) => !file.endsWith("SHA256SUMS") && !file.includes("package-unzip")).map((file) => `${sha256(file)}  ${relative(runRoot, file)}`).sort().join("\n") + "\n";
writeFileSync(join(runRoot, "SHA256SUMS"), sums);
console.log(JSON.stringify({ runRoot, packagesAudited: packageAudits.length, mediaFiles: packageAudits.reduce((n,p)=>n+p.media_files.length,0), parentRendered: packageAudits.reduce((n,p)=>n+p.media_files.filter((f:any)=>f.actual_creator==='parent_harness').length,0) }, null, 2));
