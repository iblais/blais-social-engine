import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerateImage } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { prompt, style } = await req.json();

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured. Add it in Settings.' }, { status: 400 });
  }

  const fullPrompt = `Create a high-quality social media image: ${prompt}${style ? `. Style: ${style}` : ''}. Make it visually appealing and suitable for Instagram/social media.`;

  try {
    const dataUrl = await geminiGenerateImage(fullPrompt, apiKey);
    return NextResponse.json({ image: dataUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
