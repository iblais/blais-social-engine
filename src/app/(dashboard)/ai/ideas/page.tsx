'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Lightbulb, Sparkles, Image, LayoutGrid, Film, MessageCircle, Save, Check } from 'lucide-react';

interface Idea {
  title: string;
  description: string;
  contentType: string;
  engagement: string;
}

const typeIcons: Record<string, React.ElementType> = {
  image: Image,
  carousel: LayoutGrid,
  reel: Film,
  story: MessageCircle,
};

const engagementColors: Record<string, string> = {
  high: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-gray-500/20 text-gray-400',
};

export default function AIIdeasPage() {
  const [niche, setNiche] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [count, setCount] = useState(10);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const supabase = createClient();

  async function generate() {
    if (!niche.trim()) { toast.error('Enter a niche'); return; }
    setLoading(true);
    setSavedIds(new Set());
    try {
      const res = await fetch('/api/ai/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, platform, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIdeas(data.ideas);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveIdea(idea: Idea, index: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); return; }

    const { error } = await supabase.from('content_pipeline').insert({
      user_id: user.id,
      title: idea.title,
      description: `${idea.description}\n\nType: ${idea.contentType} | Engagement: ${idea.engagement} | Platform: ${platform}`,
      stage: 'idea',
      score: null,
    });

    if (error) { toast.error(error.message); return; }
    setSavedIds(prev => new Set(prev).add(index));
    toast.success(`"${idea.title}" saved to Pipeline`);
  }

  async function saveAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Not authenticated'); return; }

    setSavingAll(true);
    const unsaved = ideas.filter((_, i) => !savedIds.has(i));
    const rows = unsaved.map(idea => ({
      user_id: user.id,
      title: idea.title,
      description: `${idea.description}\n\nType: ${idea.contentType} | Engagement: ${idea.engagement} | Platform: ${platform}`,
      stage: 'idea',
      score: null,
    }));

    const { error } = await supabase.from('content_pipeline').insert(rows);
    if (error) { toast.error(error.message); setSavingAll(false); return; }

    const allIds = new Set(ideas.map((_, i) => i));
    setSavedIds(allIds);
    toast.success(`${unsaved.length} ideas saved to Pipeline`);
    setSavingAll(false);
  }

  const unsavedCount = ideas.filter((_, i) => !savedIds.has(i)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Content Ideas Generator</h1>
        <p className="text-muted-foreground">Get AI-powered content ideas for your niche</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label>Niche / Topic</Label>
              <Input value={niche} onChange={e => setNiche(e.target.value)}
                placeholder="e.g. Fitness, Tech Reviews, Cooking..." />
            </div>
            <div className="w-40 space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                  <SelectItem value="YouTube">YouTube</SelectItem>
                  <SelectItem value="Twitter/X">Twitter/X</SelectItem>
                  <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-2">
              <Label>Count</Label>
              <Input type="number" min={5} max={25} value={count} onChange={e => setCount(Number(e.target.value))} />
            </div>
            <Button onClick={generate} disabled={loading}>
              <Sparkles className="h-4 w-4 mr-2" />
              {loading ? 'Generating...' : 'Generate'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!ideas.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Enter your niche and generate content ideas</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Save All bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{ideas.length} ideas generated</p>
            <Button onClick={saveAll} disabled={savingAll || unsavedCount === 0} size="sm" variant="outline">
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {unsavedCount === 0 ? 'All Saved' : savingAll ? 'Saving...' : `Save All (${unsavedCount})`}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {ideas.map((idea, i) => {
              const Icon = typeIcons[idea.contentType?.toLowerCase()] || Image;
              const isSaved = savedIds.has(i);
              return (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="font-medium text-sm">{idea.title}</p>
                          <button
                            onClick={() => saveIdea(idea, i)}
                            disabled={isSaved}
                            className={`flex-shrink-0 p-1 rounded transition-colors ${
                              isSaved ? 'text-green-500' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                            }`}
                            title={isSaved ? 'Saved to Pipeline' : 'Save to Pipeline'}
                          >
                            {isSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{idea.description}</p>
                        <div className="flex gap-2">
                          <Badge variant="secondary" className="text-xs capitalize">{idea.contentType}</Badge>
                          <Badge variant="secondary" className={`text-xs capitalize ${engagementColors[idea.engagement?.toLowerCase()] || ''}`}>
                            {idea.engagement}
                          </Badge>
                          {isSaved && <Badge variant="secondary" className="text-[10px] bg-green-500/20 text-green-400">Saved</Badge>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
