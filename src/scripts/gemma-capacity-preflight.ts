import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { freemem, totalmem } from "node:os";
import { loadEnv } from "./script-helpers";

export interface GemmaCapacityReceipt {
  readonly workflow_name: "gemma_capacity_preflight";
  readonly schema_version: "gemma_capacity_preflight.v1";
  readonly run_id: string;
  readonly created_at: string;
  readonly model: string;
  readonly ollama_host: string;
  readonly result: "passed" | "blocked";
  readonly can_load: boolean;
  readonly available_memory_gib: number;
  readonly total_memory_gib: number;
  readonly required_memory_gib: number | null;
  readonly response_text: string | null;
  readonly error: string | null;
  readonly blockers: readonly string[];
  readonly safety: {
    readonly public_action_performed: false;
    readonly provider_mutation_performed: false;
    readonly production_mutation_performed: false;
    readonly production_default_changed: false;
  };
  readonly next_safe_action: string;
  readonly artifact_path: string;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
}

function timestampForPath(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function gib(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
}

function parseRequiredMemoryGiB(error: string | null): number | null {
  if (!error) return null;
  const match = error.match(/requires more system memory \((\d+(?:\.\d+)?)\s*GiB\)/i);
  return match ? Number(match[1]) : null;
}

async function tryGenerate(input: { readonly host: string; readonly model: string }): Promise<{ readonly responseText: string | null; readonly errorText: string | null; readonly host: string }> {
  try {
    const response = await fetch(`${input.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: [{
          role: "user",
          content: "Transcript: I think Bitcoin is going to break above 100k in the next few months. If BTC loses 85k, I am wrong.",
        }],
        stream: false,
        options: { num_predict: 256, temperature: 0 },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const json = await response.json() as Record<string, unknown>;
    const message = typeof json.message === "object" && json.message !== null
      ? json.message as Record<string, unknown>
      : null;
    return {
      host: input.host,
      responseText: typeof message?.content === "string" ? message.content.trim() : null,
      errorText: typeof json.error === "string" ? json.error : (response.ok ? null : `http_${response.status}`),
    };
  } catch (error) {
    return { host: input.host, responseText: null, errorText: error instanceof Error ? error.message : String(error) };
  }
}

export async function runGemmaCapacityPreflight(input: {
  readonly model?: string;
  readonly ollamaHost?: string;
  readonly repoRoot?: string;
  readonly createdAt?: string;
} = {}): Promise<GemmaCapacityReceipt> {
  const model = input.model ?? process.env.GEMMA_CAPACITY_MODEL ?? "callscore-gemma4-extractor:latest";
  const primaryHost = (input.ollamaHost ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const fallbackHost = "http://127.0.0.1:11434";
  const repoRoot = input.repoRoot ?? process.cwd();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const runId = `gemma-capacity-preflight-${timestampForPath(new Date(createdAt))}`;
  const artifactPath = join(repoRoot, ".tmp", "workflow-receipts", "gemma_capacity_preflight", `${runId}.json`);

  const attempts = [primaryHost, ...(primaryHost === fallbackHost ? [] : [fallbackHost])];
  const results = [] as Awaited<ReturnType<typeof tryGenerate>>[];
  for (const host of attempts) {
    const result = await tryGenerate({ host, model });
    results.push(result);
    if (result.errorText === null && result.responseText && result.responseText.length > 0) break;
    if (result.errorText?.includes("requires more system memory")) break;
  }
  const best = results.find((item) => item.errorText === null && item.responseText !== null && item.responseText.length > 0) ?? results[results.length - 1];
  const responseText = best?.responseText ?? null;
  const errorText = best?.errorText ?? null;

  const canLoad = errorText === null && responseText !== null && responseText.length > 0;
  const required = parseRequiredMemoryGiB(errorText);
  const blockers = canLoad ? [] : [
    required !== null ? "insufficient_system_memory" : "gemma_generation_failed",
  ];
  const receipt: GemmaCapacityReceipt = {
    workflow_name: "gemma_capacity_preflight",
    schema_version: "gemma_capacity_preflight.v1",
    run_id: runId,
    created_at: createdAt,
    model,
    ollama_host: best?.host ?? primaryHost,
    result: canLoad ? "passed" : "blocked",
    can_load: canLoad,
    available_memory_gib: gib(freemem()),
    total_memory_gib: gib(totalmem()),
    required_memory_gib: required,
    response_text: responseText,
    error: errorText,
    blockers,
    safety: {
      public_action_performed: false,
      provider_mutation_performed: false,
      production_mutation_performed: false,
      production_default_changed: false,
    },
    next_safe_action: canLoad
      ? "Gemma4 is capacity-ready for bounded shadow/eval jobs; keep production default changes gated."
      : "Use lightweight Qwen for verifier work now; free memory, configure swap/smaller Gemma4 quant, or route Gemma4 jobs to laptop/GPU before always-on Gemma4 scheduling.",
    artifact_path: artifactPath,
  };
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

async function main(): Promise<void> {
  loadEnv();
  const receipt = await runGemmaCapacityPreflight({
    model: argValue(process.argv.slice(2), "--model") ?? undefined,
    ollamaHost: argValue(process.argv.slice(2), "--ollama-host") ?? undefined,
  });
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.result !== "passed") process.exitCode = 78;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
