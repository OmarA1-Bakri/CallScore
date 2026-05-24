// Netlify scheduled function → /api/cron/alerts/scan
export default async function handler() {
  const base = process.env.URL || process.env.DEPLOY_URL || "https://www.call-score.com";
  const secret = process.env.CRON_SECRET || "";
  const url = `${base}/api/cron/alerts/scan`;
  console.log(`[${"cron-alerts-scan"}] → ${url}`);
  const res = await fetch(url, { headers: secret ? { "x-cron-secret": secret } : {} });
  console.log(`[${"cron-alerts-scan"}] ← ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(()=>"")).slice(0,200)}`);
}
