import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { commentText, videoTitle, channelName } = await req.json();
  if (!commentText) {
    return NextResponse.json({ error: 'commentText is required' }, { status: 400 });
  }

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

  const prompt = `You are replying to a YouTube comment on behalf of the channel "${channelName || 'our channel'}".${videoTitle ? ` The video is titled "${videoTitle}".` : ''}

Be friendly, authentic, and helpful. Never be generic. Reference what the commenter said specifically. Keep the reply concise (1-3 sentences). Do not use excessive emojis. Do not be overly promotional. Sound like a real person, not a bot.

The comment you are replying to:
"${commentText}"

Return ONLY the reply text, nothing else.`;

  try {
    const reply = await geminiGenerate(prompt, apiKey);
    return NextResponse.json({ reply: reply.trim() });
  } catch (err) {
    console.error('YouTube reply AI error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
