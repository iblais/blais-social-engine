import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { niche, channelName, topVideos, count } = await req.json();
  if (!niche) return NextResponse.json({ error: 'Niche is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const prompt = `You are a YouTube content strategist. Generate ${count || 10} personalized daily video ideas for a channel.

Niche: ${niche}
${channelName ? `Channel name: ${channelName}` : ''}
${topVideos?.length ? `Top performing videos for reference: ${topVideos.join(', ')}` : ''}

For each idea provide:
- title: a compelling video title suggestion (under 60 chars)
- format: the video format (tutorial, vlog, review, listicle, reaction, shorts, documentary, challenge, comparison, storytime, etc.)
- difficulty: estimated production difficulty (easy, medium, hard)
- reason: a brief explanation of why this idea would work for this niche and audience
- trendScore: a trending relevance score from 0-100 based on current content trends

Prioritize ideas that:
- Fill content gaps in the niche
- Leverage trending topics and formats
- Have high search potential
- Match the channel's proven style (if top videos provided)

Return ONLY a JSON array of objects: [{"title": "...", "format": "...", "difficulty": "...", "reason": "...", "trendScore": 85}]
No markdown, no code blocks.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) throw new Error('AI did not return valid JSON.');
    const ideas = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json({ ideas });
  } catch (err) {
    console.error('YouTube ideas error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
