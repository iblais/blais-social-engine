import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ytApiFetch, YT_API } from '@/lib/youtube/api';

// Detect YouTube Data API not enabled or auth errors
function isApiNotEnabledError(err: Record<string, unknown>): boolean {
  const errorObj = err?.error as Record<string, unknown> | undefined;
  const errors = errorObj?.errors as Array<Record<string, unknown>> | undefined;
  if (errors?.some(e => e.reason === 'youtubeSignupRequired' || e.reason === 'accessNotConfigured')) {
    return true;
  }
  const message = String(errorObj?.message || '');
  if (message.includes('YouTube Data API v3 has not been used') ||
      message.includes('youtubeSignupRequired') ||
      message.includes('accessNotConfigured') ||
      message.includes('API has not been enabled')) {
    return true;
  }
  return false;
}

const API_NOT_ENABLED_MESSAGE =
  'YouTube Data API v3 is not enabled for your Google Cloud project. ' +
  'To fix this:\n' +
  '1. Go to https://console.cloud.google.com/apis/library/youtube.googleapis.com\n' +
  '2. Make sure you select the correct project (ID: 1059424724065)\n' +
  '3. Click "Enable"\n' +
  '4. Wait a few minutes, then try again.\n\n' +
  'If the issue persists, you may need to reconnect your YouTube account in Settings > Accounts.';

async function ytFetch(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (isApiNotEnabledError(err)) {
      return { error: API_NOT_ENABLED_MESSAGE, status: 403, apiNotEnabled: true };
    }
    const message = (err?.error as Record<string, unknown>)?.message || res.statusText;
    return { error: `YouTube API error ${res.status}: ${message}`, status: res.status };
  }

  const data = await res.json();
  return { data };
}

