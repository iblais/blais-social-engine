const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TEST_TIME = '2026-03-06T00:32:00.000Z'; // 8:32 PM ET

(async () => {
  // Get the original IG schedule to mirror for Twitter
  const { data: igPosts } = await c.from('posts')
    .select('caption, scheduled_at')
    .eq('platform', 'instagram')
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true });

  // Build caption -> scheduled_at map from IG
  const scheduleMap = {};
  if (igPosts) igPosts.forEach(p => {
    const key = (p.caption || '').substring(0, 100);
    if (!scheduleMap[key]) scheduleMap[key] = p.scheduled_at;
  });

  // Get all Twitter posts
  const { data: twitterPosts } = await c.from('posts')
    .select('id, caption, scheduled_at')
    .eq('platform', 'twitter')
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true });

  if (!twitterPosts || !twitterPosts.length) {
    console.log('No Twitter posts found');
    process.exit(0);
  }

  // Keep first one at 8:32 PM for test, spread rest to match IG schedule
  let testKept = false;
  let updated = 0;

  for (const tp of twitterPosts) {
    if (!testKept) {
      // Keep first one at test time
      testKept = true;
      console.log('TEST POST (8:32 PM):', tp.id, (tp.caption || '').substring(0, 50));
      continue;
    }

    // Find matching IG schedule
    const key = (tp.caption || '').substring(0, 100);
    const originalTime = scheduleMap[key];

    if (originalTime) {
      await c.from('posts').update({ scheduled_at: originalTime }).eq('id', tp.id);
      updated++;
    }
  }

  console.log(`Updated ${updated} Twitter posts to match IG schedule`);
  console.log('1 Twitter post remains at 8:32 PM for testing');

  // Verify what's at 8:32 PM
  const { data: testPosts } = await c.from('posts')
    .select('id, platform, status, caption')
    .eq('scheduled_at', TEST_TIME);

  console.log(`\n=== POSTS AT 8:32 PM ET ===`);
  if (testPosts) testPosts.forEach(p => {
    console.log(`  ${p.platform} | ${p.status} | ${(p.caption || '').substring(0, 60)}`);
  });

  process.exit(0);
})();
