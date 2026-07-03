import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import {
  CHANNEL_HEAD_TOOLBOX_CONTRACTS,
  RESTRICTED_TOOLS,
  STANDARD_TOOL_CLASSES,
  TASK_ROUTER_CONTRACT,
  buildAgentToolboxMatrix,
  validateAgentDelegation,
  validatePublicArtifactCandidate,
} from "../lib/agent-toolbox-contract";

const repoRoot = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "T").slice(0, 15) + "Z";
const runRoot = join("/srv/agents/hermes/runtime/channel-head-orchestrator/agent-toolbox-audit", timestamp);
const diagramsDir = join(runRoot, "diagrams");
const logsDir = join(runRoot, "tests");
const changedDir = join(runRoot, "changed-files");
mkdirSync(diagramsDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });
mkdirSync(changedDir, { recursive: true });

function sh(args: string[], opts: { cwd?: string; ok?: boolean } = {}): { stdout: string; status: number } {
  try {
    return { stdout: execFileSync(args[0], args.slice(1), { cwd: opts.cwd ?? repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), status: 0 };
  } catch (error: any) {
    const stdout = `${error.stdout?.toString?.() ?? ""}${error.stderr?.toString?.() ?? ""}`;
    if (!opts.ok) throw new Error(`${args.join(" ")} failed\n${stdout}`);
    return { stdout, status: error.status ?? 1 };
  }
}

function writeJson(name: string, data: unknown): void {
  writeFileSync(join(runRoot, name), `${JSON.stringify(data, null, 2)}\n`);
}

function writeMd(name: string, content: string): void {
  writeFileSync(join(runRoot, name), `${content.trim()}\n`);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

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

const discoveryPattern = "task-router|task_router|TaskRouter|toolbox|tools|skills|capabilities|toolset|toolsets|allowed_tools|delegable_tools|child_tools|spawn_child|child_subagent|delegate|delegation|channel head|channel_head|agent registry|agent_id|callscore-x-head|callscore-linkedin-head|callscore-reddit-head|callscore-youtube-head|callscore-community-drops-head|callscore-whop-commerce-head|callscore-email-partnership-drafts-head";
const grepRepo = sh(["git", "grep", "-n", "-E", discoveryPattern, "--", ":!node_modules", ":!dist", ":!build", ":!*.zip"], { ok: true }).stdout;
const hermesSearch = sh(["bash", "-lc", `grep -RInE '${discoveryPattern}' /srv/agents/hermes/profiles/callscore --exclude='*.zip' --exclude-dir='node_modules' --exclude-dir='dist' --exclude-dir='build' 2>/dev/null | head -n 400`], { ok: true }).stdout;
writeFileSync(join(runRoot, "tooling-discovery.raw.txt"), `# repo\n${grepRepo}\n# hermes-profile\n${hermesSearch}\n`);

function classifyDiscoveryLine(line: string): any | null {
  if (!line.trim()) return null;
  const [pathPart, lineNo, ...rest] = line.split(":");
  const sourcePath = pathPart.startsWith("/") ? pathPart : join(repoRoot, pathPart);
  const text = rest.join(":");
  const lower = `${sourcePath} ${text}`.toLowerCase();
  let type = "unknown";
  if (lower.includes("task-router") || lower.includes("task_router") || lower.includes("taskrouter")) type = "router";
  else if (lower.includes("skill")) type = "skill";
  else if (lower.includes("tool")) type = "tool";
  else if (lower.includes("capabilit")) type = "capability";
  else if (lower.includes("mcp")) type = "mcp";
  else if (sourcePath.endsWith(".py") || sourcePath.endsWith(".ts") || sourcePath.endsWith(".js")) type = "script";
  const mutation = lower.includes("publish") || lower.includes("provider") || lower.includes("send") ? "provider_public" : lower.includes("db") ? "db" : lower.includes("deploy") ? "deploy" : "none";
  return {
    name: basename(sourcePath),
    type,
    source_path: sourcePath,
    owner: sourcePath.includes("/srv/agents/hermes") ? "Hermes CallScore profile" : "CallScore repo",
    description: text.trim().slice(0, 260),
    mutation_capability: mutation,
    safe_in_read_only_verify: mutation === "none",
    safe_in_draft_ready: mutation !== "deploy" && mutation !== "db",
    safe_in_live_owned_public: false,
    delegable: !["provider_public", "db", "deploy"].includes(mutation),
    delegation_constraints: mutation === "none" ? [] : ["graph-owned gate required", "receipt required"],
    evidence_paths: [`${sourcePath}:${lineNo ?? "?"}`],
  };
}
const discoveredRaw = [...grepRepo.split("\n"), ...hermesSearch.split("\n")].map(classifyDiscoveryLine).filter(Boolean);
const byKey = new Map<string, any>();
for (const item of discoveredRaw) {
  const key = `${item.type}:${item.source_path}`;
  if (!byKey.has(key)) byKey.set(key, item);
  else byKey.get(key).evidence_paths.push(...item.evidence_paths);
}
const toolingDiscovery = {
  schema: "callscore.tooling_discovery.v1",
  generated_at_utc: new Date().toISOString(),
  execution_mode: "read_only_verify",
  source_roots: [repoRoot, "/srv/agents/hermes/profiles/callscore"],
  hermes_skills_hub_check: {
    docs_url: "https://hermes-agent.nousresearch.com/docs/skills/?utm_source=chatgpt.com",
    dynamic_page_extract_status: "page returned loading shell; hermes skills search CLI used as authoritative live index query",
    searched_terms: ["task-router", "platform-native-copywriting", "visual-qa", "tool inheritance", "delegation contract", "claim evidence"],
    found: ["task-router", "visual-qa", "claim-evidence-timeline-builder"],
    exact_missing: ["platform-native-copywriting", "tool inheritance", "delegation contract"],
    local_skill_created: "callscore-autopilot/callscore-agent-toolbox-contract",
  },
  objects: Array.from(byKey.values()),
};
writeJson("tooling-discovery.json", toolingDiscovery);
writeMd("tooling-discovery.md", `# Tooling discovery\n\n- Objects discovered: ${toolingDiscovery.objects.length}\n- Tools found: ${toolingDiscovery.objects.filter((o:any)=>o.type==='tool').length}\n- Skills found: ${toolingDiscovery.objects.filter((o:any)=>o.type==='skill').length}\n- Routers found: ${toolingDiscovery.objects.filter((o:any)=>o.type==='router').length}\n- Task-router status: ${toolingDiscovery.objects.some((o:any)=>o.type==='router') ? "present in docs/skills and implemented contract validator" : "implemented contract validator added; runtime router sparse"}\n- Skill registry status: Hermes Skills Hub searchable by CLI; docs page is dynamic loading shell in non-browser extract.\n- Toolbox registry status: implemented in src/lib/agent-toolbox-contract.ts.\n\n## Missing skills created locally\n\n- callscore-autopilot/callscore-agent-toolbox-contract\n`);

const matrix = buildAgentToolboxMatrix();
writeJson("agent-toolbox-matrix.json", { schema: "callscore.agent_toolbox_matrix.v1", generated_at_utc: new Date().toISOString(), agents: matrix });
writeMd("agent-toolbox-matrix.md", `# 51-agent toolbox matrix\n\n| agent | cluster | surface | role | status | children | task-router | provider mutation | publish | db write |\n|---|---|---|---|---:|---:|---|---|---|---|\n${matrix.map((a) => `| ${a.agent_id} | ${a.cluster} | ${a.surface} | ${a.role_type} | ${a.status} | ${a.allowed_child_agents.length} | ${a.task_router_access} | ${a.provider_mutation_access} | ${a.public_publish_access} | ${a.db_write_access} |`).join("\n")}\n`);

writeJson("channel-head-toolbox-contract.json", { schema: "callscore.channel_head_toolbox_contract.v1", generated_at_utc: new Date().toISOString(), contracts: CHANNEL_HEAD_TOOLBOX_CONTRACTS });
writeMd("channel-head-toolbox-contract.md", `# Channel-head toolbox contract\n\n| head | required tools | required skills | allowed children | delegable tools | non-delegable |\n|---|---:|---:|---:|---:|---|\n${Object.values(CHANNEL_HEAD_TOOLBOX_CONTRACTS).map((c) => `| ${c.agent_id} | ${c.required_tools.length} | ${c.required_skills.length} | ${c.allowed_child_agents.length} | ${c.delegable_tools_to_children.length} | ${c.non_delegable_tools.join(", ")} |`).join("\n")}\n\n## Delegable tools by channel head\n\n${Object.values(CHANNEL_HEAD_TOOLBOX_CONTRACTS).map((c) => `### ${c.agent_id}\n\nAllowed children: ${c.allowed_child_agents.join(", ")}\n\nDelegable tools: ${c.delegable_tools_to_children.join(", ")}`).join("\n\n")}\n`);

writeJson("task-router-contract.json", TASK_ROUTER_CONTRACT);
writeMd("task-router-contract.md", `# Task-router contract\n\nTask-router status: implemented contract validator in \`src/lib/agent-toolbox-contract.ts\`; legacy runtime docs mention task-router, but prior package had no task-router receipts.\n\nRequired APIs:\n\n${Object.entries(TASK_ROUTER_CONTRACT.required_api).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\nEvery public-output child task must carry \`callscore.agent_task_envelope.v1\` and emit \`callscore.task_router_receipt.v1\`.\n`);

writeJson("tool-inheritance-schema.json", {
  schema: "callscore.tool_inheritance_receipt.v1.schema",
  required: ["schema", "parent_agent_id", "child_agent_id", "workflow_id", "task_id", "execution_mode", "parent_tools_available", "child_tools_requested", "child_tools_granted", "child_tools_denied", "skills_required", "skills_confirmed", "task_router_receipt_id", "status", "created_at_utc"],
  properties: {
    schema: "callscore.tool_inheritance_receipt.v1",
    status: ["granted", "blocked"],
    execution_mode: ["read_only_verify", "draft_ready", "live_owned_public", "post_publish_closeout"],
  },
});

const validationCases = [
  validateAgentDelegation({ parent_agent_id: "callscore-x-head", child_agent_id: "callscore-x-production-copy-child", requested_tools: ["artifact-writer"], execution_mode: "draft_ready", artifact_type: "owned_post" }),
  validateAgentDelegation({ parent_agent_id: "callscore-email-channel-head", child_agent_id: "callscore-reviewer-head", requested_tools: ["artifact-reader"], execution_mode: "read_only_verify", artifact_type: "review" }),
  validateAgentDelegation({ parent_agent_id: "callscore-x-head", child_agent_id: "callscore-x-posting-agent", requested_tools: ["artifact-writer", "provider-public-mutation"], execution_mode: "draft_ready", artifact_type: "owned_post" }),
  validateAgentDelegation({ parent_agent_id: "callscore-youtube-head", child_agent_id: "callscore-youtube-script-agent", requested_tools: ["artifact-writer", "schema-validator", "transcript-evidence-reader"], execution_mode: "draft_ready", artifact_type: "youtube_script" }),
];
writeJson("delegation-validation-report.json", { schema: "callscore.delegation_validation_report.v1", generated_at_utc: new Date().toISOString(), cases: validationCases });
writeMd("delegation-validation-report.md", `# Delegation validation report\n\n| case | allowed | blocked reason | denied tools |\n|---:|---|---|---|\n${validationCases.map((c, i) => `| ${i + 1} | ${c.allowed} | ${c.blocked_reason ?? ""} | ${c.denied_tools.join(", ")} |`).join("\n")}\n`);

const packageZip = "/srv/agents/hermes/profiles/callscore/artifacts/callscore-production-candidate-repair-20260703T044633Z.zip";
const unzipDir = join(runRoot, "latest-package-unzip");
let latestAudit: any = { package_path: packageZip, package_exists: existsSync(packageZip), failures: [] };
if (existsSync(packageZip)) {
  mkdirSync(unzipDir, { recursive: true });
  sh(["unzip", "-q", packageZip, "-d", unzipDir], { ok: true });
  const files = listFiles(unzipDir);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));
  const allText = files.filter((file) => /\.(json|md|txt|log|raw|html)$/i.test(file)).map((file) => `\n--- ${relative(unzipDir, file)}\n${readFileSync(file, "utf8").slice(0, 20000)}`).join("\n");
  const childIds = Array.from(new Set([...allText.matchAll(/callscore-[a-z0-9-]+(?:-agent|-head|-child)/g)].map((m) => m[0])));
  const nonCanonicalChildIds = childIds.filter((id) => !matrix.some((a) => a.agent_id === id));
  const nonCanonicalHeads = childIds.filter((id) => id.endsWith("-head") && !Object.keys(CHANNEL_HEAD_TOOLBOX_CONTRACTS).includes(id) && !matrix.some((a) => a.agent_id === id));
  const hasTaskRouterReceipt = allText.includes("callscore.task_router_receipt.v1");
  const hasToolInheritanceReceipt = allText.includes("callscore.tool_inheritance_receipt.v1");
  const parentMedia = files.filter((file) => basename(file) === "media-render-receipt.json").map((file) => ({ path: relative(unzipDir, file), content: readFileSync(file, "utf8") }));
  const parentMediaIssues = parentMedia.filter((entry) => /run_production_candidate_repair|parent|ffmpeg|chromium|renderer/i.test(entry.content)).map((entry) => entry.path);
  const xPublic = files.find((file) => /channels\/x\/PUBLIC_OUTPUT\.md$/.test(file));
  const xLength = xPublic ? readFileSync(xPublic, "utf8").length : null;
  const xFitIssue = xPublic && readFileSync(xPublic, "utf8").length > 280 ? "x_public_output_file_over_280_chars_without_structured_long_form_receipt" : null;
  const youtubeClusterCollapsed = !["callscore-youtube-script-agent", "callscore-youtube-packaging-agent", "callscore-youtube-thumbnail-agent", "callscore-youtube-publishing-agent", "callscore-youtube-analytics-agent"].every((id) => allText.includes(id));
  const declaredWithoutPaths = jsonFiles.filter((file) => /receipts\.json$/.test(file)).flatMap((file) => {
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      const text = JSON.stringify(data);
      return /receipt/i.test(text) && !/path|source_path|evidence_paths|receipt_path/i.test(text) ? [relative(unzipDir, file)] : [];
    } catch { return []; }
  });
  latestAudit = {
    schema: "callscore.latest_package_toolbox_audit.v1",
    generated_at_utc: new Date().toISOString(),
    package_path: packageZip,
    package_exists: true,
    entries: files.length,
    child_ids_found: childIds,
    non_canonical_child_ids_found: nonCanonicalChildIds,
    non_canonical_channel_heads_found: nonCanonicalHeads,
    missing_task_router_receipts: !hasTaskRouterReceipt,
    missing_tool_inheritance_receipts: !hasToolInheritanceReceipt,
    parent_repair_harness_rendered_media: parentMediaIssues.length > 0,
    parent_media_receipt_paths: parentMediaIssues,
    youtube_cluster_collapsed: youtubeClusterCollapsed,
    x_platform_fit_issue: xFitIssue,
    sigabrt_child_accepted_as_canonical_grade: /SIGABRT|-6/.test(allText) && !hasToolInheritanceReceipt,
    declared_receipts_without_paths_or_source: declaredWithoutPaths,
    classification: "diagnostic_only_not_canonical_public_artifact",
    expected_failures_detected: [
      ...(nonCanonicalChildIds.length ? ["non-canonical child IDs"] : []),
      ...(!hasTaskRouterReceipt ? ["no task-router receipt"] : []),
      ...(!hasToolInheritanceReceipt ? ["no tool inheritance receipt"] : []),
      ...(parentMediaIssues.length ? ["parent repair harness rendered media"] : []),
      ...(youtubeClusterCollapsed ? ["YouTube cluster collapsed/incomplete"] : []),
      ...(xFitIssue ? ["X platform-fit weak structured enforcement"] : []),
      ...(/SIGABRT|-6/.test(allText) && !hasToolInheritanceReceipt ? ["SIGABRT child accepted without inheritance receipt"] : []),
      ...(declaredWithoutPaths.length ? ["declared receipts without paths/source"] : []),
    ],
  };
}
writeJson("latest-package-toolbox-audit.json", latestAudit);
writeMd("latest-package-toolbox-audit.md", `# Latest package toolbox audit\n\nPackage: ${packageZip}\n\nClassification: ${latestAudit.classification ?? "missing"}\n\n| check | result |\n|---|---|\n| non-canonical child IDs | ${(latestAudit.non_canonical_child_ids_found ?? []).join(", ") || "none detected by regex"} |\n| non-canonical channel heads | ${(latestAudit.non_canonical_channel_heads_found ?? []).join(", ") || "none detected"} |\n| missing task-router receipts | ${latestAudit.missing_task_router_receipts} |\n| missing tool inheritance receipts | ${latestAudit.missing_tool_inheritance_receipts} |\n| parent repair harness rendered media | ${latestAudit.parent_repair_harness_rendered_media} |\n| YouTube cluster collapsed/incomplete | ${latestAudit.youtube_cluster_collapsed} |\n| X platform-fit issue | ${latestAudit.x_platform_fit_issue ?? "none detected"} |\n| SIGABRT accepted without inheritance receipt | ${latestAudit.sigabrt_child_accepted_as_canonical_grade} |\n| declared receipt files without path/source | ${(latestAudit.declared_receipts_without_paths_or_source ?? []).length} |\n\nExpected failures detected: ${(latestAudit.expected_failures_detected ?? []).join("; ")}\n`);

