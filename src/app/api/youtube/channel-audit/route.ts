import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

const YT_API = 'https://www.googleapis.com/youtube/v3';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  // Get account
  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('platform', 'youtube')
    .single();

  if (!account) return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });

  const { data: setting } = await supabase
    .from('app_settings').select('value').eq('key', 'gemini_api_key').single();
  const geminiKey = setting?.value || process.env.GEMINI_API_KEY;

  try {
    // Fetch channel details
    const channelRes = await fetch(
      `${YT_API}/channels?part=statistics,snippet,brandingSettings,contentDetails&mine=true`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );
    if (!channelRes.ok) throw new Error(`YouTube API error: ${channelRes.status}`);
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];
    if (!channel) throw new Error('Channel not found');

    // Fetch recent videos via uploads playlist
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    let videos: Array<Record<string, unknown>> = [];

    if (uploadsPlaylistId) {
      const playlistRes = await fetch(
        `${YT_API}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=30`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      );
      if (playlistRes.ok) {
        const playlistData = await playlistRes.json();
        const videoIds = playlistData.items?.map((item: { contentDetails: { videoId: string } }) => item.contentDetails.videoId).join(',');

        if (videoIds) {
          const videosRes = await fetch(
            `${YT_API}/videos?part=statistics,snippet,contentDetails&id=${videoIds}`,
            { headers: { Authorization: `Bearer ${account.access_token}` } }
          );
          if (videosRes.ok) {
            const videosData = await videosRes.json();
            videos = videosData.items || [];
          }
        }
      }
    }

    // Prepare audit data
    const auditData = {
      channel: {
        title: channel.snippet?.title,
        description: channel.snippet?.description?.slice(0, 500),
        subscriberCount: Number(channel.statistics?.subscriberCount || 0),
        videoCount: Number(channel.statistics?.videoCount || 0),
        viewCount: Number(channel.statistics?.viewCount || 0),
        customUrl: channel.snippet?.customUrl,
        thumbnail: channel.snippet?.thumbnails?.default?.url,
      },
      videos: videos.map((v: Record<string, unknown>) => {
        const snippet = v.snippet as Record<string, unknown> | undefined;
        const stats = v.statistics as Record<string, unknown> | undefined;
        const content = v.contentDetails as Record<string, unknown> | undefined;
        return {
          id: v.id,
          title: snippet?.title,
          publishedAt: snippet?.publishedAt,
          views: Number(stats?.viewCount || 0),
          likes: Number(stats?.likeCount || 0),
          comments: Number(stats?.commentCount || 0),
          duration: content?.duration,
          tags: (snippet?.tags as string[]) || [],
          description: (snippet?.description as string)?.slice(0, 200) || '',
          thumbnail: (snippet?.thumbnails as Record<string, { url: string }> | undefined)?.medium?.url,
        };
      }),
    };

    // AI scoring if Gemini key available
    let aiAudit = null;
    if (geminiKey) {
      const auditPrompt = `You are a YouTube growth strategist. Audit this channel and score it.

Channel: ${auditData.channel.title}
Subscribers: ${auditData.channel.subscriberCount}
Total views: ${auditData.channel.viewCount}
Total videos: ${auditData.channel.videoCount}

Last ${auditData.videos.length} videos:
${auditData.videos.map((v) => `- "${v.title}" — ${v.views} views, ${v.likes} likes, ${v.comments} comments, duration: ${v.duration}, tags: ${(v.tags as string[])?.length || 0}`).join('\n')}

Score each dimension 0-100:
1. upload_consistency — Regular upload schedule?
2. title_optimization — Titles click-worthy and keyword-optimized?
3. description_seo — Descriptions have keywords, links, structure?
4. tag_usage — Videos properly tagged?
5. engagement_rate — Likes+comments vs views ratio?
6. overall_score — Weighted average

Also identify the best posting times based on top-performing video publish times, and give 5 specific recommendations.

Return ONLY JSON:
{
  "scores": {"upload_consistency": N, "title_optimization": N, "description_seo": N, "tag_usage": N, "engagement_rate": N, "overall_score": N},
  "best_post_times": [{"day": "Monday", "hour": 14, "performance": "high"}],
  "recommendations": ["rec1", "rec2", "rec3", "rec4", "rec5"]
}
No markdown.`;

      try {
        const raw = await geminiGenerate(auditPrompt, geminiKey);
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        const s = cleaned.indexOf('{');
        const e = cleaned.lastIndexOf('}');
        if (s !== -1 && e !== -1) aiAudit = JSON.parse(cleaned.slice(s, e + 1));
      } catch { /* AI scoring optional */ }
    }

    // Save audit to DB (optional, if table exists)
    if (aiAudit) {
      await supabase.from('youtube_audits').insert({
        account_id: accountId,
        user_id: user.id,
        audit_data: auditData,
        score: aiAudit.scores?.overall_score || null,
        recommendations: aiAudit.recommendations || [],
        best_post_times: aiAudit.best_post_times || [],
      });
    }

    return NextResponse.json({ audit: auditData, ai: aiAudit });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
