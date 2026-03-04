import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { topic, count } = await req.json();

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });
  }

  const prompt = `Generate ${count || 30} highly relevant Instagram hashtags for: "${topic}"

Mix of:
- 10 high-volume (1M+ posts)
- 10 medium-volume (100K-1M posts)
- 10 niche/specific (under 100K posts)

Return as a JSON array of strings, each starting with #.
Return ONLY the JSON array, no markdown.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const hashtags = JSON.parse(cleaned);
    return NextResponse.json({ hashtags });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
