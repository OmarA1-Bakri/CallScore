// Netlify scheduled function wrapper
// Calls the existing Next.js API route: /api/cron/weekly
export default async function handler() {
  const base = process.env.URL || process.env.DEPLOY_URL || "https://www.call-score.com";
  const secret = process.env.CRON_SECRET || "";
  
  const url = `${base}/api/cron/weekly`;
  console.log(`[cron-weekly] → ${url}`);
  
  const res = await fetch(url, {
    headers: secret ? { "Authorization": `Bearer ${secret}` } : {},
  });
  
  console.log(`[cron-weekly] ← ${res.status} ${res.statusText}`);
  
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}
