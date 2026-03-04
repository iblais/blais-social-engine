'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Eye, Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';

interface PostWithMetrics {
  id: string;
  caption: string;
  status: string;
  platform: string;
  published_at: string | null;
  post_metrics: { impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; engagement_rate: number }[];
}

export default function AnalyticsPage() {
  const [posts, setPosts] = useState<PostWithMetrics[]>([]);
  const [totals, setTotals] = useState({ impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 });
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('posts')
      .select('id, caption, status, platform, published_at, post_metrics(impressions, reach, likes, comments, shares, saves, engagement_rate)')
      .eq('status', 'posted')
      .order('published_at', { ascending: false })
      .limit(50);

    const list = (data || []) as PostWithMetrics[];
    setPosts(list);

    const t = { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
    list.forEach(p => {
      const m = p.post_metrics?.[0];
      if (m) {
        t.impressions += m.impressions;
        t.reach += m.reach;
        t.likes += m.likes;
        t.comments += m.comments;
        t.shares += m.shares;
        t.saves += m.saves;
      }
    });
    setTotals(t);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const kpis = [
    { title: 'Impressions', value: totals.impressions, icon: Eye },
    { title: 'Reach', value: totals.reach, icon: TrendingUp },
    { title: 'Likes', value: totals.likes, icon: Heart },
    { title: 'Comments', value: totals.comments, icon: MessageCircle },
    { title: 'Shares', value: totals.shares, icon: Share2 },
    { title: 'Saves', value: totals.saves, icon: Bookmark },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Track your post performance across platforms</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map(k => (
          <Card key={k.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{k.title}</CardTitle>
              <k.icon className="h-3.5 w-3.5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{k.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Top Posts</CardTitle></CardHeader>
        <CardContent>
          {!posts.length ? (
            <p className="text-muted-foreground text-center py-8">No published posts with metrics yet. Metrics are collected after posts are published.</p>
          ) : (
            <div className="space-y-3">
              {posts.map(p => {
                const m = p.post_metrics?.[0];
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.caption?.substring(0, 80) || 'No caption'}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.platform} &middot; {p.published_at ? new Date(p.published_at).toLocaleDateString() : '—'}</p>
                    </div>
                    {m ? (
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{m.likes}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{m.comments}</span>
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{m.reach}</span>
                        <Badge variant="secondary" className="text-xs">{(m.engagement_rate * 100).toFixed(1)}%</Badge>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-xs">No metrics</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
