/**
 * send-queued-alerts.ts
 *
 * Groups unsent alerts_queue rows by user, builds one digest email per
 * user, ships via Resend, and marks rows as sent on success.
 *
 * Required env:
 *   - RESEND_API_KEY
 *   - RESEND_FROM_EMAIL
 *   - ALERTS_BASE_URL (optional, default https://cryptotuberranked.com)
 *
 * A (user_id -> email) resolver is wired through the `users` table if
 * it exists; otherwise the script logs and skips. Actual user-email
 * mapping is intentionally out of scope for this slice and wired to
 * the Whop profile fetch in the next iteration.
 *
 * Run: node --import tsx src/scripts/send-queued-alerts.ts
 */
import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { markAlertsSent } from "../lib/alerts";
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

interface PendingRow {
  readonly alert_id: number;
  readonly user_id: string;
  readonly user_email: string | null;
  readonly call_id: number;
  readonly creator_id: number;
  readonly creator_name: string;
  readonly symbol: string;
  readonly direction: string;
  readonly call_date: string;
}

interface DigestGroup {
  readonly userId: string;
  readonly email: string;
  readonly alertIds: number[];
  readonly creatorBuckets: Map<string, PendingRow[]>;
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
  const entries = Array.from(group.creatorBuckets.entries());
  const creatorCount = entries.length;
  const firstCreator = entries[0]?.[0] ?? "creators";
  const callCount = entries.reduce((sum, [, rows]) => sum + rows.length, 0);
  const label = creatorCount === 1 ? firstCreator : `${creatorCount} creators`;
  const plural = callCount === 1 ? "call" : "calls";
  return `${label} made ${callCount} new ${plural} — CryptoTubers Ranked`;
}

function buildTextBody(group: DigestGroup, base: string): string {
  const lines: string[] = [];
  lines.push("CryptoTubers Ranked — new calls from creators you watch");
  lines.push("");
  for (const [creator, rows] of Array.from(group.creatorBuckets.entries())) {
    lines.push(`-- ${creator} (${rows.length}) --`);
    for (const row of rows) {
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
  for (const [creator, rows] of Array.from(group.creatorBuckets.entries())) {
    parts.push(
      `<h2 style="color:#3FD67A;font-size:14px;margin:18px 0 6px;">${escapeHtml(creator)} <span style="color:#5B6B63;">(${rows.length})</span></h2>`,
    );
    parts.push(`<ul style="padding:0;list-style:none;margin:0;">`);
    for (const row of rows) {
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

async function loadPending(): Promise<PendingRow[]> {
  const hasUsers = await userEmailsTableExists();
  const emailExpr = hasUsers
    ? `(SELECT u.email FROM users u WHERE u.id = aq.user_id LIMIT 1)`
    : `NULL::text`;

  return query<PendingRow>(
    `SELECT aq.id AS alert_id,
            aq.user_id,
            ${emailExpr} AS user_email,
            aq.call_id,
            aq.creator_id,
            cr.name AS creator_name,
            c.symbol,
            c.direction,
            c.call_date
     FROM alerts_queue aq
     JOIN calls c ON c.id = aq.call_id
     JOIN creators cr ON cr.id = aq.creator_id
     WHERE aq.sent_at IS NULL
       AND aq.event_type = 'new_call'
     ORDER BY aq.user_id ASC, aq.created_at ASC`,
  );
}

function groupByUser(rows: readonly PendingRow[]): DigestGroup[] {
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
    const bucket = group.creatorBuckets.get(row.creator_name) ?? [];
    bucket.push(row);
    group.creatorBuckets.set(row.creator_name, bucket);
  }
  return Array.from(byUser.values());
}

async function main(): Promise<void> {
  loadEnv();

  const pending = await loadPending();
  if (pending.length === 0) {
    console.log("[%s] send-queued-alerts: nothing to send", timestamp());
    process.exit(0);
  }

  const groups = groupByUser(pending);
  const skipped = pending.length - groups.reduce((s, g) => s + g.alertIds.length, 0);
  console.log(
    "[%s] send-queued-alerts: %d pending, %d user digests, %d skipped (no email)",
    timestamp(),
    pending.length,
    groups.length,
    skipped,
  );

  let sent = 0;
  let failed = 0;
  const base = baseUrl();

  for (const group of groups) {
    try {
      await sendEmail({
        to: group.email,
        subject: buildSubject(group),
        html: buildHtmlBody(group, base),
        text: buildTextBody(group, base),
      });
      await markAlertsSent(group.alertIds);
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
    }
  }

  console.log(
    "[%s] send-queued-alerts done: sent=%d failed_digests=%d",
    timestamp(),
    sent,
    failed,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  const ts = new Date().toISOString();
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[%s] Fatal error: %s", ts, msg);
  process.exit(1);
});
