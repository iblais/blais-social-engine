import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { videoUrl, videoTitle, channelNiche } = await req.json();
  if (!videoTitle) return NextResponse.json({ error: 'Video title is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const prompt = `You are a YouTube content strategist specializing in content remixing. Analyze this video concept and generate exactly 5 remix ideas.

Original video title: ${videoTitle}
${videoUrl ? `Video URL: ${videoUrl}` : ''}
${channelNiche ? `Channel niche: ${channelNiche}` : ''}

Generate these 5 specific remix angles:
1. A different angle on the same topic — same subject, fresh perspective
2. A response/reaction video — your take, commentary, or reaction to the original
3. An expanded deep-dive — go way deeper into one aspect the original only touched on
4. A simplified/beginner version — make it accessible for complete beginners
5. A contrarian/opposite take — challenge the premise or argue the other side

For each remix provide:
- title: a compelling YouTube title (under 60 chars)
- angle: which of the 5 angles this is (different-angle, response, deep-dive, beginner, contrarian)
- format: suggested video format (tutorial, reaction, essay, explainer, debate, etc.)
- hook: a 1-sentence opening hook to grab viewers in the first 5 seconds

Return ONLY a JSON array of objects: [{"title": "...", "angle": "...", "format": "...", "hook": "..."}]
No markdown, no code blocks.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) throw new Error('AI did not return valid JSON.');
    const remixes = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json({ remixes });
  } catch (err) {
    console.error('YouTube remix error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
