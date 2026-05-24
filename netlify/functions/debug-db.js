import { neon, neonConfig } from "@neondatabase/serverless";

neonConfig.webSocketConstructor = globalThis.WebSocket as typeof WebSocket;

export default async function handler() {
  try {
    const url = process.env.NEON_DATABASE_URL;
    if (!url) return new Response(JSON.stringify({ error: "No NEON_DATABASE_URL" }), { status: 500 });
    
    const sql = neon(url);
    const result = await sql`SELECT 1 as test, current_timestamp as now`;
    
    return new Response(JSON.stringify({ ok: true, result }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (err) {
    return new Response(JSON.stringify({ 
      error: "Neon connection failed", 
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0,5) : undefined
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
