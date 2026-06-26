import { enqueueNewCallAlert, claimPendingAlerts, revertClaim, type ClaimedAlertRow } from "./alerts";
import { throwIfCronDeadlineExceeded } from "@/app/api/cron/deadline";
import { query } from "./db";
import { sendEmail } from "./resend";
import { buildUnsubscribeUrl } from "./unsubscribe-token";
import { deliverWebhookEvent } from "./webhooks";

export interface AlertScanResult {
  readonly pairs: number;
  readonly enqueued: number;
  readonly duplicates: number;
  readonly failures: number;
}

export interface AlertSendResult {
  readonly claimed: number;
  readonly digests: number;
  readonly sent: number;
  readonly failed: number;
  readonly skippedNoEmail: number;
}

interface CronSignalOptions {
  readonly signal?: AbortSignal;
}

interface NewCallRow {
  readonly call_id: number;
  readonly creator_id: number;
  readonly user_id: string;
}

function throwIfAborted(signal?: AbortSignal): void {
  throwIfCronDeadlineExceeded(signal);
}

export async function runAlertScan(hours = 6, options: CronSignalOptions = {}): Promise<AlertScanResult> {
  const windowHours = Math.max(1, Math.min(hours, 24 * 7));
  throwIfAborted(options.signal);
  const pairs = await query<NewCallRow>(
    `SELECT c.id AS call_id, c.creator_id, w.user_id
     FROM calls c
     JOIN watchlists w ON w.creator_id = c.creator_id
     WHERE c.created_at >= NOW() - ($1 || ' hours')::interval
       AND c.extraction_confidence >= 0.6
     ORDER BY c.created_at ASC`,
    [String(windowHours)],
  );

  let enqueued = 0;
  let duplicates = 0;
  let failures = 0;

  for (const row of pairs) {
    throwIfAborted(options.signal);
    try {
      if (await enqueueNewCallAlert(row.user_id, row.creator_id, row.call_id)) enqueued++;
      else duplicates++;
    } catch {
      failures++;
    }
  }

  return { pairs: pairs.length, enqueued, duplicates, failures };
}

function baseUrl(): string {
  return process.env.ALERTS_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://call-score.com";
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function groupRows(rows: readonly ClaimedAlertRow[]): Map<string, ClaimedAlertRow[]> {
  const groups = new Map<string, ClaimedAlertRow[]>();
  for (const row of rows) {
    if (!row.user_email) continue;
    const group = groups.get(row.user_id) ?? [];
    group.push(row);
    groups.set(row.user_id, group);
  }
  return groups;
}

function subject(rows: readonly ClaimedAlertRow[]): string {
  const creators = new Set(rows.map((row) => row.creator_name));
  const label = creators.size === 1 ? rows[0]?.creator_name ?? "creator" : `${creators.size} creators`;
  return `${label} made ${rows.length} new ${rows.length === 1 ? "call" : "calls"} - CallScore`;
}

function textBody(rows: readonly ClaimedAlertRow[], base: string, unsubscribeUrl: string): string {
  return [
    "CallScore - new calls from creators you watch",
    "",
    ...rows.map((row) => `${row.call_date.slice(0, 10)} ${row.creator_name} ${row.symbol} ${row.direction.toUpperCase()} ${base}/call/${row.call_id}`),
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
}

function htmlBody(rows: readonly ClaimedAlertRow[], base: string, unsubscribeUrl: string): string {
  const items = rows.map((row) => {
    const link = `${base}/call/${row.call_id}`;
    return `<li><span>${escapeHtml(row.call_date.slice(0, 10))}</span> <b>${escapeHtml(row.creator_name)}</b> <a href="${escapeHtml(link)}">${escapeHtml(row.symbol)}</a> ${escapeHtml(row.direction)}</li>`;
  }).join("");
  return `<div style="font-family:ui-monospace,monospace"><h1>New watched calls</h1><ul>${items}</ul><p><a href="${escapeHtml(unsubscribeUrl)}">unsubscribe</a></p></div>`;
}

async function userEmailsTableExists(signal?: AbortSignal): Promise<boolean> {
  throwIfAborted(signal);
  const rows = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = 'users'
     ) AS exists`,
  );
  throwIfAborted(signal);
  return rows[0]?.exists === true;
}

function withoutProcessedGroups(
  groups: Map<string, ClaimedAlertRow[]>,
  processedUserIds: ReadonlySet<string>,
): number[] {
  const ids: number[] = [];
  for (const [userId, rows] of groups) {
    if (processedUserIds.has(userId)) continue;
    ids.push(...rows.map((row) => row.alert_id));
  }
  return ids;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function assertRunAlertSendGraphContext(): void {
  throw new Error("non_graph_alert_send_blocked: runAlertSend_direct_resend_webhook_mutation_disabled_use_resend_alert_send_node_or_gmail_send_node");
}

export async function runAlertSend(batchSize = 500, options: CronSignalOptions = {}): Promise<AlertSendResult> {
  assertRunAlertSendGraphContext();
  const limit = Math.max(1, Math.min(batchSize, 10_000));
  throwIfAborted(options.signal);
  const claimed = await claimPendingAlerts(limit, await userEmailsTableExists(options.signal));
  throwIfAborted(options.signal);
  const groups = groupRows(claimed);
  const noEmailIds = claimed.filter((row) => !row.user_email).map((row) => row.alert_id);
  if (noEmailIds.length > 0) await revertClaim(noEmailIds);

  let sent = 0;
  let failed = 0;
  const base = baseUrl();
  const processedUserIds = new Set<string>();

  try {
    for (const [userId, rows] of groups) {
      throwIfAborted(options.signal);
      const ids = rows.map((row) => row.alert_id);
      let emailSent = false;
      try {
        const unsubscribeUrl = buildUnsubscribeUrl(base, userId);
        await sendEmail({
          to: rows[0].user_email ?? "",
          subject: subject(rows),
          html: htmlBody(rows, base, unsubscribeUrl),
          text: textBody(rows, base, unsubscribeUrl),
        });
        emailSent = true;
        sent += ids.length;
        await deliverWebhookEvent(userId, "new_call_digest", {
          alert_ids: ids,
          calls: rows.map((row) => ({
            call_id: row.call_id,
            creator_id: row.creator_id,
            creator_name: row.creator_name,
            symbol: row.symbol,
            direction: row.direction,
            call_date: row.call_date,
          })),
        });
        processedUserIds.add(userId);
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (!emailSent) {
          failed += ids.length;
          await revertClaim(ids);
        }
        processedUserIds.add(userId);
      }
    }
  } catch (error) {
    if (options.signal?.aborted) {
      await revertClaim(withoutProcessedGroups(groups, processedUserIds));
    }
    throw error;
  }

  return { claimed: claimed.length, digests: groups.size, sent, failed, skippedNoEmail: noEmailIds.length };
}