// GET: Fetch videos (mode=videos) or comments
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  const videoId = req.nextUrl.searchParams.get('videoId');
  const mode = req.nextUrl.searchParams.get('mode');
  const pageToken = req.nextUrl.searchParams.get('pageToken');

  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('platform', 'youtube')
    .single();

  if (!account) return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });

  const token = account.access_token;
  const channelId = (account.meta as Record<string, string>)?.channel_id || account.platform_user_id;

  try {
    // MODE: videos — return list of channel videos
    if (mode === 'videos') {
      // First get the channel's uploads playlist
      // Try primary token, fall back to other YT accounts if Brand Account issue
      let channelResult = await ytFetch(
        `${YT_API}/channels?part=contentDetails,snippet&id=${channelId}`,
        token
      );
      if (channelResult.error && channelResult.apiNotEnabled) {
        const fallback = await ytApiFetch(
          `${YT_API}/channels?part=contentDetails,snippet&id=${channelId}`,
          token, supabase, user.id
        );
        if (!fallback.error) channelResult = { data: fallback.data as Record<string, unknown> };
      }
      if (channelResult.error) {
        return NextResponse.json(
          { error: channelResult.error, apiNotEnabled: channelResult.apiNotEnabled },
          { status: channelResult.status }
        );
      }

      const channel = channelResult.data?.items?.[0];
      if (!channel) {
        return NextResponse.json({ error: 'No YouTube channel found for this account' }, { status: 404 });
      }

      const uploadsPlaylistId = ((channel?.contentDetails as Record<string, unknown>)?.relatedPlaylists as Record<string, string>)?.uploads;
      if (!uploadsPlaylistId) {
        return NextResponse.json({ error: 'Could not find uploads playlist' }, { status: 404 });
      }

      // Fetch videos from uploads playlist
      let playlistUrl = `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`;
      if (pageToken) playlistUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

      const playlistResult = await ytFetch(playlistUrl, token);
      if (playlistResult.error) {
        return NextResponse.json(
          { error: playlistResult.error, apiNotEnabled: playlistResult.apiNotEnabled },
          { status: playlistResult.status }
        );
      }

      const videoIds = (playlistResult.data?.items || [])
        .map((item: Record<string, unknown>) => {
          const cd = item.contentDetails as Record<string, unknown> | undefined;
          return cd?.videoId as string;
        })
        .filter(Boolean);

      if (videoIds.length === 0) {
        return NextResponse.json({ videos: [], nextPageToken: null });
      }

      // Get video statistics
      const statsResult = await ytFetch(
        `${YT_API}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}`,
        token
      );
      if (statsResult.error) {
        return NextResponse.json(
          { error: statsResult.error, apiNotEnabled: statsResult.apiNotEnabled },
          { status: statsResult.status }
        );
      }

      const videos = (statsResult.data?.items || []).map((v: Record<string, unknown>) => {
        const snippet = v.snippet as Record<string, unknown>;
        const stats = v.statistics as Record<string, unknown>;
        const thumbnails = snippet?.thumbnails as Record<string, Record<string, unknown>> | undefined;
        const thumb = thumbnails?.medium || thumbnails?.default;
        return {
          id: v.id,
          title: snippet?.title,
          publishedAt: snippet?.publishedAt,
          thumbnail: thumb?.url || null,
          viewCount: Number(stats?.viewCount || 0),
          likeCount: Number(stats?.likeCount || 0),
          commentCount: Number(stats?.commentCount || 0),
        };
      });

      return NextResponse.json({
        videos,
        channelTitle: channel.snippet?.title,
        nextPageToken: playlistResult.data?.nextPageToken || null,
      });
    }

    // MODE: comments for a specific video
    if (videoId && videoId !== 'all') {
      let url = `${YT_API}/commentThreads?part=snippet,replies&videoId=${encodeURIComponent(videoId)}&maxResults=50&order=time`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const result = await ytFetch(url, token);
      if (result.error) {
        return NextResponse.json(
          { error: result.error, apiNotEnabled: result.apiNotEnabled },
          { status: result.status }
        );
      }

      const comments = parseCommentThreads(result.data?.items || []);
      return NextResponse.json({
        comments,
        nextPageToken: result.data?.nextPageToken || null,
        totalResults: result.data?.pageInfo?.totalResults || comments.length,
      });
    }

    // MODE: comments across all videos (videoId=all or no videoId)
    // First get channel videos (with fallback)
    let allChannelResult = await ytFetch(
      `${YT_API}/channels?part=contentDetails&id=${channelId}`,
      token
    );
    if (allChannelResult.error && allChannelResult.apiNotEnabled) {
      const fallback = await ytApiFetch(
        `${YT_API}/channels?part=contentDetails&id=${channelId}`,
        token, supabase, user.id
      );
      if (!fallback.error) allChannelResult = { data: fallback.data as Record<string, unknown> };
    }
    if (allChannelResult.error) {
      return NextResponse.json(
        { error: allChannelResult.error, apiNotEnabled: allChannelResult.apiNotEnabled },
        { status: allChannelResult.status }
      );
    }

    const channel = (allChannelResult.data?.items as Array<Record<string, unknown>>)?.[0];
    if (!channel) {
      return NextResponse.json({ error: 'No YouTube channel found' }, { status: 404 });
    }

    const uploadsPlaylistId = ((channel?.contentDetails as Record<string, unknown>)?.relatedPlaylists as Record<string, string>)?.uploads;

    // Get all videos (up to 50)
    const playlistResult = await ytFetch(
      `${YT_API}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`,
      token
    );
    if (playlistResult.error) {
      return NextResponse.json(
        { error: playlistResult.error, apiNotEnabled: playlistResult.apiNotEnabled },
        { status: playlistResult.status }
      );
    }

    const videoIds = (playlistResult.data?.items || [])
      .map((item: Record<string, unknown>) => {
        const cd = item.contentDetails as Record<string, unknown> | undefined;
        return cd?.videoId as string;
      })
      .filter(Boolean);

    // Fetch comments for each video (up to 20 per video)
    const allComments: ReturnType<typeof parseCommentThreads> = [];
    for (const vid of videoIds) {
      const result = await ytFetch(
        `${YT_API}/commentThreads?part=snippet,replies&videoId=${vid}&maxResults=20&order=time`,
        token
      );
      if (result.data) {
        const parsed = parseCommentThreads(result.data.items || [], vid);
        allComments.push(...parsed);
      }
    }

    // Sort all comments by date, newest first
    allComments.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return NextResponse.json({
      comments: allComments,
      nextPageToken: null,
      totalResults: allComments.length,
    });

  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('youtubeSignupRequired') || message.includes('accessNotConfigured')) {
      return NextResponse.json({ error: API_NOT_ENABLED_MESSAGE, apiNotEnabled: true }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseCommentThreads(items: Array<Record<string, unknown>>, videoId?: string) {
  return items.map((item: Record<string, unknown>) => {
    const thread = item.snippet as Record<string, unknown>;
    const topComment = thread?.topLevelComment as Record<string, unknown>;
    const topSnippet = (topComment?.snippet || {}) as Record<string, unknown>;
    const repliesData = item.replies as Record<string, unknown> | undefined;
    const replyComments = (repliesData?.comments || []) as Array<Record<string, unknown>>;

    return {
      id: topComment?.id as string,
      videoId: (topSnippet.videoId as string) || videoId || '',
      authorName: topSnippet.authorDisplayName as string,
      authorAvatar: topSnippet.authorProfileImageUrl as string,
      authorChannelUrl: topSnippet.authorChannelUrl as string || '',
      text: topSnippet.textDisplay as string,
      textOriginal: topSnippet.textOriginal as string,
      likeCount: Number(topSnippet.likeCount || 0),
      publishedAt: topSnippet.publishedAt as string,
      updatedAt: topSnippet.updatedAt as string,
      totalReplyCount: Number(thread?.totalReplyCount || 0),
      replyCount: replyComments.length,
      replies: replyComments.map((reply) => {
        const replySnippet = (reply.snippet || {}) as Record<string, unknown>;
        return {
          id: reply.id as string,
          authorName: replySnippet.authorDisplayName as string,
          authorAvatar: replySnippet.authorProfileImageUrl as string,
          authorChannelUrl: replySnippet.authorChannelUrl as string || '',
          text: replySnippet.textDisplay as string,
          likeCount: Number(replySnippet.likeCount || 0),
          publishedAt: replySnippet.publishedAt as string,
        };
      }),
    };
  });
}

// POST: Reply to a comment
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId, parentId, text } = await req.json();

  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  if (!parentId) return NextResponse.json({ error: 'parentId required' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('platform', 'youtube')
    .single();

  if (!account) return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });

  try {
    const result = await ytFetch(`${YT_API}/comments?part=snippet`, account.access_token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: {
          parentId,
          textOriginal: text,
        },
      }),
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error, apiNotEnabled: result.apiNotEnabled },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true, commentId: result.data.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE: Delete a comment
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId, commentId } = await req.json();

  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  if (!commentId) return NextResponse.json({ error: 'commentId required' }, { status: 400 });

  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('platform', 'youtube')
    .single();

  if (!account) return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });

  try {
    const res = await fetch(`${YT_API}/comments?id=${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.access_token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (isApiNotEnabledError(err)) {
        return NextResponse.json({ error: API_NOT_ENABLED_MESSAGE, apiNotEnabled: true }, { status: 403 });
      }
      const message = (err?.error as Record<string, unknown>)?.message || res.statusText;
      throw new Error(`YouTube API error ${res.status}: ${message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
