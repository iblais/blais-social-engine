import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

/**
 * Twitter/X OAuth 2.0 PKCE callback.
 * Exchanges code for access + refresh tokens, stores as social_account.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
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

  const cookieStore = await cookies();
  const storedState = cookieStore.get('twitter_oauth_state')?.value;
  const codeVerifier = cookieStore.get('twitter_code_verifier')?.value;

  if (!storedState || state !== storedState) {
    return NextResponse.redirect(
      new URL('/settings/accounts?error=state_mismatch', req.url)
    );
  }

  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL('/settings/accounts?error=missing_verifier', req.url)
    );
  }

  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://blais-social-engine.vercel.app').trim();
  const redirectUri = `${appUrl}/api/auth/twitter/callback`;

  try {
    // Exchange code for tokens
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Twitter token exchange failed:', tokenData);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=token_exchange_failed', req.url)
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 7200; // 2 hours default

    // Get user info
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userRes.json();
    const twitterUser = userData.data;

    if (!twitterUser) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=no_user_data', req.url)
      );
    }

    // Get authenticated Supabase user
    const authClient = await createServerSupabase();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user?.id) {
      return NextResponse.redirect(
        new URL('/settings/accounts?error=no_user', req.url)
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Upsert the social account
    const { data: existing } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('platform', 'twitter')
      .eq('platform_user_id', twitterUser.id)
      .single();

    const accountData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
      username: twitterUser.username,
      display_name: twitterUser.name,
      avatar_url: twitterUser.profile_image_url || null,
      is_active: true,
      meta: { auth_method: 'twitter_oauth2' },
    };

    if (existing) {
      await supabase.from('social_accounts').update(accountData).eq('id', existing.id);
    } else {
      await supabase.from('social_accounts').insert({
        user_id: user.id,
        platform: 'twitter' as const,
        platform_user_id: twitterUser.id,
        ...accountData,
      });
    }

    // Clear cookies
    cookieStore.delete('twitter_code_verifier');
    cookieStore.delete('twitter_oauth_state');

    return NextResponse.redirect(
      new URL(`/settings/accounts?success=twitter&connected=${encodeURIComponent(twitterUser.username)}`, req.url)
    );
  } catch (err) {
    console.error('Twitter OAuth error:', err);
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent((err as Error).message)}`, req.url)
    );
  }
}
