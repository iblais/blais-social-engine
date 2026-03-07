import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshAccountToken, refreshFacebookPageToken, tokenNeedsRefresh } from '@/lib/meta/token-refresh';

export const maxDuration = 60;

/**
 * POST /api/auth/refresh — Manually refresh a token for an account.
 * Body: { accountId: string }
 */
export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const { accountId } = await req.json();

  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  const { data: account, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  if (!['instagram', 'facebook'].includes(account.platform)) {
    return NextResponse.json({ error: 'Only Meta platforms support manual token refresh' }, { status: 400 });
  }

  try {
    const result = await refreshAccountToken(account.access_token, account.meta);

    const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();

    await supabase.from('social_accounts').update({
      access_token: result.access_token,
      token_expires_at: tokenExpiresAt,
    }).eq('id', accountId);

    return NextResponse.json({
      success: true,
      expires_at: tokenExpiresAt,
      message: `Token refreshed, expires ${new Date(tokenExpiresAt).toLocaleDateString()}`,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * GET /api/auth/refresh — Proactive token refresh for ALL platforms.
 * Called daily at 6 AM UTC by Vercel cron.
 *
 * Refreshes:
 * - Instagram (IGA tokens via graph.instagram.com, 60-day expiry)
 * - YouTube (Google OAuth2, 1-hour expiry)
 * - Twitter (OAuth 2.0 PKCE, 2-hour expiry)
 * - Facebook page tokens from facebook_login never expire — skipped
 * - Bluesky uses app passwords — skipped
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('is_active', true);

  if (!accounts?.length) {
    return NextResponse.json({ message: 'No active accounts', refreshed: 0 });
  }

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    try {
      // Bluesky: app passwords, never expires
      if (account.platform === 'bluesky') { skipped++; continue; }

      // Facebook page tokens — refresh the underlying user token before it expires
      if (account.platform === 'facebook' && account.meta?.auth_method === 'facebook_login') {
        // Permanent tokens (far-future expiry like 2099) — skip
        const fbExpiry = account.token_expires_at ? new Date(account.token_expires_at) : null;
        const isPermanent = fbExpiry && fbExpiry.getFullYear() >= 2090;
        if (isPermanent) { skipped++; continue; }

        if (account.token_expires_at && tokenNeedsRefresh(account.token_expires_at) && account.refresh_token) {
          try {
            const pageId = (account.meta?.page_id as string) || account.platform_user_id;
            const result = await refreshFacebookPageToken(account.refresh_token, pageId);
            const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
            await supabase.from('social_accounts').update({
              access_token: result.access_token,
              refresh_token: result.new_user_token,
              token_expires_at: tokenExpiresAt,
            }).eq('id', account.id);
            refreshed++;
          } catch (err) {
            failed++;
            errors.push(`${account.username} (facebook): ${(err as Error).message}`);
          }
        } else {
          skipped++;
        }
        continue;
      }

      // YouTube: refresh via Google OAuth2
      if (account.platform === 'youtube') {
        if (!account.refresh_token) { skipped++; continue; }
        const needsRefresh = !account.token_expires_at ||
          new Date(account.token_expires_at) <= new Date(Date.now() + 2 * 60 * 60 * 1000); // 2hr buffer
        if (!needsRefresh) { skipped++; continue; }

        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: account.refresh_token,
            client_id: process.env.YOUTUBE_CLIENT_ID!,
            client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
          }),
        });
        const data = await res.json();
        if (!data.access_token) throw new Error(`YouTube: ${JSON.stringify(data)}`);

        await supabase.from('social_accounts').update({
          access_token: data.access_token,
          token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
        }).eq('id', account.id);
        refreshed++;
        continue;
      }

      // Twitter: refresh via OAuth 2.0
      if (account.platform === 'twitter') {
        if (!account.refresh_token) { skipped++; continue; }
        const needsRefresh = !account.token_expires_at ||
          new Date(account.token_expires_at) <= new Date(Date.now() + 60 * 60 * 1000); // 1hr buffer
        if (!needsRefresh) { skipped++; continue; }

        const clientId = process.env.TWITTER_CLIENT_ID!;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const res = await fetch('https://api.twitter.com/2/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: account.refresh_token,
          }),
        });
        const data = await res.json();
        if (!data.access_token) throw new Error(`Twitter: ${JSON.stringify(data)}`);

        await supabase.from('social_accounts').update({
          access_token: data.access_token,
          refresh_token: data.refresh_token || account.refresh_token,
          token_expires_at: new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString(),
        }).eq('id', account.id);
        refreshed++;
        continue;
      }

      // Instagram/Facebook: refresh if within 7 days of expiry
      if (['instagram', 'facebook'].includes(account.platform)) {
        if (!tokenNeedsRefresh(account.token_expires_at)) { skipped++; continue; }

        const result = await refreshAccountToken(account.access_token, account.meta);
        const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();

        await supabase.from('social_accounts').update({
          access_token: result.access_token,
          token_expires_at: tokenExpiresAt,
        }).eq('id', account.id);
        refreshed++;
        continue;
      }

      // Unknown platform
      skipped++;
    } catch (err) {
      failed++;
      errors.push(`${account.username} (${account.platform}): ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    message: 'Done',
    total: accounts.length,
    refreshed,
    skipped,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
