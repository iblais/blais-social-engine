import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { topic, keywords, tone, count } = await req.json();
  if (!topic) return NextResponse.json({ error: 'Topic is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const prompt = `You are a YouTube SEO expert. Generate ${count || 10} compelling YouTube video title variations.

Topic: ${topic}
${keywords ? `Target keywords: ${keywords}` : ''}
${tone ? `Tone: ${tone}` : 'Tone: engaging and click-worthy'}

Rules:
- Each title under 60 characters for full display
- Use power words, numbers, or curiosity gaps
- Front-load keywords for SEO
- Mix styles: how-to, listicle, question, statement, challenge

Return ONLY a JSON array of objects: [{"title": "...", "score": 85, "reason": "brief explanation"}]
No markdown, no code blocks.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) throw new Error('AI did not return valid JSON.');
    const titles = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json({ titles });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
