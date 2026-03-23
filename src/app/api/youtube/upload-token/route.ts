import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshYouTubeToken } from '@/lib/youtube/refresh-token';

/**
 * POST /api/youtube/upload-token
 * Returns a fresh YouTube access token for direct browser-to-YouTube uploads.
 * Only returns tokens for accounts the authenticated user owns.
 */
export async function POST(req: NextRequest) {
  try {
    const { accountId } = await req.json();
    if (!accountId) {
      return NextResponse.json({ error: 'accountId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: account, error } = await adminClient
      .from('social_accounts')
      .select('id, access_token, refresh_token, token_expires_at, meta, platform')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .eq('platform', 'youtube')
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });
    }

    if (!account.refresh_token) {
      return NextResponse.json({ error: 'No refresh token. Reconnect YouTube in Settings.' }, { status: 400 });
    }

    // Check if token needs refresh (expired or expiring within 10 minutes)
    const needsRefresh = !account.token_expires_at ||
      new Date(account.token_expires_at) <= new Date(Date.now() + 10 * 60 * 1000);

    let accessToken = account.access_token;
    if (needsRefresh) {
      accessToken = await refreshYouTubeToken(account.refresh_token, adminClient, account.id);
    }

    const meta = typeof account.meta === 'string' ? JSON.parse(account.meta) : account.meta;

    return NextResponse.json({
      accessToken,
      channelId: meta?.channel_id || null,
    });
  } catch (err) {
    console.error('[upload-token]', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
