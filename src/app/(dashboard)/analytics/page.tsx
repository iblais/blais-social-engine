'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Award,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import { format, subDays, isAfter, parseISO, getDay, getHours } from 'date-fns';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';

interface Post {
  id: string;
  caption: string;
  status: string;
  platform: string;
  published_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  post_metrics?: PostMetric[];
}

interface PostMetric {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement_rate: number;
}

interface AccountMetric {
  account_id: string;
  followers: number;
  following: number;
  posts_count: number;
  engagement_rate: number;
  collected_at: string;
  platform?: string;
  username?: string;
}

type DateRange = '7' | '30' | '90' | 'all';
type SortKey = 'date' | 'status' | 'platform';
type SortDir = 'asc' | 'desc';

const STATUS_COLORS: Record<string, string> = {
  posted: 'bg-green-500/20 text-green-400',
  scheduled: 'bg-blue-500/20 text-blue-400',
  failed: 'bg-red-500/20 text-red-400',
  retry: 'bg-yellow-500/20 text-yellow-400',
  draft: 'bg-gray-500/20 text-gray-400',
  publishing: 'bg-purple-500/20 text-purple-400',
};

const STATUS_BAR_COLORS: Record<string, string> = {
  posted: '#22c55e',
  scheduled: '#3b82f6',
  failed: '#ef4444',
  draft: '#6b7280',
  retry: '#eab308',
  publishing: '#a855f7',
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  bluesky: '#0085FF',
  twitter: '#1DA1F2',
  youtube: '#FF0000',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  bluesky: 'Bluesky',
  twitter: 'Twitter/X',
  youtube: 'YouTube',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AnalyticsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [accountMetrics, setAccountMetrics] = useState<AccountMetric[]>([]);
  const { accountIds, activeBrandId } = useBrandAccounts();
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    let query = supabase
      .from('posts')
      .select('id, caption, status, platform, published_at, scheduled_at, created_at, post_metrics(impressions, reach, likes, comments, shares, saves, engagement_rate)')
      .order('scheduled_at', { ascending: false })
      .limit(500);

    if (activeBrandId && accountIds.length) {
      query = query.in('account_id', accountIds);
    }

    const [postsRes, metricsRes] = await Promise.all([
      query,
      supabase
        .from('account_metrics')
        .select('*, social_accounts(platform, username)')
        .order('collected_at', { ascending: false })
        .limit(200),
    ]);

    setPosts((postsRes.data || []) as Post[]);

    if (metricsRes.data?.length) {
      setAccountMetrics(metricsRes.data.map((m: any) => ({
        ...m,
        platform: m.social_accounts?.platform,
        username: m.social_accounts?.username,
      })));
    }
  }, [supabase, activeBrandId, accountIds]);

  useEffect(() => { load(); }, [load]);

  // Filter by date range
  const dateFiltered = useMemo(() => {
    if (dateRange === 'all') return posts;
    const days = parseInt(dateRange);
    const cutoff = subDays(new Date(), days);
    return posts.filter(p => {
      const d = p.scheduled_at || p.published_at || p.created_at;
      return d && isAfter(parseISO(d), cutoff);
    });
  }, [posts, dateRange]);

  // Filter by platform
  const filtered = useMemo(() => {
    if (!activePlatform) return dateFiltered;
    return dateFiltered.filter(p => p.platform === activePlatform);
  }, [dateFiltered, activePlatform]);

  // Unique platforms from data
  const platforms = useMemo(() => {
    const set = new Set(dateFiltered.map(p => p.platform));
    return Array.from(set).sort();
  }, [dateFiltered]);

  // --- Engagement totals from post_metrics ---
  const engagementTotals = useMemo(() => {
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalSaves = 0, totalImpressions = 0, totalReach = 0;
    let postsWithMetrics = 0;
    filtered.forEach(p => {
      const m = (p as any).post_metrics?.[0];
      if (m) {
        totalLikes += m.likes || 0;
        totalComments += m.comments || 0;
        totalShares += m.shares || 0;
        totalSaves += m.saves || 0;
        totalImpressions += m.impressions || 0;
        totalReach += m.reach || 0;
        postsWithMetrics++;
      }
    });
    const avgEngagement = totalReach > 0
      ? (((totalLikes + totalComments + totalShares + totalSaves) / totalReach) * 100).toFixed(2)
      : '0.00';
    return { totalLikes, totalComments, totalShares, totalSaves, totalImpressions, totalReach, postsWithMetrics, avgEngagement };
  }, [filtered]);

  // --- Latest account metrics per account ---
  const latestAccountMetrics = useMemo(() => {
    const map = new Map<string, AccountMetric>();
    accountMetrics.forEach(m => {
      if (!map.has(m.account_id)) map.set(m.account_id, m);
    });
    return Array.from(map.values());
  }, [accountMetrics]);

  const totalFollowers = useMemo(() => latestAccountMetrics.reduce((s, m) => s + (m.followers || 0), 0), [latestAccountMetrics]);

  // --- KPI calculations ---
  const kpis = useMemo(() => {
    const total = filtered.length;
    const published = filtered.filter(p => p.status === 'posted').length;
    const engagementRate = total > 0 ? ((published / total) * 100).toFixed(1) : '0.0';

    // Best day of week
    const dayCount: Record<number, number> = {};
    filtered.forEach(p => {
      const d = p.scheduled_at || p.published_at || p.created_at;
      if (d) {
        const day = getDay(parseISO(d));
        dayCount[day] = (dayCount[day] || 0) + 1;
      }
    });
    let bestDay = '--';
    let bestDayCount = 0;
    Object.entries(dayCount).forEach(([day, count]) => {
      if (count > bestDayCount) {
        bestDayCount = count;
        bestDay = DAY_LABELS[parseInt(day)];
      }
    });

    // Best platform
    const platCount: Record<string, number> = {};
    filtered.forEach(p => {
      platCount[p.platform] = (platCount[p.platform] || 0) + 1;
    });
    let bestPlatform = '--';
    let bestPlatCount = 0;
    Object.entries(platCount).forEach(([plat, count]) => {
      if (count > bestPlatCount) {
        bestPlatCount = count;
        bestPlatform = PLATFORM_LABELS[plat] || plat;
      }
    });

    return { total, published, engagementRate, bestDay, bestPlatform };
  }, [filtered]);

  // --- Posts Over Time chart data ---
  const chartData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    filtered.forEach(p => {
      const d = p.scheduled_at || p.published_at || p.created_at;
      if (!d) return;
      const dateKey = format(parseISO(d), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = {};
      map[dateKey][p.platform] = (map[dateKey][p.platform] || 0) + 1;
    });
    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    return sorted;
  }, [filtered]);

  const chartMax = useMemo(() => {
    let max = 0;
    chartData.forEach(([, platCounts]) => {
      const total = Object.values(platCounts).reduce((s, v) => s + v, 0);
      if (total > max) max = total;
    });
    return Math.max(max, 1);
  }, [chartData]);

  // --- Status Distribution ---
  const statusDist = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(p => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
    const total = filtered.length || 1;
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => ({
        status,
        count,
        pct: ((count / total) * 100).toFixed(1),
      }));
  }, [filtered]);

  // --- Platform Distribution ---
  const platformDist = useMemo(() => {
    const counts: Record<string, number> = {};
    dateFiltered.forEach(p => {
      counts[p.platform] = (counts[p.platform] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([platform, count]) => ({ platform, count }));
  }, [dateFiltered]);

  const platformMax = useMemo(() => {
    return Math.max(...platformDist.map(p => p.count), 1);
  }, [platformDist]);

  // --- Publishing Heatmap ---
  const heatmapData = useMemo(() => {
    // 7 days x 24 hours grid
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    filtered.forEach(p => {
      const d = p.scheduled_at || p.published_at || p.created_at;
      if (!d) return;
      const parsed = parseISO(d);
      const day = getDay(parsed);
      const hour = getHours(parsed);
      grid[day][hour]++;
      if (grid[day][hour] > max) max = grid[day][hour];
    });
    return { grid, max: Math.max(max, 1) };
  }, [filtered]);

  // --- Sorted post table ---
  const sortedPosts = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        const da = a.scheduled_at || a.published_at || a.created_at || '';
        const db = b.scheduled_at || b.published_at || b.created_at || '';
        cmp = da.localeCompare(db);
      } else if (sortKey === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortKey === 'platform') {
        cmp = a.platform.localeCompare(b.platform);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const formatPostDate = (p: Post) => {
    const d = p.scheduled_at || p.published_at || p.created_at;
    if (!d) return '--';
    return format(parseISO(d), 'MMM d, yyyy h:mm a');
  };

  return (
    <div className="space-y-6">
      {/* Header with date range */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Track your posting activity across platforms</p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Platform filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setActivePlatform(null)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            !activePlatform
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground bg-muted hover:bg-muted/80'
          }`}
        >
          All
        </button>
        {['instagram', 'facebook', 'bluesky', 'youtube'].map(plat => (
          <button
            key={plat}
            onClick={() => setActivePlatform(activePlatform === plat ? null : plat)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              activePlatform === plat
                ? 'text-white shadow-sm'
                : 'text-muted-foreground bg-muted hover:bg-muted/80'
            }`}
            style={
              activePlatform === plat
                ? { backgroundColor: PLATFORM_COLORS[plat] }
                : undefined
            }
          >
            {PLATFORM_LABELS[plat]}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Posts</CardTitle>
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Published</CardTitle>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.published}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Publish Rate</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.engagementRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Best Day</CardTitle>
            <Calendar className="h-3.5 w-3.5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.bestDay}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Best Platform</CardTitle>
            <Award className="h-3.5 w-3.5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">{kpis.bestPlatform}</div>
          </CardContent>
        </Card>
      </div>

      {/* Engagement Metrics */}
      {(engagementTotals.postsWithMetrics > 0 || latestAccountMetrics.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Engagement Metrics
          </h2>

          {/* Engagement KPIs */}
          {engagementTotals.postsWithMetrics > 0 && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'Likes', value: engagementTotals.totalLikes, color: 'text-pink-500' },
                { label: 'Comments', value: engagementTotals.totalComments, color: 'text-blue-500' },
                { label: 'Shares', value: engagementTotals.totalShares, color: 'text-green-500' },
                { label: 'Saves', value: engagementTotals.totalSaves, color: 'text-yellow-500' },
                { label: 'Impressions', value: engagementTotals.totalImpressions, color: 'text-purple-500' },
                { label: 'Reach', value: engagementTotals.totalReach, color: 'text-cyan-500' },
              ].map(kpi => (
                <Card key={kpi.label}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value.toLocaleString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Account follower cards */}
          {latestAccountMetrics.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {latestAccountMetrics.map(m => (
                <Card key={m.account_id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: PLATFORM_COLORS[m.platform || ''] || '#6B7280' }}
                      />
                      <span className="text-sm font-medium capitalize">{m.platform}</span>
                      <span className="text-xs text-muted-foreground">@{m.username}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Followers</p>
                        <p className="text-lg font-bold">{m.followers?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Following</p>
                        <p className="text-lg font-bold">{m.following?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Posts</p>
                        <p className="text-sm font-medium">{m.posts_count?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Updated</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(m.collected_at), 'MMM d, h:mm a')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Total followers banner */}
          {totalFollowers > 0 && (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Followers Across All Platforms</p>
                <p className="text-3xl font-bold">{totalFollowers.toLocaleString()}</p>
              </div>
              <p className="text-sm text-muted-foreground">{latestAccountMetrics.length} accounts tracked</p>
            </div>
          )}
        </div>
      )}

      {/* Posts Over Time - CSS bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posts Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No data for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-[2px] min-w-[400px]" style={{ height: 200 }}>
                {chartData.map(([dateKey, platCounts]) => {
                  const total = Object.values(platCounts).reduce((s, v) => s + v, 0);
                  const barHeight = (total / chartMax) * 100;
                  const segments = Object.entries(platCounts);
                  const isHovered = hoveredBar === dateKey;
                  return (
                    <div
                      key={dateKey}
                      className="flex-1 flex flex-col items-center justify-end relative group"
                      style={{ height: '100%', minWidth: 8, maxWidth: 40 }}
                      onMouseEnter={() => setHoveredBar(dateKey)}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      {/* Tooltip */}
                      {isHovered && (
                        <div className="absolute bottom-full mb-2 bg-popover border rounded-md shadow-lg px-2.5 py-1.5 text-xs z-50 whitespace-nowrap pointer-events-none">
                          <div className="font-medium mb-0.5">{format(parseISO(dateKey), 'MMM d')}</div>
                          {segments.map(([plat, count]) => (
                            <div key={plat} className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: PLATFORM_COLORS[plat] || '#888' }}
                              />
                              <span>{PLATFORM_LABELS[plat] || plat}: {count}</span>
                            </div>
                          ))}
                          <div className="border-t mt-1 pt-1 font-medium">Total: {total}</div>
                        </div>
                      )}
                      {/* Stacked bar */}
                      <div
                        className="w-full rounded-t-sm overflow-hidden transition-all duration-200"
                        style={{ height: `${barHeight}%`, minHeight: total > 0 ? 4 : 0 }}
                      >
                        {segments.map(([plat, count]) => {
                          const segPct = (count / total) * 100;
                          return (
                            <div
                              key={plat}
                              style={{
                                height: `${segPct}%`,
                                backgroundColor: PLATFORM_COLORS[plat] || '#888',
                                minHeight: 2,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* X-axis labels - show first, middle, last */}
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground min-w-[400px]">
                {chartData.length > 0 && (
                  <>
                    <span>{format(parseISO(chartData[0][0]), 'MMM d')}</span>
                    {chartData.length > 2 && (
                      <span>{format(parseISO(chartData[Math.floor(chartData.length / 2)][0]), 'MMM d')}</span>
                    )}
                    <span>{format(parseISO(chartData[chartData.length - 1][0]), 'MMM d')}</span>
                  </>
                )}
              </div>
            </div>
          )}
          {/* Legend */}
          {chartData.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
              {platforms.map(plat => (
                <div key={plat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: PLATFORM_COLORS[plat] || '#888' }}
                  />
                  {PLATFORM_LABELS[plat] || plat}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Distribution + Platform Distribution side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Combined horizontal bar */}
            {filtered.length > 0 && (
              <div className="flex h-4 rounded-full overflow-hidden">
                {statusDist.map(({ status, pct }) => (
                  <div
                    key={status}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: STATUS_BAR_COLORS[status] || '#888',
                      minWidth: parseFloat(pct) > 0 ? 4 : 0,
                    }}
                    title={`${status}: ${pct}%`}
                  />
                ))}
              </div>
            )}
            {/* Labels */}
            <div className="space-y-2">
              {statusDist.map(({ status, count, pct }) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: STATUS_BAR_COLORS[status] || '#888' }}
                    />
                    <span className="capitalize">{status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{count}</span>
                    <span className="text-xs">({pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length === 0 && (
              <p className="text-muted-foreground text-center py-4 text-sm">No posts in this period.</p>
            )}
          </CardContent>
        </Card>

        {/* Platform Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {platformDist.map(({ platform, count }) => (
              <div key={platform} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: PLATFORM_COLORS[platform] || '#888' }}
                    />
                    <span>{PLATFORM_LABELS[platform] || platform}</span>
                  </div>
                  <span className="text-muted-foreground font-medium">{count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(count / platformMax) * 100}%`,
                      backgroundColor: PLATFORM_COLORS[platform] || '#888',
                    }}
                  />
                </div>
              </div>
            ))}
            {platformDist.length === 0 && (
              <p className="text-muted-foreground text-center py-4 text-sm">No posts in this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Publishing Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publishing Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Hour labels */}
              <div className="flex ml-10">
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground">
                    {i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`}
                  </div>
                ))}
              </div>
              {/* Grid rows */}
              {DAY_LABELS.map((day, dayIdx) => (
                <div key={day} className="flex items-center gap-1">
                  <div className="w-9 text-xs text-muted-foreground text-right shrink-0">{day}</div>
                  <div className="flex flex-1 gap-[2px]">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const count = heatmapData.grid[dayIdx][hour];
                      const intensity = count / heatmapData.max;
                      let bg = 'bg-muted';
                      if (count > 0) {
                        const alpha = 0.2 + intensity * 0.8;
                        bg = '';
                        return (
                          <div
                            key={hour}
                            className="flex-1 aspect-square rounded-[2px] min-h-[12px] relative group"
                            style={{ backgroundColor: `rgba(34, 197, 94, ${alpha})` }}
                            title={`${day} ${hour === 0 ? '12' : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'AM' : 'PM'}: ${count} post${count !== 1 ? 's' : ''}`}
                          >
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-popover border rounded px-1.5 py-0.5 text-[10px] shadow-md z-50 whitespace-nowrap hidden group-hover:block pointer-events-none">
                              {count} post{count !== 1 ? 's' : ''}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={hour}
                          className={`flex-1 aspect-square rounded-[2px] min-h-[12px] ${bg}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* Heatmap legend */}
              <div className="flex items-center justify-end gap-1.5 mt-2">
                <span className="text-[10px] text-muted-foreground">Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-[2px]"
                    style={{
                      backgroundColor:
                        intensity === 0
                          ? 'hsl(var(--muted))'
                          : `rgba(34, 197, 94, ${0.2 + intensity * 0.8})`,
                    }}
                  />
                ))}
                <span className="text-[10px] text-muted-foreground">More</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Post Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Post Performance
            {activePlatform ? ` - ${PLATFORM_LABELS[activePlatform]}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedPosts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No posts in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_100px_90px_70px_70px_70px_180px_40px] gap-2 items-center px-3 py-2 text-xs font-medium text-muted-foreground border-b min-w-[700px]">
                <span>Caption</span>
                <button
                  onClick={() => toggleSort('platform')}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  Platform
                  <ArrowUpDown className="h-3 w-3" />
                </button>
                <button
                  onClick={() => toggleSort('status')}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  Status
                  <ArrowUpDown className="h-3 w-3" />
                </button>
                <span>Likes</span>
                <span>Comments</span>
                <span>Shares</span>
                <button
                  onClick={() => toggleSort('date')}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  Date
                  <ArrowUpDown className="h-3 w-3" />
                </button>
                <span />
              </div>
              {/* Table rows */}
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {sortedPosts.map(p => {
                  const metrics = (p as any).post_metrics?.[0];
                  return (
                    <div
                      key={p.id}
                      className="grid grid-cols-[1fr_100px_90px_70px_70px_70px_180px_40px] gap-2 items-center px-3 py-2.5 hover:bg-muted/50 transition-colors min-w-[700px]"
                    >
                      <p className="text-sm truncate">
                        {p.caption?.substring(0, 60) || 'No caption'}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: PLATFORM_COLORS[p.platform] || '#888' }}
                        />
                        <span className="text-xs">{PLATFORM_LABELS[p.platform] || p.platform}</span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] w-fit ${STATUS_COLORS[p.status] || ''}`}
                      >
                        {p.status}
                      </Badge>
                      <span className="text-xs font-medium">{metrics?.likes?.toLocaleString() || '—'}</span>
                      <span className="text-xs font-medium">{metrics?.comments?.toLocaleString() || '—'}</span>
                      <span className="text-xs font-medium">{metrics?.shares?.toLocaleString() || '—'}</span>
                      <span className="text-xs text-muted-foreground">{formatPostDate(p)}</span>
                      <a
                        href={`/compose?id=${p.id}`}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit post"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
