import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

const YT_API = 'https://www.googleapis.com/youtube/v3';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const region = req.nextUrl.searchParams.get('region') || 'US';
  const niche = req.nextUrl.searchParams.get('niche') || '';

  // Get YouTube API key
  const { data: setting } = await supabase
    .from('app_settings').select('value').eq('key', 'youtube_api_key').single();
  const ytKey = setting?.value || process.env.YOUTUBE_API_KEY;

  const { data: geminiSetting } = await supabase
    .from('app_settings').select('value').eq('key', 'gemini_api_key').single();
  const geminiKey = geminiSetting?.value || process.env.GEMINI_API_KEY;

  if (!ytKey) return NextResponse.json({ error: 'YouTube API key not configured.' }, { status: 400 });

  try {
    const res = await fetch(
      `${YT_API}/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}&maxResults=20&key=${ytKey}`
    );
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
    const data = await res.json();

    const trending = (data.items || []).map((v: Record<string, unknown>) => {
      const snippet = v.snippet as Record<string, unknown>;
      const stats = v.statistics as Record<string, unknown>;
      return {
        id: v.id,
        title: snippet?.title,
        channelTitle: snippet?.channelTitle,
        publishedAt: snippet?.publishedAt,
        views: Number(stats?.viewCount || 0),
        likes: Number(stats?.likeCount || 0),
        thumbnail: (snippet?.thumbnails as Record<string, { url: string }>)?.medium?.url,
      };
    });

    // AI analysis if Gemini available
    let aiAnalysis = null;
    if (geminiKey) {
      const prompt = `Analyze these trending YouTube videos and identify content opportunities.

Trending videos:
${trending.map((v: { title: unknown; channelTitle: unknown; views: unknown }) => `- "${v.title}" by ${v.channelTitle} (${v.views} views)`).join('\n')}

${niche ? `User's niche: ${niche}` : ''}

Identify:
1. 3-5 trending themes/topics
2. 3 content angle suggestions the user could create
3. Common title patterns being used

Return ONLY JSON:
{
  "themes": [{"theme": "...", "videoCount": N}],
  "suggestions": [{"title": "...", "angle": "...", "why": "..."}],
  "title_patterns": ["pattern1", "pattern2", "pattern3"]
}
No markdown.`;

      try {
        const raw = await geminiGenerate(prompt, geminiKey);
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        const s = cleaned.indexOf('{');
        const e = cleaned.lastIndexOf('}');
        if (s !== -1 && e !== -1) aiAnalysis = JSON.parse(cleaned.slice(s, e + 1));
      } catch { /* optional */ }
    }

    return NextResponse.json({ trending, ai: aiAnalysis });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
