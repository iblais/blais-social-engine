import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ytApiFetch, YT_API } from '@/lib/youtube/api';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 });

  // Get YouTube account
  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('platform', 'youtube')
    .single();

  if (!account) return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });
  if (!account.access_token) return NextResponse.json({ error: 'No OAuth token for this account' }, { status: 400 });

  try {
    // Get channel's uploads playlist ID (with fallback for Brand Account tokens)
    const channelId = (account.meta as Record<string, string>)?.channel_id || account.platform_user_id;
    const channelResult = await ytApiFetch(
      `${YT_API}/channels?part=contentDetails&id=${channelId}`,
      account.access_token, supabase, user.id
    );
    if (channelResult.error) return NextResponse.json({ error: channelResult.error }, { status: channelResult.status });

    const uploadsPlaylistId = (channelResult.data?.items as Array<Record<string, unknown>>)?.[0]?.contentDetails as Record<string, unknown> | undefined;
    const uploads = (uploadsPlaylistId as Record<string, Record<string, string>> | undefined)?.relatedPlaylists?.uploads;
    if (!uploads) throw new Error('Could not find uploads playlist');

    // Fetch last 50 videos from uploads playlist
    const playlistResult = await ytApiFetch(
      `${YT_API}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50`,
      account.access_token, supabase, user.id
    );
    if (playlistResult.error) throw new Error(`YouTube playlistItems API error: ${playlistResult.status}`);

    const videoIds = ((playlistResult.data?.items || []) as Array<Record<string, unknown>>)
      .map((item: Record<string, unknown>) => (item.contentDetails as Record<string, unknown>)?.videoId)
      .filter(Boolean)
      .join(',');

    if (!videoIds) return NextResponse.json({ averages: { views: 0, likes: 0, comments: 0 }, outliers: [], totalVideos: 0 });

    // Fetch video details with statistics
    const videosResult = await ytApiFetch(
      `${YT_API}/videos?part=snippet,statistics&id=${videoIds}`,
      account.access_token, supabase, user.id
    );
    if (videosResult.error) throw new Error(`YouTube videos API error: ${videosResult.status}`);

    const videos = ((videosResult.data?.items || []) as Array<Record<string, unknown>>).map((v: Record<string, unknown>) => {
      const snippet = v.snippet as Record<string, unknown>;
      const stats = v.statistics as Record<string, unknown>;
      return {
        id: v.id as string,
        title: snippet?.title as string,
        publishedAt: snippet?.publishedAt as string,
        thumbnail: (snippet?.thumbnails as Record<string, { url: string }>)?.medium?.url,
        views: Number(stats?.viewCount || 0),
        likes: Number(stats?.likeCount || 0),
        comments: Number(stats?.commentCount || 0),
      };
    });

    const totalVideos = videos.length;
    if (totalVideos === 0) return NextResponse.json({ averages: { views: 0, likes: 0, comments: 0 }, outliers: [], totalVideos: 0 });

    // Calculate averages
    const avgViews = videos.reduce((sum: number, v: { views: number }) => sum + v.views, 0) / totalVideos;
    const avgLikes = videos.reduce((sum: number, v: { likes: number }) => sum + v.likes, 0) / totalVideos;
    const avgComments = videos.reduce((sum: number, v: { comments: number }) => sum + v.comments, 0) / totalVideos;

    // Find outliers (2x+ above average views)
    const outliers = videos
      .filter((v: { views: number }) => v.views >= avgViews * 2)
      .map((v: { id: string; title: string; views: number; likes: number; comments: number; publishedAt: string; thumbnail: string }) => ({
        ...v,
        multiplier: Math.round((v.views / avgViews) * 10) / 10,
      }))
      .sort((a: { multiplier: number }, b: { multiplier: number }) => b.multiplier - a.multiplier);

    return NextResponse.json({
      averages: {
        views: Math.round(avgViews),
        likes: Math.round(avgLikes),
        comments: Math.round(avgComments),
      },
      outliers,
      totalVideos,
    });
  } catch (err) {
    console.error('YouTube outliers error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
