import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface OwnedPublicExecutionReceiptLike {
  readonly channel?: string;
  readonly status?: string;
  readonly created_at_utc?: string;
  readonly post_url?: string;
  readonly provider_response?: Record<string, unknown>;
  readonly public_post_monitor?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export interface ChannelExecutionSummary {
  readonly total: number;
  readonly evaluated: number;
  readonly published: number;
  readonly ready_to_publish: number;
  readonly cooldown_skipped: number;
  readonly blocked: number;
}

export interface OwnedPublicExecutionSummary {
  readonly total_receipts: number;
  readonly evaluated_count: number;
  readonly published_count: number;
  readonly ready_to_publish_count: number;
  readonly cooldown_skipped_count: number;
  readonly blocked_count: number;
  readonly latest_public_post_url: string | null;
  readonly latest_public_post_created_at_utc: string | null;
  readonly channels: Record<string, ChannelExecutionSummary>;
}

export interface CmoResponseLearningReceipt {
  readonly workflow_name: "cmo_response_learning_monitor";
  readonly schema_version: "cmo_response_learning_monitor.v1";
  readonly run_id: string;
  readonly created_at: string;
  readonly mode: "read_only_monitor";
  readonly source_receipt_paths: readonly string[];
  readonly execution_summary: OwnedPublicExecutionSummary;
  readonly response_learning: {
    readonly status: "READY_FOR_READ_ONLY_LEARNING" | "MONITOR_ONLY_LIMITED_METRICS";
    readonly metric_sources_available: readonly string[];
    readonly learning_signals: readonly string[];
    readonly notes: string;
  };
  readonly public_action_performed: false;
  readonly external_mutation_performed: false;
  readonly provider_mutation_performed: false;
  readonly whop_mutation_performed: false;
  readonly production_mutation_performed: false;
  readonly forbidden_actions_not_performed: readonly string[];
  readonly next_safe_action: string;
  readonly artifact_path: string;
}

function normalizeChannel(value: unknown): string {
  const channel = typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "unknown";
  if (channel === "reddit" || channel === "reddit_owned") return "reddit_owned_profile";
  return channel;
}

function isPublished(status: string): boolean {
  return status === "published" || status.includes("published");
}

function isReadyToPublish(status: string): boolean {
  return status === "ready_to_publish" || status.includes("ready_to_publish");
}

function isEvaluated(status: string): boolean {
  return status === "evaluated" || status.includes("evaluated");
}

function isCooldown(status: string): boolean {
  return status.includes("cooldown") || status.includes("skipped");
}

function isBlocked(status: string): boolean {
  return status.includes("blocked") || status.includes("failed");
}

function newChannelSummary(): { total: number; evaluated: number; published: number; ready_to_publish: number; cooldown_skipped: number; blocked: number } {
  return { total: 0, evaluated: 0, published: 0, ready_to_publish: 0, cooldown_skipped: 0, blocked: 0 };
}

export function summarizeOwnedPublicExecutionReceipts(
  receipts: readonly OwnedPublicExecutionReceiptLike[],
): OwnedPublicExecutionSummary {
  const channels: Record<string, { total: number; evaluated: number; published: number; ready_to_publish: number; cooldown_skipped: number; blocked: number }> = {};
  let evaluatedCount = 0;
  let publishedCount = 0;
  let readyToPublishCount = 0;
  let cooldownSkippedCount = 0;
  let blockedCount = 0;
  let latestPostUrl: string | null = null;
  let latestPostAt: string | null = null;
  let latestPostMs = -Infinity;

  for (const receipt of receipts) {
    const channel = normalizeChannel(receipt.channel);
    const status = typeof receipt.status === "string" ? receipt.status.toLowerCase() : "unknown";
    const summary = channels[channel] ?? newChannelSummary();
    summary.total += 1;
    if (isPublished(status)) {
      summary.published += 1;
      publishedCount += 1;
      const created = typeof receipt.created_at_utc === "string" ? receipt.created_at_utc : null;
      const createdMs = created ? Date.parse(created) : NaN;
      if (Number.isFinite(createdMs) && createdMs > latestPostMs) {
        latestPostMs = createdMs;
        latestPostAt = created;
        latestPostUrl = typeof receipt.post_url === "string" ? receipt.post_url : null;
      }
    } else if (isReadyToPublish(status)) {
      summary.ready_to_publish += 1;
      readyToPublishCount += 1;
    } else if (isEvaluated(status)) {
      summary.evaluated += 1;
      evaluatedCount += 1;
    } else if (isCooldown(status)) {
      summary.cooldown_skipped += 1;
      cooldownSkippedCount += 1;
    } else if (isBlocked(status)) {
      summary.blocked += 1;
      blockedCount += 1;
    }
    channels[channel] = summary;
  }

  return {
    total_receipts: receipts.length,
    evaluated_count: evaluatedCount,
    published_count: publishedCount,
    ready_to_publish_count: readyToPublishCount,
    cooldown_skipped_count: cooldownSkippedCount,
    blocked_count: blockedCount,
    latest_public_post_url: latestPostUrl,
    latest_public_post_created_at_utc: latestPostAt,
    channels,
  };
}

function hasUsableMetricPayload(value: Record<string, unknown>): boolean {
  return Object.values(value).some((item) =>
    item === true || (typeof item === "number" && Number.isFinite(item)) || (typeof item === "string" && /^https?:\/\//.test(item)),
  );
}

function metricSources(receipts: readonly OwnedPublicExecutionReceiptLike[]): string[] {
  const sources = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.public_post_monitor && hasUsableMetricPayload(receipt.public_post_monitor)) sources.add("public_post_monitor");
    const provider = receipt.provider_response;
    if (provider && provider.not_called !== true && Object.keys(provider).length > 0) sources.add("provider_response_readback");
  }
  return [...sources].sort();
}

