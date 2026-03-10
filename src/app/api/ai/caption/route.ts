import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate, geminiVision } from '@/lib/ai/gemini';

const PLATFORM_RULES: Record<string, string> = {
  Instagram: `Instagram 2026 rules:
- First 125 characters are the HOOK — this is what users see before "more". Make it stop-the-scroll.
- Keep the main caption punchy and direct. 1-3 short paragraphs max.
- Use 3-5 highly targeted hashtags ONLY — placed at the very end, after a line break. More than 5 hurts reach in 2026.
- CTAs should feel natural: "Save this.", "Tag someone who needs this.", "Drop a 🔥 if you agree."`,

  Facebook: `Facebook 2026 rules:
- Facebook rewards longer, storytelling captions that spark conversation.
- Use 0-2 hashtags maximum — hashtags have minimal impact on Facebook; focus on the text.
- End with a question or fill-in-the-blank to drive comments (comments = reach).
- First line still matters — it appears in the feed preview. Make it engaging.`,

  'Twitter/X': `Twitter/X 2026 rules:
- 280 character limit. Be punchy, direct, or provocative.
- 1-2 hashtags max, often used inline (e.g. "#AI is changing...").
- Contrarian takes, surprising stats, or strong opinions perform best.
- No fluff. Every word must earn its place.`,

  TikTok: `TikTok 2026 rules:
- Caption is secondary to the video, but the first line shows in feed. Make it a hook.
- 3-5 hashtags, mix of niche (#learnontiktok) and broad (#viral).
- Conversational, lowercase, Gen Z tone works well.`,

  LinkedIn: `LinkedIn 2026 rules:
- Professional but human. Share insight, a lesson learned, or a contrarian take.
- First line is critical — it shows before "see more". Make it surprising or valuable.
- 0-3 hashtags at the end. Over-hashtagging looks spammy on LinkedIn.
- End with a thoughtful question to drive comments.`,

  Bluesky: `Bluesky 2026 rules:
- 300 character limit. Treat it like Twitter — short, punchy, conversational.
- 0-3 hashtags, used sparingly.
- Community-driven tone. Bluesky users value authenticity over polish.`,
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { topic, tone, platform, brandVoice, includeHashtags, includeEmojis, includeCTA, images, brandId } = await req.json();

  // Get API key
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured. Add it in Settings > General.' }, { status: 400 });
  }

  // Fetch brand AI instructions if brandId provided
  let brandInstructions = '';
  if (brandId) {
    const { data: brand } = await supabase
      .from('brands')
      .select('ai_instructions')
      .eq('id', brandId)
      .single();
    if (brand?.ai_instructions) {
      brandInstructions = brand.ai_instructions;
    }
  }

  // Fall back to manually provided brandVoice if no brand instructions
  const voiceContext = brandInstructions || (brandVoice ? `Brand voice: ${brandVoice}` : '');

  const platformRules = PLATFORM_RULES[platform || 'Instagram'] || PLATFORM_RULES['Instagram'];

  const prompt = `You are an expert social media copywriter in 2026. Generate a single high-performing ${platform || 'Instagram'} caption.

${voiceContext ? `=== BRAND INSTRUCTIONS ===\n${voiceContext}\n\n` : ''}=== PLATFORM RULES ===
${platformRules}

=== CAPTION REQUEST ===
${topic ? `Topic: ${topic}` : 'Analyze the provided image(s) and create a caption based on what you see.'}
Tone: ${tone || 'professional yet friendly'}
${includeHashtags ? '' : 'Do NOT include any hashtags.'}
${includeEmojis ? 'Use emojis naturally and sparingly — only where they add meaning.' : 'Do NOT use emojis.'}
${includeCTA ? 'Include a natural call-to-action appropriate for this platform.' : 'Do not include a call-to-action.'}

Return ONLY the caption text. No explanations, no quotes around it, no meta-commentary.`;

  try {
    let caption: string;

    if (images?.length) {
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
