const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Reset failed Bluesky posts to scheduled so they retry with new image compression
  const { data: bskyPosts, error: bskyErr } = await c.from('posts')
    .update({
      status: 'scheduled',
      retry_count: 0,
      error_message: null,
      scheduled_at: new Date().toISOString()
    })
    .eq('platform', 'bluesky')
    .eq('status', 'failed')
    .select('id, platform, caption');

  console.log('=== RESET BLUESKY FAILED POSTS ===');
  console.log('Reset:', bskyPosts?.length || 0, 'posts');
  if (bskyErr) console.error('Error:', bskyErr.message);
  if (bskyPosts) bskyPosts.forEach(p => {
    console.log('  -', p.id, (p.caption || '').substring(0, 60));
  });

  // Show remaining Facebook failed posts (user needs to reconnect)
  const { data: fbPosts } = await c.from('posts')
    .select('id, platform, status, error_message')
    .eq('platform', 'facebook')
    .eq('status', 'failed');

  console.log('\n=== FACEBOOK FAILED POSTS (need reconnect) ===');
  console.log('Count:', fbPosts?.length || 0);

  process.exit(0);
})();
