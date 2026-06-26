type LegacyMutationDecision = {
  readonly status: "ok" | "blocked" | "failed";
  readonly blocker_code?: string;
  readonly provider_call_permitted: boolean;
  readonly allowed_next_action: "call_operating_goal" | "draft_only" | "read_status" | "return_blocker";
  readonly reason: string;
};

type LegacyMutationRequest = {
  readonly source_surface?: unknown;
  readonly callscore_goal?: unknown;
  readonly attempted_tool?: unknown;
  readonly command?: unknown;
  readonly graph_summary?: unknown;
};

const PROVIDER_WRITE_RE = /(?:TWITTER|LINKEDIN|REDDIT|YOUTUBE|GMAIL|RESEND|WHOP|ATTIO|POSTHOG)_(?:CREATE|SEND|UPLOAD|UPDATE|DELETE|COMMENT|FOLLOW|CAPTURE|TRACK|SYNC|MULTIPART|MUTATE)|COMPOSIO_MULTI_EXECUTE_TOOL|run_composio_tool|provider\.publish|xurl|x-cli/i;
const PUBLIC_PUBLISH_RE = /(?:TWITTER|LINKEDIN|REDDIT)_(?:CREATE|UPLOAD|COMMENT)|publish|post|comment/i;
const YOUTUBE_MUTATION_RE = /YOUTUBE_(?:UPLOAD|MULTIPART_UPLOAD|UPDATE|DELETE)|video[_ -]?(?:publish|upload|update)|thumbnail/i;
const EMAIL_SEND_RE = /(?:GMAIL|RESEND)_(?:SEND|CREATE)|email[_ -]?send|newsletter/i;
const WHOP_MUTATION_RE = /WHOP_(?:CREATE|UPDATE|DELETE|MUTATE)|whop[_ -]?(?:mutation|product|plan|checkout|customer|payment)/i;
const CRM_WRITE_RE = /(?:ATTIO|POSTHOG)_(?:CREATE|UPDATE|DELETE|CAPTURE|TRACK)|crm[_ -]?write|analytics[_ -]?write/i;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isGraphOnlyOperatingGoal(request: LegacyMutationRequest): boolean {
  const attempted = text(request.attempted_tool);
  const command = text(request.command);
  if (!/npm run operating:goal/.test(attempted) && !/npm run operating:goal/.test(command)) return false;
  return /--goal\s+\S+/.test(command) || /--goal=\S+/.test(command);
}

function classifyBlocker(request: LegacyMutationRequest): string {
  const attempted = text(request.attempted_tool);
  const source = text(request.source_surface);
  const combined = `${source}\n${attempted}`;

  if (YOUTUBE_MUTATION_RE.test(combined)) return "non_graph_youtube_mutation_blocked";
  if (EMAIL_SEND_RE.test(combined)) return "non_graph_email_send_blocked";
  if (WHOP_MUTATION_RE.test(combined)) return "non_graph_whop_mutation_blocked";
  if (CRM_WRITE_RE.test(combined)) return "non_graph_crm_write_blocked";
  if (PUBLIC_PUBLISH_RE.test(combined) && !/Claude_Code_Automations:content_creator/i.test(source)) return "non_graph_publish_blocked";
  if (PROVIDER_WRITE_RE.test(combined)) return "non_graph_external_mutation_blocked";
  return "non_graph_external_mutation_blocked";
}

export function assertLegacyCallScoreMutationBlocked(input: Record<string, unknown>): LegacyMutationDecision {
  const request = input as LegacyMutationRequest;
  if (isGraphOnlyOperatingGoal(request)) {
    return {
      status: "ok",
      provider_call_permitted: false,
      allowed_next_action: "call_operating_goal",
      reason: "legacy surface may only trigger the CallScore operating graph; provider calls remain disallowed here",
    };
  }

  const blocker = classifyBlocker(request);
  return {
    status: "blocked",
    blocker_code: blocker,
    provider_call_permitted: false,
    allowed_next_action: "call_operating_goal",
    reason: `CallScore legacy external mutation path blocked outside operating graph: ${blocker}`,
  };
}
