import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';
import { ytApiFetch, YT_API } from '@/lib/youtube/api';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('platform', 'youtube')
    .single();

  if (!account) return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });

  try {
    // Fetch historical metrics from DB
    const { data: history } = await supabase
      .from('account_metrics')
      .select('*')
      .eq('account_id', accountId)
      .order('recorded_at', { ascending: false })
      .limit(90);

    // Fetch current channel stats from YouTube (with fallback for Brand Account tokens)
    const channelId = (account.meta as Record<string, string>)?.channel_id || account.platform_user_id;
    const channelResult = await ytApiFetch(
      `${YT_API}/channels?part=statistics,snippet&id=${channelId}`,
      account.access_token, supabase, user.id
    );
    if (channelResult.error) return NextResponse.json({ error: channelResult.error }, { status: channelResult.status });
    const channel = (channelResult.data?.items as Array<Record<string, unknown>> | undefined)?.[0];
    if (!channel) throw new Error('Channel not found');

    const stats = channel.statistics as Record<string, unknown> | undefined;
    const current = {
      subscribers: Number(stats?.subscriberCount || 0),
      views: Number(stats?.viewCount || 0),
      videos: Number(stats?.videoCount || 0),
    };

    // Build history timeline (newest first from DB)
    const historyTimeline = (history || []).map((row: Record<string, unknown>) => ({
      date: row.recorded_at,
      subscribers: Number(row.followers_count || 0),
      views: Number(row.views_count || row.impressions_count || 0),
    }));

    // Calculate growth rates
    const growth = { subsPerWeek: 0, viewsPerWeek: 0, subsGrowthPct: 0 };

    if (historyTimeline.length >= 2) {
      const newest = historyTimeline[0];
      const oldest = historyTimeline[historyTimeline.length - 1];
      const daysDiff = Math.max(1, Math.round(
        (new Date(newest.date as string).getTime() - new Date(oldest.date as string).getTime()) / (1000 * 60 * 60 * 24)
      ));
      const weeksDiff = Math.max(1, daysDiff / 7);

      const subsDiff = newest.subscribers - oldest.subscribers;
      const viewsDiff = newest.views - oldest.views;

      growth.subsPerWeek = Math.round(subsDiff / weeksDiff);
      growth.viewsPerWeek = Math.round(viewsDiff / weeksDiff);
      growth.subsGrowthPct = oldest.subscribers > 0
        ? Math.round((subsDiff / oldest.subscribers) * 10000) / 100
        : 0;
    }

    // Use Gemini to predict next 30 days
    let prediction = { next30DaySubs: 0, next30DayViews: 0, confidence: 0 };

    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'gemini_api_key')
      .single();

    const geminiKey = setting?.value || process.env.GEMINI_API_KEY;

    if (geminiKey && historyTimeline.length >= 7) {
      const prompt = `You are a YouTube analytics expert. Based on this channel's growth data, predict the next 30 days.

Current stats:
- Subscribers: ${current.subscribers}
- Total views: ${current.views}
- Total videos: ${current.videos}

Growth rate:
- ${growth.subsPerWeek} subscribers/week
- ${growth.viewsPerWeek} views/week
- ${growth.subsGrowthPct}% subscriber growth over tracking period

Historical data points (last ${historyTimeline.length} records):
${historyTimeline.slice(0, 30).map((h: { date: unknown; subscribers: number; views: number }) => `${h.date}: ${h.subscribers} subs, ${h.views} views`).join('\n')}

Predict subscriber and view counts 30 days from now. Consider momentum, plateaus, and seasonal trends.

Return ONLY JSON:
{"next30DaySubs": <predicted total subscribers in 30 days>, "next30DayViews": <predicted total views in 30 days>, "confidence": <0-100 confidence score>}
No markdown.`;

      try {
        const raw = await geminiGenerate(prompt, geminiKey);
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        const s = cleaned.indexOf('{');
        const e = cleaned.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
          prediction = JSON.parse(cleaned.slice(s, e + 1));
        }
      } catch { /* Prediction is optional */ }
    }

    return NextResponse.json({
      current,
      history: historyTimeline,
      growth,
      prediction,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
