export interface ComposioToolExecutor {
  executeTool(toolSlug: string, input: Record<string, unknown>): Promise<unknown>;
}

export class ComposioHttpClient implements ComposioToolExecutor {
  constructor(private readonly options: { readonly apiKey?: string; readonly baseUrl?: string } = {}) {}

  async executeTool(toolSlug: string, input: Record<string, unknown>): Promise<unknown> {
    const apiKey = this.options.apiKey ?? process.env.COMPOSIO_API_KEY;
    const baseUrl = this.options.baseUrl ?? process.env.COMPOSIO_API_BASE_URL ?? "https://backend.composio.dev/api/v1";
    if (!apiKey) throw new Error("COMPOSIO_API_KEY is required for direct Composio execution");
    const response = await fetch(`${baseUrl}/actions/${encodeURIComponent(toolSlug)}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(`Composio ${toolSlug} failed ${response.status}: ${text.slice(0, 500)}`);
    return body;
  }
}
