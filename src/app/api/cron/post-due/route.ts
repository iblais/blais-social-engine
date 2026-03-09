import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishInstagramPost } from '@/lib/posters/instagram';
import { publishFacebookPost } from '@/lib/posters/facebook';
import { publishBlueskyPost } from '@/lib/posters/bluesky';
import { publishTwitterPost } from '@/lib/posters/twitter';
import { publishYouTubePost } from '@/lib/posters/youtube';
import { refreshAccountToken, refreshFacebookPageToken, tokenNeedsRefresh } from '@/lib/meta/token-refresh';
import { geminiVision } from '@/lib/ai/gemini';

export const maxDuration = 60;

/* ---------- helpers ---------- */

class TokenError extends Error {
  constructor(platform: string, original: string) {
    super(`Token expired — reconnect ${platform} in Settings. Original: ${original}`);
    this.name = 'TokenError';
  }
}

/** Refresh a Twitter OAuth 2.0 token. */
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

/** Refresh a YouTube (Google) OAuth 2.0 token. */
async function refreshYouTubeToken(
  refreshToken: string,
  supabase: ReturnType<typeof createAdminClient>,
  accountId: string
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`YouTube refresh failed: ${JSON.stringify(data)}`);

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  await supabase.from('social_accounts').update({
    access_token: data.access_token,
    token_expires_at: expiresAt,
  }).eq('id', accountId);

  return data.access_token;
}

/**
 * Ensure the account token is fresh before posting.
 * THROWS on failure instead of silently returning expired token.
 */
async function ensureFreshToken(
  account: {
    id: string;
    platform: string;
    platform_user_id: string;
    access_token: string;
    refresh_token?: string | null;
    token_expires_at: string | null;
    meta?: Record<string, unknown> | null;
  },
  supabase: ReturnType<typeof createAdminClient>
): Promise<string> {
  // Bluesky uses app passwords — no refresh needed
  if (account.platform === 'bluesky') return account.access_token;

  // Facebook page tokens (from facebook_login) — refresh if user token is expiring
  if (account.platform === 'facebook' && account.meta?.auth_method === 'facebook_login') {
    // Permanent tokens (far-future expiry like 2099) — skip refresh
    const fbExpiry = account.token_expires_at ? new Date(account.token_expires_at) : null;
    const isPermanent = fbExpiry && fbExpiry.getFullYear() >= 2090;
    if (isPermanent) return account.access_token;

    // If token_expires_at is set and within 7 days, refresh proactively
    if (account.token_expires_at && tokenNeedsRefresh(account.token_expires_at) && account.refresh_token) {
      console.log(`[post-due] Refreshing Facebook page token for ${account.id}`);
      const pageId = (account.meta?.page_id as string) || account.platform_user_id;
      const result = await refreshFacebookPageToken(account.refresh_token, pageId);
      const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
      await supabase.from('social_accounts').update({
        access_token: result.access_token,
        refresh_token: result.new_user_token,
        token_expires_at: tokenExpiresAt,
      }).eq('id', account.id);
      return result.access_token;
    }
    return account.access_token;
  }

  // Twitter tokens expire every 2 hours — ALWAYS refresh proactively
  if (account.platform === 'twitter') {
    if (!account.refresh_token) {
      throw new TokenError('twitter', 'No refresh token available');
    }
    const needsRefresh = !account.token_expires_at ||
      new Date(account.token_expires_at) <= new Date(Date.now() + 30 * 60 * 1000);
    if (needsRefresh) {
      console.log(`[post-due] Refreshing Twitter token for ${account.id}`);
      return await refreshTwitterToken(account.refresh_token, supabase, account.id);
    }
    return account.access_token;
  }

  // YouTube (Google OAuth2) — tokens expire every ~1 hour
  if (account.platform === 'youtube') {
    if (!account.refresh_token) {
      throw new TokenError('youtube', 'No refresh token available');
    }
    const needsRefresh = !account.token_expires_at ||
      new Date(account.token_expires_at) <= new Date(Date.now() + 10 * 60 * 1000);
    if (needsRefresh) {
      console.log(`[post-due] Refreshing YouTube token for ${account.id}`);
      return await refreshYouTubeToken(account.refresh_token, supabase, account.id);
    }
    return account.access_token;
  }

  // Meta platforms (Instagram, Facebook) — refresh if within 7 days of expiry
  if (!tokenNeedsRefresh(account.token_expires_at)) {
    return account.access_token;
  }

  console.log(`[post-due] Refreshing ${account.platform} token for ${account.id}`);
  const result = await refreshAccountToken(account.access_token, account.meta);
  const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();

  await supabase.from('social_accounts').update({
    access_token: result.access_token,
    token_expires_at: tokenExpiresAt,
  }).eq('id', account.id);

  console.log(`[post-due] Token refreshed for ${account.id}, expires ${tokenExpiresAt}`);
  return result.access_token;
}

