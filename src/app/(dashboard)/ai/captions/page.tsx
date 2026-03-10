'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Sparkles, Copy, RotateCcw, Save, Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function AICaptionsPage() {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional yet friendly');
  const [platform, setPlatform] = useState('Instagram');
  const [brandVoice, setBrandVoice] = useState('');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [includeEmojis, setIncludeEmojis] = useState(true);
  const [includeCTA, setIncludeCTA] = useState(true);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [savedCaptions, setSavedCaptions] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const supabase = createClient();
  const { activeBrandId } = useBrandAccounts();
  const [activeBrand, setActiveBrand] = useState<{ name: string; ai_instructions: string | null } | null>(null);

  useEffect(() => {
    if (!activeBrandId) { setActiveBrand(null); return; }
    supabase.from('brands').select('name, ai_instructions').eq('id', activeBrandId).single()
      .then(({ data }) => setActiveBrand(data));
  }, [activeBrandId, supabase]);

  async function generate() {
    if (!topic.trim()) { toast.error('Enter a topic'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, tone, platform, brandVoice, includeHashtags, includeEmojis, includeCTA, brandId: activeBrandId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data.caption);
      setHistory(prev => [data.caption, ...prev].slice(0, 10));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  }

  async function saveCaption(caption: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); return; }

    const name = `${platform} - ${topic.substring(0, 40) || 'AI Caption'} (${new Date().toLocaleDateString()})`;

    const { error } = await supabase.from('caption_templates').insert({
      user_id: user.id,
      name,
      template: caption,
      variables: [],
    });

    if (error) { toast.error(error.message); return; }
    setSavedCaptions(prev => new Set(prev).add(caption));
    toast.success('Caption saved to Templates');
  }

  async function saveAllCaptions() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); return; }

    setSavingAll(true);
    const unsaved = history.filter(c => !savedCaptions.has(c));
    const rows = unsaved.map((caption, i) => ({
      user_id: user.id,
      name: `${platform} - ${topic.substring(0, 30) || 'AI'} #${i + 1} (${new Date().toLocaleDateString()})`,
      template: caption,
      variables: [],
    }));

    const { error } = await supabase.from('caption_templates').insert(rows);
    if (error) { toast.error(error.message); setSavingAll(false); return; }

    const allSaved = new Set(history);
    setSavedCaptions(allSaved);
    toast.success(`${unsaved.length} captions saved to Templates`);
    setSavingAll(false);
  }

  const isSaved = (caption: string) => savedCaptions.has(caption);
  const unsavedCount = history.filter(c => !savedCaptions.has(c)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Caption Generator</h1>
        <p className="text-muted-foreground">Generate engaging captions with Gemini AI</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Topic / Description</Label>
                <Textarea value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="What is your post about?" className="min-h-[100px]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional yet friendly">Professional</SelectItem>
                      <SelectItem value="casual and fun">Casual</SelectItem>
                      <SelectItem value="inspirational and motivating">Inspirational</SelectItem>
                      <SelectItem value="humorous and witty">Humorous</SelectItem>
                      <SelectItem value="educational and informative">Educational</SelectItem>
                      <SelectItem value="urgent and exciting">Urgent/Hype</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="Facebook">Facebook</SelectItem>
                      <SelectItem value="Twitter/X">Twitter/X</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                      <SelectItem value="Bluesky">Bluesky</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Brand Voice</Label>
                {activeBrand?.ai_instructions ? (
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                    <Check className="h-4 w-4 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400">{activeBrand.name} voice active</p>
                      <p className="text-xs text-green-600/80 dark:text-green-500/80 truncate">{activeBrand.ai_instructions.substring(0, 60)}...</p>
                    </div>
                    <Link href="/settings/brand-voice" className="shrink-0">
                      <ExternalLink className="h-3.5 w-3.5 text-green-600" />
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input value={brandVoice} onChange={e => setBrandVoice(e.target.value)}
                      placeholder="e.g. Luxury, minimalist, Gen Z slang..." />
                    {activeBrandId && (
                      <p className="text-xs text-muted-foreground">
                        <Link href="/settings/brand-voice" className="underline hover:text-foreground">Set up Brand Voice</Link> for this brand to auto-apply instructions every time.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Include Hashtags</Label>
                  <Switch checked={includeHashtags} onCheckedChange={setIncludeHashtags} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Include Emojis</Label>
                  <Switch checked={includeEmojis} onCheckedChange={setIncludeEmojis} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Include Call-to-Action</Label>
                  <Switch checked={includeCTA} onCheckedChange={setIncludeCTA} />
                </div>
              </div>
              <Button onClick={generate} disabled={loading} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                {loading ? 'Generating...' : 'Generate Caption'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Generated Caption</CardTitle>
                {result && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => copy(result)}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
                    <Button variant="ghost" size="sm" onClick={() => saveCaption(result)} disabled={isSaved(result)}>
                      {isSaved(result) ? <><Check className="h-3.5 w-3.5 mr-1" />Saved</> : <><Save className="h-3.5 w-3.5 mr-1" />Save</>}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={generate}><RotateCcw className="h-3.5 w-3.5 mr-1" />Regen</Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg">{result}</div>
              ) : (
                <p className="text-muted-foreground text-center py-8">Your generated caption will appear here</p>
              )}
            </CardContent>
          </Card>

          {history.length > 1 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">History ({history.length - 1})</CardTitle>
                  <Button variant="outline" size="sm" onClick={saveAllCaptions} disabled={savingAll || unsavedCount === 0}>
                    <Save className="h-3 w-3 mr-1" />
                    {unsavedCount === 0 ? 'All Saved' : savingAll ? 'Saving...' : `Save All (${unsavedCount})`}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {history.slice(1).map((h, i) => (
                  <div key={i} className="flex items-start gap-2 bg-muted p-2 rounded group">
                    <p className="text-xs text-muted-foreground flex-1 cursor-pointer hover:text-foreground"
                      onClick={() => { setResult(h); copy(h); }}>
                      {h.substring(0, 120)}...
                    </p>
                    <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => copy(h)} className="p-1 hover:bg-background rounded" title="Copy">
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button onClick={() => saveCaption(h)} disabled={isSaved(h)}
                        className="p-1 hover:bg-background rounded" title="Save">
                        {isSaved(h) ? <Check className="h-3 w-3 text-green-500" /> : <Save className="h-3 w-3 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
