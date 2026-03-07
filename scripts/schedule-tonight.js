const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Find what Instagram already posted today
  const todayStart = '2026-03-05T00:00:00.000Z';
  const todayEnd = '2026-03-06T05:00:00.000Z';

  const { data: igPosted } = await c.from('posts')
    .select('caption, post_media(media_url)')
    .eq('platform', 'instagram')
    .eq('status', 'posted')
    .gte('published_at', todayStart)
    .lte('published_at', todayEnd);

  // Also get IG posts scheduled for today that may have gone out
  const { data: igScheduledToday } = await c.from('posts')
    .select('caption, post_media(media_url), status, published_at, scheduled_at')
    .eq('platform', 'instagram')
    .gte('scheduled_at', todayStart)
    .lte('scheduled_at', todayEnd);

  const igContent = [...(igPosted || []), ...(igScheduledToday || [])];

  // Deduplicate by caption
  const seen = new Set();
  const todaysPosts = [];
  for (const p of igContent) {
    const key = (p.caption || '').substring(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    todaysPosts.push(p);
  }

  console.log("=== Instagram posts from today ===");
  console.log("Count:", todaysPosts.length);
  todaysPosts.forEach(p => console.log("  ", (p.caption || '').substring(0, 60)));

  // Now check what FB/Bluesky/Twitter already have scheduled or posted for these same captions
  for (const plat of ['facebook', 'bluesky', 'twitter']) {
    const { data: existing } = await c.from('posts')
      .select('caption, status')
      .eq('platform', plat)
      .in('status', ['scheduled', 'posted', 'publishing']);

    const existingCaptions = new Set((existing || []).map(p => (p.caption || '').substring(0, 80)));
    const missing = todaysPosts.filter(p => {
      const key = (p.caption || '').substring(0, 80);
      return !existingCaptions.has(key);
    });

    const alreadyScheduled = todaysPosts.filter(p => {
      const key = (p.caption || '').substring(0, 80);
      return existingCaptions.has(key);
    });

    console.log(`\n${plat}: ${alreadyScheduled.length} already exist, ${missing.length} missing`);
  }

  process.exit(0);
})();
