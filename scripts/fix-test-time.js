const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TEST_TIME = '2026-03-06T00:32:00.000Z';

(async () => {
  // Get all posts at the test time
  const { data: testPosts } = await c.from('posts')
    .select('id, platform, status, caption, scheduled_at')
    .eq('scheduled_at', TEST_TIME);

  // Keep only 1 per platform at test time, move the rest to original IG schedule
  const kept = {};
  const toMove = [];

  for (const p of testPosts || []) {
    if (!kept[p.platform]) {
      kept[p.platform] = p;
    } else {
      toMove.push(p);
    }
  }

  // Get IG schedule map for reassignment
  const { data: igPosts } = await c.from('posts')
    .select('caption, scheduled_at')
    .eq('platform', 'instagram')
    .eq('status', 'scheduled')
    .neq('scheduled_at', TEST_TIME)
    .order('scheduled_at', { ascending: true });

  const scheduleMap = {};
  if (igPosts) igPosts.forEach(p => {
    const key = (p.caption || '').substring(0, 100);
    if (!scheduleMap[key]) scheduleMap[key] = p.scheduled_at;
  });

  for (const p of toMove) {
    const key = (p.caption || '').substring(0, 100);
    const newTime = scheduleMap[key] || '2026-03-07T12:00:00.000Z'; // fallback to tomorrow noon
    await c.from('posts').update({ scheduled_at: newTime }).eq('id', p.id);
    console.log('Moved:', p.platform, (p.caption || '').substring(0, 40), '-> original schedule');
  }

  // Also fix the IG post that's stuck in 'publishing'
  const { data: publishing } = await c.from('posts')
    .select('id, platform')
    .eq('status', 'publishing')
    .eq('scheduled_at', TEST_TIME);

  if (publishing && publishing.length) {
    for (const p of publishing) {
      await c.from('posts').update({ status: 'scheduled' }).eq('id', p.id);
      console.log('Reset publishing -> scheduled:', p.platform, p.id);
    }
  }

  // Final check
  const { data: final } = await c.from('posts')
    .select('id, platform, status, caption')
    .eq('scheduled_at', TEST_TIME);

  console.log('\n=== FINAL TEST POSTS AT 8:32 PM ===');
  if (final) final.forEach(p => {
    console.log(`  ${p.platform} | ${p.status} | ${(p.caption || '').substring(0, 60)}`);
  });

  process.exit(0);
})();
