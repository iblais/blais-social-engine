'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow, format, subDays, eachDayOfInterval } from 'date-fns';
import { CalendarDays, TrendingUp, Send, AlertCircle, Users, BarChart3 } from 'lucide-react';
import { useAccountStore } from '@/lib/store/account-store';
import { parseDate } from '@/lib/utils';

interface Brand {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

interface DayData {
  date: string;
  label: string;
  posted: number;
  scheduled: number;
  failed: number;
  total: number;
}

interface PlatformData {
  platform: string;
  count: number;
  color: string;
}

interface GrowthMetric {
  account_id: string;
  followers: number;
  following: number;
  posts_count: number;
  engagement_rate: number;
  collected_at: string;
  platform?: string;
  username?: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  twitter: '#1DA1F2',
  bluesky: '#0085FF',
  youtube: '#FF0000',
  linkedin: '#0A66C2',
  tiktok: '#000000',
  pinterest: '#E60023',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  publishing: 'bg-yellow-100 text-yellow-800',
  posted: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  retry: 'bg-orange-100 text-orange-800',
};

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountIds, activeBrandId } = useBrandAccounts();
  const { setActiveBrand } = useAccountStore();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [postedCount, setPostedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [accountCount, setAccountCount] = useState(0);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [platformData, setPlatformData] = useState<PlatformData[]>([]);
  const [growthMetrics, setGrowthMetrics] = useState<GrowthMetric[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<GrowthMetric[]>([]);
  const [postEngagement, setPostEngagement] = useState<any[]>([]);

  // Load brands for the dropdown
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('brands')
        .select('id, name, slug, color')
        .order('name');
      setBrands(data || []);
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    // KPI queries
    let qScheduled = supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'scheduled');
    let qPosted = supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'posted');
    let qFailed = supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'failed');
    let qRecent = supabase.from('posts').select('*, social_accounts(username, platform)').order('created_at', { ascending: false }).limit(10);

    // Last 30 days posts for analytics
    const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
    let qAnalytics = supabase
      .from('posts')
      .select('status, scheduled_at, created_at, social_accounts(platform)')
      .gte('created_at', thirtyDaysAgo);

    if (activeBrandId && accountIds.length) {
      qScheduled = qScheduled.in('account_id', accountIds);
      qPosted = qPosted.in('account_id', accountIds);
      qFailed = qFailed.in('account_id', accountIds);
      qRecent = qRecent.in('account_id', accountIds);
      qAnalytics = qAnalytics.in('account_id', accountIds);
    }

    const [r1, r2, r3, r4, r5, r6] = await Promise.all([
      qScheduled,
      qPosted,
      qFailed,
      qRecent,
      supabase.from('social_accounts').select('*').eq('is_active', true),
      qAnalytics,
    ]);

    setScheduledCount(r1.count ?? 0);
    setPostedCount(r2.count ?? 0);
    setFailedCount(r3.count ?? 0);
    setRecentPosts(r4.data || []);
    setAccountCount(activeBrandId ? accountIds.length : (r5.data?.length ?? 0));

    // Process analytics data for the chart
    const posts = r6.data || [];
    const days = eachDayOfInterval({
      start: subDays(new Date(), 30),
      end: new Date(),
    });

    const dayMap = new Map<string, { posted: number; scheduled: number; failed: number }>();
    days.forEach((d) => {
      dayMap.set(format(d, 'yyyy-MM-dd'), { posted: 0, scheduled: 0, failed: 0 });
    });

    posts.forEach((post: any) => {
      const dateKey = format(parseDate(post.created_at), 'yyyy-MM-dd');
      const entry = dayMap.get(dateKey);
      if (entry) {
        if (post.status === 'posted') entry.posted++;
        else if (post.status === 'scheduled') entry.scheduled++;
        else if (post.status === 'failed') entry.failed++;
      }
    });

    const daily: DayData[] = days.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      const entry = dayMap.get(key)!;
      return {
        date: key,
        label: format(d, 'MMM d'),
        ...entry,
        total: entry.posted + entry.scheduled + entry.failed,
      };
    });
    setDailyData(daily);

    // Platform breakdown
    const platCounts = new Map<string, number>();
    posts.forEach((post: any) => {
      const platform = (post.social_accounts as any)?.platform || 'unknown';
      platCounts.set(platform, (platCounts.get(platform) || 0) + 1);
    });

    const platData: PlatformData[] = Array.from(platCounts.entries())
      .map(([platform, count]) => ({
        platform,
        count,
        color: PLATFORM_COLORS[platform] || '#6B7280',
      }))
      .sort((a, b) => b.count - a.count);
    setPlatformData(platData);

    // Growth metrics — follower counts, engagement rate over time
    let metricsQuery = supabase
      .from('account_metrics')
      .select('*, social_accounts(platform, username)')
      .order('collected_at', { ascending: false })
      .limit(500);

    if (activeBrandId && accountIds.length) {
      metricsQuery = metricsQuery.in('account_id', accountIds);
    }

    const { data: metricsData } = await metricsQuery;

    // Also fetch post-level engagement for brand
    let engQuery = supabase
      .from('post_metrics')
      .select('*, posts!inner(account_id, platform)')
      .order('collected_at', { ascending: false })
      .limit(200);

    if (activeBrandId && accountIds.length) {
      engQuery = engQuery.in('posts.account_id', accountIds);
    }

    const { data: postMetricsData } = await engQuery;
    setPostEngagement(postMetricsData || []);

    if (metricsData?.length) {
      const enriched = metricsData.map((m: any) => ({
        ...m,
        platform: m.social_accounts?.platform,
        username: m.social_accounts?.username,
      }));
      setGrowthMetrics(enriched);

      // Get latest metric per account
      const latestMap = new Map<string, GrowthMetric>();
      enriched.forEach((m: GrowthMetric) => {
        if (!latestMap.has(m.account_id)) latestMap.set(m.account_id, m);
      });
      setLatestMetrics(Array.from(latestMap.values()));
    } else {
      setGrowthMetrics([]);
      setLatestMetrics([]);
    }
  }, [supabase, activeBrandId, accountIds]);

  useEffect(() => { load(); }, [load]);

  // Engagement totals from post_metrics
  const engagementTotals = useMemo(() => {
    let likes = 0, comments = 0, shares = 0, saves = 0, impressions = 0, reach = 0;
    postEngagement.forEach((m: any) => {
      likes += m.likes || 0;
      comments += m.comments || 0;
      shares += m.shares || 0;
      saves += m.saves || 0;
      impressions += m.impressions || 0;
      reach += m.reach || 0;
    });
    return { likes, comments, shares, saves, impressions, reach, count: postEngagement.length };
  }, [postEngagement]);

  const totalFollowers = useMemo(() => latestMetrics.reduce((s, m) => s + (m.followers || 0), 0), [latestMetrics]);

  const maxDayTotal = useMemo(() => Math.max(...dailyData.map((d) => d.total), 1), [dailyData]);
  const totalPlatformPosts = useMemo(() => platformData.reduce((sum, p) => sum + p.count, 0), [platformData]);

  // Build conic-gradient for donut chart
  const donutGradient = useMemo(() => {
    if (!platformData.length) return 'conic-gradient(#e5e7eb 0deg 360deg)';
    let accumulated = 0;
    const stops: string[] = [];
    platformData.forEach((p) => {
      const pct = (p.count / totalPlatformPosts) * 100;
      stops.push(`${p.color} ${accumulated}% ${accumulated + pct}%`);
      accumulated += pct;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [platformData, totalPlatformPosts]);

  const kpis = [
    { title: 'Scheduled', value: scheduledCount, icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Posted', value: postedCount, icon: Send, color: 'text-green-600', bg: 'bg-green-50' },
    { title: 'Failed', value: failedCount, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { title: 'Accounts', value: accountCount, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  // Filter daily data to only show days with activity, plus last 7 days always
  const visibleDays = useMemo(() => {
    const last7 = dailyData.slice(-7);
    const withActivity = dailyData.filter((d) => d.total > 0);
    const merged = new Map<string, DayData>();
    withActivity.forEach((d) => merged.set(d.date, d));
    last7.forEach((d) => merged.set(d.date, d));
    return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyData]);

  return (
    <div className="space-y-6">
      {/* Header with brand dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your social media activity</p>
        </div>
        <Select
          value={activeBrandId || 'all'}
          onValueChange={(val) => setActiveBrand(val === 'all' ? null : val)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <div className={`rounded-md p-2 ${kpi.bg}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Growth Analytics */}
      {(latestMetrics.length > 0 || engagementTotals.count > 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Growth Analytics
          </h2>

          {/* Total followers banner */}
          {totalFollowers > 0 && (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Followers{activeBrandId ? '' : ' (All Brands)'}</p>
                <p className="text-3xl font-bold">{totalFollowers.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{latestMetrics.length} accounts</p>
              </div>
            </div>
          )}

          {/* Engagement totals row */}
          {engagementTotals.count > 0 && (
            <div className="grid gap-3 grid-cols-3 sm:grid-cols-6">
              {[
                { label: 'Likes', value: engagementTotals.likes, color: 'text-pink-500' },
                { label: 'Comments', value: engagementTotals.comments, color: 'text-blue-500' },
                { label: 'Shares', value: engagementTotals.shares, color: 'text-green-500' },
                { label: 'Saves', value: engagementTotals.saves, color: 'text-yellow-500' },
                { label: 'Impressions', value: engagementTotals.impressions, color: 'text-purple-500' },
                { label: 'Reach', value: engagementTotals.reach, color: 'text-cyan-500' },
              ].map(kpi => (
                <Card key={kpi.label}>
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value.toLocaleString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Per-account analytics cards with SVG charts */}
          <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
            {latestMetrics.map((m) => {
              const color = PLATFORM_COLORS[m.platform || ''] || '#6B7280';
              const accountHistory = growthMetrics
                .filter((g) => g.account_id === m.account_id)
                .sort((a, b) => parseDate(a.collected_at).getTime() - parseDate(b.collected_at).getTime());
              const oldest = accountHistory[0];
              const followerGrowth = oldest && oldest.followers > 0
                ? m.followers - oldest.followers
                : 0;
              const growthPct = oldest && oldest.followers > 0
                ? ((followerGrowth / oldest.followers) * 100).toFixed(1)
                : '0.0';

              // Build SVG line chart points
              const chartPoints = accountHistory.length > 1 ? accountHistory.slice(-30) : [m];
              const chartMax = Math.max(...chartPoints.map(p => p.followers || 0));
              const chartMin = Math.min(...chartPoints.map(p => p.followers || 0));
              const chartRange = chartMax - chartMin || 1;
              const svgW = 400;
              const svgH = 120;
              const padding = 4;

              const points = chartPoints.map((p, i) => {
                const x = padding + (i / Math.max(chartPoints.length - 1, 1)) * (svgW - padding * 2);
                const y = svgH - padding - ((p.followers - chartMin) / chartRange) * (svgH - padding * 2);
                return { x, y, value: p.followers, date: p.collected_at };
              });

              const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
              const areaPath = `${linePath} L ${points[points.length - 1]?.x || 0} ${svgH} L ${points[0]?.x || 0} ${svgH} Z`;

              const formatNum = (n: number) => {
                if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
                if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
                return n.toLocaleString();
              };

              return (
                <Card key={m.account_id} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header */}
                    <div className="p-5 pb-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-base font-semibold capitalize">{m.platform}</span>
                          <span className="text-sm text-muted-foreground">@{m.username}</span>
                        </div>
                        {followerGrowth !== 0 && (
                          <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
                            followerGrowth > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {followerGrowth > 0 ? '+' : ''}{formatNum(followerGrowth)} ({growthPct}%)
                          </span>
                        )}
                      </div>
                      <p className="text-3xl font-bold">{formatNum(m.followers)}</p>
                      <p className="text-sm text-muted-foreground">followers</p>
                    </div>

                    {/* SVG Line Chart */}
                    <div className="px-2 pb-1">
                      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-32" preserveAspectRatio="none">
                        {/* Grid lines */}
                        {[0.25, 0.5, 0.75].map(pct => (
                          <line key={pct} x1={padding} y1={svgH - padding - pct * (svgH - padding * 2)} x2={svgW - padding} y2={svgH - padding - pct * (svgH - padding * 2)} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
                        ))}
                        {/* Area fill */}
                        <path d={areaPath} fill={color} fillOpacity={0.1} />
                        {/* Line */}
                        <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                        {/* Dots on data points */}
                        {points.length <= 14 && points.map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
                        ))}
                        {/* Latest point highlight */}
                        {points.length > 0 && (
                          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={color} stroke="white" strokeWidth={2} />
                        )}
                      </svg>
                      {/* Y-axis labels */}
                      <div className="flex justify-between text-[10px] text-muted-foreground px-1 -mt-1">
                        <span>{formatNum(chartMin)}</span>
                        <span>{formatNum(chartMax)}</span>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-1 border-t p-3">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Following</p>
                        <p className="text-sm font-bold">{formatNum(m.following || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Posts</p>
                        <p className="text-sm font-bold">{formatNum(m.posts_count || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Engagement</p>
                        <p className="text-sm font-bold">
                          {m.engagement_rate != null && m.engagement_rate > 0 ? `${m.engagement_rate}%` : '—'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data Points</p>
                        <p className="text-sm font-bold">{accountHistory.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Posting Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Posts Over Time Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Posts Over Time</CardTitle>
            <CardDescription>Last 30 days activity</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Legend */}
            <div className="flex gap-4 mb-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-green-500" />
                <span className="text-muted-foreground">Posted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
                <span className="text-muted-foreground">Scheduled</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-red-500" />
                <span className="text-muted-foreground">Failed</span>
              </div>
            </div>

            {visibleDays.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No post activity in the last 30 days.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-2">
                {visibleDays.map((day) => (
                  <div key={day.date} className="flex items-center gap-3 group">
                    <span className="text-xs text-muted-foreground w-12 shrink-0 text-right font-mono">
                      {day.label}
                    </span>
                    <div className="flex-1 flex h-6 rounded-md overflow-hidden bg-muted/30">
                      {day.posted > 0 && (
                        <div
                          className="bg-green-500 transition-all duration-300"
                          style={{ width: `${(day.posted / maxDayTotal) * 100}%` }}
                          title={`${day.posted} posted`}
                        />
                      )}
                      {day.scheduled > 0 && (
                        <div
                          className="bg-blue-500 transition-all duration-300"
                          style={{ width: `${(day.scheduled / maxDayTotal) * 100}%` }}
                          title={`${day.scheduled} scheduled`}
                        />
                      )}
                      {day.failed > 0 && (
                        <div
                          className="bg-red-500 transition-all duration-300"
                          style={{ width: `${(day.failed / maxDayTotal) * 100}%` }}
                          title={`${day.failed} failed`}
                        />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground w-6 shrink-0 text-right font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {day.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platform Breakdown Donut */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Breakdown</CardTitle>
            <CardDescription>Posts by platform (30 days)</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            {platformData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No platform data available.
              </p>
            ) : (
              <>
                {/* CSS Donut Chart */}
                <div className="relative w-40 h-40">
                  <div
                    className="w-full h-full rounded-full"
                    style={{ background: donutGradient }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-background flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold">{totalPlatformPosts}</span>
                      <span className="text-xs text-muted-foreground">posts</span>
                    </div>
                  </div>
                </div>

                {/* Platform Legend */}
                <div className="w-full space-y-2">
                  {platformData.map((p) => (
                    <div key={p.platform} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="capitalize">{p.platform}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.count}</span>
                        <span className="text-muted-foreground text-xs w-10 text-right">
                          {Math.round((p.count / totalPlatformPosts) * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Posts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Posts</CardTitle>
          <CardDescription>Your latest scheduled and published posts</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentPosts?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No posts yet. Create your first post!
            </p>
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => {
                const account = post.social_accounts as { username: string; platform: string } | null;
                const platform = account?.platform || 'unknown';
                const platformColor = PLATFORM_COLORS[platform] || '#6B7280';

                return (
                  <div
                    key={post.id}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="w-1 h-10 rounded-full shrink-0"
                        style={{ backgroundColor: platformColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {post.caption || 'No caption'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="capitalize">{platform}</span>
                          {' '}@{account?.username ?? 'unknown'}
                          {' '}&middot;{' '}
                          {post.scheduled_at
                            ? format(parseDate(post.scheduled_at), 'MMM d, h:mm a')
                            : formatDistanceToNow(parseDate(post.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className={STATUS_BADGE_COLORS[post.status] || ''}>
                      {post.status}
                    </Badge>
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
