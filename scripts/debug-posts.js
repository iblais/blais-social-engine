const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: failedPosts } = await c.from('posts')
    .select('id, platform, status, error_message, retry_count, scheduled_at, account_id')
    .in('status', ['failed', 'retry'])
    .order('scheduled_at', { ascending: false })
    .limit(10);

  console.log('=== FAILED/RETRY POSTS ===');
  if (failedPosts) failedPosts.forEach(p => {
    console.log(p.platform, '|', p.status, '| retries:', p.retry_count, '| scheduled:', p.scheduled_at);
    console.log('  error:', (p.error_message || '').substring(0, 300));
    console.log('  account_id:', p.account_id);
    console.log('---');
  });

  const { data: accounts } = await c.from('social_accounts')
    .select('id, platform, username, platform_user_id, access_token, token_expires_at')
    .in('platform', ['bluesky', 'facebook']);

  console.log('\n=== BLUESKY & FACEBOOK ACCOUNTS ===');
  if (accounts) accounts.forEach(a => {
    const hasToken = a.access_token ? true : false;
    const tokenLen = a.access_token ? a.access_token.length : 0;
    console.log(a.platform, '|', a.username, '| platform_user_id:', a.platform_user_id);
    console.log('  has_token:', hasToken, '| token_len:', tokenLen);
    console.log('  expires:', a.token_expires_at);
    console.log('---');
  });

  // Check if there are ANY posted posts for these platforms
  const { data: postedPosts, count } = await c.from('posts')
    .select('platform, status', { count: 'exact' })
    .in('platform', ['bluesky', 'facebook'])
    .eq('status', 'posted');

  console.log('\n=== POSTED (bluesky+facebook):', count, '===');
  if (postedPosts) postedPosts.forEach(p => console.log(p.platform, p.status));

  process.exit(0);
})();
