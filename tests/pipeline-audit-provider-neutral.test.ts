import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectPipelineAudit } from '../scripts/pipeline_audit';

test('pipeline audit uses the provider-neutral query adapter and treats succeeded jobs as complete', async () => {
  const seen: string[] = [];
  const fakeQuery = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
    seen.push(sql);
    if (sql.includes("information_schema.columns") && sql.includes("pipeline_jobs")) return [{ column_name: 'type' }, { column_name: 'locked_at' }] as T[];
    if (sql.includes("information_schema.columns")) return [{ column_name: 'transcript' }, { column_name: 'calls_extracted' }] as T[];
    if (sql.includes('MAX(published_at)')) return [{ c: '2026-07-10T00:00:00Z' }] as T[];
    if (sql.includes('FROM pipeline_jobs')) return [{ id: 7, name: 'retry', status: 'failed', started_at: null }] as T[];
    return [{ c: '5' }] as T[];
  };

  const result = await collectPipelineAudit(fakeQuery);
  assert.equal(result.total_videos, '5');
  assert.equal(result.latest_video_published, '2026-07-10T00:00:00Z');
  assert.equal(result.stuck_jobs.length, 1);
  assert.ok(seen.some((sql) => sql.includes("status NOT IN ('completed', 'succeeded')")));
  assert.ok(seen.every((sql) => !sql.includes('neon')));
});
