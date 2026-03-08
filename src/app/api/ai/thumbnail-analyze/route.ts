import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiVision } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { image } = await req.json();
  if (!image) return NextResponse.json({ error: 'Image is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings').select('value').eq('key', 'gemini_api_key').single();
  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const prompt = `You are a YouTube thumbnail design expert. Analyze this thumbnail image and score it.

Score each dimension 0-100:
1. face_score — Expressive face visible? Emotion readable? (faces boost CTR by 38%)
2. text_score — Text readable at small size? Under 5 words? High contrast?
3. contrast_score — Bold colors? Stands out against white/dark backgrounds?
4. composition_score — Clean layout? Rule of thirds? Not cluttered?
5. brand_score — Consistent style? Recognizable template?
6. overall_score — Weighted average

Also provide 3 specific improvement tips.

Return ONLY JSON: {"face_score": N, "text_score": N, "contrast_score": N, "composition_score": N, "brand_score": N, "overall_score": N, "tips": ["tip1", "tip2", "tip3"]}
No markdown.`;

  try {
    const raw = await geminiVision(prompt, [image], apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('AI did not return valid JSON.');
    const analysis = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
