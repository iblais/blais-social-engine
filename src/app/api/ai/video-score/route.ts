import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, description, tags, views, likes, comments, subscriberCount } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings').select('value').eq('key', 'gemini_api_key').single();
  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const engagementRate = views ? (((likes || 0) + (comments || 0)) / views * 100).toFixed(2) : 'N/A';

  const prompt = `You are a YouTube SEO analyst. Score this video across multiple dimensions.

Title: "${title}"
${description ? `Description (first 200 chars): "${description.slice(0, 200)}"` : 'Description: missing'}
${tags?.length ? `Tags: ${tags.slice(0, 10).join(', ')}` : 'Tags: none'}
${views !== undefined ? `Views: ${views}` : ''}
${likes !== undefined ? `Likes: ${likes}` : ''}
${comments !== undefined ? `Comments: ${comments}` : ''}
${subscriberCount ? `Channel subscribers: ${subscriberCount}` : ''}
${engagementRate !== 'N/A' ? `Engagement rate: ${engagementRate}%` : ''}

Score each dimension 0-100:
1. title_score — Click-worthiness, keyword placement, length
2. description_score — SEO optimization, keyword density, structure
3. tags_score — Relevance, coverage, mix of broad/long-tail
4. engagement_score — Engagement rate vs channel size (if data available, else estimate from title quality)
5. overall_score — Weighted average

Return ONLY JSON: {"title_score": N, "description_score": N, "tags_score": N, "engagement_score": N, "overall_score": N, "recommendations": ["tip1", "tip2", "tip3"]}
No markdown.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('AI did not return valid JSON.');
    const scores = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json(scores);
  } catch (err) {
    console.error('Video score error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