writeFileSync(join(diagramsDir, "agent-toolbox-map.mmd"), `flowchart TD\n  Registry[Canonical 51 Agent Registry] --> Matrix[Agent Toolbox Matrix]\n  Matrix --> Heads[8 Channel Head Contracts]\n  Matrix --> Workers[43 Worker/Review/Data Contracts]\n  Heads --> Validator[validateAgentDelegation]\n  Validator --> Receipt[task_router_receipt + tool_inheritance_receipt]\n`);
writeFileSync(join(diagramsDir, "channel-head-delegation-map.mmd"), `flowchart LR\n${Object.values(CHANNEL_HEAD_TOOLBOX_CONTRACTS).flatMap((c) => c.allowed_child_agents.map((child) => `  ${c.agent_id.replace(/-/g,"_")} --> ${child.replace(/-/g,"_")}`)).join("\n")}\n`);
writeFileSync(join(diagramsDir, "task-router-flow.mmd"), `sequenceDiagram\n  participant Head as Channel Head\n  participant Router as task-router\n  participant Validator as Delegation Validator\n  participant Child as Canonical Child Agent\n  Head->>Router: callscore.agent_task_envelope.v1\n  Router->>Validator: validateDelegation + validateToolGrant\n  Validator-->>Router: allow/block\n  Router-->>Head: callscore.task_router_receipt.v1\n  Router->>Child: launch only if allowed\n`);
writeFileSync(join(diagramsDir, "tool-inheritance-flow.mmd"), `flowchart TD\n  A[Parent tools available] --> B[Child tools requested]\n  B --> C{Execution mode safe?}\n  C -- no --> D[Denied tools + blocked receipt]\n  C -- yes --> E{Parent delegable list allows?}\n  E -- no --> D\n  E -- yes --> F[tool_inheritance_receipt.v1 granted]\n`);
writeFileSync(join(diagramsDir, "youtube-toolbox-cluster.mmd"), `flowchart TD\n  YH[callscore-youtube-head] --> Script[script agent]\n  YH --> Pack[packaging agent]\n  YH --> Thumb[thumbnail agent]\n  Script --> Pub[publishing agent]\n  Pack --> Pub\n  Thumb --> Pub\n  Pub --> Review[review/trust/compliance/safety]\n  Analytics[analytics agent] --> YH\n  Commenting[commenting agent] --> YH\n`);

