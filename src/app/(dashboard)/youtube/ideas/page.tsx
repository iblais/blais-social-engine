'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Loader2,
  Copy,
  Lightbulb,
  Shuffle,
  TrendingUp,
  Sparkles,
  Zap,
} from 'lucide-react';

interface VideoIdea {
  title: string;
  format: string;
  difficulty: string;
  trendScore: number;
  reason: string;
}

interface RemixIdea {
  title: string;
  angle: string;
  format: string;
  hook: string;
}

function DifficultyBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    easy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    hard: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return <Badge className={colors[level.toLowerCase()] || colors.medium}>{level}</Badge>;
}

function TrendBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  return (
    <span className={`font-bold text-sm ${color}`}>
      <TrendingUp className="inline h-3 w-3 mr-1" />
      {score}
    </span>
  );
}

export default function YouTubeIdeasPage() {
  // Ideas state
  const [niche, setNiche] = useState('');
  const [channelName, setChannelName] = useState('');
  const [topVideos, setTopVideos] = useState('');
  const [ideas, setIdeas] = useState<VideoIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);

  // Remix state
  const [remixUrl, setRemixUrl] = useState('');
  const [remixNiche, setRemixNiche] = useState('');
  const [remixes, setRemixes] = useState<RemixIdea[]>([]);
  const [remixLoading, setRemixLoading] = useState(false);

  async function generateIdeas() {
    if (!niche.trim()) { toast.error('Enter your niche'); return; }
    setIdeasLoading(true);
    try {
      const res = await fetch('/api/ai/youtube-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: niche.trim(),
          channelName: channelName.trim(),
          topVideos: topVideos.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate ideas');
      setIdeas(data.ideas || []);
      toast.success(`Generated ${data.ideas?.length || 0} video ideas`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setIdeasLoading(false);
  }

  async function generateRemixes() {
    if (!remixUrl.trim()) { toast.error('Enter a video URL or title'); return; }
    if (!remixNiche.trim()) { toast.error('Enter your channel niche'); return; }
    setRemixLoading(true);
    try {
      const res = await fetch('/api/ai/youtube-remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: remixUrl.trim(),
          niche: remixNiche.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate remixes');
      setRemixes(data.remixes || []);
      toast.success(`Generated ${data.remixes?.length || 0} remix ideas`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setRemixLoading(false);
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Lightbulb className="h-8 w-8 text-yellow-500" />
          AI Video Ideas & Remix
        </h1>
        <p className="text-muted-foreground mt-1">Generate fresh video ideas and remix existing content</p>
      </div>

      {/* Section 1: Daily Ideas Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Daily Ideas Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="niche">Niche *</Label>
              <Input
                id="niche"
                placeholder="e.g. tech reviews, cooking, fitness..."
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channelName">Channel Name</Label>
              <Input
                id="channelName"
                placeholder="Your channel name"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="topVideos">Top Video Titles (optional, one per line)</Label>
            <Textarea
              id="topVideos"
              placeholder="Paste your top performing video titles here..."
              value={topVideos}
              onChange={(e) => setTopVideos(e.target.value)}
              rows={3}
            />
          </div>
          <Button onClick={generateIdeas} disabled={ideasLoading}>
            {ideasLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate Ideas
          </Button>

          {ideas.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {ideas.map((idea, i) => (
                <Card key={i} className="relative group">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight">{idea.title}</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyText(idea.title)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{idea.format}</Badge>
                      <DifficultyBadge level={idea.difficulty} />
                      <TrendBadge score={idea.trendScore} />
                    </div>
                    <p className="text-xs text-muted-foreground">{idea.reason}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Video Remix Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-blue-500" />
            Video Remix Tool
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="remixUrl">Video URL or Title *</Label>
              <Input
                id="remixUrl"
                placeholder="Paste a YouTube URL or video title..."
                value={remixUrl}
                onChange={(e) => setRemixUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remixNiche">Your Channel Niche *</Label>
              <Input
                id="remixNiche"
                placeholder="e.g. personal finance, gaming..."
                value={remixNiche}
                onChange={(e) => setRemixNiche(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={generateRemixes} disabled={remixLoading}>
            {remixLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
            Generate Remixes
          </Button>

          {remixes.length > 0 && (
            <div className="space-y-3 mt-4">
              {remixes.map((remix, i) => (
                <Card key={i} className="relative group">
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{remix.title}</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyText(`${remix.title}\n\nAngle: ${remix.angle}\nFormat: ${remix.format}\nHook: ${remix.hook}`)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{remix.format}</Badge>
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{remix.angle}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Hook:</span> {remix.hook}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
