import { query } from "../lib/db";

interface JobByTypeStatus { type: string; status: string; cnt: string; }
interface JobTotals { pending: string; running: string; failed: string; }
interface JobDetail { id: number; type: string; status: string; locked_by: string | null; locked_at: string | null; heartbeat_at: string | null; attempts: number; error: string | null; updated_at: string | null; }

async function safeQuery<T = any>(q: string, params?: unknown[]): Promise<T[]> {
  try { return (params ? await query(q, params) : await query(q)) as T[]; }
  catch(e) { const msg = e instanceof Error ? e.message : String(e); if (msg.includes("does not exist")) { console.warn("safeQuery: relation missing:", msg.slice(0, 120)); return []; } throw e; }
}

async function main() {
  const r1 = await safeQuery<JobByTypeStatus>("SELECT type, status, COUNT(*) as cnt FROM pipeline_jobs GROUP BY type, status ORDER BY type, status");
  const r4 = await safeQuery<JobTotals>("SELECT COUNT(*) FILTER (WHERE status='pending') as pending, COUNT(*) FILTER (WHERE status='running') as running, COUNT(*) FILTER (WHERE status='failed') as failed FROM pipeline_jobs");
  const r7 = await safeQuery<JobDetail>("SELECT id, type, status, locked_by, locked_at, heartbeat_at, attempts, error, updated_at FROM pipeline_jobs WHERE status IN ('pending','running') ORDER BY priority DESC, run_after LIMIT 10");

  if (r1.length) { console.log("=== Jobs by type/status ==="); r1.forEach(r => console.log(`  ${r.type} / ${r.status}: ${Number(r.cnt)}`)); }
  if (r4.length) { const t = r4[0]; console.log("\n=== Job totals ==="); console.log({ pending: Number(t.pending), running: Number(t.running), failed: Number(t.failed) }); }
  if (r7.length) { console.log("\n=== Pending/Running jobs ==="); r7.forEach(r => console.log(`  #${r.id} ${r.type} | ${r.status} | locked_by=${r.locked_by} | attempts=${r.attempts} | updated=${r.updated_at}`)); }
  else { console.log("\n=== No pending/running jobs ==="); }
}

main().then(() => process.exit(0)).catch((e: any) => { console.error(e); process.exit(1); });
