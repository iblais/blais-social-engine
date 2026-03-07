const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get all current non-draft posts
  const { data: posts } = await c.from('posts')
    .select('id, platform, status, caption, account_id, user_id, scheduled_at, media_type, post_media(media_url)')
    .in('status', ['scheduled', 'failed', 'retry'])
    .order('scheduled_at', { ascending: true });

  console.log('=== ALL SCHEDULED/FAILED/RETRY POSTS ===');
  const byPlatform = {};
  if (posts) posts.forEach(p => {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = [];
    byPlatform[p.platform].push(p);
  });
  for (const [plat, arr] of Object.entries(byPlatform)) {
    console.log(`\n${plat}: ${arr.length} posts`);
    arr.forEach(p => {
      console.log(`  ${p.status} | ${p.id} | ${(p.caption || '').substring(0, 60)}`);
    });
  }

  // Get twitter account
  const { data: twitterAcct } = await c.from('social_accounts')
    .select('id, platform, username, platform_user_id, user_id')
    .eq('platform', 'twitter');

  console.log('\n=== TWITTER ACCOUNTS ===');
  if (twitterAcct && twitterAcct.length) {
    twitterAcct.forEach(a => console.log(a.id, '|', a.username, '|', a.platform_user_id, '| user:', a.user_id));
  } else {
    console.log('No twitter accounts found');
  }

  // Get unique content (by caption) from scheduled posts to create twitter versions
  const seen = new Set();
  const unique = [];
  if (posts) {
    for (const p of posts) {
      if (p.platform === 'twitter') continue; // skip existing twitter posts
      const key = (p.caption || '').substring(0, 100);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
  }
  console.log('\n=== UNIQUE CONTENT (for Twitter duplication) ===');
  console.log('Count:', unique.length);
  unique.slice(0, 5).forEach(p => {
    const media = p.post_media && p.post_media[0] ? p.post_media[0].media_url : 'no media';
    console.log(`  ${p.platform} | ${(p.caption || '').substring(0, 60)} | media: ${media ? 'yes' : 'no'}`);
  });

  process.exit(0);
})();
