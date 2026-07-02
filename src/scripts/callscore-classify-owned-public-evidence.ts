import { readFileSync } from "node:fs";
import { classifyOwnedPublicEvidence, normalizeWorkflowStatus, type CallScoreExecutionMode } from "../lib/autonomy/autonomous-execution-gates";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function readJson(path?: string): any {
  if (!path) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

const draftPath = arg("--draft");
const qualityPath = arg("--quality");
const publishPath = arg("--publish");
const mode = (arg("--mode") ?? process.env.CALLSCORE_EXECUTION_MODE ?? "read_only_verify") as CallScoreExecutionMode;
const draft = readJson(draftPath);
const quality = readJson(qualityPath);
const publish = readJson(publishPath);
const flags = publish?.mutation_flags ?? {};
const graphPath = mode === "live_owned_public"
  ? {
      node_invoked: Boolean(publish?.receipt_path || publish?.graph_stdout_path || publish?.mutation_inputs_path || publish?.schema),
      graph_exit_code: publish?.graph_exit_code ?? 0,
      provider_mutation_performed: Boolean(flags.provider_mutation_performed ?? publish?.provider_mutation_performed),
      public_publish_performed: Boolean(flags.public_publish_performed ?? publish?.public_publish_performed),
      direct_parent_provider_mutation: Boolean(publish?.direct_parent_provider_mutation),
      blockers: publish?.blockers ?? [],
    }
  : {
      preview_available: Boolean(publish?.mutation_inputs_path || draft?.graph_mutation_inputs_path || draft?.graph_owned_path || publish?.graph_node_path || publish?.node_path),
      mutation_inputs_path: publish?.mutation_inputs_path ?? draft?.graph_mutation_inputs_path,
      blockers: publish?.blockers ?? [],
    };

const classification = classifyOwnedPublicEvidence({
  execution_mode: mode,
  data_packet: draft?.data_packet,
  x: draft?.x ?? draft?.channels?.x,
  linkedin: draft?.linkedin ?? draft?.channels?.linkedin,
  quality_gate: quality ?? draft?.quality_gate,
  visual_asset: draft?.visual_asset,
  graph_owned_path: graphPath,
  provider_auth_ok: publish?.status === "blocked_auth" ? false : undefined,
  duplicate_or_cadence_hit: Boolean(publish?.duplicate_or_cadence_hit || publish?.status === "blocked_duplicate_or_cadence"),
});

const normalized = normalizeWorkflowStatus({
  status: publish?.status ?? classification.status,
  graph_status: publish?.graph_status,
  quality_gate_ok: Boolean((quality ?? draft?.quality_gate)?.ok),
  mode,
  blockers: classification.blockers,
  provider_succeeded: Boolean(flags.provider_mutation_performed || publish?.provider_mutation_performed),
  target_url_or_id: publish?.target_url_or_id ?? publish?.external_object_id ?? publish?.external_url ?? null,
});

const merged = {
  ...classification,
  normalized_status: classification.normalized_status === "blocked" ? classification.normalized_status : normalized.normalized_status,
  status_reason: classification.normalized_status === "blocked" ? classification.status_reason : normalized.status_reason,
  execution_mode: mode,
  draft_path: draftPath,
  quality_gate_path: qualityPath,
  publish_receipt_path: publishPath,
};
console.log(JSON.stringify(merged, null, 2));
