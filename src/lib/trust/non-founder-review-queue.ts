import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { NonFounderReviewItemSchema, type RiskClass, type TrustDecision } from "../autonomy/contracts";
import type { TrustEntityType } from "./trust-decision-engine";

export type NonFounderReviewQueueName = "trust_ops";
export type NonFounderReviewerRole = "trust_ops_reviewer";
export type NonFounderReviewerAction = "approve_publish" | "keep_suppressed" | "request_more_evidence";
export type NonFounderRecommendedAction = NonFounderReviewerAction;
export type NonFounderReviewStatus = "open" | "resolved";

export interface NonFounderReviewEvidenceRef {
  readonly artifact_id: string;
  readonly evidence_type: "workflow_artifact" | "approval_gate" | "receipt" | "local_artifact";
  readonly uri: string;
  readonly summary: string;
  readonly hash?: string;
}

export interface NonFounderReviewResolution {
  readonly action: NonFounderReviewerAction;
  readonly resolved_at: string;
  readonly resolved_by: string;
  readonly gate_receipt_id: string | null;
  readonly notes: string | null;
  readonly public_scoring_allowed: boolean;
}

export interface NonFounderReviewItemOptions {
  readonly review_item_id?: string;
  readonly now?: string;
  readonly due_at: string;
  readonly expires_at?: string | null;
  readonly reconsider_after?: string | null;
  readonly risk_class?: RiskClass;
  readonly recommended_action?: NonFounderRecommendedAction;
  readonly source_workflow?: string;
  readonly source_workflow_run_id?: string;
  readonly source_run_id?: string;
  readonly evidence?: readonly NonFounderReviewEvidenceRef[];
}

export interface NonFounderReviewItem {
  readonly schema_version: "callscore_non_founder_review_item.v1";
  readonly review_item_id: string;
  readonly created_at: string;
  readonly queue: NonFounderReviewQueueName;
  readonly reviewer_role: NonFounderReviewerRole;
  readonly entity_type: TrustEntityType;
  readonly entity_id: string | number;
  readonly risk_class: RiskClass;
  readonly due_at: string;
  readonly expires_at: string | null;
  readonly reconsider_after: string | null;
  readonly trust_decision_id: string;
  readonly artifact_ids: readonly string[];
  readonly evidence: readonly NonFounderReviewEvidenceRef[];
  readonly reason_codes: readonly string[];
  readonly recommended_action: NonFounderRecommendedAction;
  readonly source_workflow: string;
  readonly source_workflow_run_id: string;
  readonly source_run_id: string;
  readonly payload_hash: string;
  readonly allowed_reviewer_actions: readonly NonFounderReviewerAction[];
  readonly founder_escalation_allowed: false;
  readonly restricted_action_gate_required: "NON_FOUNDER_TRUST_REVIEW" | null;
  readonly status: NonFounderReviewStatus;
  readonly external_send_performed: false;
  readonly provider_mutation_performed: false;
  readonly whop_mutation_performed: false;
  readonly production_mutation_performed: false;
  readonly resolution?: NonFounderReviewResolution;
}

export interface NonFounderReviewWriteResult {
  readonly path: string;
  readonly item: NonFounderReviewItem;
}

export interface NonFounderReviewReadOptions {
  readonly root?: string;
  readonly status?: NonFounderReviewStatus | "all";
}

export interface NonFounderReviewResolveOptions {
  readonly root?: string;
  readonly review_item_id: string;
  readonly action: NonFounderReviewerAction;
  readonly resolved_by: string;
  readonly now?: string;
  readonly gate_receipt_id?: string | null;
  readonly notes?: string | null;
}

const QUEUE_RECEIPT_DIR = join(".tmp", "workflow-receipts", "non_founder_review_queue");

function stableReviewId(decision: TrustDecision): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ decision_id: decision.decision_id, source_artifact_ids: decision.source_artifact_ids }))
    .digest("hex")
    .slice(0, 24);
  return `nfr_${hash}`;
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function safeSegment(value: string, field: string): string {
  const raw = value.trim();
  if (raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    throw new Error(`${field} is not safe for a local review queue path`);
  }
  const normalized = raw.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized || normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    throw new Error(`${field} is not safe for a local review queue path`);
  }
  return normalized;
}

function localQueueDir(root = process.cwd()): string {
  return resolve(root, QUEUE_RECEIPT_DIR);
}

export function nonFounderReviewItemPath(reviewItemId: string, root = process.cwd()): string {
  const base = localQueueDir(root);
  const out = resolve(join(base, `${safeSegment(reviewItemId, "review_item_id")}.json`));
  if (!out.startsWith(`${base}/`) && out !== base) throw new Error("review queue path escapes queue root");
  return out;
}

function defaultEvidence(decision: TrustDecision, sourceWorkflowRunId: string): readonly NonFounderReviewEvidenceRef[] {
  return decision.source_artifact_ids.map((artifactId) => ({
    artifact_id: artifactId,
    evidence_type: "workflow_artifact",
    uri: `workflow://${sourceWorkflowRunId}/artifacts/${artifactId}`,
    summary: `Evidence artifact ${artifactId} referenced by trust decision ${decision.decision_id}.`,
  }));
}

