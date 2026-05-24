// Netlify scheduled function → /api/cron/scores/enqueue
export default async function handler() {
  const base = process.env.URL || process.env.DEPLOY_URL || "https://www.call-score.com";
  const secret = process.env.CRON_SECRET || "";
  const url = `${base}/api/cron/scores/enqueue`;
  console.log(`[${"cron-scores-enqueue"}] → ${url}`);
  const res = await fetch(url, { headers: secret ? { "Authorization": `Bearer ${secret}` } : {} });
  console.log(`[${"cron-scores-enqueue"}] ← ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(()=>"")).slice(0,200)}`);
}