const gitDiff = sh(["git", "diff", "--", "src/lib/agent-toolbox-contract.ts", "tests/agent-toolbox-contract.test.ts"], { ok: true }).stdout;
writeFileSync(join(runRoot, "git-diff.patch"), gitDiff);
for (const f of ["src/lib/agent-toolbox-contract.ts", "tests/agent-toolbox-contract.test.ts"]) {
  const target = join(changedDir, f);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(join(repoRoot, f)));
}

const mutationAudit = {
  schema: "callscore.mutation_audit.v1",
  execution_mode: "read_only_verify",
  provider_public_mutation: false,
  public_publish: false,
  db_deploy_destructive_mutation: false,
  filesystem_writes: [runRoot, "src/lib/agent-toolbox-contract.ts", "tests/agent-toolbox-contract.test.ts", "/srv/agents/hermes/profiles/callscore/skills/callscore-autopilot/callscore-agent-toolbox-contract/SKILL.md"],
  note: "No live provider/public/DB/deploy/destructive mutation performed. Filesystem writes limited to repo contract/tests, local CallScore skill, and audit package artifacts.",
};
writeJson("mutation-audit.json", mutationAudit);

const credRegex = /(sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;
const scanned = listFiles(runRoot).filter((file) => !file.endsWith(".zip"));
const findings = scanned.flatMap((file) => {
  try {
    const text = readFileSync(file, "utf8");
    const matches = text.match(credRegex) ?? [];
    return matches.map((match) => ({ path: file, fingerprint: createHash("sha256").update(match).digest("hex").slice(0, 12) }));
  } catch { return []; }
});
writeJson("credential-scan.json", { schema: "callscore.credential_scan.v1", scanned_files: scanned.length, findings, status: findings.length === 0 ? "pass" : "fail" });

const sums = listFiles(runRoot).filter((file) => !file.endsWith("SHA256SUMS")).map((file) => `${sha256(file)}  ${relative(runRoot, file)}`).sort().join("\n") + "\n";
writeFileSync(join(runRoot, "SHA256SUMS"), sums);
writeFileSync(join(runRoot, "RUN_PATH.txt"), `${runRoot}\n`);
console.log(JSON.stringify({ runRoot, latestAuditSummary: latestAudit.expected_failures_detected ?? [], matrixCount: matrix.length }, null, 2));
