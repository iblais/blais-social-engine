import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishInstagramPost } from '@/lib/posters/instagram';
import { publishFacebookPost } from '@/lib/posters/facebook';
import { ensureValidToken } from '@/lib/token-refresh';

export const maxDuration = 60;

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

  if (!duePosts?.length) {
    return NextResponse.json({ message: 'No posts due', processed: 0 });
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
      // Refresh token if expired before publishing
      const { accessToken } = await ensureValidToken(
        account.id,
        account.platform,
        account.access_token,
        account.refresh_token,
        account.token_expires_at,
      );

      let platformPostId: string;
      const media = post.post_media || [];
      const primaryMedia = media[0];

      switch (account.platform) {
        case 'instagram': {
          const carouselUrls = media.length > 1 ? media.map((m: { media_url: string }) => m.media_url) : undefined;
          platformPostId = await publishInstagramPost({
            igUserId: account.platform_user_id,
            accessToken,
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
            accessToken,
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

      await supabase
        .from('posts')
        .update({
          status: newRetryCount >= 3 ? 'failed' : 'retry',
          error_message: errorMessage,
          retry_count: newRetryCount,
        })
        .eq('id', post.id);

      failed++;
    }
  }

  return NextResponse.json({ message: 'Done', processed, failed });
}
