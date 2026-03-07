const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const NOW = new Date().toISOString();

(async () => {
  // 1. Check Twitter account token status
  const { data: twAcct } = await c.from('social_accounts')
    .select('id, username, access_token, refresh_token, token_expires_at, meta')
    .eq('id', '9e5e1e9f-abfc-4999-88e2-a50b4f0723c6')
    .single();

  console.log('=== TWITTER ACCOUNT ===');
  console.log('username:', twAcct.username);
  console.log('token_expires_at:', twAcct.token_expires_at);
  console.log('has refresh_token:', twAcct.refresh_token ? 'yes (length ' + twAcct.refresh_token.length + ')' : 'NO');
  console.log('token starts with:', twAcct.access_token.substring(0, 20) + '...');
  console.log('meta:', JSON.stringify(twAcct.meta));

  const expires = twAcct.token_expires_at ? new Date(twAcct.token_expires_at) : null;
  const isExpired = expires ? expires < new Date() : 'unknown';
  console.log('expired:', isExpired);

  // 2. Try to refresh the token
  if (twAcct.refresh_token) {
    console.log('\nRefreshing Twitter token...');
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    const basicAuth = Buffer.from(clientId + ':' + clientSecret).toString('base64');

    const res = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + basicAuth,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: twAcct.refresh_token,
      }),
    });

    const data = await res.json();
    if (data.access_token) {
      const newExpires = new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString();
      await c.from('social_accounts').update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || twAcct.refresh_token,
        token_expires_at: newExpires,
      }).eq('id', twAcct.id);
      console.log('Token refreshed! Expires:', newExpires);
    } else {
      console.log('Refresh FAILED:', JSON.stringify(data));
    }
  }

  // 3. Schedule all remaining posts for NOW
  // "WHICH AI TOOL TO USE FOR POD" - FB and Twitter
  const { data: updated1 } = await c.from('posts')
    .update({ status: 'scheduled', scheduled_at: NOW, retry_count: 0, error_message: null })
    .eq('platform', 'facebook')
    .like('caption', 'WHICH AI TOOL TO USE FOR POD%')
    .in('status', ['scheduled', 'failed', 'retry'])
    .select('id, platform');
  console.log('\nFB "WHICH AI TOOL": reset', (updated1 || []).length, 'posts');

  const { data: updated2 } = await c.from('posts')
    .update({ status: 'scheduled', scheduled_at: NOW, retry_count: 0, error_message: null })
    .eq('platform', 'twitter')
    .like('caption', 'WHICH AI TOOL TO USE FOR POD%')
    .in('status', ['scheduled', 'failed', 'retry'])
    .select('id, platform');
  console.log('TW "WHICH AI TOOL": reset', (updated2 || []).length, 'posts');

  // "WHY YOUR AI DESIGNS PRINT BLURRY" - FB and Twitter (already scheduled, just make sure time is NOW)
  const { data: updated3 } = await c.from('posts')
    .update({ scheduled_at: NOW, retry_count: 0, error_message: null })
    .eq('platform', 'facebook')
    .like('caption', 'WHY YOUR AI DESIGNS PRINT BLURRY%')
    .eq('status', 'scheduled')
    .select('id');
  console.log('FB "PRINT BLURRY": moved', (updated3 || []).length, 'to now');

  const { data: updated4 } = await c.from('posts')
    .update({ scheduled_at: NOW, retry_count: 0, error_message: null })
    .eq('platform', 'twitter')
    .like('caption', 'WHY YOUR AI DESIGNS PRINT BLURRY%')
    .eq('status', 'scheduled')
    .select('id');
  console.log('TW "PRINT BLURRY": moved', (updated4 || []).length, 'to now');

  // Final check
  const { data: ready } = await c.from('posts')
    .select('platform, status, caption, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date(Date.now() + 5 * 60 * 1000).toISOString())
    .in('platform', ['facebook', 'twitter', 'bluesky']);

  console.log('\n=== READY TO POST NOW ===');
  if (ready) ready.forEach(p => {
    console.log('  ' + p.platform + ' | ' + (p.caption || '').substring(0, 50));
  });

  process.exit(0);
})();
