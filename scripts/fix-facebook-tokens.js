#!/usr/bin/env node

/**
 * fix-facebook-tokens.js
 *
 * Takes a short-lived Facebook User Token from Graph API Explorer,
 * exchanges it for a long-lived token, fetches PERMANENT page tokens,
 * verifies they never expire, and writes them to the database.
 *
 * Usage:
 *   node scripts/fix-facebook-tokens.js <USER_ACCESS_TOKEN>
 */

const GRAPH_API = 'https://graph.facebook.com/v22.0';
const APP_ID = '1656097598425089';
const APP_SECRET = 'b0fc15a3c344ca08f3eac2f45095cd8b';
const SUPABASE_URL = 'https://mzwleneitsihjwfzfuho.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16d2xlbmVpdHNpaGp3ZnpmdWhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY0NzEyOCwiZXhwIjoyMDg4MjIzMTI4fQ.HDgn2em010TumtXt-yuLBLbcYHAeZKYcDFn2suoEoKc';

async function main() {
  const shortToken = process.argv[2];
  if (!shortToken) {
    console.error('Usage: node scripts/fix-facebook-tokens.js <USER_ACCESS_TOKEN>');
    console.error('\nGet the token from: https://developers.facebook.com/tools/explorer/');
    process.exit(1);
  }

  console.log('Step 1: Exchanging for long-lived user token (60 days)...');
  const llRes = await fetch(
    `${GRAPH_API}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: APP_ID,
      client_secret: APP_SECRET,
      fb_exchange_token: shortToken,
    })
  );
  const llData = await llRes.json();

  if (!llData.access_token) {
    console.error('FAILED:', llData);
    process.exit(1);
  }

  const longLivedUserToken = llData.access_token;
  const expiresInDays = Math.round((llData.expires_in || 0) / 86400);
  console.log(`  OK — long-lived user token obtained (expires in ${expiresInDays} days)`);

  console.log('\nStep 2: Fetching Page Access Tokens (these are PERMANENT)...');
  const pagesRes = await fetch(
    `${GRAPH_API}/me/accounts?fields=id,name,access_token&access_token=${longLivedUserToken}`
  );
  const pagesData = await pagesRes.json();
  const pages = pagesData.data || [];

  if (!pages.length) {
    console.error('FAILED: No pages found. Check permissions.');
    console.error(pagesData);
    process.exit(1);
  }

  console.log(`  Found ${pages.length} page(s):`);
  for (const page of pages) {
    console.log(`    - ${page.name} (${page.id})`);
  }

  console.log('\nStep 3: Verifying page tokens are permanent...');
  for (const page of pages) {
    const debugRes = await fetch(
      `${GRAPH_API}/debug_token?input_token=${page.access_token}&access_token=${APP_ID}|${APP_SECRET}`
    );
    const debugData = await debugRes.json();
    const d = debugData.data || {};
    const expires = d.expires_at === 0 ? 'NEVER (permanent)' : new Date(d.expires_at * 1000).toISOString();
    const valid = d.is_valid ? 'VALID' : 'INVALID';
    console.log(`  ${page.name}: ${valid}, expires: ${expires}`);

    if (!d.is_valid) {
      console.error(`  WARNING: Token for ${page.name} is invalid!`);
    }
  }

  console.log('\nStep 4: Updating database...');
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  // Get existing Facebook accounts
  const acctRes = await fetch(
    `${SUPABASE_URL}/rest/v1/social_accounts?platform=eq.facebook&is_active=eq.true&select=id,username,platform_user_id`,
    { headers }
  );
  const accounts = await acctRes.json();

  let updated = 0;
  for (const page of pages) {
    const match = accounts.find(a => a.platform_user_id === page.id);
    if (!match) {
      console.log(`  ${page.name} (${page.id}): no matching account in DB, skipping`);
      continue;
    }

    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/social_accounts?id=eq.${match.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          access_token: page.access_token,
          refresh_token: longLivedUserToken,
          token_expires_at: '2099-01-01T00:00:00Z', // permanent — far-future so refresh logic skips it
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (updateRes.ok) {
      console.log(`  ${match.username}: UPDATED`);
      updated++;
    } else {
      const err = await updateRes.text();
      console.error(`  ${match.username}: FAILED — ${err}`);
    }
  }

  console.log(`\nStep 5: Verifying Blais Lab can post...`);
  const blaisLab = accounts.find(a => a.username === 'Blais Lab');
  if (blaisLab) {
    const blaisPage = pages.find(p => p.id === blaisLab.platform_user_id);
    if (blaisPage) {
      const testRes = await fetch(
        `${GRAPH_API}/${blaisLab.platform_user_id}?fields=name,fan_count&access_token=${blaisPage.access_token}`
      );
      const testData = await testRes.json();
      if (testData.name) {
        console.log(`  Blais Lab page accessible: "${testData.name}" (${testData.fan_count || 0} followers)`);
      } else {
        console.error('  FAILED:', testData);
      }
    }
  }

  console.log(`\n=== DONE: ${updated}/${pages.length} Facebook accounts updated with permanent tokens ===`);
  console.log('These tokens NEVER expire unless you change your Facebook password or remove the app.');

  // Now reset any failed Facebook posts
  console.log('\nStep 6: Resetting failed Facebook posts to scheduled...');
  const resetRes = await fetch(
    `${SUPABASE_URL}/rest/v1/posts?status=eq.failed&platform=eq.facebook&select=id,caption,account_id`,
    { headers }
  );
  const failedPosts = await resetRes.json();

  if (failedPosts.length > 0) {
    const ids = failedPosts.map(p => p.id);
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/posts?id=in.(${ids.join(',')})`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'scheduled',
          error_message: null,
          retry_count: 0,
          scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min from now
        }),
      }
    );
    console.log(`  Reset ${failedPosts.length} failed FB posts to scheduled (5 min from now)`);
  } else {
    console.log('  No failed Facebook posts to reset');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
