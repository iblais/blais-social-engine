import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const IG_GRAPH = 'https://graph.instagram.com/v22.0';

/** Pick the right Graph API base URL based on token type */
function graphApi(token: string): string {
  return token.startsWith('IGA') ? IG_GRAPH : FB_GRAPH;
}

/**
 * Fetch real engagement metrics (likes, comments, shares, views) for all posted posts.
 * Pulls from Instagram Graph API and Facebook Graph API.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get all posted posts with platform_post_ids, joined with account tokens
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, platform, platform_post_id, account_id, social_accounts(access_token, platform_user_id)')
    .eq('status', 'posted')
    .not('platform_post_id', 'is', null)
    .order('published_at', { ascending: false })
    .limit(100);

  if (error || !posts?.length) {
    return NextResponse.json({ message: 'No posts to fetch metrics for', error: error?.message });
  }

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const post of posts) {
    const account = post.social_accounts as any;
    if (!account?.access_token) continue;

    try {
      let metrics: { impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number } | null = null;

      if (post.platform === 'instagram') {
        const base = graphApi(account.access_token);
        // IG Media Insights API
        const insightsRes = await fetch(
          `${base}/${post.platform_post_id}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${account.access_token}`
        );

        if (insightsRes.ok) {
          const insightsData = await insightsRes.json();
          const vals: Record<string, number> = {};
          (insightsData.data || []).forEach((m: any) => {
            vals[m.name] = m.values?.[0]?.value || 0;
          });
          metrics = {
            impressions: vals.impressions || 0,
            reach: vals.reach || 0,
            likes: vals.likes || 0,
            comments: vals.comments || 0,
            shares: vals.shares || 0,
            saves: vals.saved || 0,
          };
        } else {
          // Fallback: get basic fields from media endpoint
          const mediaRes = await fetch(
            `${base}/${post.platform_post_id}?fields=like_count,comments_count&access_token=${account.access_token}`
          );
          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            metrics = {
              impressions: 0,
              reach: 0,
              likes: mediaData.like_count || 0,
              comments: mediaData.comments_count || 0,
              shares: 0,
              saves: 0,
            };
          }
        }
      } else if (post.platform === 'facebook') {
        // Facebook post insights
        const fbRes = await fetch(
          `${FB_GRAPH}/${post.platform_post_id}?fields=likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions,post_engaged_users)&access_token=${account.access_token}`
        );

        if (fbRes.ok) {
          const fbData = await fbRes.json();
          const insightVals: Record<string, number> = {};
          (fbData.insights?.data || []).forEach((m: any) => {
            insightVals[m.name] = m.values?.[0]?.value || 0;
          });
          metrics = {
            impressions: insightVals.post_impressions || 0,
            reach: insightVals.post_engaged_users || 0,
            likes: fbData.likes?.summary?.total_count || 0,
            comments: fbData.comments?.summary?.total_count || 0,
            shares: fbData.shares?.count || 0,
            saves: 0,
          };
        }
      }

      if (metrics) {
        const totalInteractions = metrics.likes + metrics.comments + metrics.shares + metrics.saves;
        const engagementRate = metrics.reach > 0 ? totalInteractions / metrics.reach : 0;

        // Upsert into post_metrics
        await supabase.from('post_metrics').upsert(
          {
            post_id: post.id,
            ...metrics,
            engagement_rate: Math.round(engagementRate * 10000) / 10000,
            collected_at: new Date().toISOString(),
          },
          { onConflict: 'post_id' }
        );
        updated++;
      }
    } catch (err) {
      failed++;
      errors.push(`${post.platform}/${post.id}: ${(err as Error).message}`);
    }
  }

  // Also fetch account-level metrics (followers, etc.) for growth analytics
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, platform, platform_user_id, access_token, meta')
    .eq('is_active', true);

  let accountsUpdated = 0;

  for (const acc of accounts || []) {
    try {
      if (acc.platform === 'instagram') {
        const base = graphApi(acc.access_token);
        const res = await fetch(
          `${base}/${acc.platform_user_id}?fields=followers_count,follows_count,media_count&access_token=${acc.access_token}`
        );
        if (res.ok) {
          const data = await res.json();
          await supabase.from('account_metrics').insert({
            account_id: acc.id,
            followers: data.followers_count || 0,
            following: data.follows_count || 0,
            posts_count: data.media_count || 0,
            engagement_rate: 0,
          });
          accountsUpdated++;
        }
      } else if (acc.platform === 'facebook') {
        const res = await fetch(
          `${FB_GRAPH}/${acc.platform_user_id}?fields=followers_count,fan_count&access_token=${acc.access_token}`
        );
        if (res.ok) {
          const data = await res.json();
          await supabase.from('account_metrics').insert({
            account_id: acc.id,
            followers: data.fan_count || data.followers_count || 0,
            following: 0,
            posts_count: 0,
            engagement_rate: 0,
          });
          accountsUpdated++;
        }
      } else if (acc.platform === 'youtube') {
        // YouTube Data API — channel statistics
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${acc.platform_user_id}&access_token=${acc.access_token}`
        );
        if (res.ok) {
          const data = await res.json();
          const channel = data.items?.[0];
          if (channel) {
            const stats = channel.statistics || {};
            await supabase.from('account_metrics').insert({
              account_id: acc.id,
              followers: parseInt(stats.subscriberCount || '0'),
              following: 0,
              posts_count: parseInt(stats.videoCount || '0'),
              engagement_rate: 0,
            });
            accountsUpdated++;
          }
        }
      } else if (acc.platform === 'bluesky') {
        // AT Protocol — create session first, then fetch profile
        try {
          const sessionRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: acc.platform_user_id, password: acc.access_token }),
          });
          if (sessionRes.ok) {
            const session = await sessionRes.json();
            const profileRes = await fetch(
              `https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${session.did}`,
              { headers: { Authorization: `Bearer ${session.accessJwt}` } }
            );
            if (profileRes.ok) {
              const profile = await profileRes.json();
              await supabase.from('account_metrics').insert({
                account_id: acc.id,
                followers: profile.followersCount || 0,
                following: profile.followsCount || 0,
                posts_count: profile.postsCount || 0,
                engagement_rate: 0,
              });
              accountsUpdated++;
            }
          }
        } catch { /* Bluesky session creation may fail */ }
      }
    } catch {
      // Don't block on account metric failures
    }
  }

  return NextResponse.json({
    message: 'Done',
    posts_updated: updated,
    posts_failed: failed,
    accounts_updated: accountsUpdated,
    errors: errors.slice(0, 10),
  });
}
