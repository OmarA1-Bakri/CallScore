export default async function handler() {
  const db = process.env.NEON_DATABASE_URL ? process.env.NEON_DATABASE_URL.slice(0, 30) + "..." : "MISSING";
  return new Response(JSON.stringify({ db_url: db, node_version: process.version }), { status: 200, headers: { "Content-Type": "application/json" } });
}
