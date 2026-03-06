import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishInstagramPost } from '@/lib/posters/instagram';
import { publishFacebookPost } from '@/lib/posters/facebook';
import { publishBlueskyPost } from '@/lib/posters/bluesky';
import { publishTwitterPost } from '@/lib/posters/twitter';
import { refreshAccountToken, tokenNeedsRefresh } from '@/lib/meta/token-refresh';

export const maxDuration = 60;

/**
 * Ensure the account's Meta token is fresh before posting.
 * Refreshes if expired or expiring within 7 days.
 * Returns the (possibly refreshed) access token.
 */
async function refreshTwitterToken(
  refreshToken: string,
  supabase: ReturnType<typeof createAdminClient>,
  accountId: string
): Promise<string> {
  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Twitter refresh failed: ${JSON.stringify(data)}`);

  const expiresAt = new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString();

  await supabase.from('social_accounts').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    token_expires_at: expiresAt,
  }).eq('id', accountId);

  return data.access_token;
}

async function ensureFreshToken(
  account: { id: string; platform: string; access_token: string; refresh_token?: string | null; token_expires_at: string | null; meta?: Record<string, unknown> | null },
  supabase: ReturnType<typeof createAdminClient>
): Promise<string> {
  // Bluesky uses app passwords — no refresh needed
  if (account.platform === 'bluesky') {
    return account.access_token;
  }

  // Facebook page tokens (from facebook_login) don't expire — skip refresh
  if (account.platform === 'facebook' && account.meta?.auth_method === 'facebook_login') {
    return account.access_token;
  }

  // Check if token needs refresh
  if (!tokenNeedsRefresh(account.token_expires_at)) {
    return account.access_token;
  }

  try {
    console.log(`[post-due] Refreshing token for account ${account.id} (${account.platform})`);

    // Twitter uses its own OAuth 2.0 refresh flow
    if (account.platform === 'twitter') {
      if (!account.refresh_token) throw new Error('No refresh token for Twitter');
      return await refreshTwitterToken(account.refresh_token, supabase, account.id);
    }

    // Meta platforms (Instagram, Facebook)
    const result = await refreshAccountToken(account.access_token, account.meta);
    const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();

    await supabase.from('social_accounts').update({
      access_token: result.access_token,
      token_expires_at: tokenExpiresAt,
    }).eq('id', account.id);

    console.log(`[post-due] Token refreshed for ${account.id}, expires ${tokenExpiresAt}`);
    return result.access_token;
  } catch (err) {
    console.error(`[post-due] Token refresh failed for ${account.id}:`, (err as Error).message);
    return account.access_token;
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Fetch posts that are due
  const { data: duePosts, error } = await supabase
    .from('posts')
    .select('*, social_accounts(*), post_media(*)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also re-queue retries (posts that failed but have retries left, waiting 5+ min)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: retryPosts } = await supabase
    .from('posts')
    .select('id')
    .eq('status', 'retry')
    .lt('updated_at', fiveMinutesAgo)
    .lt('retry_count', 3)
    .limit(20);

  if (retryPosts?.length) {
    await supabase
      .from('posts')
      .update({ status: 'scheduled', scheduled_at: new Date().toISOString() })
      .in('id', retryPosts.map((p) => p.id));
  }

  if (!duePosts?.length) {
    return NextResponse.json({
      message: 'No posts due',
      processed: 0,
      retries_requeued: retryPosts?.length || 0,
    });
  }

  let processed = 0;
  let failed = 0;

  for (const post of duePosts) {
    const account = post.social_accounts;
    if (!account) continue;

    // Mark as publishing
    await supabase
      .from('posts')
      .update({ status: 'publishing' })
      .eq('id', post.id);

    try {
      // Refresh token if needed BEFORE posting
      const freshToken = await ensureFreshToken(account, supabase);

      let platformPostId: string;
      const media = post.post_media || [];
      const primaryMedia = media[0];

      switch (account.platform) {
        case 'instagram': {
          const carouselUrls = media.length > 1 ? media.map((m: { media_url: string }) => m.media_url) : undefined;
          platformPostId = await publishInstagramPost({
            igUserId: account.platform_user_id,
            accessToken: freshToken,
            caption: post.caption,
            imageUrl: primaryMedia?.media_url || '',
            mediaType: post.media_type as 'image' | 'video' | 'carousel',
            carouselUrls,
          });
          break;
        }
        case 'facebook': {
          platformPostId = await publishFacebookPost({
            pageId: account.platform_user_id,
            accessToken: freshToken,
            caption: post.caption,
            imageUrl: primaryMedia?.media_url,
          });
          break;
        }
        case 'bluesky': {
          platformPostId = await publishBlueskyPost({
            handle: account.username,
            appPassword: freshToken,
            caption: post.caption,
            imageUrl: primaryMedia?.media_url,
          });
          break;
        }
        case 'twitter': {
          platformPostId = await publishTwitterPost({
            accessToken: freshToken,
            caption: post.caption,
            imageUrl: primaryMedia?.media_url,
          });
          break;
        }
        default:
          throw new Error(`Unsupported platform: ${account.platform}`);
      }

      // Mark as posted
      await supabase
        .from('posts')
        .update({
          status: 'posted',
          published_at: new Date().toISOString(),
          platform_post_id: platformPostId,
          error_message: null,
        })
        .eq('id', post.id);

      // Log activity
      await supabase.from('activity_log').insert({
        user_id: post.user_id,
        action: 'post_published',
        entity_type: 'post',
        entity_id: post.id,
        details: { platform: account.platform, platform_post_id: platformPostId },
      });

      processed++;
    } catch (err) {
      const errorMessage = (err as Error).message;
      const newRetryCount = (post.retry_count || 0) + 1;

      // If it's a token error (401/190), mark clearly so user knows to reconnect
      const isTokenError = errorMessage.includes('190') || errorMessage.includes('401') || errorMessage.includes('OAuthException');

      await supabase
        .from('posts')
        .update({
          status: newRetryCount >= 3 ? 'failed' : 'retry',
          error_message: isTokenError
            ? `Token expired — reconnect ${account.platform} in Settings. Original: ${errorMessage}`
            : errorMessage,
          retry_count: newRetryCount,
        })
        .eq('id', post.id);

      failed++;
    }
  }

  return NextResponse.json({
    message: 'Done',
    processed,
    failed,
    retries_requeued: retryPosts?.length || 0,
  });
}
