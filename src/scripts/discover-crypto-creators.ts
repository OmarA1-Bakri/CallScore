import { fetchChannelMetrics } from "../lib/youtube";
import { query } from "../lib/db";
import { google } from "googleapis";

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) { console.error("[FATAL] YOUTUBE_API_KEY missing"); process.exit(1); }

const youtube = google.youtube({ version: "v3", auth: API_KEY });

const CANDIDATES = [
  { name: "EllioTrades", q: "EllioTrades" },
  { name: "Chico Crypto", q: "ChicoCrypto" },
  { name: "That Martini Guy", q: "That Martini Guy" },
  { name: "Cheeky Crypto", q: "Cheeky Crypto" },
  { name: "Krown Crypto", q: "Krown Crypto" },
  { name: "Jason Pizzino", q: "Jason Pizzino" },
  { name: "Crypto Tony", q: "Crypto Tony" },
  { name: "Rekt Capital", q: "Rekt Capital" },
  { name: "Michael van de Poppe", q: "Michael van de Poppe" },
  { name: "Tone Vays", q: "Tone Vays" },
  { name: "PlanB", q: "PlanB crypto" },
  { name: "Boxmining", q: "Boxmining" },
  { name: "Crypto Crew", q: "Crypto Crew University" },
  { name: "Crypto Wendy O", q: "Crypto Wendy O" },
  { name: "YoungAndInvesting", q: "YoungAndInvesting" },
  { name: "Crypto Stache", q: "The Crypto Stache" },
  { name: "Daan", q: "Daan Crypto" },
  { name: "Scott Melker", q: "Scott Melker" },
  { name: "CryptoBirb", q: "CryptoBirb" },
  { name: "CryptoGodJohn", q: "CryptoGodJohn" },
  { name: "Criptomaniacos", q: "Criptomaniacos" },
  { name: "Hasheur", q: "Hasheur" },
  { name: "Bitcoin2Go", q: "Bitcoin2Go" },
  { name: "Coach Miranda", q: "Coach Miranda Miner" },
  { name: "Lady of Crypto", q: "Lady of Crypto" },
  { name: "DonAlt", q: "DonAlt" },
  { name: "Blue Edge Crypto", q: "Blue Edge Crypto" },
  { name: "Max Maher", q: "Max Maher" },
];

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function discover() {
  const discovered: any[] = [];
  const missing: string[] = [];

  for (const cand of CANDIDATES) {
    try {
      const search = await youtube.search.list({
        part: ["snippet"],
        q: cand.q,
        type: ["channel"],
        maxResults: 1,
      });
      const item = search.data.items?.[0];
      if (!item?.id?.channelId) {
        missing.push(cand.name);
        continue;
      }
      const cid = item.id.channelId;
      await sleep(200);
      const stats = await fetchChannelMetrics([cid]);
      const stat = stats[0];
      if (!stat) {
        missing.push(cand.name);
        continue;
      }
      discovered.push({
        name: cand.name,
        channelTitle: stat.title || cand.name,
        channelId: cid,
        subscriberCount: stat.subscribers,
        videoCount: stat.videoCount,
        publishedAt: stat.publishedAt,
      });
      console.log(`✓ ${cand.name.padEnd(25)} ${stat.subscribers.toLocaleString().padStart(10)} subs | ${stat.videoCount.toString().padStart(4)} videos`);
      await sleep(600);
    } catch (err: any) {
      console.error(`✗ ${cand.name}: ${err.message || err}`);
      missing.push(cand.name);
      await sleep(1000);
    }
  }

  console.log("\n=== MISSING / NOT FOUND ===");
  missing.forEach(m => console.log("✗", m));

  console.log("\n=== SQL INSERT ===");
  console.log(`INSERT INTO creators (name, youtube_channel_id, subscribers, video_count, created_at) VALUES`);
  console.log(discovered.map((d, i) =>
    `  ('${d.channelTitle.replace(/'/g, "''")}', '${d.channelId}', ${d.subscriberCount}, ${d.videoCount}, NOW())${i < discovered.length - 1 ? ',' : ';'}`
  ).join('\n'));
}

discover().catch(console.error);
