import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

interface CreatorSeed {
  readonly name: string;
  readonly youtube_handle: string;
  readonly subscribers: string;
  readonly focus: string;
}

const CREATORS: readonly CreatorSeed[] = [
  { name: "Altcoin Daily", youtube_handle: "@AltcoinDaily", subscribers: "1.66M", focus: "Daily altcoin picks, specific coin calls" },
  { name: "Discover Crypto", youtube_handle: "@DiscoverCrypto", subscribers: "1.4M", focus: "Solana analysis, altseason picks" },
  { name: "Alex Becker", youtube_handle: "@AlexBeckersChannel", subscribers: "1.44M", focus: "Bold altcoin calls, AI crypto, metaverse" },
  { name: "Crypto Banter", youtube_handle: "@CryptoBanter", subscribers: "1.18M", focus: "Live market analysis, daily trade calls" },
  { name: "EllioTrades", youtube_handle: "@EllioTrades", subscribers: "636K", focus: "DeFi gems, early altcoin calls" },
  { name: "Benjamin Cowen", youtube_handle: "@BenjaminCowen", subscribers: "972K", focus: "Quantitative analysis, cycle timing" },
  { name: "Lark Davis", youtube_handle: "@LarkDavis", subscribers: "638K", focus: "Altcoin gem hunting, portfolio updates" },
  { name: "The Moon (Carl)", youtube_handle: "@TheMoon", subscribers: "657K", focus: "Bold price targets, TA-based calls" },
  { name: "Crypto Capital Venture", youtube_handle: "@CryptoCapitalVenture", subscribers: "350K", focus: "Price predictions, mid-cap alts" },
  { name: "Crypto Zombie", youtube_handle: "@CryptoZombie", subscribers: "263K", focus: "Daily altcoin alerts, specific entries" },
  { name: "Coin Bureau", youtube_handle: "@CoinBureau", subscribers: "2.7M", focus: "Deep analysis, project reviews" },
  { name: "CryptosRUs", youtube_handle: "@CryptosRUs", subscribers: "810K", focus: "Daily updates, BTC analysis" },
  { name: "DataDash", youtube_handle: "@DataDash", subscribers: "510K", focus: "Macro + crypto crossover" },
  { name: "Jacob Crypto Bury", youtube_handle: "@JacobCryptoBury", subscribers: "58K", focus: "Early small-cap gems" },
  { name: "Michael Wrubel", youtube_handle: "@MichaelWrubel", subscribers: "315K", focus: "Quick updates, honest reviews" },
  { name: "Crypto Jebb", youtube_handle: "@CryptoJebb", subscribers: "247K", focus: "TA, chart patterns, price targets" },
  { name: "Ivan on Tech", youtube_handle: "@IvanOnTech", subscribers: "534K", focus: "Tech + market calls" },
  { name: "Crypto ZEUS", youtube_handle: "@CryptoZEUS", subscribers: "77K", focus: "Meme coin analysis, presale picks" },
  { name: "Crypto Tips", youtube_handle: "@CryptoTips", subscribers: "215K", focus: "Trading guidance, altcoin picks" },
  { name: "BitBoy Crypto", youtube_handle: "@BitBoyCryptoV2", subscribers: "117K", focus: "Specific predictions, controversial" },
] as const;

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Seeding ${CREATORS.length} creators...`);

  let success = 0;
  let failed = 0;

  for (const creator of CREATORS) {
    try {
      await query(
        `INSERT INTO creators (name, youtube_handle, subscribers, focus, tier)
         VALUES ($1, $2, $3, $4, 'free')
         ON CONFLICT (youtube_handle) DO UPDATE SET
           name = EXCLUDED.name,
           subscribers = EXCLUDED.subscribers,
           focus = EXCLUDED.focus`,
        [creator.name, creator.youtube_handle, creator.subscribers, creator.focus],
      );
      success++;
      console.log(`[${timestamp()}] OK: ${creator.name} (${creator.youtube_handle})`);
    } catch (error: unknown) {
      failed++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] FAIL: ${creator.name} -> ${msg}`);
    }
  }

  console.log(`[${timestamp()}] Seed complete: ${success} succeeded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
