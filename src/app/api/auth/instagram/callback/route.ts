import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Instagram OAuth callback — Instagram Direct Login flow.
 *
 * Flow:
 * 1. Exchange code for short-lived token via graph.instagram.com
 * 2. Exchange for long-lived token (60 days)
 * 3. Get user profile (username, account type, etc.)
 * 4. Store in Supabase with token_expires_at for auto-refresh
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings/accounts?error=no_code', req.url)
    );
  }

  const appId = process.env.INSTAGRAM_APP_ID!;
  const appSecret = process.env.INSTAGRAM_APP_SECRET!;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://blais-social-engine.vercel.app').trim();
  const redirectUri = `${appUrl}/api/auth/instagram/callback`;

  try {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch('https://graph.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code.replace(/#_$/, ''), // Instagram appends #_ to the code
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Instagram token exchange failed:', tokenData);
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=token_exchange_failed`, req.url)
      );
    }

    const shortToken = tokenData.access_token;
    const igUserId = tokenData.user_id?.toString();

    // Step 2: Exchange for long-lived token (60 days)
    const llRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`
    );
    const llData = await llRes.json();

    const longLivedToken = llData.access_token || shortToken;
    const expiresIn = llData.expires_in || 5184000; // default 60 days
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Step 3: Get user profile
    const profileRes = await fetch(
      `https://graph.instagram.com/v22.0/me?fields=user_id,username,name,account_type,profile_picture_url&access_token=${longLivedToken}`
    );
    const profile = await profileRes.json();

    const username = profile.username || `user_${igUserId}`;
    const displayName = profile.name || username;
    const platformUserId = profile.user_id?.toString() || igUserId;
    const avatarUrl = profile.profile_picture_url || null;

    // Step 4: Store in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user ID
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    const userId = profiles?.[0]?.id;

    if (!userId) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=no_user', req.url)
      );
    }

    // Check if this account already exists
    const { data: existing } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('platform', 'instagram')
      .eq('platform_user_id', platformUserId)
      .single();

    const accountData = {
      access_token: longLivedToken,
      refresh_token: null, // Instagram Login uses ig_refresh_token endpoint instead
      token_expires_at: tokenExpiresAt,
      username,
      display_name: displayName,
      avatar_url: avatarUrl,
      is_active: true,
      meta: {
        instagram_app_id: appId,
        account_type: profile.account_type,
        auth_method: 'instagram_login',
      },
    };

    if (existing) {
      await supabase.from('social_accounts').update(accountData).eq('id', existing.id);
    } else {
      await supabase.from('social_accounts').insert({
        user_id: userId,
        platform: 'instagram' as const,
        platform_user_id: platformUserId,
        ...accountData,
      });
    }

    return NextResponse.redirect(
      new URL(`/settings/accounts?success=instagram&channel=${encodeURIComponent('@' + username)}`, req.url)
    );
  } catch (err) {
    console.error('Instagram OAuth error:', err);
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent((err as Error).message)}`, req.url)
    );
  }
}
