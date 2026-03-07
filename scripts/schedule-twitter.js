const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TWITTER_ACCOUNT_ID = '9e5e1e9f-abfc-4999-88e2-a50b4f0723c6'; // blaislab OAuth account
const TEST_TIME = '2026-03-06T00:32:00.000Z'; // 8:32 PM ET = 00:32 UTC next day

(async () => {
  // 1. Get all unique content from existing scheduled posts (use instagram as source)
  const { data: igPosts } = await c.from('posts')
    .select('caption, media_type, user_id, post_media(media_url)')
    .eq('platform', 'instagram')
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true });

  // Also get the 2 failed facebook posts that don't have IG equivalents
  const { data: failedFb } = await c.from('posts')
    .select('caption, media_type, user_id, post_media(media_url)')
    .eq('platform', 'facebook')
    .eq('status', 'failed');

  // Combine and deduplicate
  const allContent = [...(failedFb || []), ...(igPosts || [])];
  const seen = new Set();
  const unique = [];
  for (const p of allContent) {
    const key = (p.caption || '').substring(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }

  console.log(`Creating ${unique.length} Twitter posts for blaislab...`);

  // 2. Create Twitter posts
  const rows = unique.map(p => ({
    user_id: p.user_id,
    account_id: TWITTER_ACCOUNT_ID,
    platform: 'twitter',
    caption: p.caption,
    media_type: p.media_type || 'image',
    status: 'scheduled',
    scheduled_at: TEST_TIME,
  }));

  const { data: inserted, error: insertErr } = await c.from('posts').insert(rows).select('id');
  if (insertErr) {
    console.error('Insert error:', insertErr.message);
    process.exit(1);
  }
  console.log(`Created ${inserted.length} Twitter posts`);

  // 3. Copy media references for each twitter post
  let mediaCount = 0;
  for (let i = 0; i < unique.length; i++) {
    const source = unique[i];
    const twitterPost = inserted[i];
    if (source.post_media && source.post_media.length > 0) {
      const mediaRows = source.post_media.map((m, j) => ({
        post_id: twitterPost.id,
        media_url: m.media_url,
        media_type: 'image',
        position: j,
      }));
      const { error: mediaErr } = await c.from('post_media').insert(mediaRows);
      if (mediaErr) console.error('Media insert error:', mediaErr.message);
      else mediaCount += mediaRows.length;
    }
  }
  console.log(`Linked ${mediaCount} media items to Twitter posts`);

  // 4. Reset failed FB and Bluesky posts to scheduled at 8:32 PM
  const { data: resetFb } = await c.from('posts')
    .update({ status: 'scheduled', retry_count: 0, error_message: null, scheduled_at: TEST_TIME })
    .eq('platform', 'facebook')
    .eq('status', 'failed')
    .select('id');
  console.log(`Reset ${(resetFb || []).length} failed Facebook posts to 8:32 PM`);

  // 5. Schedule one of each platform for 8:32 PM test
  // Get first scheduled post from each platform
  for (const plat of ['instagram', 'facebook', 'bluesky']) {
    const { data: first } = await c.from('posts')
      .select('id')
      .eq('platform', plat)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .single();

    if (first) {
      await c.from('posts').update({ scheduled_at: TEST_TIME }).eq('id', first.id);
      console.log(`Moved first ${plat} post to 8:32 PM: ${first.id}`);
    }
  }

  // Also move first twitter post to test time (already set, but confirm)
  console.log('\nAll Twitter posts already scheduled for 8:32 PM ET');
  console.log('First posts from IG/FB/Bluesky also moved to 8:32 PM ET');
  console.log('\nDone! Trigger the cron at 8:32 PM or manually call:');
  console.log('curl -H "Authorization: Bearer $CRON_SECRET" https://blais-social-engine.vercel.app/api/cron/post-due');

  process.exit(0);
})();
