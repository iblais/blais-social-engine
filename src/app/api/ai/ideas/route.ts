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
    // Find the JSON array in the response
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) {
      throw new Error('AI did not return valid JSON. Please try again.');
    }
    const ideas = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json({ ideas });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('Content ideas error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
