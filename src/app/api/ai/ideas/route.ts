import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { niche, platform, count } = await req.json();

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });
  }

  const prompt = `Generate ${count || 10} unique, creative content ideas for ${platform || 'Instagram'} in the ${niche || 'general'} niche.

For each idea, provide:
1. A catchy title
2. A brief description (1-2 sentences)
3. The content type (image, carousel, reel, story)
4. Estimated engagement level (high, medium, low)

Return as a JSON array with objects having: title, description, contentType, engagement
Return ONLY the JSON array, no markdown formatting.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const ideas = JSON.parse(cleaned);
    return NextResponse.json({ ideas });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
