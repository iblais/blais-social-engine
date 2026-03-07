const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TWITTER_ACCOUNT_ID = '9e5e1e9f-abfc-4999-88e2-a50b4f0723c6';
const NOW = new Date();

// Stagger: post 1 at now, post 2 at now+3min, etc.
function staggerTime(index) {
  const t = new Date(NOW.getTime() + index * 3 * 60 * 1000);
  return t.toISOString();
}

(async () => {
  // Get the 2 IG posts from today with their media
  const { data: igPosted } = await c.from('posts')
    .select('caption, media_type, user_id, post_media(media_url, media_type)')
    .eq('platform', 'instagram')
    .eq('status', 'posted')
    .order('published_at', { ascending: true });

  const todaysPosts = igPosted || [];
  console.log(`IG posted today: ${todaysPosts.length} posts`);

  for (const plat of ['facebook', 'bluesky', 'twitter']) {
    console.log(`\n--- ${plat.toUpperCase()} ---`);

    for (let i = 0; i < todaysPosts.length; i++) {
      const igPost = todaysPosts[i];
      const captionPrefix = (igPost.caption || '').substring(0, 80);
      const scheduleAt = staggerTime(i);

      // Check if post already exists for this platform+caption
      const { data: existing } = await c.from('posts')
        .select('id, status, scheduled_at')
        .eq('platform', plat)
        .like('caption', captionPrefix + '%')
        .in('status', ['scheduled', 'posted', 'publishing', 'failed', 'retry'])
        .limit(1);

      if (existing && existing.length > 0) {
        const post = existing[0];
        if (post.status === 'posted') {
          console.log(`  ALREADY POSTED: ${captionPrefix.substring(0, 40)}`);
          continue;
        }
        // Reset to scheduled at staggered time
        await c.from('posts').update({
          status: 'scheduled',
          scheduled_at: scheduleAt,
          retry_count: 0,
          error_message: null
        }).eq('id', post.id);
        console.log(`  RESCHEDULED: ${captionPrefix.substring(0, 40)} -> ${new Date(scheduleAt).toLocaleTimeString()}`);
      } else {
        // Need to create this post
        // Get account_id for this platform
        let accountId;
        if (plat === 'twitter') {
          accountId = TWITTER_ACCOUNT_ID;
        } else {
          // Get first active account for this platform
          const { data: acct } = await c.from('social_accounts')
            .select('id')
            .eq('platform', plat)
            .eq('is_active', true)
            .limit(1)
            .single();
          if (!acct) {
            console.log(`  SKIP (no ${plat} account): ${captionPrefix.substring(0, 40)}`);
            continue;
          }
          accountId = acct.id;
        }

        // Create the post
        const { data: newPost, error: insertErr } = await c.from('posts').insert({
          user_id: igPost.user_id,
          account_id: accountId,
          platform: plat,
          caption: igPost.caption,
          media_type: igPost.media_type || 'image',
          status: 'scheduled',
          scheduled_at: scheduleAt,
        }).select('id').single();

        if (insertErr) {
          console.log(`  ERROR creating: ${insertErr.message}`);
          continue;
        }

        // Copy media
        if (igPost.post_media && igPost.post_media.length > 0) {
          const mediaRows = igPost.post_media.map(m => ({
            post_id: newPost.id,
            media_url: m.media_url,
            media_type: m.media_type || 'image',
          }));
          await c.from('post_media').insert(mediaRows);
        }

        console.log(`  CREATED: ${captionPrefix.substring(0, 40)} -> ${new Date(scheduleAt).toLocaleTimeString()}`);
      }
    }
  }

  // Final summary
  const { data: tonight } = await c.from('posts')
    .select('platform, status, caption, scheduled_at')
    .in('platform', ['facebook', 'bluesky', 'twitter'])
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date(NOW.getTime() + 30 * 60 * 1000).toISOString())
    .order('scheduled_at', { ascending: true });

  console.log('\n=== POSTS SCHEDULED FOR RIGHT NOW ===');
  if (tonight) tonight.forEach(p => {
    console.log(`  ${p.platform} | ${new Date(p.scheduled_at).toLocaleTimeString()} | ${(p.caption || '').substring(0, 50)}`);
  });

  process.exit(0);
})();
