import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

const GRAPH_API = 'https://graph.facebook.com/v22.0';

/**
 * Fetch real follower/engagement data for tracked competitors.
 * Uses Instagram Graph API business discovery for IG competitors.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get all competitors
  const { data: competitors } = await supabase
    .from('competitors')
    .select('*')
    .order('created_at');

  if (!competitors?.length) {
    return NextResponse.json({ message: 'No competitors to track' });
  }

  // Get an IG account token to use for business discovery lookups
  const { data: igAccounts } = await supabase
    .from('social_accounts')
    .select('platform_user_id, access_token')
    .eq('platform', 'instagram')
    .eq('is_active', true)
    .limit(1);

  const igToken = igAccounts?.[0]?.access_token;
  const igUserId = igAccounts?.[0]?.platform_user_id;

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const comp of competitors) {
    try {
      if (comp.platform === 'instagram' && igToken && igUserId) {
        // Use Instagram Business Discovery API
        const res = await fetch(
          `${GRAPH_API}/${igUserId}?fields=business_discovery.username(${comp.username}){followers_count,follows_count,media_count,biography,profile_picture_url,name}&access_token=${igToken}`
        );

        if (res.ok) {
          const data = await res.json();
          const biz = data.business_discovery;

          if (biz) {
            // Update competitor record
            await supabase.from('competitors').update({
              followers: biz.followers_count || 0,
              following: biz.follows_count || 0,
              post_count: biz.media_count || 0,
              display_name: biz.name || comp.display_name,
              avatar_url: biz.profile_picture_url || comp.avatar_url,
              last_fetched_at: new Date().toISOString(),
            }).eq('id', comp.id);

            // Save snapshot
            await supabase.from('competitor_snapshots').insert({
              competitor_id: comp.id,
              followers: biz.followers_count || 0,
              following: biz.follows_count || 0,
              post_count: biz.media_count || 0,
            });

            updated++;
          }
        } else {
          const errText = await res.text();
          errors.push(`IG @${comp.username}: ${errText.substring(0, 100)}`);
          failed++;
        }
      } else if (comp.platform === 'facebook') {
        // For Facebook pages, we'd need the page ID — skip for now unless we have it
        // Facebook doesn't support looking up arbitrary pages by username via Graph API without page access token
        failed++;
        errors.push(`FB @${comp.username}: Facebook competitor lookup not yet supported`);
      } else if (comp.platform === 'youtube') {
        // YouTube Data API — search for channel by username
        const ytKey = process.env.YOUTUBE_API_KEY;
        if (ytKey) {
          const searchRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=${comp.username}&key=${ytKey}`
          );
          if (searchRes.ok) {
            const ytData = await searchRes.json();
            const channel = ytData.items?.[0];
            if (channel) {
              await supabase.from('competitors').update({
                followers: parseInt(channel.statistics?.subscriberCount || '0'),
                post_count: parseInt(channel.statistics?.videoCount || '0'),
                display_name: channel.snippet?.title || comp.display_name,
                avatar_url: channel.snippet?.thumbnails?.default?.url || comp.avatar_url,
                platform_user_id: channel.id,
                last_fetched_at: new Date().toISOString(),
              }).eq('id', comp.id);

              await supabase.from('competitor_snapshots').insert({
                competitor_id: comp.id,
                followers: parseInt(channel.statistics?.subscriberCount || '0'),
                post_count: parseInt(channel.statistics?.videoCount || '0'),
              });
              updated++;
            }
          }
        }
      }
      // Bluesky: AT Protocol doesn't have a discovery API for arbitrary users yet
    } catch (err) {
      failed++;
      errors.push(`${comp.platform} @${comp.username}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    message: 'Done',
    updated,
    failed,
    total: competitors.length,
    errors: errors.slice(0, 10),
  });
}
