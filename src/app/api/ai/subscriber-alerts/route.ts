import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 });

  try {
    // Verify account belongs to user
    const { data: account, error: accError } = await supabase
      .from('social_accounts')
      .select('id, platform')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Get last 2 metric snapshots
    const { data: metrics, error: metError } = await supabase
      .from('account_metrics')
      .select('followers, collected_at')
      .eq('account_id', accountId)
      .order('collected_at', { ascending: false })
      .limit(2);

    if (metError) throw metError;

    if (!metrics || metrics.length === 0) {
      return NextResponse.json({
        currentSubs: 0,
        previousSubs: 0,
        gain: 0,
        gainPct: 0,
        alert: 'stable',
      });
    }

    const currentSubs = metrics[0]?.followers ?? 0;
    const previousSubs = metrics[1]?.followers ?? currentSubs;
    const gain = currentSubs - previousSubs;
    const gainPct = previousSubs > 0 ? Math.round((gain / previousSubs) * 10000) / 100 : 0;

    let alert: 'surge' | 'growth' | 'stable' = 'stable';
    if (gain > 100) alert = 'surge';
    else if (gain > 10) alert = 'growth';

    return NextResponse.json({ currentSubs, previousSubs, gain, gainPct, alert });
  } catch (err) {
    console.error('Subscriber alerts error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
