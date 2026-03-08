import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, description, niche } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const prompt = `You are a YouTube SEO expert. Generate 30 optimized YouTube tags.

Video title: "${title}"
${description ? `Description: ${description}` : ''}
${niche ? `Niche: ${niche}` : ''}

Rules:
- Mix of broad, medium, and long-tail tags
- Include exact match of title as first tag
- Include common misspellings if relevant
- Each tag under 30 characters
- Order by estimated search volume (highest first)

Return ONLY a JSON array of objects: [{"tag": "...", "volume": "high|medium|low"}]
No markdown, no code blocks.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) throw new Error('AI did not return valid JSON.');
    const tags = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json({ tags });
  } catch (err) {
    console.error('YouTube tags error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
