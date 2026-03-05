import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishInstagramPost } from '@/lib/posters/instagram';
import { publishFacebookPost } from '@/lib/posters/facebook';
import { publishBlueskyPost } from '@/lib/posters/bluesky';
import { refreshAccountToken, tokenNeedsRefresh } from '@/lib/meta/token-refresh';

export const maxDuration = 60;

/**
 * Ensure the account's Meta token is fresh before posting.
 * Refreshes if expired or expiring within 7 days.
 * Returns the (possibly refreshed) access token.
 */
async function ensureFreshToken(
  account: { id: string; platform: string; access_token: string; token_expires_at: string | null; meta?: Record<string, unknown> | null },
  supabase: ReturnType<typeof createAdminClient>
): Promise<string> {
  // Only Meta platforms need token refresh
  if (!['instagram', 'facebook'].includes(account.platform)) {
    return account.access_token;
  }

  // Check if token needs refresh
  if (!tokenNeedsRefresh(account.token_expires_at)) {
    return account.access_token;
  }

  try {
    console.log(`[post-due] Refreshing token for account ${account.id} (${account.platform})`);
    const result = await refreshAccountToken(account.access_token, account.meta);
    const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();

    // Update the stored token
    await supabase.from('social_accounts').update({
      access_token: result.access_token,
      token_expires_at: tokenExpiresAt,
    }).eq('id', account.id);

    console.log(`[post-due] Token refreshed for ${account.id}, expires ${tokenExpiresAt}`);
    return result.access_token;
  } catch (err) {
    console.error(`[post-due] Token refresh failed for ${account.id}:`, (err as Error).message);
    // Fall back to existing token — it might still work
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