/** Check if an error is a token/auth problem (don't retry these). */
function isTokenError(message: string): boolean {
  // Rate limit errors (403 + "request limit") are NOT token errors — they should retry
  if (/request limit reached/i.test(message)) return false;
  return /\b(190|401|403|OAuthException|token expired|unauthorized)\b/i.test(message);
}

/** Calculate exponential backoff: 5min, 15min, 45min based on retry_count. */
function getBackoffMinutes(retryCount: number): number {
  return Math.min(5 * Math.pow(3, retryCount), 60); // 5, 15, 45, capped at 60min
}

/* ---------- self-healing ---------- */

/**
 * Fix posts stuck in "publishing" state.
 * If a post has been "publishing" for >5 min and has a platform_post_id, it actually succeeded.
 * If no platform_post_id after >10 min, it failed silently (Vercel timeout killed it).
 */
async function healStuckPosts(supabase: ReturnType<typeof createAdminClient>) {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // Posts that succeeded but status wasn't updated (have platform_post_id)
  const { data: succeeded } = await supabase
    .from('posts')
    .update({
      status: 'posted',
      published_at: new Date().toISOString(),
    })
    .eq('status', 'publishing')
    .not('platform_post_id', 'is', null)
    .lte('updated_at', fiveMinAgo)
    .select('id');

  // Posts stuck publishing with no platform_post_id — reset to scheduled for retry
  // Also increment retry_count to prevent infinite retry loops
  const { data: stuckRaw } = await supabase
    .from('posts')
    .select('id, retry_count')
    .eq('status', 'publishing')
    .is('platform_post_id', null)
    .lte('updated_at', tenMinAgo);

  const stuck: { id: string }[] = [];
  for (const s of stuckRaw || []) {
    const newRetry = (s.retry_count || 0) + 1;
    if (newRetry >= 3) {
      await supabase.from('posts').update({
        status: 'failed',
        error_message: 'Max retries exhausted (stuck in publishing)',
        retry_count: newRetry,
      }).eq('id', s.id);
    } else {
      await supabase.from('posts').update({
        status: 'scheduled',
        scheduled_at: new Date().toISOString(),
        retry_count: newRetry,
      }).eq('id', s.id);
    }
    stuck.push({ id: s.id });
  }

  const healedCount = (succeeded?.length || 0) + (stuck?.length || 0);
  if (healedCount > 0) {
    console.log(`[post-due] Healed ${succeeded?.length || 0} succeeded + ${stuck?.length || 0} stuck posts`);
  }
  return healedCount;
}

