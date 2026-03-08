import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { niche, uploadsPerWeek, existingTopics, duration } = await req.json();
  if (!niche) return NextResponse.json({ error: 'niche is required' }, { status: 400 });
  if (!uploadsPerWeek) return NextResponse.json({ error: 'uploadsPerWeek is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const weeks = duration || 4;

  const prompt = `You are a YouTube content strategist. Create a detailed content calendar for the next ${weeks} weeks.

Niche: ${niche}
Uploads per week: ${uploadsPerWeek}
${existingTopics?.length ? `Topics already covered (avoid repeating): ${existingTopics.join(', ')}` : ''}

For each week, generate exactly ${uploadsPerWeek} video ideas. For each video provide:
- day: suggested day of the week to publish (e.g. "Monday", "Wednesday")
- title: a compelling, click-worthy video title (under 70 chars)
- format: the video format (tutorial, vlog, listicle, review, shorts, comparison, storytime, challenge, documentary, reaction)
- topic: the core topic or keyword being targeted
- reason: brief explanation of why this video at this time (trending relevance, seasonal tie-in, audience demand, etc.)

Guidelines:
- Mix up video formats across weeks for variety
- Consider seasonal/trending relevance for the current time period
- Space uploads evenly across the week
- Suggest optimal publish times (morning, afternoon, evening)
- Build content momentum — earlier videos should set up later ones

Return ONLY JSON:
{
  "weeks": [
    {
      "weekNumber": 1,
      "videos": [
        {"day": "Monday", "title": "...", "format": "tutorial", "topic": "...", "reason": "..."}
      ]
    }
  ]
}
No markdown, no code blocks.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('AI did not return valid JSON.');
    const calendar = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json(calendar);
  } catch (err) {
    console.error('Content calendar error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
