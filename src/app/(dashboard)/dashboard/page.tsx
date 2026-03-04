import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, TrendingUp, Send, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch counts for KPI cards
  const [
    { count: scheduledCount },
    { count: postedCount },
    { count: failedCount },
    { data: recentPosts },
    { data: accounts },
  ] = await Promise.all([
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'scheduled'),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'posted'),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('posts').select('*, social_accounts(username, platform)').order('created_at', { ascending: false }).limit(10),
    supabase.from('social_accounts').select('*').eq('is_active', true),
  ]);

  const kpis = [
    { title: 'Scheduled', value: scheduledCount ?? 0, icon: CalendarDays, color: 'text-blue-600' },
    { title: 'Posted', value: postedCount ?? 0, icon: Send, color: 'text-green-600' },
    { title: 'Failed', value: failedCount ?? 0, icon: AlertCircle, color: 'text-red-600' },
    { title: 'Accounts', value: accounts?.length ?? 0, icon: TrendingUp, color: 'text-purple-600' },
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
