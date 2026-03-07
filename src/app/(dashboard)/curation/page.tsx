'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import {
  Plus,
  Trash2,
  Rss,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PenSquare,
  Globe,
} from 'lucide-react';

interface Feed {
  id: string;
  user_id: string;
  brand_id: string | null;
  name: string;
  url: string;
  last_fetched_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface CuratedItem {
  id: string;
  feed_id: string;
  user_id: string;
  brand_id: string | null;
  title: string;
  url: string;
  summary: string | null;
  image_url: string | null;
  source: string | null;
  is_saved: boolean;
  is_used: boolean;
  created_at: string;
}

type ContentFilter = 'all' | 'saved' | 'used';

export default function CurationPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { activeBrandId } = useBrandAccounts();

  const [tab, setTab] = useState('feeds');

  // Feeds state
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);

  // Content state
  const [content, setContent] = useState<CuratedItem[]>([]);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // ---------- Feeds ----------

  const loadFeeds = useCallback(async () => {
    setFeedsLoading(true);
    let query = supabase
      .from('content_feeds')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeBrandId) {
      query = query.eq('brand_id', activeBrandId);
    }

    const { data, error } = await query;
    if (error) toast.error(error.message);
    setFeeds(data || []);
    setFeedsLoading(false);
  }, [supabase, activeBrandId]);

  const addFeed = async () => {
    if (!newName.trim() || !newUrl.trim()) {
      toast.error('Name and URL are required');
      return;
    }
    setAdding(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Not authenticated');
      setAdding(false);
      return;
    }
    const { error } = await supabase.from('content_feeds').insert({
      user_id: user.id,
      brand_id: activeBrandId || null,
      name: newName.trim(),
      url: newUrl.trim(),
      is_active: true,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Feed added');
      setNewName('');
      setNewUrl('');
      setAddOpen(false);
      loadFeeds();
    }
    setAdding(false);
  };

  const toggleFeedActive = async (feed: Feed) => {
    const { error } = await supabase
      .from('content_feeds')
      .update({ is_active: !feed.is_active })
      .eq('id', feed.id);
    if (error) toast.error(error.message);
    else setFeeds((prev) => prev.map((f) => (f.id === feed.id ? { ...f, is_active: !f.is_active } : f)));
  };

  const deleteFeed = async (id: string) => {
    const { error } = await supabase.from('content_feeds').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Feed deleted');
      setFeeds((prev) => prev.filter((f) => f.id !== id));
    }
  };

  // ---------- Content ----------

  const loadContent = useCallback(async () => {
    setContentLoading(true);
    let query = supabase
      .from('curated_content')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (activeBrandId) {
      query = query.eq('brand_id', activeBrandId);
    }

    const { data, error } = await query;
    if (error) toast.error(error.message);
    setContent(data || []);
    setContentLoading(false);
  }, [supabase, activeBrandId]);

  const toggleSaved = async (item: CuratedItem) => {
    const { error } = await supabase
      .from('curated_content')
      .update({ is_saved: !item.is_saved })
      .eq('id', item.id);
    if (error) toast.error(error.message);
    else setContent((prev) => prev.map((c) => (c.id === item.id ? { ...c, is_saved: !c.is_saved } : c)));
  };

  const toggleUsed = async (item: CuratedItem) => {
    const { error } = await supabase
      .from('curated_content')
      .update({ is_used: !item.is_used })
      .eq('id', item.id);
    if (error) toast.error(error.message);
    else setContent((prev) => prev.map((c) => (c.id === item.id ? { ...c, is_used: !c.is_used } : c)));
  };

  const createPost = (item: CuratedItem) => {
    const caption = `${item.title}\n\n${item.summary || ''}\n\nSource: ${item.url}`.trim();
    router.push(`/compose?caption=${encodeURIComponent(caption)}`);
  };

  // ---------- Derived ----------

  const sources = useMemo(() => {
    const set = new Set(content.map((c) => c.source).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [content]);

  const filteredContent = useMemo(() => {
    let items = content;
    if (contentFilter === 'saved') items = items.filter((c) => c.is_saved);
    if (contentFilter === 'used') items = items.filter((c) => c.is_used);
    if (sourceFilter !== 'all') items = items.filter((c) => c.source === sourceFilter);
    return items;
  }, [content, contentFilter, sourceFilter]);

  // ---------- Effects ----------

  useEffect(() => {
    loadFeeds();
    loadContent();
  }, [loadFeeds, loadContent]);

  // ---------- Render ----------

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Curation</h1>
          <p className="text-sm text-muted-foreground">Manage RSS feeds and curate content for posts</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="feeds" className="gap-2">
            <Rss className="h-4 w-4" />
            Feeds
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-2">
            <Globe className="h-4 w-4" />
            Content
          </TabsTrigger>
        </TabsList>

        {/* ===== FEEDS TAB ===== */}
        <TabsContent value="feeds" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Feed
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add RSS Feed</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      placeholder="e.g. TechCrunch"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Feed URL</label>
                    <Input
                      placeholder="https://example.com/feed.xml"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                    />
                  </div>
                  <Button onClick={addFeed} disabled={adding} className="w-full">
                    {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Feed
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {feedsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : feeds.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Rss className="mb-4 h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">No feeds yet. Add an RSS feed to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {feeds.map((feed) => (
                <Card key={feed.id}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="min-w-0 flex-1 pr-2">
                      <CardTitle className="truncate text-base">{feed.name}</CardTitle>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{feed.url}</p>
                    </div>
                    <Switch
                      checked={feed.is_active}
                      onCheckedChange={() => toggleFeedActive(feed)}
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {feed.last_fetched_at
                          ? `Fetched ${new Date(feed.last_fetched_at).toLocaleDateString()}`
                          : 'Never fetched'}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteFeed(feed.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== CONTENT TAB ===== */}
        <TabsContent value="content" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-lg border p-1">
              {(['all', 'saved', 'used'] as ContentFilter[]).map((f) => (
                <Button
                  key={f}
                  variant={contentFilter === f ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setContentFilter(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
            {sources.length > 0 && (
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">All Sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredContent.length} item{filteredContent.length !== 1 ? 's' : ''}
            </span>
          </div>

          {contentLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredContent.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="mb-4 h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {content.length === 0
                    ? 'No curated content yet. Add feeds and fetch content to populate this view.'
                    : 'No items match the current filters.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredContent.map((item) => (
                <Card key={item.id} className="flex flex-col">
                  {item.image_url && (
                    <div className="relative aspect-video w-full overflow-hidden rounded-t-lg">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-2">
                      <CardTitle className="line-clamp-2 flex-1 text-sm leading-snug">
                        {item.title}
                      </CardTitle>
                      <div className="flex shrink-0 gap-1">
                        {item.is_saved && (
                          <Badge variant="secondary" className="text-xs">
                            Saved
                          </Badge>
                        )}
                        {item.is_used && (
                          <Badge variant="outline" className="text-xs">
                            Used
                          </Badge>
                        )}
                      </div>
                    </div>
                    {item.source && (
                      <p className="text-xs text-muted-foreground">{item.source}</p>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-3">
                    {item.summary && (
                      <p className="line-clamp-3 text-sm text-muted-foreground">{item.summary}</p>
                    )}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={item.is_saved ? 'Unsave' : 'Save'}
                        onClick={() => toggleSaved(item)}
                      >
                        {item.is_saved ? (
                          <BookmarkCheck className="h-4 w-4 text-primary" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={item.is_used ? 'Mark unused' : 'Mark as used'}
                        onClick={() => toggleUsed(item)}
                      >
                        <CheckCircle2
                          className={`h-4 w-4 ${item.is_used ? 'text-green-500' : ''}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Create Post"
                        onClick={() => createPost(item)}
                      >
                        <PenSquare className="h-4 w-4" />
                      </Button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto"
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Open source">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
