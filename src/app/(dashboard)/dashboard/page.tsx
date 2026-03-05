'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAccountStore } from '@/lib/store/account-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, TrendingUp, Send, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function DashboardPage() {
  const { activeAccountId } = useAccountStore();
  const supabase = createClient();
  const [scheduledCount, setScheduledCount] = useState(0);
  const [postedCount, setPostedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [accountCount, setAccountCount] = useState(0);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);

  const load = useCallback(async () => {
    let qScheduled = supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'scheduled');
    let qPosted = supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'posted');
    let qFailed = supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'failed');
    let qRecent = supabase.from('posts').select('*, social_accounts(username, platform)').order('created_at', { ascending: false }).limit(10);

    if (activeAccountId) {
      qScheduled = qScheduled.eq('account_id', activeAccountId);
      qPosted = qPosted.eq('account_id', activeAccountId);
      qFailed = qFailed.eq('account_id', activeAccountId);
      qRecent = qRecent.eq('account_id', activeAccountId);
    }

    const [r1, r2, r3, r4, r5] = await Promise.all([
      qScheduled,
      qPosted,
      qFailed,
      qRecent,
      supabase.from('social_accounts').select('*').eq('is_active', true),
    ]);

    setScheduledCount(r1.count ?? 0);
    setPostedCount(r2.count ?? 0);
    setFailedCount(r3.count ?? 0);
    setRecentPosts(r4.data || []);
    setAccountCount(r5.data?.length ?? 0);
  }, [supabase, activeAccountId]);

  useEffect(() => { load(); }, [load]);

  const kpis = [
    { title: 'Scheduled', value: scheduledCount, icon: CalendarDays, color: 'text-blue-600' },
    { title: 'Posted', value: postedCount, icon: Send, color: 'text-green-600' },
    { title: 'Failed', value: failedCount, icon: AlertCircle, color: 'text-red-600' },
    { title: 'Accounts', value: accountCount, icon: TrendingUp, color: 'text-purple-600' },
  ];

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    publishing: 'bg-yellow-100 text-yellow-800',
    posted: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    retry: 'bg-orange-100 text-orange-800',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your social media activity</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
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
              {recentPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {post.caption || 'No caption'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{(post.social_accounts as { username: string })?.username ?? 'unknown'} &middot;{' '}
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge variant="secondary" className={statusColors[post.status] || ''}>
                    {post.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
