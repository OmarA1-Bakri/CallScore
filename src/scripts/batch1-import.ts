const { getDb } = require('../lib/db');
const sql = getDb();

const newChannels = [
  { name: 'Coffeezilla', youtube_handle: '@coffeezilla', youtube_channel_id: 'UCFQMnBA3CS502aghlcr0_aw', subscribers: 4540000, video_count: 538, focus: 'investigative', tier: 'A' },
  { name: 'Professor Crypto', youtube_handle: '@professorcrypto', youtube_channel_id: 'UCaWPscYkCeYEZgG1QNefZ0w', subscribers: 1540000, video_count: 1120, focus: 'reviews', tier: 'A' },
  { name: 'UP NEXT CRYPTO', youtube_handle: '@upnextcrypto', youtube_channel_id: 'UC3d5XyOZR2-HQOL8O5uS7Hg', subscribers: 991000, video_count: 1299, focus: 'reviews', tier: 'A' },
  { name: 'KManuS88', youtube_handle: '@kmanus88', youtube_channel_id: 'UC0Ym7ckYtSsgcbZX1VvYMQQ', subscribers: 1000000, video_count: 2965, focus: 'trading', tier: 'A' },
  { name: 'Alexandros Tellios', youtube_handle: '@alexandrostellios', youtube_channel_id: 'UCffx2QHWRlEd3WBgstZdo3w', subscribers: 96100, video_count: 1358, focus: 'reviews', tier: 'B' },
  { name: 'Whiteboard Crypto на русском', youtube_handle: '@whiteboardcryptoru', youtube_channel_id: 'UC3UwyLetjgocg7376SH1twg', subscribers: 69300, video_count: 85, focus: 'education', tier: 'B' },
  { name: 'Coin Mühendisi', youtube_handle: '@coinmuhendisim', youtube_channel_id: 'UCem4sZYgYBkN7fxAco-J58w', subscribers: 496000, video_count: 1794, focus: 'analysis', tier: 'B' },
  { name: 'Dapp University', youtube_handle: '@dappuniversity', youtube_channel_id: 'UCY0xL8V6NzzFcwzHCgB8orQ', subscribers: 697000, video_count: 1434, focus: 'education', tier: 'B' },
  { name: 'Cameron Fous', youtube_handle: '@cameronfous', youtube_channel_id: 'UCwGflGmzevf4fcm-z8E-twA', subscribers: 460000, video_count: 740, focus: 'trading', tier: 'B' },
  { name: 'CoinMarketCap', youtube_handle: '@coinmarketcap', youtube_channel_id: 'UCnhdZlwVd6ocXGhdSyV9Axg', subscribers: 408000, video_count: 1128, focus: 'news', tier: 'B' },
  { name: 'Finematics', youtube_handle: '@finematics', youtube_channel_id: 'UCh1ob28ceGdqohUnR7vBACA', subscribers: 355000, video_count: 64, focus: 'education', tier: 'B' },
  { name: 'My Financial Friend', youtube_handle: '@myfinancialfriend', youtube_channel_id: 'UCUr_YzOB7pp50F4r1KJ7Dag', subscribers: 350000, video_count: 4694, focus: 'analysis', tier: 'B' },
  { name: 'CryptoCoins', youtube_handle: '@cryptocoins', youtube_channel_id: 'UCtjH162DOHj2bHhYm7rM0Ng', subscribers: 337000, video_count: 475, focus: 'reviews', tier: 'B' },
  { name: 'Coinsider', youtube_handle: '@coinsider', youtube_channel_id: 'UCi7egjf0JDHuhznWugXq4hA', subscribers: 335000, video_count: 1001, focus: 'education', tier: 'B' },
  { name: 'Honest Chain', youtube_handle: '@honestchain', youtube_channel_id: 'UCDiwWdT1bIdxTwANnt5jXdw', subscribers: 301000, video_count: 167, focus: 'reviews', tier: 'B' },
  { name: 'CRYPTO BAPE', youtube_handle: '@cryptobape', youtube_channel_id: 'UCTpvnEoVHzDUIJN6XKozUUw', subscribers: 160000, video_count: 200, focus: 'reviews', tier: 'C' },
  { name: 'Crypto Shrek', youtube_handle: '@cryptoshrek', youtube_channel_id: 'UCXiD5_5eKG7LzD-ky1dQh2w', subscribers: 144000, video_count: 278, focus: 'reviews', tier: 'C' },
  { name: "Nugget's News", youtube_handle: '@nuggetsnews', youtube_channel_id: 'UCLo66QVfEod0nNM_GzKNxmQ', subscribers: 159000, video_count: 1272, focus: 'education', tier: 'C' },
  { name: 'More Crypto Online', youtube_handle: '@morecryptoonline', youtube_channel_id: 'UCngIhBkikUe6e7tZTjpKK7Q', subscribers: 323000, video_count: 26303, focus: 'analysis', tier: 'B' },
  { name: 'CRYPTO CRED', youtube_handle: '@cryptocred', youtube_channel_id: 'UCpt6WUAd8O3Vqyy9FHm7YDg', subscribers: 86700, video_count: 47, focus: 'education', tier: 'C' },
  { name: 'Crypto Daily Trade Signals', youtube_handle: '@cryptodailytradesignals', youtube_channel_id: 'UCyzDtZVP6Rlb-Yg3R5rY8Pg', subscribers: 83200, video_count: 3257, focus: 'trading', tier: 'C' },
  { name: 'Crypto World', youtube_handle: '@cryptoworld', youtube_channel_id: 'UCgY66N1YS_G9lYMvCQko6yw', subscribers: 226000, video_count: 2171, focus: 'news', tier: 'B' },
  { name: 'Adrián Sáenz Podcast', youtube_handle: '@adriansaenz', youtube_channel_id: 'UCBtKQIB56bJmu6eZ4cbehKQ', subscribers: 53300, video_count: 1360, focus: 'trading', tier: 'C' },
  { name: 'El Diario Cripto', youtube_handle: '@eldiariocripto', youtube_channel_id: 'UCR_aQaM2EnSUETON8YGi8uQ', subscribers: 87000, video_count: 507, focus: 'news', tier: 'C' },
  { name: 'Crypto ZEUS', youtube_handle: '@cryptodailyupdate', youtube_channel_id: 'UCvIy1FVVcRBy9-JvGMMduyg', subscribers: 87600, video_count: 239, focus: 'analysis', tier: 'C' },
  { name: 'Julien Roman | Crypto & Analyses', youtube_handle: '@julienromancrypto', youtube_channel_id: 'UCF09Jbsxb7x6lJ5imkapHNA', subscribers: 466000, video_count: 1781, focus: 'trading', tier: 'B' },
  { name: 'Bitbull', youtube_handle: '@bitbull', youtube_channel_id: 'UCh8EqZyAUunyl1ryHeZAaSw', subscribers: 153000, video_count: 3136, focus: 'analysis', tier: 'C' },
  { name: 'BitcoinHyper', youtube_handle: '@bitcoinhyper', youtube_channel_id: 'UCVEQTVuaFpcatHDhKIyhZmQ', subscribers: 137000, video_count: 417, focus: 'trading', tier: 'C' },
];

(async () => {
  let inserted = 0, skipped = 0, failed = 0;
  for (const ch of newChannels) {
    try {
      await sql`
        INSERT INTO creators (name, youtube_handle, youtube_channel_id, subscribers, video_count, focus, tier)
        VALUES (${ch.name}, ${ch.youtube_handle}, ${ch.youtube_channel_id}, ${ch.subscribers}, ${ch.video_count}, ${ch.focus}, ${ch.tier})
        ON CONFLICT (youtube_channel_id) DO NOTHING
      `;
      inserted++;
      console.log('✓', ch.name, '|', ch.subscribers.toLocaleString());
    } catch(e) {
      if (e.message.includes('conflict') || e.message.includes('duplicate')) {
        skipped++;
        console.log('⚠', ch.name, '| ALREADY EXISTS');
      } else {
        failed++;
        console.log('✗', ch.name, '|', e.message);
      }
    }
  }
  const [{count}] = await sql`SELECT COUNT(*)::int as count FROM creators`;
  console.log('\n=== IMPORT SUMMARY ===');
  console.log('Inserted:', inserted);
  console.log('Skipped:', skipped);
  console.log('Failed:', failed);
  console.log('Total DB now:', count);
})();
