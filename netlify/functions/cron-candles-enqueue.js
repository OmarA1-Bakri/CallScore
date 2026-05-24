// Netlify scheduled function → /api/cron/candles/enqueue
export default async function handler() {
  const base = process.env.URL || process.env.DEPLOY_URL || "https://www.call-score.com";
  const secret = process.env.CRON_SECRET || "";
  const url = `${base}/api/cron/candles/enqueue`;
  console.log(`[${"cron-candles-enqueue"}] → ${url}`);
  const res = await fetch(url, { headers: secret ? { "Authorization": `Bearer ${secret}` } : {} });
  console.log(`[${"cron-candles-enqueue"}] ← ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(()=>"")).slice(0,200)}`);
}
