'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Loader2,
  Copy,
  Youtube,
  Type,
  FileText,
  ScrollText,
  Tags,
  ImageIcon,
  Sparkles,
  Download,
  Upload,
  Lightbulb,
  Shuffle,
  CheckSquare,
  Check,
  X,
} from 'lucide-react';

type Tab = 'titles' | 'descriptions' | 'scripts' | 'tags' | 'thumbnails' | 'ideas' | 'remix' | 'seo';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'titles', label: 'Titles', icon: Type },
  { id: 'descriptions', label: 'Descriptions', icon: FileText },
  { id: 'scripts', label: 'Scripts', icon: ScrollText },
  { id: 'tags', label: 'Tags', icon: Tags },
  { id: 'thumbnails', label: 'Thumbnails', icon: ImageIcon },
  { id: 'ideas', label: 'Ideas', icon: Lightbulb },
  { id: 'remix', label: 'Remix', icon: Shuffle },
  { id: 'seo', label: 'SEO Check', icon: CheckSquare },
];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  return <span className={`font-bold ${color}`}>{score}</span>;
}

function VolumeBadge({ volume }: { volume: string }) {
  const colors: Record<string, string> = {
    high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  };
  return <Badge className={colors[volume] || colors.low}>{volume}</Badge>;
}

export default function YouTubeStudioPage() {
  const [activeTab, setActiveTab] = useState<Tab>('titles');
  const [loading, setLoading] = useState(false);

  // Titles state
  const [titleTopic, setTitleTopic] = useState('');
  const [titleKeywords, setTitleKeywords] = useState('');
  const [titleTone, setTitleTone] = useState('');
  const [titles, setTitles] = useState<Array<{ title: string; score: number; reason: string }>>([]);

  // Description state
  const [descTitle, setDescTitle] = useState('');
  const [descTopic, setDescTopic] = useState('');
  const [descKeywords, setDescKeywords] = useState('');
  const [descCTA, setDescCTA] = useState(true);
  const [descTimestamps, setDescTimestamps] = useState(true);
  const [description, setDescription] = useState('');

  // Script state
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptDuration, setScriptDuration] = useState('medium');
  const [scriptStyle, setScriptStyle] = useState('');
  const [scriptKeyPoints, setScriptKeyPoints] = useState('');
  const [script, setScript] = useState('');

  // Tags state
  const [tagsTitle, setTagsTitle] = useState('');
  const [tagsNiche, setTagsNiche] = useState('');
  const [tags, setTags] = useState<Array<{ tag: string; volume: string }>>([]);

  // Thumbnails state
  const [thumbTitle, setThumbTitle] = useState('');
  const [thumbStyle, setThumbStyle] = useState('');
  const [thumbColors, setThumbColors] = useState('');
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbImage, setThumbImage] = useState<string | null>(null);
  const [thumbAnalysis, setThumbAnalysis] = useState<Record<string, unknown> | null>(null);

  // Ideas state
  const [ideasNiche, setIdeasNiche] = useState('');
  const [ideasChannel, setIdeasChannel] = useState('');
  const [ideasTopVideos, setIdeasTopVideos] = useState('');
  const [ideasCount, setIdeasCount] = useState('10');
  const [ideas, setIdeas] = useState<Array<{ title: string; format: string; difficulty: string; reason: string; trendScore: number }>>([]);

  // Remix state
  const [remixUrl, setRemixUrl] = useState('');
  const [remixTitle, setRemixTitle] = useState('');
  const [remixNiche, setRemixNiche] = useState('');
  const [remixes, setRemixes] = useState<Array<{ title: string; angle: string; format: string; hook: string }>>([]);

  // SEO Checklist state
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoTags, setSeoTags] = useState('');
  const [seoThumbUrl, setSeoThumbUrl] = useState('');
  const [seoItems, setSeoItems] = useState<Array<{ check: string; passed: boolean; tip: string }>>([]);
  const [seoScore, setSeoScore] = useState<number | null>(null);

  async function generateTitles() {
    if (!titleTopic) { toast.error('Enter a topic'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/youtube-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: titleTopic, keywords: titleKeywords, tone: titleTone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTitles(data.titles);
      toast.success(`Generated ${data.titles.length} titles`);
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function generateDescription() {
    if (!descTitle) { toast.error('Enter a title'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/youtube-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: descTitle, topic: descTopic, keywords: descKeywords,
          includeCTA: descCTA, includeTimestamps: descTimestamps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDescription(data.description);
      toast.success('Description generated');
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function generateScript() {
    if (!scriptTitle) { toast.error('Enter a title'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/youtube-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: scriptTitle, duration: scriptDuration,
          style: scriptStyle, keyPoints: scriptKeyPoints,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScript(data.script);
      toast.success('Script generated');
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function generateTags() {
    if (!tagsTitle) { toast.error('Enter a title'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/youtube-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: tagsTitle, niche: tagsNiche }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTags(data.tags);
      toast.success(`Generated ${data.tags.length} tags`);
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function generateThumbnails() {
    if (!thumbTitle) { toast.error('Enter a title'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/thumbnail-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: thumbTitle, style: thumbStyle, brandColors: thumbColors }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setThumbnails(data.thumbnails);
      toast.success(`Generated ${data.thumbnails.length} thumbnails`);
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function analyzeThumbnail() {
    if (!thumbImage) { toast.error('Upload an image first'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/thumbnail-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: thumbImage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setThumbAnalysis(data);
      toast.success('Thumbnail analyzed');
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function generateIdeas() {
    if (!ideasNiche) { toast.error('Enter a niche'); return; }
    setLoading(true);
    try {
      const topVideos = ideasTopVideos.trim() ? ideasTopVideos.split('\n').map(v => v.trim()).filter(Boolean) : undefined;
      const res = await fetch('/api/ai/youtube-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: ideasNiche, channelName: ideasChannel, topVideos, count: parseInt(ideasCount) || 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIdeas(data.ideas);
      toast.success(`Generated ${data.ideas.length} video ideas`);
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function generateRemixes() {
    if (!remixTitle) { toast.error('Enter a video title'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/youtube-remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: remixUrl, videoTitle: remixTitle, channelNiche: remixNiche }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRemixes(data.remixes);
      toast.success(`Generated ${data.remixes.length} remix ideas`);
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function runSeoChecklist() {
    if (!seoTitle) { toast.error('Enter a title'); return; }
    setLoading(true);
    try {
      const tagsArray = seoTags.trim() ? seoTags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const res = await fetch('/api/ai/seo-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: seoTitle, description: seoDescription, tags: tagsArray, thumbnailUrl: seoThumbUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSeoItems(data.items);
      setSeoScore(data.score);
      toast.success('SEO checklist complete');
    } catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  function handleThumbUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setThumbImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Youtube className="h-8 w-8 text-red-500" />
        <div>
          <h1 className="text-2xl font-bold">YouTube Studio</h1>
          <p className="text-muted-foreground">AI-powered tools for YouTube content creation</p>
        </div>
      </div>

      {/* Quick links to sub-pages */}
      <div className="flex flex-wrap gap-2">
        {[
          { href: '/youtube/audit', label: 'Channel Audit' },
          { href: '/youtube/keywords', label: 'Keyword Research' },
          { href: '/youtube/growth', label: 'Growth Tracking' },
          { href: '/youtube/comments', label: 'Comments' },
          { href: '/youtube/seo', label: 'SEO Tools' },
        ].map(link => (
          <Link key={link.href} href={link.href}>
            <Button variant="outline" size="sm">{link.label}</Button>
          </Link>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b pb-px">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-red-500 text-red-500'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Titles Tab */}
      {activeTab === 'titles' && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Title Generator</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Video Topic *</Label>
                <Input placeholder="e.g., How to edit videos with DaVinci Resolve" value={titleTopic} onChange={e => setTitleTopic(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Target Keywords</Label>
                <Input placeholder="e.g., video editing, DaVinci Resolve, tutorial" value={titleKeywords} onChange={e => setTitleKeywords(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tone</Label>
                <Select value={titleTone} onValueChange={setTitleTone}>
                  <SelectTrigger><SelectValue placeholder="Select tone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="engaging">Engaging & Click-worthy</SelectItem>
                    <SelectItem value="educational">Educational & Informative</SelectItem>
                    <SelectItem value="provocative">Provocative & Bold</SelectItem>
                    <SelectItem value="casual">Casual & Fun</SelectItem>
                    <SelectItem value="professional">Professional & Authority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={generateTitles} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate Titles
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Results</CardTitle></CardHeader>
            <CardContent>
              {titles.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Generate titles to see results here</p>
              ) : (
                <div className="space-y-3">
                  {titles.map((t, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <ScoreBadge score={t.score} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t.reason}</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => copyToClipboard(t.title)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Descriptions Tab */}
      {activeTab === 'descriptions' && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Description Generator</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Video Title *</Label>
                <Input placeholder="Your video title" value={descTitle} onChange={e => setDescTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Topic / Summary</Label>
                <Input placeholder="Brief summary of content" value={descTopic} onChange={e => setDescTopic(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Target Keywords</Label>
                <Input placeholder="SEO keywords" value={descKeywords} onChange={e => setDescKeywords(e.target.value)} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={descTimestamps} onChange={e => setDescTimestamps(e.target.checked)} className="rounded" />
                  Timestamps
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={descCTA} onChange={e => setDescCTA(e.target.checked)} className="rounded" />
                  Call-to-Action
                </label>
              </div>
              <Button onClick={generateDescription} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate Description
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Result</CardTitle>
                {description && (
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(description)}>
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!description ? (
                <p className="text-muted-foreground text-center py-8">Generate a description to see results here</p>
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{description}</pre>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scripts Tab */}
      {activeTab === 'scripts' && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Script Writer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Video Title *</Label>
                <Input placeholder="Your video title" value={scriptTitle} onChange={e => setScriptTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={scriptDuration} onValueChange={setScriptDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (1-3 min)</SelectItem>
                    <SelectItem value="medium">Medium (5-10 min)</SelectItem>
                    <SelectItem value="long">Long (15-25 min)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Style</Label>
                <Input placeholder="e.g., educational, storytelling, vlog" value={scriptStyle} onChange={e => setScriptStyle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Key Points</Label>
                <Textarea placeholder="Main points to cover (one per line)" value={scriptKeyPoints} onChange={e => setScriptKeyPoints(e.target.value)} rows={3} />
              </div>
              <Button onClick={generateScript} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate Script
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Script</CardTitle>
                {script && (
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(script)}>
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!script ? (
                <p className="text-muted-foreground text-center py-8">Generate a script to see results here</p>
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed max-h-[600px] overflow-y-auto">{script}</pre>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tags Tab */}
      {activeTab === 'tags' && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Tag Generator</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Video Title *</Label>
                <Input placeholder="Your video title" value={tagsTitle} onChange={e => setTagsTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Niche</Label>
                <Input placeholder="e.g., tech, fitness, cooking" value={tagsNiche} onChange={e => setTagsNiche(e.target.value)} />
              </div>
              <Button onClick={generateTags} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate Tags
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Tags ({tags.length})</CardTitle>
                {tags.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(tags.map(t => t.tag).join(', '))}>
                    <Copy className="h-4 w-4 mr-1" /> Copy All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {tags.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Generate tags to see results here</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => copyToClipboard(t.tag)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm hover:bg-muted transition-colors"
                    >
                      {t.tag}
                      <VolumeBadge volume={t.volume} />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Thumbnails Tab */}
      {activeTab === 'thumbnails' && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Generate Thumbnails</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Video Title *</Label>
                  <Input placeholder="Your video title" value={thumbTitle} onChange={e => setThumbTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Input placeholder="e.g., bold text, dark background, minimal" value={thumbStyle} onChange={e => setThumbStyle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Brand Colors</Label>
                  <Input placeholder="e.g., red, black, white" value={thumbColors} onChange={e => setThumbColors(e.target.value)} />
                </div>
                <Button onClick={generateThumbnails} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generate Thumbnails
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Analyze Thumbnail</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Upload Image</Label>
                  <Input type="file" accept="image/*" onChange={handleThumbUpload} />
                </div>
                {thumbImage && (
                  <img src={thumbImage} alt="Thumbnail preview" className="w-full rounded-lg border" />
                )}
                <Button onClick={analyzeThumbnail} disabled={loading || !thumbImage} variant="outline" className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Analyze
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Results</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {thumbAnalysis && (
                <div className="space-y-3">
                  <h3 className="font-semibold">Analysis Scores</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {['face_score', 'text_score', 'contrast_score', 'composition_score', 'brand_score', 'overall_score'].map(key => (
                      <div key={key} className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm capitalize">{key.replace('_score', '').replace('_', ' ')}</span>
                        <ScoreBadge score={thumbAnalysis[key] as number} />
                      </div>
                    ))}
                  </div>
                  {(thumbAnalysis.tips as string[])?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Tips</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        {(thumbAnalysis.tips as string[]).map((tip, i) => (
                          <li key={i}>• {tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {thumbnails.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold">Generated Thumbnails</h3>
                  <div className="grid gap-4">
                    {thumbnails.map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} alt={`Thumbnail ${i + 1}`} className="w-full rounded-lg border" />
                        <a
                          href={src}
                          download={`thumbnail-${i + 1}.png`}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Button size="icon" variant="secondary"><Download className="h-4 w-4" /></Button>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!thumbAnalysis && thumbnails.length === 0 && (
                <p className="text-muted-foreground text-center py-8">Generate or analyze thumbnails to see results here</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ideas Tab */}
      {activeTab === 'ideas' && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Video Ideas Generator</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Niche *</Label>
                <Input placeholder="e.g., tech reviews, fitness, cooking" value={ideasNiche} onChange={e => setIdeasNiche(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Channel Name</Label>
                <Input placeholder="Your channel name" value={ideasChannel} onChange={e => setIdeasChannel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Top Videos (one per line)</Label>
                <Textarea placeholder="Paste your best-performing video titles for reference" value={ideasTopVideos} onChange={e => setIdeasTopVideos(e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Number of Ideas</Label>
                <Select value={ideasCount} onValueChange={setIdeasCount}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 ideas</SelectItem>
                    <SelectItem value="10">10 ideas</SelectItem>
                    <SelectItem value="15">15 ideas</SelectItem>
                    <SelectItem value="20">20 ideas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={generateIdeas} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lightbulb className="h-4 w-4 mr-2" />}
                Generate Ideas
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Video Ideas ({ideas.length})</CardTitle></CardHeader>
            <CardContent>
              {ideas.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Generate ideas to see results here</p>
              ) : (
                <div className="space-y-3">
                  {ideas.map((idea, i) => (
                    <div key={i} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{idea.title}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="outline">{idea.format}</Badge>
                            <Badge className={
                              idea.difficulty === 'easy' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              idea.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                              'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }>{idea.difficulty}</Badge>
                            <span className="text-xs text-muted-foreground">Trend: <ScoreBadge score={idea.trendScore} /></span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">{idea.reason}</p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => copyToClipboard(idea.title)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Remix Tab */}
      {activeTab === 'remix' && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Shuffle className="h-4 w-4" /> Content Remixer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Video Title *</Label>
                <Input placeholder="Title of the video to remix" value={remixTitle} onChange={e => setRemixTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Video URL</Label>
                <Input placeholder="https://youtube.com/watch?v=..." value={remixUrl} onChange={e => setRemixUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Your Channel Niche</Label>
                <Input placeholder="e.g., tech, fitness, cooking" value={remixNiche} onChange={e => setRemixNiche(e.target.value)} />
              </div>
              <Button onClick={generateRemixes} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shuffle className="h-4 w-4 mr-2" />}
                Generate Remixes
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Remix Ideas ({remixes.length})</CardTitle></CardHeader>
            <CardContent>
              {remixes.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Enter a video to remix and see ideas here</p>
              ) : (
                <div className="space-y-3">
                  {remixes.map((remix, i) => (
                    <div key={i} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{remix.title}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="outline" className="capitalize">{remix.angle.replace('-', ' ')}</Badge>
                            <Badge variant="secondary">{remix.format}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5 italic">&quot;{remix.hook}&quot;</p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => copyToClipboard(remix.title)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SEO Checklist Tab */}
      {activeTab === 'seo' && (
        <div className="grid gap-6 md:grid-cols-[1fr_1.5fr]">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CheckSquare className="h-4 w-4" /> SEO Checklist</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Video Title *</Label>
                <Input placeholder="Your video title" value={seoTitle} onChange={e => setSeoTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Your video description" value={seoDescription} onChange={e => setSeoDescription(e.target.value)} rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Textarea placeholder="tag1, tag2, tag3, ..." value={seoTags} onChange={e => setSeoTags(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Thumbnail URL</Label>
                <Input placeholder="https://..." value={seoThumbUrl} onChange={e => setSeoThumbUrl(e.target.value)} />
              </div>
              <Button onClick={runSeoChecklist} disabled={loading} className="w-full bg-red-600 hover:bg-red-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckSquare className="h-4 w-4 mr-2" />}
                Run SEO Check
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Results</CardTitle>
                {seoScore !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Score:</span>
                    <span className={`text-2xl font-bold ${seoScore >= 80 ? 'text-green-500' : seoScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                      {seoScore}%
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {seoItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Run an SEO check to see results here</p>
              ) : (
                <div className="space-y-2">
                  {seoItems.map((item, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${item.passed ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'}`}>
                      <div className="mt-0.5">
                        {item.passed ? (
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.check}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.tip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
