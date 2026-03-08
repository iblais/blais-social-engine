import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, duration, style, keyPoints } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const durationMap: Record<string, string> = {
    short: '1-3 minutes (YouTube Short or quick tip)',
    medium: '5-10 minutes (standard YouTube video)',
    long: '15-25 minutes (in-depth tutorial or essay)',
  };
  const durationDesc = durationMap[duration || 'medium'] || durationMap.medium;

  const prompt = `You are a professional YouTube scriptwriter. Write a complete video script.

Title: "${title}"
Target duration: ${durationDesc}
${style ? `Style: ${style}` : 'Style: educational and engaging'}
${keyPoints ? `Key points to cover: ${keyPoints}` : ''}

Format the script with these markers:
[HOOK] — Opening hook (first 5-10 seconds, critical for retention)
[INTRO] — Brief intro and what viewers will learn
[SECTION: Topic Name] — Each main section
[B-ROLL: description] — Where to cut to supplementary footage
[CUT] — Scene transition points
[CTA] — Call to action moments
[OUTRO] — Closing

Include:
- Estimated timestamp for each section
- Speaking directions in (parentheses)
- Engagement prompts ("Comment below...", "Hit subscribe...")

Return ONLY the script text.`;

  try {
    const script = await geminiGenerate(prompt, apiKey);
    return NextResponse.json({ script: script.trim() });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
