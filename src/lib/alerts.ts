/**
 * Per-creator alerts: watchlist + alerts_queue data layer.
 *
 * Required env vars (consumed indirectly via @/lib/db):
 *   - NEON_DATABASE_URL (or DATABASE_URL / POSTGRES_URL / POSTGRES_URL_NON_POOLING)
 *
 * Run `migrations/001-watchlists.sql` against the database before using.
 */
import { query } from "@/lib/db";

export interface WatchRow {
  readonly id: number;
  readonly user_id: string;
  readonly creator_id: number;
  readonly created_at: string;
}

export interface PendingAlertRow {
  readonly id: number;
  readonly user_id: string;
  readonly creator_id: number | null;
  readonly call_id: number | null;
  readonly event_type: string;
  readonly created_at: string;
  readonly sent_at: string | null;
}

/**
 * Add a (user, creator) pair to the watchlist. Idempotent — if the row
 * already exists the request is a no-op and the existing row is returned.
 */
export async function addWatch(
  userId: string,
  creatorId: number,
): Promise<WatchRow> {
  const rows = await query<WatchRow>(
    `INSERT INTO watchlists (user_id, creator_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, creator_id) DO UPDATE
       SET user_id = EXCLUDED.user_id
     RETURNING id, user_id, creator_id, created_at`,
    [userId, creatorId],
  );

  if (rows.length === 0) {
    throw new Error("Failed to upsert watchlist row");
  }
  return rows[0];
}

export async function removeWatch(
  userId: string,
  creatorId: number,
): Promise<void> {
  await query(
    `DELETE FROM watchlists WHERE user_id = $1 AND creator_id = $2`,
    [userId, creatorId],
  );
}

export async function listWatches(userId: string): Promise<WatchRow[]> {
  return query<WatchRow>(
    `SELECT id, user_id, creator_id, created_at
     FROM watchlists
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
}

/**
 * Enqueue a "new call" alert. Idempotent on (user_id, call_id) — the
 * unique partial index ensures the same call is never queued twice for
 * the same user. Returns true if a new row was inserted, false if the
 * duplicate was silently dropped.
 */
export async function enqueueNewCallAlert(
  userId: string,
  creatorId: number,
  callId: number,
): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `INSERT INTO alerts_queue (user_id, creator_id, call_id, event_type)
     VALUES ($1, $2, $3, 'new_call')
     ON CONFLICT (user_id, call_id) WHERE call_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [userId, creatorId, callId],
  );
  return rows.length > 0;
}

export async function getPendingAlertsForUser(
  userId: string,
): Promise<PendingAlertRow[]> {
  return query<PendingAlertRow>(
    `SELECT id, user_id, creator_id, call_id, event_type, created_at, sent_at
     FROM alerts_queue
     WHERE user_id = $1 AND sent_at IS NULL
     ORDER BY created_at ASC`,
    [userId],
  );
}

export async function markAlertsSent(
  alertIds: readonly number[],
): Promise<number> {
  if (alertIds.length === 0) return 0;
  const rows = await query<{ id: number }>(
    `UPDATE alerts_queue
     SET sent_at = NOW()
     WHERE id = ANY($1::int[]) AND sent_at IS NULL
     RETURNING id`,
    [alertIds as number[]],
  );
  return rows.length;
}

export async function listRecentAlertsForUser(
  userId: string,
  limit: number = 20,
): Promise<PendingAlertRow[]> {
  return query<PendingAlertRow>(
    `SELECT id, user_id, creator_id, call_id, event_type, created_at, sent_at
     FROM alerts_queue
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
}
