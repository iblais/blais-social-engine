import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { veoGenerateVideo, veoPollOperation } from '@/lib/ai/gemini';

export const maxDuration = 300; // 5 min max for Vercel function

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { prompt, aspectRatio, duration, resolution, startFrame, endFrame } = await req.json();

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured. Add it in Settings > General.' }, { status: 400 });
  }

  try {
    // Start the video generation
    const operationName = await veoGenerateVideo({
      prompt,
      apiKey,
      aspectRatio: aspectRatio || '16:9',
      duration: duration || '8',
      resolution: resolution || '720p',
      startFrame,
      endFrame,
    });

    // Return the operation name so the client can poll
    return NextResponse.json({ operationName });
  } catch (err) {
    console.error('Video gen error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Poll endpoint — check video generation status
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { operationName } = await req.json();
  if (!operationName) {
    return NextResponse.json({ error: 'operationName is required' }, { status: 400 });
  }

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });
  }

  try {
    const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
    const res = await fetch(`${GEMINI_BASE}/${operationName}?key=${apiKey}`);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Poll error ${res.status}: ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();

    if (data.done) {
      if (data.error) {
        return NextResponse.json({ done: true, error: data.error.message });
      }
      const samples = data.response?.generateVideoResponse?.generatedSamples
        || data.response?.generatedSamples;
      const videoUri = samples?.[0]?.video?.uri;
      return NextResponse.json({ done: true, videoUri });
    }

    return NextResponse.json({ done: false });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
