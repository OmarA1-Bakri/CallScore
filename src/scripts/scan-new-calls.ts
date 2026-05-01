/**
 * scan-new-calls.ts
 *
 * Finds calls inserted into the DB in the last 6h (or a custom window)
 * and fans them out to each user who is watching the corresponding
 * creator. Writes rows into alerts_queue; send-queued-alerts.ts picks
 * them up in a later pass.
 *
 * Idempotent: (user_id, call_id) is unique in alerts_queue so re-runs
 * over the same window are safe.
 *
 * Run: npm exec -- node --import tsx src/scripts/scan-new-calls.ts [--hours=6]
 */
import { query } from "../lib/db";
import { enqueueNewCallAlert } from "../lib/alerts";
import { loadEnv, timestamp } from "./_shared";

function parseHoursArg(argv: readonly string[]): number {
  const match = argv.find((a) => a.startsWith("--hours="));
  if (!match) return 6;
  const value = parseInt(match.slice("--hours=".length), 10);
  if (!Number.isFinite(value) || value <= 0) return 6;
  return Math.min(value, 24 * 7);
}

interface NewCallRow {
  readonly call_id: number;
  readonly creator_id: number;
  readonly user_id: string;
}

async function main(): Promise<void> {
  loadEnv();

  const hours = parseHoursArg(process.argv.slice(2));
  console.log(
    `[${timestamp()}] scan-new-calls: window=${hours}h`,
  );

  // Join new calls with watchlists in SQL so we only round-trip once.
  // Filter to extraction_confidence above 0.6 so garbage calls don't
  // flood every watcher's inbox.
  const pairs = await query<NewCallRow>(
    `SELECT c.id AS call_id, c.creator_id, w.user_id
     FROM calls c
     JOIN watchlists w ON w.creator_id = c.creator_id
     WHERE c.created_at >= NOW() - ($1 || ' hours')::interval
       AND c.extraction_confidence >= 0.6
     ORDER BY c.created_at ASC`,
    [String(hours)],
  );

  console.log(
    `[${timestamp()}] scan-new-calls: found ${pairs.length} (watcher x call) pairs`,
  );

  // Each (user, call) enqueue is independent, so run them in parallel.
  // Promise.allSettled keeps us going when individual rows fail — we
  // still want to enqueue the rest rather than short-circuit on the
  // first error.
  const results = await Promise.allSettled(
    pairs.map((row) =>
      enqueueNewCallAlert(row.user_id, row.creator_id, row.call_id),
    ),
  );

  let enqueued = 0;
  let duplicates = 0;
  let enqueueFailures = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      if (result.value) enqueued++;
      else duplicates++;
    } else {
      enqueueFailures++;
      const row = pairs[i];
      const reason = result.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.error(
        `[${timestamp()}] enqueue failed user=${row.user_id} call=${row.call_id}: ${msg}`,
      );
    }
  }

  console.log(
    `[${timestamp()}] scan-new-calls done: enqueued=${enqueued} skipped_duplicates=${duplicates} failures=${enqueueFailures}`,
  );
  // Duplicates are expected (idempotency ON CONFLICT) and do not count as
  // failure. Real enqueue failures must surface a non-zero exit so cron
  // treats the run as failed and alerts aren't silently dropped.
  process.exit(enqueueFailures > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  const ts = new Date().toISOString();
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[%s] Fatal error: %s", ts, msg);
  process.exit(1);
});
