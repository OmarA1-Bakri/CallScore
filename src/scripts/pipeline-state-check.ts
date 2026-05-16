import { query } from "../lib/db";

async function safeQuery(q: string) {
  try { return await query(q); }
  catch(e) { const msg = e instanceof Error ? e.message : String(e); if (msg.includes("does not exist")) return []; throw e; }
}

async function main() {
  const r1 = await safeQuery("SELECT type, status, COUNT(*) as cnt FROM pipeline_jobs GROUP BY type, status ORDER BY type, status");
  const r4 = await safeQuery("SELECT COUNT(*) FILTER (WHERE status='pending') as pending, COUNT(*) FILTER (WHERE status='running') as running, COUNT(*) FILTER (WHERE status='failed') as failed FROM pipeline_jobs");
  const r7 = await safeQuery("SELECT id, type, status, locked_by, locked_at, heartbeat_at, attempts, error, updated_at FROM pipeline_jobs WHERE status IN ('pending','running') ORDER BY priority DESC, run_after LIMIT 10");

  if (r1.length) { console.log("=== Jobs by type/status ==="); r1.forEach((r: any) => console.log(`  ${r.type} / ${r.status}: ${r.cnt}`)); }
  if (r4.length) { console.log("\n=== Job totals ==="); console.log(r4[0]); }
  if (r7.length) { console.log("\n=== Pending/Running jobs ==="); r7.forEach((r: any) => console.log(`  #${r.id} ${r.type} | ${r.status} | locked_by=${r.locked_by} | attempts=${r.attempts} | updated=${r.updated_at}`)); }
  else { console.log("\n=== No pending/running jobs ==="); }
}

main().then(() => process.exit(0)).catch((e: any) => { console.error(e); process.exit(1); });
