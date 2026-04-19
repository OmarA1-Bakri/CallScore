/**
 * send-queued-alerts.ts
 *
 * Atomically CLAIMS a batch of pending alerts_queue rows (FOR UPDATE
 * SKIP LOCKED inside a CTE that also flips sent_at), groups them by
 * user, builds one digest email per user, and ships via Resend. If
 * send fails, the claim is reverted so the next cron run retries.
 *
 * The claim-first design prevents two concurrent cron runs from
 * double-sending the same digest.
 *
 * Required env:
 *   - RESEND_API_KEY
 *   - RESEND_FROM_EMAIL
 *   - ALERTS_BASE_URL (optional, default https://cryptotuberranked.com)
 *   - ALERTS_CLAIM_BATCH  (optional, default 500)
 *
 * A (user_id -> email) resolver is wired through the `users` table if
 * it exists; otherwise rows with no email are skipped and IMMEDIATELY
 * reverted so the next run retries once the users table is populated.
 *
 * Run: node --import tsx src/scripts/send-queued-alerts.ts
 */
import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { claimPendingAlerts, revertClaim } from "../lib/alerts";
import { sendEmail } from "../lib/resend";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = raw.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

import type { ClaimedAlertRow } from "../lib/alerts";

interface CreatorBucket {
  readonly creatorId: number;
  readonly creatorName: string;
  readonly rows: ClaimedAlertRow[];
}

interface DigestGroup {
  readonly userId: string;
  readonly email: string;
  readonly alertIds: number[];
  /** Keyed by creator_id so same-display-name creators don't merge. */
  readonly creatorBuckets: Map<number, CreatorBucket>;
}

