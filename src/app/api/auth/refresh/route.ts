import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refreshAccountToken, tokenNeedsRefresh } from '@/lib/meta/token-refresh';

/**
 * POST /api/auth/refresh — Manually refresh a Meta token for an account.
 * Body: { accountId: string }
 *
 * Also used internally by the cron job.
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
    return NextResponse.json({ error: 'Only Meta platforms support token refresh' }, { status: 400 });
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
 * GET /api/auth/refresh — Auto-refresh all Meta tokens expiring within 7 days.
 * Called by cron or manually.
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
    .in('platform', ['instagram', 'facebook'])
    .eq('is_active', true);

  if (!accounts?.length) {
    return NextResponse.json({ message: 'No Meta accounts to refresh', refreshed: 0 });
  }

  let refreshed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    if (!tokenNeedsRefresh(account.token_expires_at)) continue;

    try {
      const result = await refreshAccountToken(account.access_token, account.meta);
      const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();

      await supabase.from('social_accounts').update({
        access_token: result.access_token,
        token_expires_at: tokenExpiresAt,
      }).eq('id', account.id);

      refreshed++;
    } catch (err) {
      failed++;
      errors.push(`${account.username} (${account.platform}): ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ message: 'Done', refreshed, failed, errors });
}