/* ---------- main cron handler ---------- */

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 0) Self-heal: fix posts stuck in "publishing" from previous timeout
  const healed = await healStuckPosts(supabase);

  // 1) Atomically claim scheduled posts by setting status='publishing' in one step
  //    This prevents race conditions when multiple cron instances run concurrently
  const { data: claimedIds } = await supabase.rpc('claim_due_posts', {
    max_posts: 10,
    due_before: now,
  });

  // Fetch full post data for claimed posts
  let duePosts: any[] = [];
  let error: any = null;
  if (claimedIds && claimedIds.length > 0) {
    const ids = claimedIds.map((r: any) => r.id);
    const result = await supabase
      .from('posts')
      .select('*, social_accounts(*), post_media(*)')
      .in('id', ids);
    duePosts = result.data || [];
    error = result.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2) Fetch retry posts that have waited long enough (exponential backoff)
  const { data: retryPosts } = await supabase
    .from('posts')
    .select('*, social_accounts(*), post_media(*)')
    .eq('status', 'retry')
    .neq('platform', 'twitter')
    .lt('retry_count', 3)
    .order('updated_at', { ascending: true })
    .limit(5);

  // Filter retries that have waited long enough based on their retry count
  const readyRetries = (retryPosts || []).filter((p) => {
    const updatedAt = new Date(p.updated_at).getTime();
    const backoffMs = getBackoffMinutes(p.retry_count || 0) * 60 * 1000;
    return Date.now() - updatedAt >= backoffMs;
  });

  // Atomically claim retry posts (set status='publishing' to prevent race conditions)
  if (readyRetries.length > 0) {
    const retryIds = readyRetries.map((p) => p.id);
    await supabase
      .from('posts')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .in('id', retryIds)
      .eq('status', 'retry'); // Only update if still in retry (another run hasn't claimed them)
  }

  // Combine due posts + ready retries, then pick max 1 per account
  const combined = [...(duePosts || []), ...readyRetries];
  const seenAccounts = new Set<string>();
  const allPosts = combined.filter((p) => {
    const accountId = p.account_id;
    if (seenAccounts.has(accountId)) return false;
    seenAccounts.add(accountId);
    return true;
  });

  if (!allPosts.length) {
    return NextResponse.json({
      message: 'No posts due',
      processed: 0,
      failed: 0,
      healed,
      retries_checked: retryPosts?.length || 0,
    });
  }

  let processed = 0;
  let failed = 0;
  const results: { id: string; status: string; error?: string }[] = [];

  for (const post of allPosts) {
    const account = post.social_accounts;
    if (!account) {
      await supabase.from('posts').update({
        status: 'failed',
        error_message: 'No social account linked to this post',
      }).eq('id', post.id);
      failed++;
      continue;
    }

    // Duplicate detection: skip if same caption was already posted to same account
    if (post.caption) {
      const captionPrefix = post.caption.substring(0, 80);
      const { data: alreadyPosted } = await supabase
        .from('posts')
        .select('id')
        .eq('account_id', post.account_id)
        .eq('status', 'posted')
        .like('caption', captionPrefix + '%')
        .neq('id', post.id)
        .limit(1);

      if (alreadyPosted && alreadyPosted.length > 0) {
        console.log(`[post-due] SKIP duplicate: "${captionPrefix.substring(0, 40)}..." already posted to ${account.platform}/${account.username}`);
        await supabase.from('posts').update({
          status: 'failed',
          error_message: 'Duplicate — same content already posted to this account',
        }).eq('id', post.id);
        failed++;
        results.push({ id: post.id, status: 'duplicate', error: 'Already posted to this account' });
        continue;
      }
    }

    try {
      // Refresh token — THROWS on failure instead of returning expired token
      let freshToken: string;
      try {
        freshToken = await ensureFreshToken(account, supabase);
      } catch (tokenErr) {
        throw new TokenError(account.platform, (tokenErr as Error).message);
      }

      let platformPostId: string;
      const media = (post.post_media || []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0)
      );
      const primaryMedia = media[0];

      switch (account.platform) {
        case 'instagram': {
          const carouselUrls = media.length > 1
            ? media.map((m: { media_url: string }) => m.media_url)
            : undefined;
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
          const isVideo = post.media_type === 'video' ||
            primaryMedia?.media_type === 'video';
          const fbMediaUrls = !isVideo && media.length > 1
            ? media.map((m: { media_url: string }) => m.media_url)
            : undefined;
          platformPostId = await publishFacebookPost({
            pageId: account.platform_user_id,
            accessToken: freshToken,
            caption: post.caption,
            videoUrl: isVideo ? primaryMedia?.media_url : undefined,
            imageUrl: !isVideo ? primaryMedia?.media_url : undefined,
            imageUrls: fbMediaUrls,
          });
          break;
        }
        case 'bluesky': {
          // Bluesky only supports images — filter out video media
          const bskyImageMedia = media.filter((m: { media_type: string }) => m.media_type !== 'video');
          const bskyMediaUrls = bskyImageMedia.length > 1
            ? bskyImageMedia.slice(0, 4).map((m: { media_url: string }) => m.media_url)
            : undefined;
          const bskyPrimaryImage = bskyImageMedia[0];

          let bskyCaption = post.caption;

          if (bskyImageMedia.length > 4) {
            try {
              const apiKey = process.env.GEMINI_API_KEY;
              if (apiKey) {
                const extraUrls = bskyImageMedia.slice(4).map((m: { media_url: string }) => m.media_url);
                const extracted = await geminiVision(
                  'Extract all visible text from these images. Return ONLY the text content, separated by newlines. No commentary.',
                  extraUrls,
                  apiKey
                );
                if (extracted?.trim()) {
                  bskyCaption = `${post.caption}\n\n${extracted.trim()}`;
                }
              }
            } catch (err) {
              console.error('[post-due] Bluesky text extraction failed, using original caption:', (err as Error).message);
            }
          }

          platformPostId = await publishBlueskyPost({
            handle: account.username,
            appPassword: freshToken,
            caption: bskyCaption,
            imageUrl: bskyPrimaryImage?.media_url,
            imageUrls: bskyMediaUrls,
          });
          break;
        }
        case 'twitter': {
          throw new Error('Twitter posting disabled — paid API plan required');
        }
        case 'youtube': {
          const videoMedia = media.find(
            (m: { media_type: string }) => m.media_type === 'video'
          ) || primaryMedia;
          if (!videoMedia?.media_url) {
            throw new Error('YouTube posts require a video file');
          }
          const lines = post.caption.split('\n');
          const ytTitle = lines[0]?.slice(0, 100) || 'Untitled';
          const ytDescription = lines.slice(1).join('\n').trim() || post.caption;
          const isShort = post.post_type === 'short' || post.media_type === 'short';

          platformPostId = await publishYouTubePost({
            accessToken: freshToken,
            title: ytTitle,
            description: ytDescription,
            videoUrl: videoMedia.media_url,
            isShort,
          });
          break;
        }
        default:
          throw new Error(`Unsupported platform: ${account.platform}`);
      }

      // Post first comment if configured (Instagram only for now)
      if (post.first_comment && account.platform === 'instagram' && platformPostId) {
        try {
          const commentRes = await fetch(
            `https://graph.facebook.com/v22.0/${platformPostId}/comments`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: post.first_comment,
                access_token: freshToken,
              }),
            }
          );
          if (!commentRes.ok) {
            console.error('[post-due] First comment failed:', await commentRes.text());
          }
        } catch (commentErr) {
          console.error('[post-due] First comment error:', (commentErr as Error).message);
        }
      }

      // Success — mark as posted
      await supabase.from('posts').update({
        status: 'posted',
        published_at: new Date().toISOString(),
        platform_post_id: platformPostId,
        error_message: null,
      }).eq('id', post.id);

      // Move media files to "posted/" folder in storage to prevent re-use
      if (media.length > 0) {
        for (const m of media) {
          if (!m.storage_path) continue;
          const newPath = m.storage_path.startsWith('posted/')
            ? m.storage_path
            : `posted/${m.storage_path}`;
          const { error: moveErr } = await supabase.storage
            .from('media')
            .move(m.storage_path, newPath);
          if (!moveErr) {
            const { data: { publicUrl } } = supabase.storage
              .from('media')
              .getPublicUrl(newPath);
            await supabase.from('post_media').update({
              storage_path: newPath,
              media_url: publicUrl,
            }).eq('id', m.id);
          } else {
            console.error(`[post-due] Failed to move media ${m.storage_path}:`, moveErr.message);
          }
        }
      }

      await supabase.from('activity_log').insert({
        user_id: post.user_id,
        action: 'post_published',
        entity_type: 'post',
        entity_id: post.id,
        details: { platform: account.platform, platform_post_id: platformPostId },
      });

      processed++;
      results.push({ id: post.id, status: 'posted' });
    } catch (err) {
      const errorMessage = (err as Error).message;
      const newRetryCount = (post.retry_count || 0) + 1;

      // Token errors: fail immediately, don't waste retries
      if (err instanceof TokenError || isTokenError(errorMessage)) {
        await supabase.from('posts').update({
          status: 'failed',
          error_message: err instanceof TokenError ? errorMessage
            : `Token expired — reconnect ${account.platform} in Settings. Original: ${errorMessage}`,
        }).eq('id', post.id);
      } else if (newRetryCount >= 3) {
        // Max retries exhausted — mark as failed
        await supabase.from('posts').update({
          status: 'failed',
          error_message: errorMessage,
          retry_count: newRetryCount,
        }).eq('id', post.id);
      } else {
        // Reschedule same day: push 1 hour later, stay in 'scheduled' status
        const retryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await supabase.from('posts').update({
          status: 'scheduled',
          scheduled_at: retryAt,
          error_message: `Retry ${newRetryCount}/3: ${errorMessage}`,
          retry_count: newRetryCount,
        }).eq('id', post.id);
      }

      failed++;
      results.push({ id: post.id, status: 'failed', error: errorMessage });
    }
  }

  return NextResponse.json({
    message: 'Done',
    processed,
    failed,
    total: allPosts.length,
    healed,
    retries_processed: readyRetries.length,
    results,
  });
}
