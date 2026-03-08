import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const YT_API = 'https://www.googleapis.com/youtube/v3';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!videoId) return NextResponse.json({ error: 'videoId is required' }, { status: 400 });

  // Get YouTube API key from app_settings
  const { data: setting } = await supabase
    .from('app_settings').select('value').eq('key', 'youtube_api_key').single();
  const apiKey = setting?.value || process.env.YOUTUBE_API_KEY;

  if (!apiKey) return NextResponse.json({ error: 'YouTube API key not configured.' }, { status: 400 });

  try {
    const res = await fetch(
      `${YT_API}/videos?part=snippet&id=${videoId}&key=${apiKey}`
    );
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
    const data = await res.json();

    const video = data.items?.[0];
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });

    const snippet = video.snippet as Record<string, unknown>;

    return NextResponse.json({
      videoId: video.id,
      title: snippet?.title as string,
      tags: (snippet?.tags as string[]) || [],
      channelTitle: snippet?.channelTitle as string,
    });
  } catch (err) {
    console.error('YouTube video-tags error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
