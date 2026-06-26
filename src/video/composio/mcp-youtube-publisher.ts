import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ComposioPublishResultSchema, YoutubePublishInputSchema, type ComposioPublishResult, type YoutubePublishInput } from "../schemas/youtube.schemas";
import type { VideoPublisher } from "./youtube-publisher";
import { evaluateExternalMutationRequest, finalizeExternalMutationReceipt } from "../../lib/workplane/external-mutation-guard";

export interface McpYoutubePublisherOptions {
  readonly helperPath?: string;
  readonly pythonPath?: string;
  readonly timeoutMs?: number;
  readonly artifactDir?: string;
}

const DEFAULT_HELPER = path.join(process.cwd(), "src/video/composio/private_provider_helper.py");
const DEFAULT_PYTHON = "/srv/agents/hermes/hermes-agent/venv/bin/python";

function sanitizeError(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "<redacted>")
    .replace(/ghp_[A-Za-z0-9]{12,}/g, "<redacted>")
    .replace(/x-api-key[^\n\r]*/gi, "x-api-key=<redacted>")
    .slice(0, 2_000);
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function runHelper(input: unknown, options: Required<Pick<McpYoutubePublisherOptions, "helperPath" | "pythonPath" | "timeoutMs">>): Promise<unknown> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-mcp-youtube-"));
  const inputPath = path.join(dir, "input.json");
  await fs.writeFile(inputPath, JSON.stringify(input), "utf8");
  return await new Promise<unknown>((resolve, reject) => {
    const child = spawn(options.pythonPath, [options.helperPath, inputPath], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONPATH: "/srv/agents/hermes/hermes-agent", HERMES_HOME: "/srv/agents/hermes" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("MCP YouTube helper timed out"));
    }, options.timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(sanitizeError(stderr || stdout || `helper exited ${code}`)));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`MCP YouTube helper returned non-JSON output: ${sanitizeError(stdout)}`)); }
    });
  });
}

export class McpYoutubePublisher implements VideoPublisher {
  constructor(private readonly options: McpYoutubePublisherOptions = {}) {}

  async publishVideo(input: YoutubePublishInput): Promise<ComposioPublishResult> {
    const parsed = YoutubePublishInputSchema.parse(input);
    const graphContext = parsed.graph_context ?? null;
    const preflight = evaluateExternalMutationRequest({
      mode: "approved_publish",
      graph_context: graphContext,
      requested_action: "provider_mutation",
      platform: "youtube",
      provider_tool: "YOUTUBE_UPLOAD_VIDEO",
      approved: true,
      approval_receipt_id: graphContext?.approval_receipt_id ?? null,
    });
    if (!preflight.allowed || graphContext?.graph_node_id !== "youtube_video_publish_node") {
      throw new Error(preflight.blocker_code ?? "non_graph_youtube_mutation_blocked");
    }
    if (parsed.privacyStatus !== "private" && process.env.VIDEO_PRIVATE_CANARY_ONLY !== "false") {
      throw new Error("MCP YouTube publisher is private-only unless VIDEO_PRIVATE_CANARY_ONLY=false is explicitly set");
    }
    const raw = await runHelper({ ...parsed, artifactDir: this.options.artifactDir }, {
      helperPath: this.options.helperPath ?? DEFAULT_HELPER,
      pythonPath: this.options.pythonPath ?? DEFAULT_PYTHON,
      timeoutMs: this.options.timeoutMs ?? 900_000,
    });
    const result = raw as Record<string, unknown>;
    if (!result.ok) throw new Error(`MCP YouTube private upload failed: ${sanitizeError(JSON.stringify(result).slice(0, 1_500))}`);
    const providerExecutionReceiptId = `mcp-youtube-helper-${String(result.youtubeVideoId ?? "unknown")}`;
    const finalReceipt = finalizeExternalMutationReceipt({
      mode: "approved_publish",
      graph_context: graphContext,
      requested_action: "provider_mutation",
      platform: "youtube",
      provider_tool: "YOUTUBE_UPLOAD_VIDEO",
      approved: true,
      approval_receipt_id: graphContext?.approval_receipt_id ?? null,
      provider_response: result,
      mutation_flags: { external_mutation_performed: true, provider_mutation_performed: true, public_publish_performed: true },
      provider_execution_receipt_id: providerExecutionReceiptId,
      child_receipt_ids: [providerExecutionReceiptId],
    });
    if (!finalReceipt.allowed) {
      throw new Error(finalReceipt.blocker_code ?? "provider_success_required_before_mutation_flags");
    }
    return ComposioPublishResultSchema.parse({
      jobId: parsed.jobId,
      youtubeVideoId: result.youtubeVideoId,
      publishUrl: result.publishUrl ?? null,
      privacyStatus: "private",
      publishAt: parsed.publishAt ?? null,
      rawResponse: jsonSafe({ ...result, externalMutationReceipt: finalReceipt.receipt }) as never,
    });
  }
}
