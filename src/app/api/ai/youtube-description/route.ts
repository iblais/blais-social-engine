import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, topic, keywords, includeCTA, includeTimestamps } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const prompt = `You are a YouTube SEO expert. Write an optimized YouTube video description.

Video title: "${title}"
${topic ? `Topic: ${topic}` : ''}
${keywords ? `Target keywords to include naturally: ${keywords}` : ''}

Structure:
1. Hook (first 2 lines visible before "Show more") — compelling summary with primary keyword
2. Detailed description (2-3 paragraphs, keyword-rich, natural language)
${includeTimestamps ? '3. Timestamps section (00:00 format, 5-8 chapters)' : ''}
${includeCTA ? '4. Call-to-action (subscribe, like, comment prompt)' : ''}
5. Relevant hashtags (3-5, at the end)

Return ONLY the description text, no wrapping quotes or markdown.`;

  try {
    const description = await geminiGenerate(prompt, apiKey);
    return NextResponse.json({ description: description.trim() });
  } catch (err) {
    console.error('YouTube description error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
