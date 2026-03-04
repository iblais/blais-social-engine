'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
interface PostRow {
  id: string;
  caption: string;
  status: string;
  scheduled_at: string | null;
  retry_count: number;
  social_accounts: { username: string; platform: string } | null;
}

const STATUS_TABS = ['all', 'draft', 'scheduled', 'posted', 'failed'] as const;

export default function QueuePage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const supabase = createClient();

  const loadPosts = useCallback(async () => {
    let query = supabase
      .from('posts')
      .select('*, social_accounts(username, platform)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (activeTab !== 'all') {
      query = query.eq('status', activeTab);
    }

    const { data } = await query;
    setPosts(data || []);
  }, [supabase, activeTab]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  async function deletePost(id: string) {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete post');
      return;
    }
    toast.success('Post deleted');
    loadPosts();
  }

  async function retryPost(id: string) {
    const { error } = await supabase
      .from('posts')
      .update({ status: 'scheduled', error_message: null, retry_count: 0 })
      .eq('id', id);
    if (error) {
      toast.error('Failed to retry post');
      return;
    }
    toast.success('Post queued for retry');
    loadPosts();
  }

  const statusVariant: Record<string, string> = {
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
        <h1 className="text-2xl font-bold">Queue</h1>
        <p className="text-muted-foreground">Manage your posts</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="capitalize">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caption</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!posts.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No posts found
                      </TableCell>
                    </TableRow>
                  ) : (
                    posts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell className="max-w-[300px]">
                          <p className="truncate text-sm">
                            {post.caption || 'No caption'}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          @{post.social_accounts?.username ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusVariant[post.status] || ''}>
                            {post.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {post.scheduled_at
                            ? format(new Date(post.scheduled_at), 'MMM d, HH:mm')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {post.status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => retryPost(post.id)}
                                title="Retry"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deletePost(post.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
