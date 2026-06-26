import { evaluateExternalMutationRequest } from "../../lib/workplane/external-mutation-guard";

export interface ComposioToolExecutor {
  executeTool(toolSlug: string, input: Record<string, unknown>): Promise<unknown>;
}

const MUTATION_TOOL_RE = /_(?:CREATE|CREATION|SEND|UPLOAD|UPDATE|DELETE|COMMENT|FOLLOW|CAPTURE|TRACK|SYNC|MULTIPART|MUTATE)/i;

function isMutationTool(toolSlug: string): boolean {
  return MUTATION_TOOL_RE.test(toolSlug) && !/_GET_|_LIST_|_FETCH_|_READ_|_SEARCH_/i.test(toolSlug);
}

function platformFromTool(toolSlug: string): string {
  const prefix = toolSlug.split("_")[0]?.toLowerCase();
  if (["twitter", "x"].includes(prefix)) return "x";
  if (["linkedin", "reddit", "youtube", "gmail", "resend", "whop", "attio", "posthog"].includes(prefix)) return prefix;
  return "unknown";
}

function graphContextFromInputOrEnv(input: Record<string, unknown>): unknown {
  if (input.__callscore_graph_context && typeof input.__callscore_graph_context === "object") return input.__callscore_graph_context;
  return null;
}

function stripInternalGraphContext(input: Record<string, unknown>): Record<string, unknown> {
  const { graph_context, __callscore_graph_context, __callscore_mode, ...providerInput } = input;
  void graph_context;
  void __callscore_graph_context;
  void __callscore_mode;
  return providerInput;
}

export function assertComposioMutationGraphContext(toolSlug: string, input: Record<string, unknown>): Record<string, unknown> {
  if (!isMutationTool(toolSlug)) return input;
  const providerInput = stripInternalGraphContext(input);
  const graphContext = graphContextFromInputOrEnv(input);
  const platform = platformFromTool(toolSlug);
  const decision = evaluateExternalMutationRequest({
    mode: input.__callscore_mode ?? "bounded_write",
    graph_context: graphContext,
    requested_action: "provider_mutation",
    platform,
    provider_tool: toolSlug,
    provider_payload: providerInput,
    approved: true,
    approval_receipt_id: graphContext && typeof graphContext === "object" && !Array.isArray(graphContext)
      ? (graphContext as Record<string, unknown>).approval_receipt_id ?? null
      : null,
  });

  if (!decision.allowed) {
    throw new Error(`${decision.blocker_code ?? "missing_operating_graph_context"}: ${toolSlug}`);
  }

  return providerInput;
}

export class ComposioHttpClient implements ComposioToolExecutor {
  constructor(private readonly options: { readonly apiKey?: string; readonly baseUrl?: string } = {}) {}

  async executeTool(toolSlug: string, input: Record<string, unknown>): Promise<unknown> {
    const providerInput = assertComposioMutationGraphContext(toolSlug, input);
    const apiKey = this.options.apiKey ?? process.env.COMPOSIO_API_KEY;
    const baseUrl = this.options.baseUrl ?? process.env.COMPOSIO_API_BASE_URL ?? "https://backend.composio.dev/api/v1";
    if (!apiKey) throw new Error("COMPOSIO_API_KEY is required for direct Composio execution");
    const response = await fetch(`${baseUrl}/actions/${encodeURIComponent(toolSlug)}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(providerInput),
    });
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(`Composio ${toolSlug} failed ${response.status}: ${text.slice(0, 500)}`);
    return body;
  }
}
