import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate, geminiVision } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { topic, tone, platform, brandVoice, includeHashtags, includeEmojis, includeCTA, images } = await req.json();

  // Get API key from app_settings
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured. Add it in Settings > General.' }, { status: 400 });
  }

  const prompt = `You are a social media expert. Generate an engaging ${platform || 'Instagram'} caption.

${topic ? `Topic: ${topic}` : 'Analyze the provided image(s) and create a caption based on what you see.'}
Tone: ${tone || 'professional yet friendly'}
${brandVoice ? `Brand voice: ${brandVoice}` : ''}
${includeHashtags ? 'Include 10-15 relevant hashtags at the end.' : 'Do NOT include hashtags.'}
${includeEmojis ? 'Use emojis naturally throughout.' : 'Do NOT use emojis.'}
${includeCTA ? 'Include a clear call-to-action.' : ''}

Return ONLY the caption text, nothing else.`;

  try {
    let caption: string;

    if (images?.length) {
      // Use vision to analyze images and generate caption
      caption = await geminiVision(prompt, images, apiKey);
    } else {
      caption = await geminiGenerate(prompt, apiKey);
    }

    return NextResponse.json({ caption: caption.trim() });
  } catch (err) {
    console.error('Caption error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
