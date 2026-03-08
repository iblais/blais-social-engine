import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const YT_API = 'https://www.googleapis.com/youtube/v3';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  const videoId = req.nextUrl.searchParams.get('videoId');
  const pageToken = req.nextUrl.searchParams.get('pageToken');

  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 });

  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('platform', 'youtube')
    .single();

  if (!account) return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });

  try {
    let url = `${YT_API}/commentThreads?part=snippet,replies&videoId=${videoId}&maxResults=20`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`YouTube API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();

    const comments = (data.items || []).map((item: Record<string, unknown>) => {
      const thread = item.snippet as Record<string, unknown>;
      const topComment = thread?.topLevelComment as Record<string, unknown>;
      const topSnippet = (topComment?.snippet || {}) as Record<string, unknown>;
      const repliesData = item.replies as Record<string, unknown> | undefined;
      const replyComments = (repliesData?.comments || []) as Array<Record<string, unknown>>;

      return {
        id: topComment?.id,
        authorName: topSnippet.authorDisplayName,
        authorAvatar: topSnippet.authorProfileImageUrl,
        text: topSnippet.textDisplay,
        likeCount: Number(topSnippet.likeCount || 0),
        publishedAt: topSnippet.publishedAt,
        replies: replyComments.map((reply) => {
          const replySnippet = (reply.snippet || {}) as Record<string, unknown>;
          return {
            id: reply.id,
            authorName: replySnippet.authorDisplayName,
            text: replySnippet.textDisplay,
            publishedAt: replySnippet.publishedAt,
          };
        }),
      };
    });

    return NextResponse.json({
      comments,
      nextPageToken: data.nextPageToken || null,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

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
    const res = await fetch(`${YT_API}/comments?part=snippet`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          parentId,
          textOriginal: text,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`YouTube API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json({ success: true, commentId: data.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

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
    const res = await fetch(`${YT_API}/comments?id=${commentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.access_token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`YouTube API error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
