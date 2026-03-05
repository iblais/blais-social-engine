'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Plus, Pencil } from 'lucide-react';
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
import type { Post, PostMedia } from '@/types/database';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';

interface PostWithRelations extends Post {
  social_accounts?: { username: string; platform: string } | null;
  post_media?: PostMedia[];
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostWithRelations | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { accountIds, activeBrandId } = useBrandAccounts();
  const supabase = createClient();
  const router = useRouter();

  const loadPosts = useCallback(async () => {
    const start = startOfMonth(currentMonth).toISOString();
    const end = endOfMonth(currentMonth).toISOString();

    let query = supabase
      .from('posts')
      .select('*, social_accounts(username, platform), post_media(*)')
      .or(`scheduled_at.gte.${start},published_at.gte.${start}`)
      .or(`scheduled_at.lte.${end},published_at.lte.${end}`)
      .order('scheduled_at', { ascending: true });

    if (activeBrandId && accountIds.length) {
      query = query.in('account_id', accountIds);
    }

    const { data } = await query;
    setPosts(data || []);
  }, [supabase, currentMonth, activeBrandId, accountIds]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-400',
    scheduled: 'bg-blue-500',
    publishing: 'bg-yellow-500',
    posted: 'bg-green-500',
    failed: 'bg-red-500',
    retry: 'bg-orange-500',
  };

  const statusLabels: Record<string, string> = {
    draft: 'Draft',
    scheduled: 'Scheduled',
    publishing: 'Publishing',
    posted: 'Posted',
    failed: 'Failed',
    retry: 'Retry',
  };

  function getPostsForDay(day: Date) {
    return posts.filter((p) => {
      const d = p.scheduled_at || p.published_at;
      return d && isSameDay(new Date(d), day);
    });
  }

  function handleDayClick(day: Date) {
    const dateStr = format(day, 'yyyy-MM-dd');
    router.push(`/compose?date=${dateStr}`);
  }

  function handlePostClick(post: PostWithRelations, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedPost(post);
    setDialogOpen(true);
  }

  function editPost(postId: string) {
    setDialogOpen(false);
    router.push(`/compose?id=${postId}`);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Tap a day to add a post, tap a post to view details</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs sm:text-sm font-medium w-28 sm:w-36 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b min-w-[560px]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="p-1.5 sm:p-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 min-w-[560px]">
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[72px] sm:min-h-[100px] border-b border-r p-1" />
            ))}
            {days.map((day) => {
              const dayPosts = getPostsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`group relative min-h-[72px] sm:min-h-[100px] border-b border-r p-1 cursor-pointer hover:bg-muted/50 transition-colors active:bg-muted/70 ${
                    isToday(day) ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => handleDayClick(day)}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] sm:text-xs font-medium ${
                        isToday(day)
                          ? 'bg-primary text-primary-foreground rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-[10px]'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                    </span>
                  </div>
                  <div className="mt-0.5 sm:mt-1 space-y-0.5">
                    {dayPosts.slice(0, 3).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-[9px] sm:text-[10px] bg-muted truncate hover:bg-accent hover:text-accent-foreground transition-colors text-left"
                        onClick={(e) => handlePostClick(p, e)}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColors[p.status]}`} />
                        <span className="truncate">
                          {p.scheduled_at ? format(new Date(p.scheduled_at), 'HH:mm') : ''}{' '}
                          {p.caption?.substring(0, 18) || 'No caption'}
                        </span>
                      </button>
                    ))}
                    {dayPosts.length > 3 && (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground pl-1">
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
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={statusColors[selectedPost.status] + ' text-white'}>
                  {statusLabels[selectedPost.status] || selectedPost.status}
                </Badge>
                {selectedPost.social_accounts && (
                  <Badge variant="outline">
                    {selectedPost.social_accounts.username.startsWith('@') ? selectedPost.social_accounts.username : `@${selectedPost.social_accounts.username}`}
                  </Badge>
                )}
                {selectedPost.social_accounts && (
                  <Badge variant="secondary" className="capitalize">
                    {selectedPost.social_accounts.platform}
                  </Badge>
                )}
                {selectedPost.media_type && (
                  <Badge variant="secondary" className="capitalize">{selectedPost.media_type}</Badge>
                )}
              </div>

              {/* Schedule info */}
              {selectedPost.scheduled_at && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Scheduled:</span>
                  <span className="font-medium">{format(new Date(selectedPost.scheduled_at), 'PPP p')}</span>
                </div>
              )}
              {selectedPost.published_at && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Published:</span>
                  <span className="font-medium">{format(new Date(selectedPost.published_at), 'PPP p')}</span>
                </div>
              )}

              {/* Caption */}
              <div className="rounded-lg bg-muted p-3 max-h-[200px] overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap break-words">{selectedPost.caption || 'No caption'}</p>
              </div>

              {/* Media thumbnails */}
              {selectedPost.post_media && selectedPost.post_media.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Media ({selectedPost.post_media.length} {selectedPost.post_media.length === 1 ? 'file' : 'files'})
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedPost.post_media
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .slice(0, 8)
                      .map((m) => (
                        <div key={m.id} className="aspect-square rounded-md overflow-hidden border bg-muted">
                          <img
                            src={m.media_url}
                            alt={`Slide ${m.sort_order + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                  </div>
                  {selectedPost.post_media.length > 8 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      +{selectedPost.post_media.length - 8} more slides
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {selectedPost.error_message && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {selectedPost.error_message}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={() => editPost(selectedPost.id)}>
                  <Pencil className="h-4 w-4 mr-2" />Edit Post
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