export function buildCmoResponseLearningReceipt(input: {
  readonly runId: string;
  readonly createdAt?: string;
  readonly sourceReceiptPaths: readonly string[];
  readonly receipts: readonly OwnedPublicExecutionReceiptLike[];
  readonly artifactPath: string;
}): CmoResponseLearningReceipt {
  const summary = summarizeOwnedPublicExecutionReceipts(input.receipts);
  const sources = metricSources(input.receipts);
  const learningSignals = [
    `evaluated_count=${summary.evaluated_count}`,
    `published_count=${summary.published_count}`,
    `ready_to_publish_count=${summary.ready_to_publish_count}`,
    `cooldown_skipped_count=${summary.cooldown_skipped_count}`,
    `blocked_count=${summary.blocked_count}`,
    `channels=${Object.keys(summary.channels).sort().join(",") || "none"}`,
  ];
  const limited = sources.length === 0 || !sources.includes("public_post_monitor");
  return {
    workflow_name: "cmo_response_learning_monitor",
    schema_version: "cmo_response_learning_monitor.v1",
    run_id: input.runId,
    created_at: input.createdAt ?? new Date().toISOString(),
    mode: "read_only_monitor",
    source_receipt_paths: input.sourceReceiptPaths,
    execution_summary: summary,
    response_learning: {
      status: limited ? "MONITOR_ONLY_LIMITED_METRICS" : "READY_FOR_READ_ONLY_LEARNING",
      metric_sources_available: sources,
      learning_signals: learningSignals,
      notes: "Read-only aggregation only. Use observed metrics/replies to improve future drafts; do not reply, DM, spend, or mutate providers from this monitor.",
    },
    public_action_performed: false,
    external_mutation_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    forbidden_actions_not_performed: [
      "reply/DM/outreach/send",
      "paid spend or boost",
      "provider mutation",
      "Whop pricing/product/customer/payment mutation",
      "DB/deploy/infra mutation",
      "non-owned public posting",
    ],
    next_safe_action: "collect read-only metrics/replies where available, feed lessons into the next owned-public draft packet, and keep replies/sends/spend gated",
    artifact_path: input.artifactPath,
  };
}

function timestampForPath(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function readLatestOwnedPublicExecutionReceipts(input: { readonly repoRoot?: string; readonly limit?: number } = {}): {
  readonly paths: readonly string[];
  readonly receipts: readonly OwnedPublicExecutionReceiptLike[];
} {
  const repoRoot = input.repoRoot ?? process.cwd();
  const dir = join(repoRoot, ".tmp", "workflow-receipts", "artofwar_owned_public_execution");
  if (!existsSync(dir)) return { paths: [], receipts: [] };
  const paths = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name))
    .filter((path) => {
      try { return statSync(path).isFile(); } catch { return false; }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, input.limit ?? 20);
  const receipts = paths
    .map(readJson)
    .filter((receipt): receipt is OwnedPublicExecutionReceiptLike => Boolean(receipt));
  return { paths, receipts };
}

export function runCmoResponseLearningMonitor(input: { readonly repoRoot?: string; readonly limit?: number } = {}): CmoResponseLearningReceipt {
  const repoRoot = input.repoRoot ?? process.cwd();
  const runId = `cmo-response-learning-monitor-${timestampForPath()}`;
  const artifactPath = join(repoRoot, ".tmp", "workflow-receipts", "cmo_response_learning_monitor", `${runId}.json`);
  const { paths, receipts } = readLatestOwnedPublicExecutionReceipts({ repoRoot, limit: input.limit });
  const receipt = buildCmoResponseLearningReceipt({
    runId,
    sourceReceiptPaths: paths,
    receipts,
    artifactPath,
  });
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
}

function main(argv = process.argv.slice(2)): void {
  const limitRaw = argValue(argv, "--limit");
  const limit = limitRaw ? Math.max(1, Math.min(100, Math.floor(Number(limitRaw)))) : 20;
  const receipt = runCmoResponseLearningMonitor({ limit });
  console.log(JSON.stringify(receipt, null, 2));
}

if (require.main === module) {
  main();
}
