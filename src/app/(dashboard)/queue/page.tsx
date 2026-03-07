'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { Trash2, RotateCcw, Pencil, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';

interface PostRow {
  id: string;
  caption: string;
  status: string;
  media_type: string;
  scheduled_at: string | null;
  published_at: string | null;
  retry_count: number;
  error_message: string | null;
  social_accounts: { username: string; platform: string } | null;
}

const STATUS_TABS = ['all', 'scheduled', 'draft', 'posted', 'failed'] as const;

export default function QueuePage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const { accountIds, activeBrandId } = useBrandAccounts();
  const supabase = createClient();
  const router = useRouter();

  const loadPosts = useCallback(async () => {
    let query = supabase
      .from('posts')
      .select('*, social_accounts(username, platform)')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(200);

    if (activeTab !== 'all') {
      query = query.eq('status', activeTab);
    }
    if (activeBrandId && accountIds.length) {
      query = query.in('account_id', accountIds);
    }

    const { data } = await query;
    setPosts(data || []);
  }, [supabase, activeTab, activeBrandId, accountIds]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  async function deletePost(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) { toast.error('Failed to delete post'); return; }
    toast.success('Post deleted');
    loadPosts();
  }

  async function retryPost(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const { error } = await supabase
      .from('posts')
      .update({ status: 'scheduled', error_message: null, retry_count: 0 })
      .eq('id', id);
    if (error) { toast.error('Failed to retry post'); return; }
    toast.success('Post queued for retry');
    loadPosts();
  }

  function editPost(id: string) {
    router.push(`/compose?id=${id}`);
  }

  const statusBadge: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    publishing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    posted: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    retry: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Queue</h1>
        <p className="text-sm text-muted-foreground">Manage your posts — tap any post to edit</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="capitalize text-xs sm:text-sm">
              {tab}
              {tab !== 'all' && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({posts.filter((p) => p.status === tab).length})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {!posts.length ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No posts found
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile: Card layout */}
              <div className="space-y-3 sm:hidden">
                {posts.map((post) => (
                  <Card
                    key={post.id}
                    className="cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors"
                    onClick={() => editPost(post.id)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium line-clamp-2 flex-1">
                          {post.caption?.substring(0, 80) || 'No caption'}
                        </p>
                        <Badge variant="secondary" className={`shrink-0 text-[10px] ${statusBadge[post.status] || ''}`}>
                          {post.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>@{post.social_accounts?.username ?? '—'}</span>
                        <div className="flex items-center gap-1">
                          {post.scheduled_at && (
                            <>
                              <Clock className="h-3 w-3" />
                              {format(new Date(post.scheduled_at), 'MMM d, h:mm a')}
                            </>
                          )}
                        </div>
                      </div>
                      {post.error_message && (
                        <div className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span className="truncate">{post.error_message}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 pt-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); editPost(post.id); }}>
                          <Pencil className="h-3 w-3 mr-1" />Edit
                        </Button>
                        {post.status === 'failed' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => retryPost(post.id, e)}>
                            <RotateCcw className="h-3 w-3 mr-1" />Retry
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={(e) => deletePost(post.id, e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop: Table layout */}
              <Card className="hidden sm:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Caption</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead className="w-[140px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posts.map((post) => (
                        <TableRow
                          key={post.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => editPost(post.id)}
                        >
                          <TableCell className="max-w-[280px]">
                            <p className="truncate text-sm">{post.caption?.substring(0, 60) || 'No caption'}</p>
                            {post.error_message && (
                              <p className="text-xs text-destructive truncate mt-0.5">{post.error_message}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            @{post.social_accounts?.username ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize text-xs">
                              {post.media_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={statusBadge[post.status] || ''}>
                              {post.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {post.scheduled_at
                              ? format(new Date(post.scheduled_at), 'MMM d, h:mm a')
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editPost(post.id)} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {post.status === 'failed' && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => retryPost(post.id, e)} title="Retry">
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => deletePost(post.id, e)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
