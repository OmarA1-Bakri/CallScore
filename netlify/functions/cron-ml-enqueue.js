// Netlify scheduled function → /api/cron/ml/enqueue
export default async function handler() {
  const base = process.env.URL || process.env.DEPLOY_URL || "https://www.call-score.com";
  const secret = process.env.CRON_SECRET || "";
  const url = `${base}/api/cron/ml/enqueue`;
  console.log(`[${"cron-ml-enqueue"}] → ${url}`);
  const res = await fetch(url, { headers: secret ? { "Authorization": `Bearer ${secret}` } : {} });
  console.log(`[${"cron-ml-enqueue"}] ← ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(()=>"")).slice(0,200)}`);
}
