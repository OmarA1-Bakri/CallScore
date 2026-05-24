// Netlify scheduled function → /api/cron/alerts/send
export default async function handler() {
  const base = process.env.URL || process.env.DEPLOY_URL || "https://www.call-score.com";
  const secret = process.env.CRON_SECRET || "";
  const url = `${base}/api/cron/alerts/send`;
  console.log(`[${"cron-alerts-send"}] → ${url}`);
  const res = await fetch(url, { headers: secret ? { "x-cron-secret": secret } : {} });
  console.log(`[${"cron-alerts-send"}] ← ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(()=>"")).slice(0,200)}`);
}