function baseUrl(): string {
  return (
    process.env.ALERTS_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://cryptotuberranked.com"
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSubject(group: DigestGroup): string {
  const buckets = Array.from(group.creatorBuckets.values());
  const creatorCount = buckets.length;
  const firstCreator = buckets[0]?.creatorName ?? "creators";
  const callCount = buckets.reduce((sum, b) => sum + b.rows.length, 0);
  const label = creatorCount === 1 ? firstCreator : `${creatorCount} creators`;
  const plural = callCount === 1 ? "call" : "calls";
  return `${label} made ${callCount} new ${plural} — CryptoTubers Ranked`;
}

function buildTextBody(group: DigestGroup, base: string): string {
  const lines: string[] = [];
  lines.push("CryptoTubers Ranked — new calls from creators you watch");
  lines.push("");
  for (const bucket of Array.from(group.creatorBuckets.values())) {
    lines.push(`-- ${bucket.creatorName} (${bucket.rows.length}) --`);
    for (const row of bucket.rows) {
      const dateStr = row.call_date.slice(0, 10);
      lines.push(
        `  ${dateStr}  ${row.symbol}  ${row.direction.toUpperCase()}  ${base}/call/${row.call_id}`,
      );
    }
    lines.push("");
  }
  lines.push("Unsubscribe: " + base + "/unsubscribe?token=TODO");
  return lines.join("\n");
}

function buildHtmlBody(group: DigestGroup, base: string): string {
  const parts: string[] = [];
  parts.push(
    `<div style="font-family:JetBrains Mono,ui-monospace,monospace;background:#0B0F0E;color:#C8D3CA;padding:24px;">`,
  );
  parts.push(
    `<h1 style="color:#C8D3CA;font-size:20px;margin:0 0 12px;">new calls from creators you watch</h1>`,
  );
  for (const bucket of Array.from(group.creatorBuckets.values())) {
    parts.push(
      `<h2 style="color:#3FD67A;font-size:14px;margin:18px 0 6px;">${escapeHtml(bucket.creatorName)} <span style="color:#5B6B63;">(${bucket.rows.length})</span></h2>`,
    );
    parts.push(`<ul style="padding:0;list-style:none;margin:0;">`);
    for (const row of bucket.rows) {
      const link = `${base}/call/${row.call_id}`;
      const dateStr = escapeHtml(row.call_date.slice(0, 10));
      parts.push(
        `<li style="padding:4px 0;border-bottom:1px solid rgba(200,211,202,0.08);">` +
          `<span style="color:#5B6B63;">${dateStr}</span> ` +
          `<a href="${escapeHtml(link)}" style="color:#3FD67A;text-decoration:underline;">${escapeHtml(row.symbol)}</a> ` +
          `<span style="color:#C8D3CA;">${escapeHtml(row.direction)}</span>` +
          `</li>`,
      );
    }
    parts.push(`</ul>`);
  }
  parts.push(
    `<p style="color:#5B6B63;font-size:12px;margin-top:24px;">` +
      `<a href="${escapeHtml(base)}/unsubscribe?token=TODO" style="color:#5B6B63;">unsubscribe</a>` +
      `</p>`,
  );
  parts.push(`</div>`);
  return parts.join("");
}

async function userEmailsTableExists(): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_name = 'users'
     ) AS exists`,
  );
  return rows[0]?.exists === true;
}

function groupByUser(rows: readonly ClaimedAlertRow[]): DigestGroup[] {
  const byUser = new Map<string, DigestGroup>();
  for (const row of rows) {
    if (!row.user_email) continue;
    let group = byUser.get(row.user_id);
    if (!group) {
      group = {
        userId: row.user_id,
        email: row.user_email,
        alertIds: [],
        creatorBuckets: new Map(),
      };
      byUser.set(row.user_id, group);
    }
    group.alertIds.push(row.alert_id);
    const bucket =
      group.creatorBuckets.get(row.creator_id) ??
      ({
        creatorId: row.creator_id,
        creatorName: row.creator_name,
        rows: [],
      } satisfies CreatorBucket);
    bucket.rows.push(row);
    group.creatorBuckets.set(row.creator_id, bucket);
  }
  return Array.from(byUser.values());
}

function parseClaimBatch(): number {
  const raw = process.env.ALERTS_CLAIM_BATCH;
  if (!raw) return 500;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 500;
  return Math.min(n, 10_000);
}

async function main(): Promise<void> {
  loadEnv();

  const batchSize = parseClaimBatch();
  const hasUsers = await userEmailsTableExists();

  // Atomic claim: FOR UPDATE SKIP LOCKED in a CTE that also flips
  // sent_at. Two concurrent runs cannot pick up the same row.
  const claimed = await claimPendingAlerts(batchSize, hasUsers);
  if (claimed.length === 0) {
    console.log("[%s] send-queued-alerts: nothing to claim", timestamp());
    process.exit(0);
  }

  const groups = groupByUser(claimed);
  const noEmailRows = claimed.filter((r) => !r.user_email);
  const noEmailIds = noEmailRows.map((r) => r.alert_id);

  console.log(
    "[%s] send-queued-alerts: claimed=%d, digests=%d, skipped_no_email=%d",
    timestamp(),
    claimed.length,
    groups.length,
    noEmailRows.length,
  );

  // Revert rows we can't possibly send (no user email). They remain
  // pending so a future run retries once user email is available.
  if (noEmailIds.length > 0) {
    try {
      const reverted = await revertClaim(noEmailIds);
      if (reverted !== noEmailIds.length) {
        console.error(
          "[%s] WARNING revert mismatch on no-email rows: claimed=%d reverted=%d",
          timestamp(),
          noEmailIds.length,
          reverted,
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        "[%s] revertClaim failed for no-email rows: %s",
        timestamp(),
        msg,
      );
    }
  }

  let sent = 0;
  let failed = 0;
  let revertFailures = 0;
  const base = baseUrl();

  for (const group of groups) {
    try {
      await sendEmail({
        to: group.email,
        subject: buildSubject(group),
        html: buildHtmlBody(group, base),
        text: buildTextBody(group, base),
      });
      sent += group.alertIds.length;
    } catch (error: unknown) {
      failed++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        "[%s] send failed user=%s: %s",
        timestamp(),
        group.userId,
        msg,
      );
      // Revert this group's claim so the next run retries.
      try {
        const reverted = await revertClaim(group.alertIds);
        if (reverted !== group.alertIds.length) {
          revertFailures++;
          console.error(
            "[%s] WARNING revert mismatch user=%s claimed=%d reverted=%d",
            timestamp(),
            group.userId,
            group.alertIds.length,
            reverted,
          );
        }
      } catch (revertError: unknown) {
        revertFailures++;
        const revertMsg =
          revertError instanceof Error
            ? revertError.message
            : String(revertError);
        console.error(
          "[%s] revertClaim failed user=%s: %s",
          timestamp(),
          group.userId,
          revertMsg,
        );
      }
    }
  }

  console.log(
    "[%s] send-queued-alerts done: sent=%d failed_digests=%d revert_failures=%d",
    timestamp(),
    sent,
    failed,
    revertFailures,
  );
  // Revert failures are the most dangerous case — rows stuck in
  // "sent_at=NOW()" state that were never actually delivered. Surface
  // as exit 1 so the cron operator notices.
  process.exit(failed > 0 || revertFailures > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  const ts = new Date().toISOString();
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[%s] Fatal error: %s", ts, msg);
  process.exit(1);
});
