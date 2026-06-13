import { query } from "@/lib/db";
import { normalizeCreatorHandle } from "@/lib/creator-handle-path";
export { creatorHandlePath, normalizeCreatorHandle } from "@/lib/creator-handle-path";
import type { Creator } from "@/lib/types";

export async function findCreatorByHandle<T extends Partial<Creator>>(
  rawHandle: string,
  selectClause = "*",
): Promise<T | null> {
  const handle = rawHandle.trim();
  const normalized = normalizeCreatorHandle(handle);

  if (normalized.length === 0) {
    return null;
  }

  const rows = await query<T>(
    `SELECT ${selectClause}
     FROM creators
     WHERE lower(youtube_handle) = lower($1)
        OR lower(ltrim(youtube_handle, '@')) = lower($2)
     LIMIT 1`,
    [handle, normalized],
  );

  return rows[0] ?? null;
}
