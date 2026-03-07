import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings/accounts?error=no_code', req.url));
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://blais-social-engine.vercel.app').trim();
  const redirectUri = `${appUrl}/api/auth/youtube/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error('YouTube token exchange failed:', tokens);
      return NextResponse.redirect(
        new URL('/settings/accounts?error=token_exchange_failed', req.url)
      );
    }

    // Get channel info
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];

    if (!channel) {
      return NextResponse.redirect(new URL('/settings/accounts?error=no_channel', req.url));
    }

    // Get authenticated user
    const authClient = await createServerSupabase();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user?.id) {
      return NextResponse.redirect(new URL('/settings/accounts?error=no_user', req.url));
    }

    const supabase = createAdminClient();
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const accountData = {
      user_id: user.id,
      platform: 'youtube' as const,
      platform_user_id: channel.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: tokenExpiresAt,
      username: channel.snippet.customUrl || channel.snippet.title,
      display_name: channel.snippet.title,
      avatar_url: channel.snippet.thumbnails?.default?.url || null,
      is_active: true,
      updated_at: new Date().toISOString(),
      meta: {
        auth_method: 'google_oauth2',
        channel_id: channel.id,
      },
    };

    const { error: upsertErr } = await supabase
      .from('social_accounts')
      .upsert(accountData, { onConflict: 'user_id,platform,platform_user_id' });

    if (upsertErr) {
      console.error('YouTube upsert failed:', upsertErr);
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=${encodeURIComponent(upsertErr.message)}`, req.url)
      );
    }

    return NextResponse.redirect(
      new URL(
        `/settings/accounts?success=youtube&connected=${encodeURIComponent(channel.snippet.title)}`,
        req.url
      )
    );
  } catch (err) {
    console.error('YouTube OAuth error:', err);
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent((err as Error).message)}`, req.url)
    );
  }
}
