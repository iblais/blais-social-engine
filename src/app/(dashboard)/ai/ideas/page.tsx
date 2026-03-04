'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Lightbulb, Sparkles, Image, LayoutGrid, Film, MessageCircle } from 'lucide-react';

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

  async function generate() {
    if (!niche.trim()) { toast.error('Enter a niche'); return; }
    setLoading(true);
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
                  <SelectItem value="TikTok">TikTok</SelectItem>
                  <SelectItem value="YouTube">YouTube</SelectItem>
                  <SelectItem value="Twitter/X">Twitter/X</SelectItem>
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
        <div className="grid gap-3 sm:grid-cols-2">
          {ideas.map((idea, i) => {
            const Icon = typeIcons[idea.contentType?.toLowerCase()] || Image;
            return (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm">{idea.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{idea.description}</p>
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-xs capitalize">{idea.contentType}</Badge>
                        <Badge variant="secondary" className={`text-xs capitalize ${engagementColors[idea.engagement?.toLowerCase()] || ''}`}>
                          {idea.engagement}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
