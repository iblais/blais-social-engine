'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Eye, Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';

interface PostWithMetrics {
  id: string;
  caption: string;
  status: string;
  platform: string;
  published_at: string | null;
  post_metrics: { impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; engagement_rate: number }[];
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  bluesky: '#0085FF',
  twitter: '#000000',
  youtube: '#FF0000',
  tiktok: '#000000',
  pinterest: '#E60023',
  linkedin: '#0A66C2',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  bluesky: 'Bluesky',
  twitter: 'Twitter/X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  linkedin: 'LinkedIn',
};

export default function AnalyticsPage() {
  const [posts, setPosts] = useState<PostWithMetrics[]>([]);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const { accountIds, activeBrandId } = useBrandAccounts();
  const supabase = createClient();

  const load = useCallback(async () => {
    let query = supabase
      .from('posts')
      .select('id, caption, status, platform, published_at, post_metrics(impressions, reach, likes, comments, shares, saves, engagement_rate)')
      .eq('status', 'posted')
      .order('published_at', { ascending: false })
      .limit(200);

    if (activeBrandId && accountIds.length) {
      query = query.in('account_id', accountIds);
    }

    const { data } = await query;
    setPosts((data || []) as PostWithMetrics[]);
  }, [supabase, activeBrandId, accountIds]);

  useEffect(() => { load(); }, [load]);

  // Get unique platforms from the data
  const platforms = useMemo(() => {
    const set = new Set(posts.map(p => p.platform));
    return Array.from(set).sort();
  }, [posts]);

  // Filter posts by platform
  const filtered = useMemo(() => {
    if (!activePlatform) return posts;
    return posts.filter(p => p.platform === activePlatform);
  }, [posts, activePlatform]);

  // Compute totals for filtered posts
  const totals = useMemo(() => {
    const t = { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
    filtered.forEach(p => {
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
    return t;
  }, [filtered]);

  // Per-platform summary for the breakdown section
  const platformBreakdown = useMemo(() => {
    const map: Record<string, { posts: number; likes: number; comments: number; reach: number; avgEngagement: number }> = {};
    posts.forEach(p => {
      if (!map[p.platform]) map[p.platform] = { posts: 0, likes: 0, comments: 0, reach: 0, avgEngagement: 0 };
      map[p.platform].posts++;
      const m = p.post_metrics?.[0];
      if (m) {
        map[p.platform].likes += m.likes;
        map[p.platform].comments += m.comments;
        map[p.platform].reach += m.reach;
        map[p.platform].avgEngagement += m.engagement_rate;
      }
    });
    // Calculate average engagement
    Object.keys(map).forEach(k => {
      if (map[k].posts > 0) map[k].avgEngagement = map[k].avgEngagement / map[k].posts;
    });
    return map;
  }, [posts]);

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

      {/* Platform filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setActivePlatform(null)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            !activePlatform ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground bg-muted hover:bg-muted/80'
          }`}
        >
          All Platforms
        </button>
        {platforms.map(plat => (
          <button
            key={plat}
            onClick={() => setActivePlatform(plat)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              activePlatform === plat ? 'text-white shadow-sm' : 'text-muted-foreground bg-muted hover:bg-muted/80'
            }`}
            style={activePlatform === plat ? { backgroundColor: PLATFORM_COLORS[plat] || '#888' } : undefined}
          >
            {PLATFORM_LABELS[plat] || plat}
          </button>
        ))}
      </div>

      {/* KPI cards */}
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

      {/* Platform breakdown (only show when "All Platforms" is active) */}
      {!activePlatform && platforms.length > 1 && (
        <Card>
          <CardHeader><CardTitle>Platform Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {platforms.map(plat => {
                const s = platformBreakdown[plat];
                if (!s) return null;
                return (
                  <div key={plat} className="p-3 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[plat] || '#888' }} />
                      <span className="font-medium text-sm">{PLATFORM_LABELS[plat] || plat}</span>
                      <Badge variant="secondary" className="text-xs ml-auto">{s.posts} posts</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><Heart className="h-3 w-3" />{s.likes.toLocaleString()}</div>
                      <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{s.comments.toLocaleString()}</div>
                      <div className="flex items-center gap-1"><Eye className="h-3 w-3" />{s.reach.toLocaleString()}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Avg engagement: {(s.avgEngagement * 100).toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Post list */}
      <Card>
        <CardHeader><CardTitle>Top Posts {activePlatform ? `- ${PLATFORM_LABELS[activePlatform]}` : ''}</CardTitle></CardHeader>
        <CardContent>
          {!filtered.length ? (
            <p className="text-muted-foreground text-center py-8">No published posts with metrics yet.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map(p => {
                const m = p.post_metrics?.[0];
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.caption?.substring(0, 80) || 'No caption'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p.platform] || '#888' }} />
                        <p className="text-xs text-muted-foreground capitalize">{PLATFORM_LABELS[p.platform] || p.platform} &middot; {p.published_at ? new Date(p.published_at).toLocaleDateString() : '—'}</p>
                      </div>
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
