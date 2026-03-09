import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const IG_GRAPH = 'https://graph.instagram.com/v22.0';

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

  // For business_discovery we need a Facebook page token (EAA...) linked to an IG business account
  // Try to find a Facebook page that has an instagram_business_account linked
  const { data: fbAccounts } = await supabase
    .from('social_accounts')
    .select('platform_user_id, access_token')
    .eq('platform', 'facebook')
    .eq('is_active', true);

  // Try each FB page token to find one with an IG business account linked
  let bizDiscoveryToken: string | null = null;
  let bizDiscoveryIgId: string | null = null;

  for (const fb of fbAccounts || []) {
    try {
      const checkRes = await fetch(
        `${FB_GRAPH}/${fb.platform_user_id}?fields=instagram_business_account&access_token=${fb.access_token}`
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.instagram_business_account?.id) {
          bizDiscoveryToken = fb.access_token;
          bizDiscoveryIgId = checkData.instagram_business_account.id;
          break;
        }
      }
    } catch { /* continue */ }
  }

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const comp of competitors) {
    try {
      if (comp.platform === 'instagram' && bizDiscoveryToken && bizDiscoveryIgId) {
        // Use Instagram Business Discovery API via Facebook page token
        const res = await fetch(
          `${FB_GRAPH}/${bizDiscoveryIgId}?fields=business_discovery.username(${comp.username}){followers_count,follows_count,media_count,biography,profile_picture_url,name}&access_token=${bizDiscoveryToken}`
        );

        if (res.ok) {
          const data = await res.json();
          const biz = data.business_discovery;

          if (biz) {
            await supabase.from('competitors').update({
              followers: biz.followers_count || 0,
              following: biz.follows_count || 0,
              post_count: biz.media_count || 0,
              display_name: biz.name || comp.display_name,
              avatar_url: biz.profile_picture_url || comp.avatar_url,
              last_fetched_at: new Date().toISOString(),
            }).eq('id', comp.id);

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
      } else if (comp.platform === 'instagram') {
        // No FB token with linked IG business account — can't use business_discovery
        failed++;
        errors.push(`IG @${comp.username}: No Facebook page with linked IG business account found for business_discovery`);
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
            `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet,contentDetails&forHandle=${comp.username}&key=${ytKey}`
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

              // Fetch last 10 videos
              const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
              if (uploadsId) {
                try {
                  const plRes = await fetch(
                    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsId}&maxResults=10&key=${ytKey}`
                  );
                  if (plRes.ok) {
                    const plData = await plRes.json();
                    const vidIds = plData.items?.map((i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId).join(',');
                    if (vidIds) {
                      const vidsRes = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${vidIds}&key=${ytKey}`
                      );
                      if (vidsRes.ok) {
                        const vidsData = await vidsRes.json();
                        for (const v of vidsData.items || []) {
                          const { error: upsertErr } = await supabase.from('competitor_videos').upsert({
                            competitor_id: comp.id,
                            video_id: v.id,
                            title: v.snippet?.title,
                            published_at: v.snippet?.publishedAt,
                            views: parseInt(v.statistics?.viewCount || '0'),
                            likes: parseInt(v.statistics?.likeCount || '0'),
                            comments: parseInt(v.statistics?.commentCount || '0'),
                            duration: v.contentDetails?.duration,
                            tags: v.snippet?.tags || [],
                            thumbnail_url: v.snippet?.thumbnails?.medium?.url,
                          }, { onConflict: 'competitor_id, video_id' });
                          if (upsertErr) console.error(`Video upsert error for ${v.id}:`, upsertErr.message);
                        }
                      }
                    }
                  }
                } catch { /* video fetch optional */ }
              }

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
