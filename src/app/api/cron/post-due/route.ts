import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishInstagramPost } from '@/lib/posters/instagram';
import { publishFacebookPost } from '@/lib/posters/facebook';
import { publishBlueskyPost } from '@/lib/posters/bluesky';
import { publishTwitterPost } from '@/lib/posters/twitter';
import { publishYouTubePost } from '@/lib/posters/youtube';
import { refreshAccountToken, refreshFacebookPageToken, tokenNeedsRefresh } from '@/lib/meta/token-refresh';
import { geminiVision } from '@/lib/ai/gemini';

export const maxDuration = 300;

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

import { refreshYouTubeToken } from '@/lib/youtube/refresh-token';

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

/**
 * Check if a post with the same caption already exists on Facebook (page posts).
 * Returns the existing post ID if found, or null if not found.
 */
async function findExistingFacebookPost(
  pageId: string,
  accessToken: string,
  caption: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${pageId}/posts?fields=id,message&limit=25&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const prefix = caption.slice(0, 120).trim();
    const match = (data.data || []).find(
      (m: { id: string; message?: string }) =>
        m.message && m.message.slice(0, 120).trim() === prefix
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if a post with the same text already exists on Bluesky.
 * Returns the existing post URI if found, or null if not found.
 */
async function findExistingBlueskyPost(
  handle: string,
  appPassword: string,
  caption: string
): Promise<string | null> {
  try {
    // Authenticate to get session
    const sessionRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
      signal: AbortSignal.timeout(10000),
    });
    if (!sessionRes.ok) return null;
    const session = await sessionRes.json();

    // Fetch recent posts
    const feedRes = await fetch(
      `https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?actor=${session.did}&limit=25`,
      {
        headers: { Authorization: `Bearer ${session.accessJwt}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!feedRes.ok) return null;
    const feed = await feedRes.json();
    const prefix = caption.slice(0, 120).trim();
    const match = (feed.feed || []).find(
      (item: { post: { uri: string; record?: { text?: string } } }) =>
        item.post?.record?.text && item.post.record.text.slice(0, 120).trim() === prefix
    );
    return match?.post?.uri ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if a post with the same caption already exists on Instagram.
 * Returns the existing platform post ID if found, or null if not found.
 * This prevents duplicate posts when a post was actually published but got marked as failed
 * due to a transient error (e.g. 500 after the publish call succeeded).
 */
async function findExistingInstagramPost(
  igUserId: string,
  accessToken: string,
  caption: string
): Promise<string | null> {
  try {
    const base = accessToken.startsWith('IGA')
      ? 'https://graph.instagram.com/v22.0'
      : 'https://graph.facebook.com/v22.0';
    const res = await fetch(
      `${base}/${igUserId}/media?fields=id,caption&limit=25&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Compare first 120 chars of caption — unique enough to detect duplicates
    const prefix = caption.slice(0, 120).trim();
    const match = (data.data || []).find(
      (m: { id: string; caption?: string }) =>
        m.caption && m.caption.slice(0, 120).trim() === prefix
    );
    return match?.id ?? null;
  } catch {
    return null; // If check fails, proceed with publishing (fail-open)
  }
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
  //    Claim only 1 post per run — cron fires every minute, so each post gets full 60s
  const { data: claimedIds } = await supabase.rpc('claim_due_posts', {
    max_posts: 1,
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
    .limit(1);

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
          // Always check Instagram first — prevents duplicates if a previous attempt
          // actually succeeded but errored after publish (e.g. 500 from IG servers)
          const existingIgId = await findExistingInstagramPost(
            account.platform_user_id,
            freshToken,
            post.caption
          );
          if (existingIgId) {
            console.log(`[post-due] Duplicate prevented: post ${post.id} already on Instagram (${existingIgId})`);
            platformPostId = existingIgId;
          } else {
            const carouselUrls = media.length > 1
              ? media.map((m: { media_url: string }) => m.media_url)
              : undefined;
            platformPostId = await publishInstagramPost({
              igUserId: account.platform_user_id,
              accessToken: freshToken,
              caption: post.caption,
              imageUrl: primaryMedia?.media_url || '',
              mediaType: post.media_type as 'image' | 'video' | 'carousel',
              postType: (post.post_type as 'post' | 'reel' | 'story') || 'post',
              carouselUrls,
            });
          }
          break;
        }
        case 'facebook': {
          const existingFbId = await findExistingFacebookPost(
            account.platform_user_id,
            freshToken,
            post.caption
          );
          if (existingFbId) {
            console.log(`[post-due] Duplicate prevented: post ${post.id} already on Facebook (${existingFbId})`);
            platformPostId = existingFbId;
          } else {
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
          }
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

          const existingBskyUri = await findExistingBlueskyPost(
            account.username,
            freshToken,
            bskyCaption
          );
          if (existingBskyUri) {
            console.log(`[post-due] Duplicate prevented: post ${post.id} already on Bluesky (${existingBskyUri})`);
            platformPostId = existingBskyUri;
          } else {
            platformPostId = await publishBlueskyPost({
              handle: account.username,
              appPassword: freshToken,
              caption: bskyCaption,
              imageUrl: bskyPrimaryImage?.media_url,
              imageUrls: bskyMediaUrls,
            });
          }
          break;
        }
        case 'twitter': {
          throw new Error('Twitter posting disabled — paid API plan required');
        }
        case 'youtube': {
          // If video was already uploaded directly from browser (has platform_post_id)
          if (post.platform_post_id) {
            // Just flip privacy status from private to public
            const updateRes = await fetch(
              'https://www.googleapis.com/youtube/v3/videos?part=status',
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${freshToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  id: post.platform_post_id,
                  status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
                }),
              }
            );
            if (!updateRes.ok) {
              const err = await updateRes.json().catch(() => ({}));
              throw new Error(`YouTube status update failed (${updateRes.status}): ${(err as Record<string, Record<string, string>>)?.error?.message || 'Unknown'}`);
            }
            platformPostId = post.platform_post_id;
            break;
          }

          // Fallback: server-side upload for small videos already in storage
          const videoMedia = media.find(
            (m: { media_type: string }) => m.media_type === 'video'
          ) || primaryMedia;
          if (!videoMedia?.media_url) {
            throw new Error('YouTube posts require a video file. Use the compose page to upload directly to YouTube.');
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
      // Skip library/ files — they're shared assets used across multiple posts
      if (media.length > 0) {
        for (const m of media) {
          if (!m.storage_path) continue;
          if (m.storage_path.startsWith('library/') || m.storage_path.startsWith('posted/')) continue;
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
