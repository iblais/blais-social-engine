'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow, format, subDays, eachDayOfInterval } from 'date-fns';
import { CalendarDays, TrendingUp, Send, AlertCircle } from 'lucide-react';
import { useAccountStore } from '@/lib/store/account-store';

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
      const dateKey = format(new Date(post.created_at), 'yyyy-MM-dd');
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
  }, [supabase, activeBrandId, accountIds]);

  useEffect(() => { load(); }, [load]);

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

      {/* Analytics Section */}
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
                            ? format(new Date(post.scheduled_at), 'MMM d, h:mm a')
                            : formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
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
