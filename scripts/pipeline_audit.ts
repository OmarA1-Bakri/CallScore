import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
config({ path: '.env.local' });

const client = neon(process.env.DATABASE_URL!);

async function main() {
  const total = await client('SELECT COUNT(*)::text AS c FROM videos');
  const withTranscript = await client("SELECT COUNT(*)::text AS c FROM videos WHERE transcript_text IS NOT NULL AND transcript_text != ''");
  const missingTranscript = await client("SELECT COUNT(*)::text AS c FROM videos WHERE transcript_text IS NULL OR transcript_text = ''");
  const extracted = await client("SELECT COUNT(*)::text AS c FROM videos WHERE extracted_calls IS NOT NULL");
  const unextracted = await client("SELECT COUNT(*)::text AS c FROM videos WHERE extracted_calls IS NULL AND transcript_text IS NOT NULL AND transcript_text != ''");
  const matches = await client("SELECT COUNT(*)::text AS c FROM price_matches");
  const calls = await client("SELECT COUNT(*)::text AS c FROM calls");
  const creators = await client("SELECT COUNT(*)::text AS c FROM creators");
  const latest = await client("SELECT MAX(published_at)::text AS c FROM videos");
  const stuckJobs = await client("SELECT id, name, status, started_at::text FROM pipeline_jobs WHERE status != 'completed' ORDER BY id DESC LIMIT 10");

  console.log('total_videos:', total[0].c);
  console.log('with_transcript:', withTranscript[0].c);
  console.log('missing_transcript:', missingTranscript[0].c);
  console.log('extracted:', extracted[0].c);
  console.log('unextracted_have_transcript:', unextracted[0].c);
  console.log('price_matches:', matches[0].c);
  console.log('calls:', calls[0].c);
  console.log('creators:', creators[0].c);
  console.log('latest_video_published:', latest[0].c);
  console.log('stuck_jobs:', JSON.stringify(stuckJobs));
}

main().catch(e => { console.error(e.message); process.exit(1); });
