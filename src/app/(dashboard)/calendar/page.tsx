'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  isSameDay,
  getDay,
  isToday,
} from 'date-fns';
import type { Post } from '@/types/database';
import { useAccountStore } from '@/lib/store/account-store';

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<Post[]>([]);
  const { activeAccountId } = useAccountStore();
  const supabase = createClient();

  const loadPosts = useCallback(async () => {
    const start = startOfMonth(currentMonth).toISOString();
    const end = endOfMonth(currentMonth).toISOString();

    let query = supabase
      .from('posts')
      .select('*, social_accounts(username, platform)')
      .or(`scheduled_at.gte.${start},published_at.gte.${start}`)
      .or(`scheduled_at.lte.${end},published_at.lte.${end}`)
      .order('scheduled_at', { ascending: true });

    if (activeAccountId) {
      query = query.eq('account_id', activeAccountId);
    }

    const { data } = await query;
    setPosts(data || []);
  }, [supabase, currentMonth, activeAccountId]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart); // 0=Sun

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-400',
    scheduled: 'bg-blue-500',
    publishing: 'bg-yellow-500',
    posted: 'bg-green-500',
    failed: 'bg-red-500',
    retry: 'bg-orange-500',
  };

  function getPostsForDay(day: Date) {
    return posts.filter((p) => {
      const d = p.scheduled_at || p.published_at;
      return d && isSameDay(new Date(d), day);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-muted-foreground">See your scheduled posts at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-36 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells for padding */}
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[100px] border-b border-r p-1" />
            ))}
            {days.map((day) => {
              const dayPosts = getPostsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[100px] border-b border-r p-1 ${
                    isToday(day) ? 'bg-primary/5' : ''
                  }`}
                >
                  <span
                    className={`text-xs font-medium ${
                      isToday(day)
                        ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayPosts.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] bg-muted truncate"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColors[p.status]}`} />
                        <span className="truncate">
                          {p.scheduled_at ? format(new Date(p.scheduled_at), 'HH:mm') : ''}{' '}
                          {p.caption?.substring(0, 20) || 'No caption'}
                        </span>
                      </div>
                    ))}
                    {dayPosts.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pl-1">
                        +{dayPosts.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
