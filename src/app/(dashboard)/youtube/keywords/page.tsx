'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  Search,
  ChevronRight,
  TrendingUp,
  Copy,
  Plus,
  X,
  Youtube,
} from 'lucide-react';

interface Keyword {
  keyword: string;
  volume: string;
  competition: string;
}

function VolumeBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  };
  return <Badge className={colors[level] || colors.low}>{level}</Badge>;
}

function CompBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    medium: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };
  return <Badge className={colors[level] || colors.low}>{level}</Badge>;
}

export default function YouTubeKeywordsPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [savedKeywords, setSavedKeywords] = useState<Keyword[]>([]);
  const [history, setHistory] = useState<string[]>([]);

  async function searchKeywords(searchQuery?: string) {
    const q = searchQuery || query;
    if (!q.trim()) { toast.error('Enter a keyword'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/youtube/keyword-suggest?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKeywords(data.keywords || []);
      if (!history.includes(q)) setHistory(prev => [q, ...prev].slice(0, 20));
      toast.success(`Found ${data.keywords?.length || 0} suggestions`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setLoading(false);
  }

  function saveKeyword(kw: Keyword) {
    if (savedKeywords.some(s => s.keyword === kw.keyword)) return;
    setSavedKeywords(prev => [...prev, kw]);
    toast.success('Keyword saved');
  }

  function removeKeyword(keyword: string) {
    setSavedKeywords(prev => prev.filter(k => k.keyword !== keyword));
  }

  function expandKeyword(kw: string) {
    setQuery(kw);
    searchKeywords(kw);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Link href="/youtube" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
        <ArrowLeft className="h-4 w-4" /> Back to YouTube Studio
      </Link>
      <div className="flex items-center gap-3">
        <Youtube className="h-8 w-8 text-red-500" />
        <div>
          <h1 className="text-2xl font-bold">Keyword Research</h1>
          <p className="text-muted-foreground">Discover YouTube search terms and opportunities</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter a seed keyword (e.g., video editing tutorial)"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchKeywords()}
                className="pl-10"
              />
            </div>
            <Button onClick={() => searchKeywords()} disabled={loading} className="bg-red-600 hover:bg-red-700">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {history.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {history.map(h => (
                <button
                  key={h}
                  onClick={() => expandKeyword(h)}
                  className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
        {/* Results */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Suggestions ({keywords.length})</CardTitle>
              {keywords.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(keywords.map(k => k.keyword).join('\n'));
                    toast.success('Copied all keywords');
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" /> Copy All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {keywords.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Search for a keyword to see suggestions</p>
            ) : (
              <div className="space-y-2">
                {keywords.map((kw, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <button
                      onClick={() => expandKeyword(kw.keyword)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Expand this keyword"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <span className="flex-1 text-sm font-medium">{kw.keyword}</span>
                    <div className="flex items-center gap-2">
                      {kw.volume !== 'unknown' && (
                        <div className="text-center">
                          <p className="text-[10px] text-muted-foreground">Volume</p>
                          <VolumeBadge level={kw.volume} />
                        </div>
                      )}
                      {kw.competition !== 'unknown' && (
                        <div className="text-center">
                          <p className="text-[10px] text-muted-foreground">Comp</p>
                          <CompBadge level={kw.competition} />
                        </div>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => saveKeyword(kw)}
                        disabled={savedKeywords.some(s => s.keyword === kw.keyword)}
                        className="h-8 w-8"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Saved Keywords */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Saved Keywords ({savedKeywords.length})
              </CardTitle>
              {savedKeywords.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(savedKeywords.map(k => k.keyword).join('\n'));
                    toast.success('Copied saved keywords');
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {savedKeywords.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">
                Click + on suggestions to save keywords to your list
              </p>
            ) : (
              <div className="space-y-2">
                {savedKeywords.map((kw, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                    <span className="flex-1 text-sm">{kw.keyword}</span>
                    {kw.volume !== 'unknown' && <VolumeBadge level={kw.volume} />}
                    <button onClick={() => removeKeyword(kw.keyword)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
