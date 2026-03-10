'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface Brand {
  id: string;
  name: string;
  color: string | null;
  ai_instructions: string | null;
}

const EXAMPLE_PROMPTS: Record<string, string> = {
  'Fan Page': `This is a fan page dedicated to [artist/celebrity name]. Write captions from the perspective of an enthusiastic, knowledgeable fan.

Voice: Passionate, celebratory, nostalgic, deeply informed about their work and legacy.
Audience: Devoted fans, casual listeners, new followers discovering their music/art.

Instagram (3-5 hashtags): Lead with an emotional hook — a lyric, a memory, a "did you know" fact. Keep captions under 150 characters before the line break. Use era-specific references. Hashtags at the end only.
Facebook (0-2 hashtags): Tell a fuller story. Share context, history, or a memory that sparks conversation.

NEVER: Use generic captions. Avoid clickbait. No overused phrases like "legend" or "GOAT" without context.
ALWAYS: Include a specific detail that only real fans would know. End with a question or fill-in-the-blank to drive comments.`,

  'Horror / Faceless': `This is a faceless horror/mystery content channel. Write captions that build dread, curiosity, and suspense.

Voice: Ominous, cryptic, storytelling-focused. Like a campfire narrator. Never reveal everything.
Audience: Horror fans, true crime enthusiasts, people who love unsettling content.

Instagram (3-5 hashtags): Open with a line that creates immediate unease. Short sentences. Leave the reader wanting more.
YouTube: First line = title hook. Rest = tease the video without spoilers.

NEVER: Use exclamation points. No emojis except 🔴 or 🖤 sparingly. No "Wait for it!" or "You won't believe..."
ALWAYS: End with an unanswered question. Use "they say...", "some believe...", "the records show..."`,

  'AI / Tech': `This is an AI and no-code tools education brand. Write captions that make complex tech feel approachable and exciting.

Voice: Smart but not nerdy, practical, forward-thinking. Think "tech friend who explains it simply."
Audience: Entrepreneurs, creators, solopreneurs, non-technical people curious about AI.

Instagram (3-5 hashtags): Lead with a surprising stat or counterintuitive insight. Keep it punchy. Use simple language.
Facebook (1-2 hashtags): Go deeper — share a use case, workflow, or transformation story.

NEVER: Use jargon without explaining it. No "revolutionary" or "game-changing."
ALWAYS: Show the practical outcome. "In 10 minutes you can..." or "This replaced [tool] for me."`,
};

function BrandCard({ brand, onSave }: { brand: Brand; onSave: (id: string, instructions: string) => Promise<void> }) {
  const [instructions, setInstructions] = useState(brand.ai_instructions || '');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(!!brand.ai_instructions);
  const [showExamples, setShowExamples] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(brand.id, instructions);
    setSaving(false);
  }

  function useExample(text: string) {
    setInstructions(text);
    setShowExamples(false);
    setExpanded(true);
  }

  const wordCount = instructions.trim().split(/\s+/).filter(Boolean).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full shrink-0"
              style={{ backgroundColor: brand.color || '#6366f1' }}
            />
            <CardTitle className="text-base">{brand.name}</CardTitle>
            {brand.ai_instructions && (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                Configured
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        {!expanded && brand.ai_instructions && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{brand.ai_instructions}</p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          <Textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder={`Describe how the AI should write for ${brand.name}:\n\n• What is this brand/page about?\n• What tone and voice? (e.g. passionate fan, professional, humorous)\n• Who is the audience?\n• Platform-specific rules (hashtag counts, caption length, CTA style)\n• What to NEVER do\n• What to ALWAYS include`}
            className="min-h-[200px] text-sm font-mono"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{wordCount} words</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowExamples(!showExamples)}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Examples
              </Button>
            </div>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>

          {showExamples && (
            <div className="border rounded-lg overflow-hidden">
              {Object.entries(EXAMPLE_PROMPTS).map(([label, text]) => (
                <div key={label} className="border-b last:border-b-0">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                    onClick={() => useExample(text)}
                  >
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{text.substring(0, 80)}...</p>
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function BrandVoicePage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('brands')
      .select('id, name, color, ai_instructions')
      .order('name');
    setBrands(data || []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function saveBrand(id: string, instructions: string) {
    const { error } = await supabase
      .from('brands')
      .update({ ai_instructions: instructions || null })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Brand voice saved');
    setBrands(prev => prev.map(b => b.id === id ? { ...b, ai_instructions: instructions || null } : b));
  }

  const configuredCount = brands.filter(b => b.ai_instructions).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brand Voice</h1>
        <p className="text-muted-foreground">
          Train the AI to caption exactly the way each brand speaks. These instructions are injected into every AI caption, idea, and script generated for that brand.
        </p>
      </div>

      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">How it works</p>
              <p className="text-muted-foreground">Write natural language instructions — like briefing a human copywriter. Cover: the brand&apos;s personality, audience, hashtag strategy per platform, what to always/never do, and your preferred CTA style. The more specific, the better the output.</p>
              <p className="text-muted-foreground mt-1">
                <strong className="text-foreground">2026 best practices are already built in:</strong> Instagram (3–5 hashtags, hook-first), Facebook (0–2 hashtags, storytelling), Bluesky/X (punchy, inline tags). Your brand instructions layer on top.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{configuredCount} of {brands.length} brands configured</p>
      </div>

      <div className="space-y-3">
        {brands.map(brand => (
          <BrandCard key={brand.id} brand={brand} onSave={saveBrand} />
        ))}
      </div>

      {!brands.length && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No brands found. Create a brand first in Settings &gt; Accounts.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
