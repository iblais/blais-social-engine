import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/settings/accounts?error=no_code', req.url));
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/youtube/callback`;

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
    return NextResponse.redirect(new URL('/settings/accounts?error=token_failed', req.url));
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

  // Store in Supabase using service role (we don't have user session in OAuth callback)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the user — for now use the first/only user since this is a single-user app
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  const userId = profiles?.[0]?.id;

  if (!userId) {
    return NextResponse.redirect(new URL('/settings/accounts?error=no_user', req.url));
  }

  // Check if this channel already exists
  const { data: existing } = await supabase
    .from('social_accounts')
    .select('id')
    .eq('platform', 'youtube')
    .eq('platform_user_id', channel.id)
    .single();

  if (existing) {
    // Update existing
    await supabase.from('social_accounts').update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      username: channel.snippet.title,
      display_name: channel.snippet.title,
      avatar_url: channel.snippet.thumbnails?.default?.url || null,
      is_active: true,
    }).eq('id', existing.id);
  } else {
    // Insert new
    await supabase.from('social_accounts').insert({
      user_id: userId,
      platform: 'youtube',
      platform_user_id: channel.id,
      username: channel.snippet.customUrl || channel.snippet.title,
      display_name: channel.snippet.title,
      avatar_url: channel.snippet.thumbnails?.default?.url || null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      is_active: true,
      meta: {
        client_id: process.env.YOUTUBE_CLIENT_ID,
        channel_id: channel.id,
        subscriber_count: channel.snippet.subscriberCount || null,
      },
    });
  }

  return NextResponse.redirect(
    new URL(`/settings/accounts?success=youtube&channel=${encodeURIComponent(channel.snippet.title)}`, req.url)
  );
}
