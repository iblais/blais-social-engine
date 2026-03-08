'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  Copy,
  Search,
  CheckCircle2,
  XCircle,
  Upload,
  Tags,
  ShieldCheck,
} from 'lucide-react';

interface CheckItem {
  label: string;
  passed: boolean;
  tip: string;
}

interface TagResult {
  videoTitle: string;
  channelName: string;
  tags: string[];
}

function ScoreRing({ score }: { score: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/20"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          className="transition-all duration-700"
        />
      </svg>
      <span
        className="absolute text-2xl font-bold"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

export default function YouTubeSEOPage() {
  // SEO Checklist state
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoTags, setSeoTags] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoScore, setSeoScore] = useState<number | null>(null);
  const [seoChecklist, setSeoChecklist] = useState<CheckItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tag Copier state
  const [tagVideoId, setTagVideoId] = useState('');
  const [tagLoading, setTagLoading] = useState(false);
  const [tagResult, setTagResult] = useState<TagResult | null>(null);

  async function runSEOCheck() {
    if (!seoTitle.trim()) { toast.error('Enter a video title'); return; }
    setSeoLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', seoTitle.trim());
      formData.append('description', seoDescription.trim());
      formData.append('tags', seoTags.trim());
      if (thumbnailFile) {
        formData.append('thumbnail', thumbnailFile);
      }

      const res = await fetch('/api/ai/seo-checklist', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SEO check failed');
      setSeoScore(data.score ?? 0);
      setSeoChecklist(data.checklist || []);
      toast.success(`SEO Score: ${data.score}/100`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSeoLoading(false);
  }

  function extractVideoId(input: string): string {
    const trimmed = input.trim();
    // Handle full URLs
    const urlMatch = trimmed.match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (urlMatch) return urlMatch[1];
    // Assume raw ID if 11 chars
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    return trimmed;
  }

  async function copyTags() {
    if (!tagVideoId.trim()) { toast.error('Enter a video URL or ID'); return; }
    const videoId = extractVideoId(tagVideoId);
    setTagLoading(true);
    try {
      const res = await fetch(`/api/youtube/video-tags?videoId=${encodeURIComponent(videoId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tags');
      setTagResult({
        videoTitle: data.title || 'Unknown',
        channelName: data.channel || 'Unknown',
        tags: data.tags || [],
      });
      toast.success(`Found ${data.tags?.length || 0} tags`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setTagLoading(false);
  }

  function copyAllTags() {
    if (!tagResult?.tags.length) return;
    navigator.clipboard.writeText(tagResult.tags.join(', '));
    toast.success('All tags copied to clipboard');
  }

  function copyTag(tag: string) {
    navigator.clipboard.writeText(tag);
    toast.success('Tag copied');
  }

  return (
    <div className="space-y-8 p-6">
      <Link href="/youtube" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
        <ArrowLeft className="h-4 w-4" /> Back to YouTube Studio
      </Link>
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-green-500" />
          SEO Optimization
        </h1>
        <p className="text-muted-foreground mt-1">Check your video SEO and steal competitor tags</p>
      </div>

      {/* SEO Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-500" />
            SEO Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="seoTitle">Video Title *</Label>
              <Input
                id="seoTitle"
                placeholder="Your video title..."
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seoTags">Tags (comma-separated)</Label>
              <Input
                id="seoTags"
                placeholder="tag1, tag2, tag3..."
                value={seoTags}
                onChange={(e) => setSeoTags(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seoDescription">Description</Label>
            <Textarea
              id="seoDescription"
              placeholder="Your video description..."
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>Thumbnail</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {thumbnailFile ? thumbnailFile.name : 'Upload Thumbnail'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
              />
              {thumbnailFile && (
                <Button variant="ghost" size="sm" onClick={() => setThumbnailFile(null)}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          <Button onClick={runSEOCheck} disabled={seoLoading}>
            {seoLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Run SEO Check
          </Button>

          {seoScore !== null && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-6">
                <ScoreRing score={seoScore} />
                <div>
                  <h3 className="text-lg font-semibold">Overall SEO Score</h3>
                  <p className="text-sm text-muted-foreground">
                    {seoScore >= 80 ? 'Great! Your video is well optimized.' :
                     seoScore >= 60 ? 'Good, but there is room for improvement.' :
                     'Needs work. Review the checklist below.'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {seoChecklist.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                    {item.passed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.tip}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tag Copier */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-purple-500" />
            Tag Copier
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="tagVideoId">Video URL or ID</Label>
              <Input
                id="tagVideoId"
                placeholder="https://youtube.com/watch?v=... or video ID"
                value={tagVideoId}
                onChange={(e) => setTagVideoId(e.target.value)}
              />
            </div>
            <Button onClick={copyTags} disabled={tagLoading}>
              {tagLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
              Copy Tags
            </Button>
          </div>

          {tagResult && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{tagResult.videoTitle}</p>
                  <p className="text-sm text-muted-foreground">{tagResult.channelName}</p>
                </div>
                {tagResult.tags.length > 0 && (
                  <Button variant="outline" size="sm" onClick={copyAllTags}>
                    <Copy className="h-3.5 w-3.5 mr-2" />
                    Copy All
                  </Button>
                )}
              </div>
              {tagResult.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tagResult.tags.map((tag, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => copyTag(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tags found for this video.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