function validateReviewDecision(decision: TrustDecision): void {
  if (decision.decision !== "review" || !decision.non_founder_review_required || decision.reviewer_role !== "trust_ops_reviewer") {
    throw new Error("non-founder review items can only be created for review decisions");
  }
  if (decision.founder_review_required !== false) {
    throw new Error("founder escalation is not allowed for routine trust review");
  }
  if (decision.source_artifact_ids.length === 0) {
    throw new Error("non-founder review requires evidence refs");
  }
}

export function createNonFounderReviewItem(
  decision: TrustDecision,
  options: NonFounderReviewItemOptions,
): NonFounderReviewItem {
  validateReviewDecision(decision);
  const sourceWorkflow = options.source_workflow ?? "trust_decision_engine";
  const sourceWorkflowRunId = options.source_workflow_run_id ?? decision.decision_id;
  const sourceRunId = options.source_run_id ?? sourceWorkflowRunId;
  const evidence = options.evidence ?? defaultEvidence(decision, sourceWorkflowRunId);
  if (evidence.length === 0) throw new Error("non-founder review requires evidence details");

  const base = {
    review_item_id: options.review_item_id ?? stableReviewId(decision),
    trust_decision_id: decision.decision_id,
    artifact_ids: decision.source_artifact_ids,
    evidence,
    reason_codes: decision.reason_codes,
    source_workflow: sourceWorkflow,
    source_workflow_run_id: sourceWorkflowRunId,
    source_run_id: sourceRunId,
    recommended_action: options.recommended_action ?? "request_more_evidence",
    risk_class: options.risk_class ?? "public_claim_risk",
    expires_at: options.expires_at ?? options.due_at,
    reconsider_after: options.reconsider_after ?? null,
  } as const;

  const item: NonFounderReviewItem = {
    schema_version: "callscore_non_founder_review_item.v1",
    review_item_id: base.review_item_id,
    created_at: options.now ?? new Date().toISOString(),
    queue: "trust_ops",
    reviewer_role: "trust_ops_reviewer",
    entity_type: decision.entity_type,
    entity_id: decision.entity_id,
    risk_class: base.risk_class,
    due_at: options.due_at,
    expires_at: base.expires_at,
    reconsider_after: base.reconsider_after,
    trust_decision_id: base.trust_decision_id,
    artifact_ids: base.artifact_ids,
    evidence: base.evidence,
    reason_codes: base.reason_codes,
    recommended_action: base.recommended_action,
    source_workflow: base.source_workflow,
    source_workflow_run_id: base.source_workflow_run_id,
    source_run_id: base.source_run_id,
    payload_hash: sha256Json(base),
    allowed_reviewer_actions: ["approve_publish", "keep_suppressed", "request_more_evidence"],
    founder_escalation_allowed: false,
    restricted_action_gate_required: base.recommended_action === "approve_publish" ? "NON_FOUNDER_TRUST_REVIEW" : null,
    status: "open",
    external_send_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
  };
  NonFounderReviewItemSchema.parse(item);
  return item;
}

function parseItem(json: string): NonFounderReviewItem {
  return NonFounderReviewItemSchema.parse(JSON.parse(json)) as NonFounderReviewItem;
}

export function writeNonFounderReviewItem(item: NonFounderReviewItem, root = process.cwd()): NonFounderReviewWriteResult {
  const parsed = NonFounderReviewItemSchema.parse(item) as NonFounderReviewItem;
  const out = nonFounderReviewItemPath(parsed.review_item_id, root);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  return { path: out, item: parsed };
}

export function readNonFounderReviewQueue(options: NonFounderReviewReadOptions = {}): readonly NonFounderReviewItem[] {
  const dir = localQueueDir(options.root);
  if (!existsSync(dir)) return [];
  const status = options.status ?? "all";
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => parseItem(readFileSync(join(dir, name), "utf8")))
    .filter((item) => status === "all" || item.status === status)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.review_item_id.localeCompare(b.review_item_id));
}

function requireOpen(item: NonFounderReviewItem): void {
  if (item.status !== "open") throw new Error(`non-founder review item ${item.review_item_id} is not open`);
}

export function resolveNonFounderReviewItem(options: NonFounderReviewResolveOptions): NonFounderReviewWriteResult {
  const path = nonFounderReviewItemPath(options.review_item_id, options.root);
  if (!existsSync(path)) throw new Error(`non-founder review item not found: ${options.review_item_id}`);
  const item = parseItem(readFileSync(path, "utf8"));
  requireOpen(item);
  if (!item.allowed_reviewer_actions.includes(options.action)) {
    throw new Error(`reviewer action is not allowed: ${options.action}`);
  }
  if (options.action === "approve_publish" && !options.gate_receipt_id?.trim()) {
    throw new Error("approve_publish requires NON_FOUNDER_TRUST_REVIEW gate receipt evidence");
  }

  const resolved: NonFounderReviewItem = {
    ...item,
    status: "resolved",
    restricted_action_gate_required: options.action === "approve_publish" ? "NON_FOUNDER_TRUST_REVIEW" : item.restricted_action_gate_required,
    resolution: {
      action: options.action,
      resolved_at: options.now ?? new Date().toISOString(),
      resolved_by: options.resolved_by,
      gate_receipt_id: options.gate_receipt_id ?? null,
      notes: options.notes ?? null,
      public_scoring_allowed: options.action === "approve_publish",
    },
  };
  return writeNonFounderReviewItem(resolved, options.root);
}