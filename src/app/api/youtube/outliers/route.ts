import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const YT_API = 'https://www.googleapis.com/youtube/v3';

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
    // Get channel's uploads playlist ID
    const channelRes = await fetch(
      `${YT_API}/channels?part=contentDetails&mine=true`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );
    if (!channelRes.ok) throw new Error(`YouTube channels API error: ${channelRes.status}`);
    const channelData = await channelRes.json();

    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) throw new Error('Could not find uploads playlist');

    // Fetch last 50 videos from uploads playlist
    const playlistRes = await fetch(
      `${YT_API}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );
    if (!playlistRes.ok) throw new Error(`YouTube playlistItems API error: ${playlistRes.status}`);
    const playlistData = await playlistRes.json();

    const videoIds = (playlistData.items || [])
      .map((item: Record<string, unknown>) => (item.contentDetails as Record<string, unknown>)?.videoId)
      .filter(Boolean)
      .join(',');

    if (!videoIds) return NextResponse.json({ averages: { views: 0, likes: 0, comments: 0 }, outliers: [], totalVideos: 0 });

    // Fetch video details with statistics
    const videosRes = await fetch(
      `${YT_API}/videos?part=snippet,statistics&id=${videoIds}`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );
    if (!videosRes.ok) throw new Error(`YouTube videos API error: ${videosRes.status}`);
    const videosData = await videosRes.json();

    const videos = (videosData.items || []).map((v: Record<string, unknown>) => {
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
