'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Plus, Pencil, Clock } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameDay,
  getDay,
  getHours,
  isToday,
  setHours,
  setMinutes,
  startOfDay,
  endOfDay,
} from 'date-fns';
import type { Post, PostMedia } from '@/types/database';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { toast } from 'sonner';
import { parseDate } from '@/lib/utils';

interface PostWithRelations extends Post {
  social_accounts?: { username: string; platform: string } | null;
  post_media?: PostMedia[];
}

const platformColors: Record<string, string> = {
  instagram: 'bg-pink-500',
  facebook: 'bg-blue-600',
  bluesky: 'bg-sky-500',
  youtube: 'bg-red-600',
  twitter: 'bg-gray-500',
};

const platformBadgeColors: Record<string, string> = {
  instagram: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  facebook: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  bluesky: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
  youtube: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const platformLabels: Record<string, string> = {
  instagram: 'IG',
  facebook: 'FB',
  bluesky: 'BS',
  youtube: 'YT',
  twitter: 'X',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-400',
  scheduled: 'bg-blue-500',
  publishing: 'bg-yellow-500',
  posted: 'bg-green-500',
  failed: 'bg-red-500',
  retry: 'bg-orange-500',
};

// Best posting times by platform (hour in local time)
const bestTimes: Record<string, number[]> = {
  instagram: [7, 8, 11, 12, 13, 17, 18, 19],
  facebook: [9, 10, 11, 13, 14, 15, 16],
  bluesky: [8, 9, 10, 12, 17, 18],
  youtube: [12, 13, 14, 15, 17, 18, 19, 20],
};

type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostWithRelations | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragPost, setDragPost] = useState<PostWithRelations | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [bestTimePlatform, setBestTimePlatform] = useState<string>('instagram');
  const [zoom, setZoom] = useState(64); // row height in px (32-96)
  const { accountIds, activeBrandId } = useBrandAccounts();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadPosts = useCallback(async () => {
    let rangeStart: Date, rangeEnd: Date;
    if (viewMode === 'month') {
      rangeStart = startOfMonth(currentDate);
      rangeEnd = endOfMonth(currentDate);
    } else if (viewMode === 'week') {
      rangeStart = startOfWeek(currentDate);
      rangeEnd = endOfWeek(currentDate);
    } else {
      rangeStart = startOfDay(currentDate);
      rangeEnd = endOfDay(currentDate);
    }

    let query = supabase
      .from('posts')
      .select('*, social_accounts(username, platform), post_media(*)')
      .gte('scheduled_at', rangeStart.toISOString())
      .lte('scheduled_at', rangeEnd.toISOString())
      .order('scheduled_at', { ascending: true });

    if (activeBrandId && accountIds.length) {
      query = query.in('account_id', accountIds);
    }

    const { data } = await query;
    setPosts(data || []);
  }, [supabase, currentDate, viewMode, activeBrandId, accountIds]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Scroll to current time on mount for week/day view
  useEffect(() => {
    if (viewMode !== 'month' && scrollRef.current) {
      const currentHour = new Date().getHours();
      const scrollTo = Math.max(0, (currentHour - 2) * zoom);
      scrollRef.current.scrollTop = scrollTo;
    }
  }, [viewMode]);

  function navigate(direction: 'prev' | 'next') {
    if (viewMode === 'month') {
      setCurrentDate(direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(direction === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    } else {
      setCurrentDate(direction === 'prev' ? subDays(currentDate, 1) : addDays(currentDate, 1));
    }
  }

  function getTitle() {
    if (viewMode === 'month') return format(currentDate, 'MMMM yyyy');
    if (viewMode === 'week') {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      return `${format(ws, 'MMM d')} — ${format(we, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'EEEE, MMM d, yyyy');
  }

  // Drag handlers - instant reschedule, no confirmation
  function handleDragStart(post: PostWithRelations, e: React.DragEvent) {
    if (post.status === 'posted' || post.status === 'publishing') {
      e.preventDefault();
      return;
    }
    setDragPost(post);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', post.id);
  }

  function handleDragEnd() {
    setDragPost(null);
    setDropTarget(null);
  }

  async function dropOnSlot(day: Date, hour: number, e: React.DragEvent) {
    e.preventDefault();
    setDropTarget(null);
    if (!dragPost) return;

    // Keep original minutes, just change day and hour
    const origMinutes = dragPost.scheduled_at
      ? parseDate(dragPost.scheduled_at).getMinutes()
      : 0;
    const newDate = setMinutes(setHours(day, hour), origMinutes);

    const { error } = await supabase
      .from('posts')
      .update({ scheduled_at: newDate.toISOString(), status: 'scheduled', error_message: null })
      .eq('id', dragPost.id);

    if (error) {
      toast.error('Failed to move');
    } else {
      toast.success(`Moved to ${format(newDate, 'MMM d, h:mm a')}`);
      loadPosts();
    }
    setDragPost(null);
  }

  // Month drop (keeps time, changes day)
  async function dropOnDay(day: Date, e: React.DragEvent) {
    e.preventDefault();
    setDropTarget(null);
    if (!dragPost) return;

    const orig = dragPost.scheduled_at ? parseDate(dragPost.scheduled_at) : new Date();
    const newDate = setMinutes(setHours(day, orig.getHours()), orig.getMinutes());

    const { error } = await supabase
      .from('posts')
      .update({ scheduled_at: newDate.toISOString(), status: 'scheduled', error_message: null })
      .eq('id', dragPost.id);

    if (!error) {
      toast.success(`Moved to ${format(newDate, 'MMM d, h:mm a')}`);
      loadPosts();
    }
    setDragPost(null);
  }

  function handlePostClick(post: PostWithRelations, e: React.MouseEvent) {
    e.stopPropagation();
    if (dragPost) return;
    setSelectedPost(post);
    setDialogOpen(true);
  }

  function editPost(postId: string) {
    setDialogOpen(false);
    router.push(`/compose?id=${postId}`);
  }

  function handleSlotClick(day: Date, hour: number) {
    const dateStr = format(day, 'yyyy-MM-dd');
    router.push(`/compose?date=${dateStr}T${String(hour).padStart(2, '0')}:00`);
  }

  // Shared post pill component
  function PostPill({ post, compact = false }: { post: PostWithRelations; compact?: boolean }) {
    const plt = post.social_accounts?.platform || post.platform || '';
    const canDrag = post.status !== 'posted' && post.status !== 'publishing';
    return (
      <button
        type="button"
        draggable={canDrag}
        onDragStart={(e) => handleDragStart(post, e as unknown as React.DragEvent)}
        onDragEnd={handleDragEnd}
        className={`w-full flex items-center gap-1 rounded px-1.5 py-1 text-[10px] sm:text-[11px] truncate transition-colors text-left border ${
          canDrag ? 'cursor-grab active:cursor-grabbing' : ''
        } ${dragPost?.id === post.id ? 'opacity-30' : ''} ${
          post.status === 'posted' ? 'bg-red-600 border-red-700 text-white' :
          post.status === 'failed' ? 'bg-orange-500 border-orange-600 text-white' :
          'bg-background border-border hover:bg-accent'
        }`}
        onClick={(e) => handlePostClick(post, e)}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${platformColors[plt] || statusColors[post.status]}`} />
        {!compact && (
          <span className="text-[9px] font-bold flex-shrink-0 opacity-70">
            {platformLabels[plt] || ''}
          </span>
        )}
        {!compact && post.scheduled_at && (
          <span className="text-[9px] opacity-60 flex-shrink-0">
            {format(parseDate(post.scheduled_at), 'h:mm a')}
          </span>
        )}
        <span className="truncate opacity-80">
          {post.caption?.substring(0, compact ? 12 : 20) || ''}
        </span>
      </button>
    );
  }

  // ----- WEEK / DAY VIEW -----
  function TimeSlotView() {
    const days = viewMode === 'day'
      ? [currentDate]
      : eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const bestHours = bestTimes[bestTimePlatform] || [];

    function getPostsForSlot(day: Date, hour: number) {
      return posts.filter((p) => {
        if (!p.scheduled_at) return false;
        const d = parseDate(p.scheduled_at);
        return isSameDay(d, day) && getHours(d) === hour;
      });
    }

    return (
      <Card>
        <CardContent className="p-0">
          {/* Day headers */}
          <div className={`grid border-b sticky top-0 z-10 bg-background ${viewMode === 'day' ? 'grid-cols-[60px_1fr]' : 'grid-cols-[60px_repeat(7,1fr)]'}`}>
            <div className="p-2 text-xs text-muted-foreground border-r" />
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={`p-2 text-center border-r ${isToday(day) ? 'bg-primary/5' : ''}`}
              >
                <div className="text-[10px] text-muted-foreground uppercase">{format(day, 'EEE')}</div>
                <div className={`text-sm font-semibold ${
                  isToday(day)
                    ? 'bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto'
                    : ''
                }`}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div ref={scrollRef} className="overflow-y-auto max-h-[calc(100vh-240px)]">
            {hours.map((hour) => (
              <div
                key={hour}
                className={`grid ${viewMode === 'day' ? 'grid-cols-[60px_1fr]' : 'grid-cols-[60px_repeat(7,1fr)]'}`}
                style={{ minHeight: `${zoom}px` }}
              >
                {/* Time label */}
                <div className="p-1 text-[10px] sm:text-xs text-muted-foreground text-right pr-2 border-r border-b flex items-start justify-end pt-1">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>

                {/* Slots */}
                {days.map((day) => {
                  const slotPosts = getPostsForSlot(day, hour);
                  const isBestTime = bestHours.includes(hour);
                  const slotKey = `${day.toISOString()}-${hour}`;
                  const isDropping = dropTarget === slotKey;

                  return (
                    <div
                      key={slotKey}
                      className={`border-r border-b p-0.5 transition-colors cursor-pointer relative group ${
                        isBestTime ? 'bg-pink-50/60 dark:bg-pink-950/20' : ''
                      } ${isDropping ? 'bg-primary/15 ring-2 ring-primary ring-inset' : ''} ${
                        isToday(day) ? 'bg-primary/[0.02]' : ''
                      }`}
                      onClick={() => handleSlotClick(day, hour)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTarget(slotKey);
                      }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => dropOnSlot(day, hour, e)}
                    >
                      {/* Best time indicator */}
                      {isBestTime && (
                        <div className="absolute top-0 right-0 w-1 h-full bg-pink-300/40 dark:bg-pink-500/20" />
                      )}

                      {/* Add button on hover */}
                      <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>

                      {/* Posts in this slot */}
                      <div className="space-y-0.5">
                        {slotPosts.map((p) => (
                          <PostPill key={p.id} post={p} compact={viewMode === 'week'} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ----- MONTH VIEW -----
  function MonthView() {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);

    function getPostsForDay(day: Date) {
      return posts.filter((p) => {
        const d = p.scheduled_at || p.published_at;
        return d && isSameDay(new Date(d), day);
      });
    }

    return (
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="grid grid-cols-7 border-b min-w-[700px]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 min-w-[700px]">
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[120px] sm:min-h-[140px] border-b border-r p-1.5" />
            ))}
            {days.map((day) => {
              const dayPosts = getPostsForDay(day);
              const isDropping = dropTarget === day.toISOString();
              return (
                <div
                  key={day.toISOString()}
                  className={`group relative min-h-[120px] sm:min-h-[140px] border-b border-r p-1.5 cursor-pointer hover:bg-muted/50 transition-colors ${
                    isToday(day) ? 'bg-primary/5' : ''
                  } ${isDropping ? 'bg-primary/15 ring-2 ring-primary ring-inset' : ''}`}
                  onClick={() => router.push(`/compose?date=${format(day, 'yyyy-MM-dd')}`)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTarget(day.toISOString());
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => dropOnDay(day, e)}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${
                      isToday(day)
                        ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center'
                        : 'text-muted-foreground'
                    }`}>
                      {format(day, 'd')}
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayPosts.slice(0, 5).map((p) => (
                      <PostPill key={p.id} post={p} />
                    ))}
                    {dayPosts.length > 5 && (
                      <p className="text-[10px] text-muted-foreground pl-1">+{dayPosts.length - 5} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Drag posts to reschedule instantly</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Best times selector (week/day view) */}
          {viewMode !== 'month' && (
            <Select value={bestTimePlatform} onValueChange={setBestTimePlatform}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <Clock className="h-3.5 w-3.5 mr-1 text-pink-500" />
                <SelectValue placeholder="Best times" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No overlay</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="bluesky">Bluesky</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Zoom slider (week/day) */}
          {viewMode !== 'month' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">-</span>
              <input
                type="range"
                min={28}
                max={96}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-[60px] h-1 accent-primary"
              />
              <span className="text-[10px] text-muted-foreground">+</span>
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            {(['month', 'week', 'day'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  viewMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Today button */}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium min-w-[140px] text-center">{getTitle()}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar View */}
      {viewMode === 'month' ? <MonthView /> : <TimeSlotView />}

      {/* Post detail dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              Post Details
              {selectedPost && (
                <Button size="sm" onClick={() => editPost(selectedPost.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={statusColors[selectedPost.status] + ' text-white'}>
                  {selectedPost.status}
                </Badge>
                {selectedPost.social_accounts && (
                  <>
                    <Badge variant="secondary" className={platformBadgeColors[selectedPost.social_accounts.platform] || ''}>
                      {selectedPost.social_accounts.platform}
                    </Badge>
                    <Badge variant="outline">@{selectedPost.social_accounts.username}</Badge>
                  </>
                )}
                {selectedPost.media_type && (
                  <Badge variant="secondary" className="capitalize">{selectedPost.media_type}</Badge>
                )}
              </div>

              {selectedPost.scheduled_at && (
                <p className="text-sm"><span className="text-muted-foreground">Scheduled:</span> {format(parseDate(selectedPost.scheduled_at), 'PPP p')}</p>
              )}
              {selectedPost.published_at && (
                <p className="text-sm"><span className="text-muted-foreground">Published:</span> {format(parseDate(selectedPost.published_at), 'PPP p')}</p>
              )}

              <div className="rounded-lg bg-muted p-3 max-h-[200px] overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap break-words">{selectedPost.caption || 'No caption'}</p>
              </div>

              {selectedPost.post_media && selectedPost.post_media.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Media ({selectedPost.post_media.length})
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedPost.post_media
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .slice(0, 8)
                      .map((m) => (
                        <div key={m.id} className="aspect-square rounded-md overflow-hidden border bg-muted">
                          <img src={m.media_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {selectedPost.error_message && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {selectedPost.error_message}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={() => editPost(selectedPost.id)}>
                  <Pencil className="h-4 w-4 mr-2" />Edit Post
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
