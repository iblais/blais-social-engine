import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerate } from '@/lib/ai/gemini';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = req.nextUrl.searchParams.get('q');
  if (!query) return NextResponse.json({ error: 'Query (q) is required' }, { status: 400 });

  try {
    // YouTube autocomplete (free, no quota)
    const suggestRes = await fetch(
      `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    let suggestions: string[] = [];
    if (suggestRes.ok) {
      const text = await suggestRes.text();
      // Response is JSONP: window.google.ac.h([...])
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        // Format: [[query, [suggestion1, suggestion2, ...], ...]]
        if (Array.isArray(parsed[1])) {
          suggestions = parsed[1].map((s: string | string[]) => Array.isArray(s) ? s[0] : s).filter(Boolean);
        }
      }
    }

    // Gemini scoring if available
    const { data: setting } = await supabase
      .from('app_settings').select('value').eq('key', 'gemini_api_key').single();
    const geminiKey = setting?.value || process.env.GEMINI_API_KEY;

    let keywords = suggestions.map(s => ({ keyword: s, volume: 'unknown' as string, competition: 'unknown' as string }));

    if (geminiKey && suggestions.length > 0) {
      const prompt = `You are a YouTube keyword research expert. Estimate the search volume and competition for these YouTube search terms:

${suggestions.map(s => `- "${s}"`).join('\n')}

For each keyword, estimate:
- volume: "high" (100K+/month), "medium" (10K-100K), or "low" (under 10K)
- competition: "high" (saturated), "medium" (competitive), or "low" (opportunity)

Return ONLY a JSON array: [{"keyword": "...", "volume": "high|medium|low", "competition": "high|medium|low"}]
No markdown.`;

      try {
        const raw = await geminiGenerate(prompt, geminiKey);
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
        const s = cleaned.indexOf('[');
        const e = cleaned.lastIndexOf(']');
        if (s !== -1 && e !== -1) {
          keywords = JSON.parse(cleaned.slice(s, e + 1));
        }
      } catch { /* use unscored suggestions */ }
    }

    return NextResponse.json({ query, keywords });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
