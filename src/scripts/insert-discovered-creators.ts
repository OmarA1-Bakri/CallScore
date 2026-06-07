export {};

const { getDb } = require('../lib/db');

const NEW = [
  { name: "EllioTrades", handle: "elliotrades", cid: "UCMtJYS0PrtiUwlk6zjGDEMA", subs: 671000, vids: 1401 },
  { name: "Chico Crypto", handle: "chicocrypto", cid: "UCHop-jpf-huVT1IYw79ymPw", subs: 307000, vids: 1575 },
  { name: "That Martini Guy", handle: "thatmartiniguy", cid: "UCytNzxSmUqEBychgoKoQssw", subs: 149000, vids: 529 },
  { name: "Cheeky Crypto", handle: "cheekycrypto", cid: "UCd4Ys__EL_gbJrYq6JscrAw", subs: 225000, vids: 805 },
  { name: "Krown", handle: "krowncrypto", cid: "UCnwxzpFzZNtLH8NgTeAROFA", subs: 202000, vids: 3863 },
  { name: "Jason Pizzino", handle: "jasonpizzino", cid: "UCIb34uXDsfTq4PJKW0eztkA", subs: 360000, vids: 1581 },
  { name: "Crypto Tony", handle: "cryptotony", cid: "UCffNwA5OkxWEmruYFrWJsoQ", subs: 39500, vids: 354 },
  { name: "Rekt Capital", handle: "rektcapital", cid: "UCffNwA5OkxWEmruYFrWJsoQ", subs: 114000, vids: 697 },
  { name: "Michael van de Poppe", handle: "michaelevandepoppe", cid: "UCtvdzJWoDKL1LOewU5ADJIQ", subs: 171000, vids: 1465 },
  { name: "Tone Vays", handle: "tonevays", cid: "UCbiWJYRg8luWHnmNkJRZEnw", subs: 121000, vids: 1819 },
  { name: "PlanB", handle: "planb", cid: "UCyTSwVh66Y2Ww_CIIHhuxbw", subs: 218000, vids: 26 },
  { name: "Boxmining", handle: "boxmining", cid: "UCxODjeUwZHk3p-7TU-IsDOA", subs: 518000, vids: 823 },
  { name: "Crypto Crew University", handle: "cryptocrewuniversity", cid: "UC7ndkZ4vViKiM7kVEgdrlZQ", subs: 410000, vids: 1198 },
  { name: "Crypto Wendy O", handle: "cryptowendyo", cid: "UCla2jS8BrfLJj7kbKyy5_ew", subs: 270000, vids: 3195 },
  { name: "Crypto Stache", handle: "cryptostache", cid: "UCL4knTqpF5KTcJrAdethgNQ", subs: 96600, vids: 1155 },
  { name: "Daan Crypto", handle: "daan", cid: "UCoMMDwaJCMgWKsycGuR_msg", subs: 7250, vids: 124 },
  { name: "CryptoBirb", handle: "cryptobirb", cid: "UCGrAPU7wtDOX1zx00MXRt1A", subs: 77300, vids: 1218 },
  { name: "Criptomaniacos", handle: "criptomaniacos", cid: "UCEkg0hhWS_oxD24f_6C9Qbw", subs: 416000, vids: 2845 },
  { name: "Bitcoin2Go", handle: "bitcoin2go", cid: "UCfKWBMhbxrwjTuzW1MDf5Og", subs: 116000, vids: 873 },
  { name: "Coach Miranda Miner", handle: "coachmirandaminer", cid: "UCizGJKhQzZa688CwgTLZgGA", subs: 131000, vids: 3342 },
  { name: "DonAlt", handle: "donalt", cid: "UCYStZ8mMNGOVTj-Z4AbbSrQ", subs: 68000, vids: 656 },
  { name: "Blue Edge Crypto", handle: "blueedgecrypto", cid: "UCBCbEDO5tMP6saX9yNU_zYQ", subs: 106000, vids: 756 },
  { name: "Max Maher", handle: "maxmaher", cid: "UCQEBsgNV0RGm1O2iOMDbZjA", subs: 988000, vids: 1158 },
  { name: "Koroush AK", handle: "koroush", cid: "UCak-HWmXEqeC3KOjTN9Fr-Q", subs: 106000, vids: 66 },
  { name: "CriptoFacil", handle: "criptofacil", cid: "UCqOK6j2ZiZ214rsIYMxhzag", subs: 106000, vids: 3272 },
  { name: "Kripto Emre", handle: "kriptoemre", cid: "UCeUI8PTXem0-S-yj3NGf46g", subs: 255000, vids: 470 },
  { name: "Crypto Guruji", handle: "cryptoguruji", cid: "UC87A7vsRlyZ68gtu-z1Q3ow", subs: 3130, vids: 115 },
  { name: "Bitcoin Playboy", handle: "bitcoinplayboy", cid: "UCwJPZaTeNna81-Q_yJi8wnw", subs: 8580, vids: 269 },
  { name: "Investidor Internacional", handle: "investidorinternacional", cid: "UCMJIdrbhN49t1-bWV8WsIBQ", subs: 43700, vids: 256 },
  { name: "Davinci Jeremie", handle: "davincij15", cid: "UCP0g6ygQkYjmog801YnNqtQ", subs: 930000, vids: 2750 },
  { name: "Bitcoin Archive", handle: "bitcoinarchive", cid: "UC7Da3hauf8II7Dbjj0CILaQ", subs: 29300, vids: 368 },
];

async function run() {
  const sql = getDb();
  let inserted = 0;
  let skipped = 0;

  for (const c of NEW) {
    try {
      await sql`INSERT INTO creators (name, youtube_handle, youtube_channel_id, subscribers, video_count, created_at)
        VALUES (${c.name}, ${c.handle}, ${c.cid}, ${c.subs}, ${c.vids}, NOW())
        ON CONFLICT (youtube_channel_id) DO NOTHING`;
      inserted++;
      console.log(`+ ${c.name} (${c.subs.toLocaleString()})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${c.name}: ${message}`);
      skipped++;
    }
  }

  console.log(`\nInserted: ${inserted} | Skipped: ${skipped}`);
  const res = await sql`SELECT COUNT(*)::int AS total FROM creators`;
  console.log(`Total creators in DB: ${res[0].total}`);
}

run().catch(console.error);
