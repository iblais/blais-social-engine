import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/settings/accounts?error=no_code', req.url));
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = `${req.nextUrl.origin}/api/auth/facebook/callback`;

  // 1. Exchange code for short-lived token
  const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('redirect_uri', redirectUri);
  tokenUrl.searchParams.set('code', code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL('/settings/accounts?error=token_failed', req.url));
  }

  // 2. Exchange for long-lived token (60 days)
  const longLivedUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
  longLivedUrl.searchParams.set('client_id', appId);
  longLivedUrl.searchParams.set('client_secret', appSecret);
  longLivedUrl.searchParams.set('fb_exchange_token', tokenData.access_token);

  const longLivedRes = await fetch(longLivedUrl.toString());
  const longLivedData = await longLivedRes.json();
  const userAccessToken = longLivedData.access_token || tokenData.access_token;
  const expiresIn = longLivedData.expires_in || tokenData.expires_in || 5184000; // default 60 days

  // 3. Get user's Facebook Pages and Instagram accounts
  const accountsRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}`,
    { headers: { Authorization: `Bearer ${userAccessToken}` } }
  );
  const accountsData = await accountsRes.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the user
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  const userId = profiles?.[0]?.id;
  if (!userId) {
    return NextResponse.redirect(new URL('/settings/accounts?error=no_user', req.url));
  }

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  let connectedCount = 0;

  for (const page of accountsData.data || []) {
    // Save Facebook Page with its own page access token (doesn't expire for long-lived user tokens)
    await upsertAccount(supabase, {
      userId,
      platform: 'facebook',
      platformUserId: page.id,
      username: page.name,
      displayName: page.name,
      accessToken: page.access_token, // Page tokens from long-lived user tokens don't expire
      refreshToken: userAccessToken, // Store user token for refresh
      tokenExpiresAt: null, // Page tokens from long-lived user tokens are perpetual
      meta: { app_id: appId, page_id: page.id },
    });
    connectedCount++;

    // Save Instagram Business Account if connected
    const ig = page.instagram_business_account;
    if (ig) {
      await upsertAccount(supabase, {
        userId,
        platform: 'instagram',
        platformUserId: ig.id,
        username: ig.username || ig.name,
        displayName: ig.name || ig.username,
        avatarUrl: ig.profile_picture_url,
        accessToken: page.access_token, // Instagram uses the Page token
        refreshToken: userAccessToken,
        tokenExpiresAt,
        meta: { app_id: appId, page_id: page.id, ig_user_id: ig.id },
      });
      connectedCount++;
    }
  }

  if (connectedCount === 0) {
    return NextResponse.redirect(
      new URL('/settings/accounts?error=no_pages', req.url)
    );
  }

  return NextResponse.redirect(
    new URL(`/settings/accounts?success=facebook&count=${connectedCount}`, req.url)
  );
}

async function upsertAccount(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string;
    platform: string;
    platformUserId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: string | null;
    meta: Record<string, unknown>;
  }
) {
  const { data: existing } = await supabase
    .from('social_accounts')
    .select('id')
    .eq('platform', params.platform)
    .eq('platform_user_id', params.platformUserId)
    .single();

  if (existing) {
    await supabase
      .from('social_accounts')
      .update({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
        token_expires_at: params.tokenExpiresAt,
        username: params.username,
        display_name: params.displayName,
        avatar_url: params.avatarUrl || null,
        is_active: true,
        meta: params.meta,
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('social_accounts').insert({
      user_id: params.userId,
      platform: params.platform,
      platform_user_id: params.platformUserId,
      username: params.username,
      display_name: params.displayName,
      avatar_url: params.avatarUrl || null,
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
      token_expires_at: params.tokenExpiresAt,
      is_active: true,
      meta: params.meta,
    });
  }
}
