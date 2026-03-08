import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerateImage } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, style, brandColors, count } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings').select('value').eq('key', 'gemini_api_key').single();
  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const styleDesc = style || 'bold, eye-catching, modern YouTube thumbnail';
  const colorDesc = brandColors ? `Brand colors: ${brandColors}.` : '';

  const prompt = `Create a professional YouTube thumbnail image (16:9, 1280x720).

Video title: "${title}"
Style: ${styleDesc}
${colorDesc}

Requirements:
- Bold, readable text overlay with key words from the title
- High contrast and saturated colors
- Clean composition, not cluttered
- Eye-catching and click-worthy
- Professional quality suitable for YouTube`;

  try {
    const images = await geminiGenerateImage({
      prompt,
      apiKey,
      model: 'nano-banana-2',
      count: count || 2,
    });
    return NextResponse.json({ thumbnails: images });
  } catch (err) {
    console.error('Thumbnail generate error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
