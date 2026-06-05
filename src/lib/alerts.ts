/**
 * Per-creator alerts: watchlist + alerts_queue data layer.
 *
 * Required env vars (consumed indirectly via @/lib/db):
 *   - DATABASE_URL or POSTGRES-compatible env vars; NEON_DATABASE_URL remains backup/legacy fallback
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

export interface WatchWithCreatorRow extends WatchRow {
  readonly creator_name: string;
  readonly youtube_handle: string;
  readonly alpha_score: number;
  readonly accuracy_rank: number | null;
  readonly total_calls: number;
}

/**
 * Raw row shape from `alerts_queue`. `sent_at` is null for rows that
 * have not been delivered (or have been reverted by `revertClaim`);
 * non-null once a claim marks them shipped.
 */
export interface AlertQueueRow {
  readonly id: number;
  readonly user_id: string;
  readonly creator_id: number | null;
  readonly creator_name?: string | null;
  readonly youtube_handle?: string | null;
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

export async function listWatchesWithCreators(
  userId: string,
): Promise<WatchWithCreatorRow[]> {
  return query<WatchWithCreatorRow>(
    `SELECT
       w.id,
       w.user_id,
       w.creator_id,
       w.created_at,
       cr.name AS creator_name,
       cr.youtube_handle,
       COALESCE(cs.alpha_score, cr.alpha_score) AS alpha_score,
       COALESCE(cs.accuracy_rank, cr.accuracy_rank) AS accuracy_rank,
       COALESCE(cs.total_calls, cr.total_calls) AS total_calls
     FROM watchlists w
     JOIN creators cr ON cr.id = w.creator_id
     LEFT JOIN creator_stats cs
       ON cs.creator_id = cr.id AND cs.period = 'all_time'
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId],
  );
}

export async function recordAlertUnsubscribe(userId: string): Promise<void> {
  await query(
    `INSERT INTO alerts_unsubscribes (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE
       SET created_at = alerts_unsubscribes.created_at`,
    [userId],
  );

  await query(
    `DELETE FROM watchlists WHERE user_id = $1`,
    [userId],
  );
}

export async function hasAlertUnsubscribe(userId: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM alerts_unsubscribes WHERE user_id = $1
     ) AS exists`,
    [userId],
  );
  return rows[0]?.exists === true;
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
): Promise<AlertQueueRow[]> {
  return query<AlertQueueRow>(
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

/**
 * Row shape returned by the atomic claim query. Includes everything the
 * digest builder needs so we only round-trip the DB once per claim.
 */
export interface ClaimedAlertRow {
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

/**
 * Atomically claim pending alerts so concurrent cron runs never process
 * the same row twice.
 *
 * Uses `FOR UPDATE SKIP LOCKED` inside a CTE that feeds an `UPDATE ...
 * RETURNING` against the same table. Rows locked by a concurrent
 * transaction are silently skipped, so a second runner simply picks up
 * the next batch.
 *
 * The claim marks `sent_at = NOW()` up-front (at-most-once semantics).
 * If the subsequent email send fails, the caller MUST invoke
 * `revertClaim(alertIds)` to push the rows back into the pending pool
 * so the next cron run retries them.
 *
 * Email address resolution is part of the claim query so the row's
 * participation in the digest is decided atomically with the claim.
 * If the `users` table is missing (bootstrap phase), `user_email` is
 * NULL and the caller skips the digest (see send-queued-alerts.ts).
 */
export async function claimPendingAlerts(
  limit: number,
  hasUsersTable: boolean,
): Promise<ClaimedAlertRow[]> {
  if (!Number.isInteger(limit) || limit <= 0) return [];

  const emailExpr = hasUsersTable
    ? `(SELECT u.email FROM users u WHERE u.id = marked.user_id LIMIT 1)`
    : `NULL::text`;

  return query<ClaimedAlertRow>(
    `WITH claimed AS (
       SELECT id, user_id, creator_id, call_id
       FROM alerts_queue
       WHERE sent_at IS NULL
         AND event_type = 'new_call'
         AND NOT EXISTS (
           SELECT 1 FROM alerts_unsubscribes au
           WHERE au.user_id = alerts_queue.user_id
         )
       ORDER BY user_id ASC, created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     ),
     marked AS (
       UPDATE alerts_queue aq
       SET sent_at = NOW()
       FROM claimed
       WHERE aq.id = claimed.id
       RETURNING aq.id AS alert_id, aq.user_id, aq.creator_id, aq.call_id
     )
     SELECT marked.alert_id,
            marked.user_id,
            ${emailExpr} AS user_email,
            marked.call_id,
            marked.creator_id,
            cr.name AS creator_name,
            c.symbol,
            c.direction,
            c.call_date
     FROM marked
     JOIN calls c ON c.id = marked.call_id
     JOIN creators cr ON cr.id = marked.creator_id
     ORDER BY marked.user_id ASC, marked.alert_id ASC`,
    [limit],
  );
}

/**
 * Release a claim by pushing `sent_at` back to NULL for the given ids.
 * Used when an email send fails after the rows were already claimed so
 * the next cron run retries them. Only reverts rows whose `sent_at`
 * was set by this process (i.e. currently non-null) — other state is
 * left untouched.
 */
export async function revertClaim(
  alertIds: readonly number[],
): Promise<number> {
  if (alertIds.length === 0) return 0;
  const rows = await query<{ id: number }>(
    `UPDATE alerts_queue
     SET sent_at = NULL
     WHERE id = ANY($1::int[]) AND sent_at IS NOT NULL
     RETURNING id`,
    [alertIds as number[]],
  );
  return rows.length;
}

export async function listRecentAlertsForUser(
  userId: string,
  limit: number = 20,
): Promise<AlertQueueRow[]> {
  return query<AlertQueueRow>(
    `SELECT
       aq.id,
       aq.user_id,
       aq.creator_id,
       cr.name AS creator_name,
       cr.youtube_handle,
       aq.call_id,
       aq.event_type,
       aq.created_at,
       aq.sent_at
     FROM alerts_queue aq
     LEFT JOIN creators cr ON cr.id = aq.creator_id
     WHERE aq.user_id = $1
     ORDER BY aq.created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
}
