import { query } from "../lib/db";

const toCheck = [
  "EllioTrades","Chico Crypto","That Martini Guy","Cheeky Crypto","Krown","Jason Pizzino",
  "Crypto Tony","Rekt Capital","Koroush","Michael van de Poppe","Tone Vays","PlanB",
  "Max Maher","Boxmining","Crypto Crew University","Lady of Crypto","Crypto Wendy O",
  "YoungAndInvesting","Blue Edge Crypto","Crypto Stache","DonAlt","Crypto Newton",
  "Daan Crypto","Scott Melker","Willy Woo","Woonomic","CryptoBirb","CryptoBull",
  "Naeem","CryptoGodJohn","CryptoMob","Investidor Internacional","Criptomaniacos",
  "CriptoFacil","Experto Cripto","Criptomonedas TV","Hasheur","Bitcoin2Go",
  "Kien Thuc Crypto","Coach Miranda Miner"
];

async function check() {
  const all = await query<{ name: string | null }>('SELECT name FROM creators');
  const names = all.map(r => (r.name || '').toLowerCase());
  for (const name of toCheck) {
    const found = names.some(n => n.includes(name.toLowerCase()));
    console.log(found ? '✓' : '✗', name);
  }
}
check().catch(console.error);
