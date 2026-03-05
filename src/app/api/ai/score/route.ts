import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title } = await req.json();
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured. Add it in Settings.' }, { status: 400 });
  }

  const prompt = `You are a social media content strategist. Score this content idea from 0 to 100 based on:
- Viral potential (shareability, relatability)
- Engagement likelihood (comments, saves)
- Clarity and hook strength
- Audience value (educational, entertaining, inspiring)

Content idea: "${title}"

Reply with ONLY a JSON object like {"score": 75, "reason": "brief 1-sentence explanation"}. Nothing else.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const score = Math.min(100, Math.max(0, Math.round(Number(parsed.score))));
    return NextResponse.json({ score, reason: parsed.reason || '' });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
