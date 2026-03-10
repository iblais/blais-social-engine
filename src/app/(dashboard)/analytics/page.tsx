'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  TrendingDown,
  Award,
  ArrowUpDown,
  ExternalLink,
  RefreshCw,
  Users,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
} from 'lucide-react';
import { format, subDays, isAfter, parseISO, getDay, getHours } from 'date-fns';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { toast } from 'sonner';

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
type SortKey = 'date' | 'status' | 'platform' | 'likes' | 'comments';
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
  tiktok: '#000000',
  linkedin: '#0A66C2',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  bluesky: 'Bluesky',
  twitter: 'Twitter/X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
};

// Platform-specific terminology
const PLATFORM_TERMS: Record<string, { audience: string; content: string; engagement: string }> = {
  instagram: { audience: 'Followers', content: 'Posts', engagement: 'Engagement' },
  facebook: { audience: 'Followers', content: 'Posts', engagement: 'Engagement' },
  bluesky: { audience: 'Followers', content: 'Posts', engagement: 'Engagement' },
  twitter: { audience: 'Followers', content: 'Posts', engagement: 'Engagement' },
  youtube: { audience: 'Subscribers', content: 'Videos', engagement: 'Engagement' },
  tiktok: { audience: 'Followers', content: 'Videos', engagement: 'Engagement' },
  linkedin: { audience: 'Connections', content: 'Posts', engagement: 'Engagement' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function AnalyticsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [accountMetrics, setAccountMetrics] = useState<AccountMetric[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { accountIds, activeBrandId } = useBrandAccounts();
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    // Wait for accountIds to load when a brand is selected
    if (activeBrandId && accountIds.length === 0) return;

    let postsQuery = supabase
      .from('posts')
      .select('id, caption, status, platform, published_at, scheduled_at, created_at, post_metrics(impressions, reach, likes, comments, shares, saves, engagement_rate)')
      .order('scheduled_at', { ascending: false })
      .limit(500);

    if (activeBrandId) {
      postsQuery = postsQuery.in('account_id', accountIds);
    }

    // Account metrics — fetch ALL history for growth charts, filtered by brand
    let metricsQuery = supabase
      .from('account_metrics')
      .select('*, social_accounts(platform, username, brand_id)')
      .order('collected_at', { ascending: false })
      .limit(2000);

    if (activeBrandId) {
      metricsQuery = metricsQuery.in('account_id', accountIds);
    }

    const [postsRes, metricsRes] = await Promise.all([postsQuery, metricsQuery]);

    setPosts((postsRes.data || []) as Post[]);

    if (metricsRes.data?.length) {
      setAccountMetrics(metricsRes.data.map((m: any) => ({
        ...m,
        platform: m.social_accounts?.platform,
        username: m.social_accounts?.username,
      })));
    } else {
      setAccountMetrics([]);
    }
  }, [supabase, activeBrandId, accountIds]);

  useEffect(() => { load(); }, [load]);

  // Manual refresh — reload analytics from DB
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
      toast.success('Analytics refreshed');
    } catch {
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

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

  // Date range cutoff for account metrics
  const metricsCutoff = useMemo(() => {
    if (dateRange === 'all') return null;
    return subDays(new Date(), parseInt(dateRange));
  }, [dateRange]);

  // Filter account metrics by date range
  const dateFilteredMetrics = useMemo(() => {
    if (!metricsCutoff) return accountMetrics;
    return accountMetrics.filter(m => isAfter(parseISO(m.collected_at), metricsCutoff));
  }, [accountMetrics, metricsCutoff]);

  // --- Account metrics: latest per account (always from full data, since latest = current followers) ---
  const latestAccountMetrics = useMemo(() => {
    const map = new Map<string, AccountMetric>();
    accountMetrics.forEach(m => {
      if (!map.has(m.account_id)) map.set(m.account_id, m);
    });
    return Array.from(map.values());
  }, [accountMetrics]);

  // Growth data per account — filtered to date range for charts
  const accountGrowth = useMemo(() => {
    const grouped = new Map<string, AccountMetric[]>();
    dateFilteredMetrics.forEach(m => {
      const arr = grouped.get(m.account_id) || [];
      arr.push(m);
      grouped.set(m.account_id, arr);
    });
    // Sort each group by date ascending
    grouped.forEach((arr) => {
      arr.sort((a, b) => new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime());
    });
    return grouped;
  }, [dateFilteredMetrics]);

  // Baseline metrics: the record closest to the start of the date range per account
  const baselineMetrics = useMemo(() => {
    const map = new Map<string, AccountMetric>();
    if (!metricsCutoff) {
      // "all time" — use the earliest record per account
      accountMetrics.forEach(m => {
        const existing = map.get(m.account_id);
        if (!existing || new Date(m.collected_at).getTime() < new Date(existing.collected_at).getTime()) {
          map.set(m.account_id, m);
        }
      });
    } else {
      // Find the record closest to (but not after) the cutoff, or the earliest record in range
      accountMetrics.forEach(m => {
        const mTime = new Date(m.collected_at).getTime();
        const cutoffTime = metricsCutoff.getTime();
        const existing = map.get(m.account_id);
        if (!existing) {
          map.set(m.account_id, m);
        } else {
          const existingTime = new Date(existing.collected_at).getTime();
          // Prefer the record closest to (and <= cutoff), otherwise earliest in range
          const mDist = Math.abs(mTime - cutoffTime);
          const eDist = Math.abs(existingTime - cutoffTime);
          // If m is closer to cutoff and on or before it, or existing is after cutoff and m is before
          if (mTime <= cutoffTime && (existingTime > cutoffTime || mDist < eDist)) {
            map.set(m.account_id, m);
          } else if (existingTime > cutoffTime && mTime < existingTime) {
            // Both after cutoff, pick the earlier one (closest to cutoff)
            map.set(m.account_id, m);
          }
        }
      });
    }
    return map;
  }, [accountMetrics, metricsCutoff]);

  const totalFollowers = useMemo(() => latestAccountMetrics.reduce((s, m) => s + (m.followers || 0), 0), [latestAccountMetrics]);

  // Overall growth percentage — compares latest vs baseline (start of date range)
  const overallGrowth = useMemo(() => {
    let baselineTotal = 0;
    let latestTotal = 0;
    latestAccountMetrics.forEach(latest => {
      latestTotal += latest.followers || 0;
      const baseline = baselineMetrics.get(latest.account_id);
      if (baseline) {
        baselineTotal += baseline.followers || 0;
      }
    });
    const diff = latestTotal - baselineTotal;
    const pct = baselineTotal > 0 ? ((diff / baselineTotal) * 100).toFixed(1) : '0.0';
    return { diff, pct, oldestTotal: baselineTotal, latestTotal };
  }, [latestAccountMetrics, baselineMetrics]);

  // --- KPI calculations ---
  const kpis = useMemo(() => {
    const total = filtered.length;
    const published = filtered.filter(p => p.status === 'posted').length;
    const publishRate = total > 0 ? ((published / total) * 100).toFixed(1) : '0.0';

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

    return { total, published, publishRate, bestDay, bestPlatform };
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
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
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
    filtered.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([status, count]) => ({ status, count, pct: ((count / total) * 100).toFixed(1) }));
  }, [filtered]);

  // --- Platform Distribution ---
  const platformDist = useMemo(() => {
    const counts: Record<string, number> = {};
    dateFiltered.forEach(p => { counts[p.platform] = (counts[p.platform] || 0) + 1; });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([platform, count]) => ({ platform, count }));
  }, [dateFiltered]);

  const platformMax = useMemo(() => Math.max(...platformDist.map(p => p.count), 1), [platformDist]);

  // --- Publishing Heatmap ---
  const heatmapData = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    filtered.forEach(p => {
      const d = p.scheduled_at || p.published_at || p.created_at;
      if (!d) return;
      const parsed = parseISO(d);
      grid[getDay(parsed)][getHours(parsed)]++;
      if (grid[getDay(parsed)][getHours(parsed)] > max) max = grid[getDay(parsed)][getHours(parsed)];
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
      } else if (sortKey === 'likes') {
        const la = (a as any).post_metrics?.[0]?.likes || 0;
        const lb = (b as any).post_metrics?.[0]?.likes || 0;
        cmp = la - lb;
      } else if (sortKey === 'comments') {
        const ca = (a as any).post_metrics?.[0]?.comments || 0;
        const cb = (b as any).post_metrics?.[0]?.comments || 0;
        cmp = ca - cb;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const formatPostDate = (p: Post) => {
    const d = p.scheduled_at || p.published_at || p.created_at;
    if (!d) return '--';
    return format(parseISO(d), 'MMM d, yyyy h:mm a');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            {activeBrandId ? 'Brand performance & growth' : 'All brands — select a brand for filtered view'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[140px]">
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
      </div>

      {/* Platform filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setActivePlatform(null)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            !activePlatform ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground bg-muted hover:bg-muted/80'
          }`}
        >All</button>
        {['instagram', 'facebook', 'bluesky', 'youtube', 'tiktok', 'linkedin'].map(plat => {
          const hasData = platforms.includes(plat) || latestAccountMetrics.some(m => m.platform === plat);
          if (!hasData) return null;
          return (
            <button
              key={plat}
              onClick={() => setActivePlatform(activePlatform === plat ? null : plat)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activePlatform === plat ? 'text-white shadow-sm' : 'text-muted-foreground bg-muted hover:bg-muted/80'
              }`}
              style={activePlatform === plat ? { backgroundColor: PLATFORM_COLORS[plat] } : undefined}
            >{PLATFORM_LABELS[plat]}</button>
          );
        })}
      </div>

      {/* ========== AUDIENCE GROWTH SECTION ========== */}
      {latestAccountMetrics.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Audience Growth
          </h2>

          {/* Total audience banner with growth */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Total Audience{activeBrandId ? '' : ' (All Brands)'}
                </p>
                <p className="text-4xl font-bold tracking-tight">{formatNum(totalFollowers)}</p>
                <p className="text-sm text-muted-foreground mt-1">across {latestAccountMetrics.length} account{latestAccountMetrics.length !== 1 ? 's' : ''}</p>
              </div>
              {overallGrowth.diff !== 0 && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  overallGrowth.diff > 0
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}>
                  {overallGrowth.diff > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  <div>
                    <p className="text-lg font-bold">
                      {overallGrowth.diff > 0 ? '+' : ''}{formatNum(overallGrowth.diff)}
                    </p>
                    <p className="text-xs">{overallGrowth.pct}% growth</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Per-account analytics cards with SVG charts */}
          <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
            {latestAccountMetrics
              .filter(m => !activePlatform || m.platform === activePlatform)
              .map((m) => {
              const platform = m.platform || '';
              const color = PLATFORM_COLORS[platform] || '#6B7280';
              const terms = PLATFORM_TERMS[platform] || { audience: 'Followers', content: 'Posts', engagement: 'Engagement' };
              const history = accountGrowth.get(m.account_id) || [m];

              // Growth calculation — compare current vs baseline (start of date range)
              const baseline = baselineMetrics.get(m.account_id);
              const baselineFollowers = baseline?.followers || 0;
              const followerGrowth = baselineFollowers > 0 ? m.followers - baselineFollowers : 0;
              const growthPct = baselineFollowers > 0 ? ((followerGrowth / baselineFollowers) * 100).toFixed(1) : '0.0';

              // SVG chart — show all data points within the date range
              const chartPoints = history;
              const vals = chartPoints.map(p => p.followers || 0);
              const chartMax = Math.max(...vals);
              const chartMin = Math.min(...vals);
              const chartRange = chartMax - chartMin || 1;
              const svgW = 400;
              const svgH = 140;
              const pad = 4;

              const points = chartPoints.map((p, i) => ({
                x: pad + (i / Math.max(chartPoints.length - 1, 1)) * (svgW - pad * 2),
                y: svgH - pad - ((p.followers - chartMin) / chartRange) * (svgH - pad * 2),
                value: p.followers,
                date: p.collected_at,
              }));

              const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
              const areaPath = points.length > 0
                ? `${linePath} L ${points[points.length - 1].x} ${svgH} L ${points[0].x} ${svgH} Z`
                : '';

              return (
                <Card key={m.account_id} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="p-5 pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: color }}>
                            {platform === 'youtube' ? 'YT' : platform === 'instagram' ? 'IG' : platform === 'facebook' ? 'FB' : platform === 'bluesky' ? 'BS' : platform.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-base font-semibold">{PLATFORM_LABELS[platform] || platform}</span>
                            <span className="text-sm text-muted-foreground ml-2">@{m.username}</span>
                          </div>
                        </div>
                        {followerGrowth !== 0 && (
                          <span className={`text-sm font-semibold px-3 py-1 rounded-full flex items-center gap-1 ${
                            followerGrowth > 0
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {followerGrowth > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {followerGrowth > 0 ? '+' : ''}{formatNum(followerGrowth)} ({growthPct}%)
                          </span>
                        )}
                      </div>
                      <p className="text-3xl font-bold tracking-tight">{formatNum(m.followers)}</p>
                      <p className="text-sm text-muted-foreground">{terms.audience.toLowerCase()}</p>
                    </div>

                    {/* SVG Line Chart */}
                    <div className="px-3 pb-1">
                      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-36" preserveAspectRatio="none">
                        {/* Grid lines */}
                        {[0.25, 0.5, 0.75].map(pct => (
                          <line key={pct} x1={pad} y1={svgH - pad - pct * (svgH - pad * 2)} x2={svgW - pad} y2={svgH - pad - pct * (svgH - pad * 2)} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
                        ))}
                        {/* Area fill */}
                        {areaPath && <path d={areaPath} fill={color} fillOpacity={0.08} />}
                        {/* Line */}
                        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
                        {/* Dots */}
                        {points.length <= 14 && points.map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} fillOpacity={0.6} />
                        ))}
                        {/* Latest point */}
                        {points.length > 0 && (
                          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={5} fill={color} stroke="white" strokeWidth={2} />
                        )}
                      </svg>
                      {/* Y-axis labels */}
                      <div className="flex justify-between text-[10px] text-muted-foreground px-1 -mt-1">
                        <span>{formatNum(chartMin)}</span>
                        {chartPoints.length > 1 && <span className="text-[9px]">{chartPoints.length} data points</span>}
                        <span>{formatNum(chartMax)}</span>
                      </div>
                    </div>

                    {/* Detailed stats row */}
                    <div className="grid grid-cols-4 gap-1 border-t p-3 bg-muted/20">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Following</p>
                        <p className="text-sm font-bold">{formatNum(m.following || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{terms.content}</p>
                        <p className="text-sm font-bold">{formatNum(m.posts_count || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{terms.engagement}</p>
                        <p className="text-sm font-bold">
                          {m.engagement_rate != null && m.engagement_rate > 0 ? `${m.engagement_rate}%` : '—'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Updated</p>
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {format(parseISO(m.collected_at), 'MMM d, h:mma')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ========== ENGAGEMENT METRICS ========== */}
      {engagementTotals.postsWithMetrics > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            Engagement Metrics
            <span className="text-sm font-normal text-muted-foreground ml-2">
              from {engagementTotals.postsWithMetrics} post{engagementTotals.postsWithMetrics !== 1 ? 's' : ''} with data
            </span>
          </h2>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-7">
            {[
              { label: 'Likes', value: engagementTotals.totalLikes, icon: Heart, color: 'text-pink-500' },
              { label: 'Comments', value: engagementTotals.totalComments, icon: MessageCircle, color: 'text-blue-500' },
              { label: 'Shares', value: engagementTotals.totalShares, icon: Share2, color: 'text-green-500' },
              { label: 'Saves', value: engagementTotals.totalSaves, icon: Bookmark, color: 'text-yellow-500' },
              { label: 'Impressions', value: engagementTotals.totalImpressions, icon: Eye, color: 'text-purple-500' },
              { label: 'Reach', value: engagementTotals.totalReach, icon: Users, color: 'text-cyan-500' },
              { label: 'Eng. Rate', value: parseFloat(engagementTotals.avgEngagement), icon: TrendingUp, color: 'text-orange-500', suffix: '%' },
            ].map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                  </div>
                  <p className={`text-xl font-bold ${kpi.color}`}>
                    {kpi.suffix ? kpi.value + kpi.suffix : formatNum(kpi.value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ========== POST KPIs ========== */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Posts</CardTitle>
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Published</CardTitle>
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.published}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Publish Rate</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.publishRate}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Best Day</CardTitle>
            <Calendar className="h-3.5 w-3.5 text-orange-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.bestDay}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Best Platform</CardTitle>
            <Award className="h-3.5 w-3.5 text-yellow-500" />
          </CardHeader>
          <CardContent><div className="text-xl font-bold truncate">{kpis.bestPlatform}</div></CardContent>
        </Card>
      </div>

      {/* Posts Over Time */}
      <Card>
        <CardHeader><CardTitle className="text-base">Posts Over Time</CardTitle></CardHeader>
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
                    <div key={dateKey} className="flex-1 flex flex-col items-center justify-end relative group" style={{ height: '100%', minWidth: 8, maxWidth: 40 }} onMouseEnter={() => setHoveredBar(dateKey)} onMouseLeave={() => setHoveredBar(null)}>
                      {isHovered && (
                        <div className="absolute bottom-full mb-2 bg-popover border rounded-md shadow-lg px-2.5 py-1.5 text-xs z-50 whitespace-nowrap pointer-events-none">
                          <div className="font-medium mb-0.5">{format(parseISO(dateKey), 'MMM d')}</div>
                          {segments.map(([plat, count]) => (
                            <div key={plat} className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: PLATFORM_COLORS[plat] || '#888' }} />
                              <span>{PLATFORM_LABELS[plat] || plat}: {count}</span>
                            </div>
                          ))}
                          <div className="border-t mt-1 pt-1 font-medium">Total: {total}</div>
                        </div>
                      )}
                      <div className="w-full rounded-t-sm overflow-hidden transition-all duration-200" style={{ height: `${barHeight}%`, minHeight: total > 0 ? 4 : 0 }}>
                        {segments.map(([plat, count]) => (
                          <div key={plat} style={{ height: `${(count / total) * 100}%`, backgroundColor: PLATFORM_COLORS[plat] || '#888', minHeight: 2 }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground min-w-[400px]">
                {chartData.length > 0 && (
                  <>
                    <span>{format(parseISO(chartData[0][0]), 'MMM d')}</span>
                    {chartData.length > 2 && <span>{format(parseISO(chartData[Math.floor(chartData.length / 2)][0]), 'MMM d')}</span>}
                    <span>{format(parseISO(chartData[chartData.length - 1][0]), 'MMM d')}</span>
                  </>
                )}
              </div>
            </div>
          )}
          {chartData.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
              {platforms.map(plat => (
                <div key={plat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PLATFORM_COLORS[plat] || '#888' }} />
                  {PLATFORM_LABELS[plat] || plat}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status + Platform Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {filtered.length > 0 && (
              <div className="flex h-4 rounded-full overflow-hidden">
                {statusDist.map(({ status, pct }) => (
                  <div key={status} style={{ width: `${pct}%`, backgroundColor: STATUS_BAR_COLORS[status] || '#888', minWidth: parseFloat(pct) > 0 ? 4 : 0 }} title={`${status}: ${pct}%`} />
                ))}
              </div>
            )}
            <div className="space-y-2">
              {statusDist.map(({ status, count, pct }) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: STATUS_BAR_COLORS[status] || '#888' }} />
                    <span className="capitalize">{status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{count}</span>
                    <span className="text-xs">({pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length === 0 && <p className="text-muted-foreground text-center py-4 text-sm">No posts in this period.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Platform Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {platformDist.map(({ platform, count }) => (
              <div key={platform} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[platform] || '#888' }} />
                    <span>{PLATFORM_LABELS[platform] || platform}</span>
                  </div>
                  <span className="text-muted-foreground font-medium">{count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(count / platformMax) * 100}%`, backgroundColor: PLATFORM_COLORS[platform] || '#888' }} />
                </div>
              </div>
            ))}
            {platformDist.length === 0 && <p className="text-muted-foreground text-center py-4 text-sm">No posts in this period.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Publishing Heatmap */}
      <Card>
        <CardHeader><CardTitle className="text-base">Publishing Heatmap</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="flex ml-10">
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground">
                    {i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`}
                  </div>
                ))}
              </div>
              {DAY_LABELS.map((day, dayIdx) => (
                <div key={day} className="flex items-center gap-1">
                  <div className="w-9 text-xs text-muted-foreground text-right shrink-0">{day}</div>
                  <div className="flex flex-1 gap-[2px]">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const count = heatmapData.grid[dayIdx][hour];
                      const intensity = count / heatmapData.max;
                      if (count > 0) {
                        return (
                          <div key={hour} className="flex-1 aspect-square rounded-[2px] min-h-[12px] relative group" style={{ backgroundColor: `rgba(34, 197, 94, ${0.2 + intensity * 0.8})` }} title={`${day} ${hour === 0 ? '12' : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'AM' : 'PM'}: ${count} post${count !== 1 ? 's' : ''}`}>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-popover border rounded px-1.5 py-0.5 text-[10px] shadow-md z-50 whitespace-nowrap hidden group-hover:block pointer-events-none">{count} post{count !== 1 ? 's' : ''}</div>
                          </div>
                        );
                      }
                      return <div key={hour} className="flex-1 aspect-square rounded-[2px] min-h-[12px] bg-muted" />;
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-end gap-1.5 mt-2">
                <span className="text-[10px] text-muted-foreground">Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
                  <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: intensity === 0 ? 'var(--muted)' : `rgba(34, 197, 94, ${0.2 + intensity * 0.8})` }} />
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
            Post Performance{activePlatform ? ` — ${PLATFORM_LABELS[activePlatform]}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedPosts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No posts in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[1fr_100px_90px_70px_70px_70px_180px_40px] gap-2 items-center px-3 py-2 text-xs font-medium text-muted-foreground border-b min-w-[700px]">
                <span>Caption</span>
                <button onClick={() => toggleSort('platform')} className="flex items-center gap-1 hover:text-foreground transition-colors">Platform <ArrowUpDown className="h-3 w-3" /></button>
                <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors">Status <ArrowUpDown className="h-3 w-3" /></button>
                <button onClick={() => toggleSort('likes')} className="flex items-center gap-1 hover:text-foreground transition-colors">Likes <ArrowUpDown className="h-3 w-3" /></button>
                <button onClick={() => toggleSort('comments')} className="flex items-center gap-1 hover:text-foreground transition-colors">Comments <ArrowUpDown className="h-3 w-3" /></button>
                <span>Shares</span>
                <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-foreground transition-colors">Date <ArrowUpDown className="h-3 w-3" /></button>
                <span />
              </div>
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {sortedPosts.map(p => {
                  const metrics = (p as any).post_metrics?.[0];
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr_100px_90px_70px_70px_70px_180px_40px] gap-2 items-center px-3 py-2.5 hover:bg-muted/50 transition-colors min-w-[700px]">
                      <p className="text-sm truncate">{p.caption?.substring(0, 60) || 'No caption'}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_COLORS[p.platform] || '#888' }} />
                        <span className="text-xs">{PLATFORM_LABELS[p.platform] || p.platform}</span>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] w-fit ${STATUS_COLORS[p.status] || ''}`}>{p.status}</Badge>
                      <span className="text-xs font-medium">{metrics?.likes?.toLocaleString() || '—'}</span>
                      <span className="text-xs font-medium">{metrics?.comments?.toLocaleString() || '—'}</span>
                      <span className="text-xs font-medium">{metrics?.shares?.toLocaleString() || '—'}</span>
                      <span className="text-xs text-muted-foreground">{formatPostDate(p)}</span>
                      <a href={`/compose?id=${p.id}`} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit post"><ExternalLink className="h-3.5 w-3.5" /></a>
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
