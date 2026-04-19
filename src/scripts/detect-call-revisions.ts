/**
 * detect-call-revisions.ts
 *
 * Backfill entrypoint for the self-correction index.
 *
 * For each creator:
 *   1. Load all calls ordered by call_date ASC.
 *   2. Run `detectRevisions(calls)` (pure, in-memory pattern match).
 *   3. Upsert into `call_revisions` with ON CONFLICT DO NOTHING against the
 *      `(original_call_id, revision_type)` unique index so re-runs are idempotent.
 *
 * Run: npm exec -- node --import tsx src/scripts/detect-call-revisions.ts
 */
import { query } from "../lib/db";
import { detectRevisions, type Revision } from "../lib/self-correction";
import type { Call } from "../lib/types";
import { loadEnv, timestamp } from "./_shared";

interface CreatorRow {
  readonly id: number;
  readonly youtube_handle: string;
}

interface InsertCountRow {
  readonly inserted: string;
}

async function loadCreators(): Promise<readonly CreatorRow[]> {
  return query<CreatorRow>(
    `SELECT id, youtube_handle
       FROM creators
      ORDER BY id ASC`,
  );
}

async function loadCreatorCalls(creatorId: number): Promise<readonly Call[]> {
  return query<Call>(
    `SELECT *
       FROM calls
      WHERE creator_id = $1
      ORDER BY call_date ASC`,
    [creatorId],
  );
}

async function persistRevision(revision: Revision): Promise<boolean> {
  const rows = await query<InsertCountRow>(
    `INSERT INTO call_revisions (
       original_call_id,
       creator_id,
       revised_at,
       revision_type,
       source_video_id,
       notes
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (original_call_id, revision_type) DO NOTHING
     RETURNING '1'::text AS inserted`,
    [
      revision.originalCallId,
      revision.creatorId,
      revision.revisedAt.toISOString(),
      revision.revisionType,
      revision.sourceVideoId,
      revision.notes,
    ],
  );
  return rows.length > 0;
}

async function main(): Promise<void> {
  loadEnv();

  console.log(
    `[${timestamp()}] detect-call-revisions: starting full backfill`,
  );

  const creators = await loadCreators();
  console.log(
    `[${timestamp()}] detect-call-revisions: scanning ${creators.length} creators`,
  );

  let totalDetected = 0;
  let totalInserted = 0;

  for (const creator of creators) {
    const calls = await loadCreatorCalls(creator.id);
    if (calls.length === 0) {
      console.log(
        `${creator.youtube_handle}: 0 revisions detected, 0 inserted (no calls)`,
      );
      continue;
    }

    const revisions = detectRevisions(calls);
    totalDetected += revisions.length;

    let insertedForCreator = 0;
    for (const revision of revisions) {
      const inserted = await persistRevision(revision);
      if (inserted) insertedForCreator += 1;
    }
    totalInserted += insertedForCreator;

    console.log(
      `${creator.youtube_handle}: ${revisions.length} revisions detected, ${insertedForCreator} inserted`,
    );
  }

  console.log(
    `[${timestamp()}] detect-call-revisions done: detected=${totalDetected} inserted=${totalInserted}`,
  );
}

main().catch((err: unknown) => {
  const ts = new Date().toISOString();
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[%s] Fatal error: %s", ts, msg);
  process.exit(1);
});
