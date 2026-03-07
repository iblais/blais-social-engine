const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check ALL posts with these two captions across all platforms
  const captions = ['WHY YOUR AI DESIGNS PRINT BLURRY', 'WHICH AI TOOL TO USE FOR POD'];

  for (const cap of captions) {
    console.log(`\n=== "${cap}" ===`);
    const { data } = await c.from('posts')
      .select('id, platform, status, scheduled_at, published_at, error_message')
      .like('caption', cap + '%');

    if (data) data.forEach(p => {
      console.log(`  ${p.platform} | ${p.status} | sched: ${p.scheduled_at} | pub: ${p.published_at || '-'}`);
      if (p.error_message) console.log(`    error: ${p.error_message.substring(0, 100)}`);
    });
  }

  process.exit(0);
})();
