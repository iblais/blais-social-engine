import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, description, tags, thumbnailUrl } = await req.json();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .single();

  const apiKey = setting?.value || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured.' }, { status: 400 });

  const tagsArray = tags || [];
  const descLength = description ? description.length : 0;

  const prompt = `You are a YouTube SEO expert. Evaluate this video's metadata against a comprehensive SEO checklist.

Video metadata:
- Title: "${title}" (${title.length} characters)
- Description: "${description || '(none provided)'}" (${descLength} characters)
- Tags: ${tagsArray.length > 0 ? JSON.stringify(tagsArray) : '(none provided)'} (${tagsArray.length} tags)
- Thumbnail: ${thumbnailUrl ? 'provided' : 'not provided'}

Evaluate each of these 12 SEO checks. For each, determine if it passes or fails based on the actual metadata provided:

1. Title under 60 chars — currently ${title.length} chars
2. Title contains primary keyword — does the title contain a clear searchable keyword?
3. Title uses power words or numbers — does it use emotional triggers, numbers, or curiosity gaps?
4. Description over 200 chars — currently ${descLength} chars
5. Description contains keywords in first 2 lines — are searchable terms in the opening lines?
6. Description has timestamps — does it include chapter timestamps (0:00 format)?
7. Description has CTA — does it include a call-to-action (subscribe, like, comment)?
8. Description has links — does it include URLs or social links?
9. At least 10 tags — currently ${tagsArray.length} tags
10. Tags include exact title match — is the full title or close variant in the tags?
11. Tags mix broad and long-tail — do tags include both general and specific phrases?
12. Thumbnail provided — ${thumbnailUrl ? 'yes' : 'no'}

For each check return:
- check: the check name
- passed: true or false
- tip: a brief actionable tip (if passed, a reinforcement; if failed, how to fix it)

Also calculate an overall score: (passed checks / 12) * 100, rounded to nearest integer.

Return ONLY a JSON object: {"items": [{"check": "...", "passed": true, "tip": "..."}], "score": 75}
No markdown, no code blocks.`;

  try {
    const raw = await geminiGenerate(prompt, apiKey);
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('AI did not return valid JSON.');
    const result = JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    return NextResponse.json(result);
  } catch (err) {
    console.error('SEO checklist error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
