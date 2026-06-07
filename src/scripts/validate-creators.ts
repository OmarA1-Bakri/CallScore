import { query } from "../lib/db";

interface Creator {
  id: number;
  name: string | null;
  youtube_channel_id: string | null;
  subscribers: string | null;
  video_count: number | null;
}

async function validate() {
  const rows = await query<Creator>(
    `SELECT id, name, youtube_channel_id, subscribers::text, video_count FROM creators ORDER BY subscribers DESC NULLS LAST`
  );
  const total = rows.length;
  const zero = rows.filter((c) => Number(c.subscribers) === 0);
  const low = rows.filter((c) => Number(c.subscribers) > 0 && Number(c.subscribers) < 5000);
  const high = rows.filter((c) => Number(c.subscribers) > 1000000);
  console.log('Total creators:', total);
  console.log('Zero/ghost subs:', zero.length);
  console.log('Low subs (<5K):', low.length);
  console.log('Million+ subs:', high.length);

  if (zero.length) {
    console.log('\n=== ZERO/GHOST CHANNELS ===');
    zero.forEach((c) => console.log(c.id, c.name, '| channel=' + c.youtube_channel_id));
  }
  if (low.length) {
    console.log('\n=== LOW SUBS (<5000) ===');
    low.forEach((c) => console.log(c.id, c.name, '| subs=' + Number(c.subscribers).toLocaleString(), '| channel=' + c.youtube_channel_id));
  }
  if (high.length) {
    console.log('\n=== MILLION+ CLUB ===');
    high.forEach((c) => console.log(c.id, c.name, '| subs=' + Number(c.subscribers).toLocaleString()));
  }

  const badChannelIds = rows.filter((c) => !c.youtube_channel_id || !c.youtube_channel_id.startsWith('UC'));
  if (badChannelIds.length) {
    console.log('\n=== BAD CHANNEL IDs ===');
    badChannelIds.forEach((c) => console.log(c.id, c.name, '| channel=' + c.youtube_channel_id));
  }
}

validate().catch(console.error);
