import { readFileSync } from "node:fs";
import { timestamp } from "./script-helpers";
import { decideTrust, type TrustDecision, type TrustDecisionInput } from "../lib/trust/trust-decision-engine";
import {
  createNonFounderReviewItem,
  readNonFounderReviewQueue,
  resolveNonFounderReviewItem,
  writeNonFounderReviewItem,
  type NonFounderRecommendedAction,
  type NonFounderReviewerAction,
} from "../lib/trust/non-founder-review-queue";
import type { RiskClass } from "../lib/autonomy/contracts";

function valueAfter(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function requireArg(argv: readonly string[], flag: string): string {
  const value = valueAfter(argv, flag);
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

function parseRecommendedAction(value: string | null): NonFounderRecommendedAction {
  if (value === "approve_publish" || value === "keep_suppressed" || value === "request_more_evidence") return value;
  return "request_more_evidence";
}

function parseReviewerAction(value: string): NonFounderReviewerAction {
  if (value === "approve_publish" || value === "keep_suppressed" || value === "request_more_evidence") return value;
  throw new Error(`Unsupported --action ${value}`);
}

function parseRiskClass(value: string | null): RiskClass {
  if (
    value === "safe_owned_public" ||
    value === "restricted_provider" ||
    value === "restricted_financial" ||
    value === "restricted_db_deploy" ||
    value === "restricted_credentials" ||
    value === "restricted_outreach" ||
    value === "public_claim_risk"
  ) return value;
  return "public_claim_risk";
}

function loadDecision(path: string): TrustDecision {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as TrustDecision | TrustDecisionInput;
  if ("decision" in parsed && "decision_id" in parsed) return parsed as TrustDecision;
  return decideTrust(parsed as TrustDecisionInput);
}

export function main(argv = process.argv.slice(2)): void {
  const root = valueAfter(argv, "--root") ?? process.cwd();
  const now = valueAfter(argv, "--now") ?? timestamp();

  if (hasFlag(argv, "--create")) {
    const decision = loadDecision(requireArg(argv, "--decision-json"));
    const writeResult = writeNonFounderReviewItem(createNonFounderReviewItem(decision, {
      review_item_id: valueAfter(argv, "--review-item-id") ?? undefined,
      now,
      due_at: requireArg(argv, "--due-at"),
      expires_at: valueAfter(argv, "--expires-at") ?? undefined,
      reconsider_after: valueAfter(argv, "--reconsider-after") ?? undefined,
      risk_class: parseRiskClass(valueAfter(argv, "--risk-class")),
      recommended_action: parseRecommendedAction(valueAfter(argv, "--recommended-action")),
      source_workflow: valueAfter(argv, "--source-workflow") ?? undefined,
      source_workflow_run_id: valueAfter(argv, "--source-workflow-run-id") ?? undefined,
      source_run_id: valueAfter(argv, "--source-run-id") ?? undefined,
    }), root);
    console.log(JSON.stringify({
      ok: true,
      action: "created",
      path: writeResult.path,
      review_item_id: writeResult.item.review_item_id,
      founder_escalation_allowed: false,
      external_send_performed: false,
      provider_mutation_performed: false,
    }, null, 2));
    return;
  }

  if (hasFlag(argv, "--resolve")) {
    const writeResult = resolveNonFounderReviewItem({
      root,
      review_item_id: requireArg(argv, "--resolve"),
      action: parseReviewerAction(requireArg(argv, "--action")),
      resolved_by: requireArg(argv, "--resolved-by"),
      now,
      gate_receipt_id: valueAfter(argv, "--gate-receipt-id"),
      notes: valueAfter(argv, "--notes"),
    });
    console.log(JSON.stringify({
      ok: true,
      action: "resolved",
      path: writeResult.path,
      review_item_id: writeResult.item.review_item_id,
      status: writeResult.item.status,
      resolution: writeResult.item.resolution,
      founder_escalation_allowed: false,
      external_send_performed: false,
      provider_mutation_performed: false,
    }, null, 2));
    return;
  }

  const status = valueAfter(argv, "--status") as "open" | "resolved" | "all" | null;
  const items = readNonFounderReviewQueue({ root, status: status ?? "open" });
  console.log(JSON.stringify({
    ok: true,
    action: "list",
    count: items.length,
    items,
    founder_escalation_allowed: false,
    external_send_performed: false,
    provider_mutation_performed: false,
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
