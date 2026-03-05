'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Recycle, Copy, Heart, MessageCircle, Eye } from 'lucide-react';
import { useAccountStore } from '@/lib/store/account-store';

interface PostWithMetrics {
  id: string;
  caption: string;
  platform: string;
  account_id: string;
  published_at: string | null;
  post_metrics: { likes: number; comments: number; reach: number; engagement_rate: number }[];
}

export default function EvergreenPage() {
  const [posts, setPosts] = useState<PostWithMetrics[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const { activeAccountId } = useAccountStore();
  const supabase = createClient();

  const load = useCallback(async () => {
    let query = supabase
      .from('posts')
      .select('id, caption, platform, account_id, published_at, post_metrics(likes, comments, reach, engagement_rate)')
      .eq('status', 'posted')
      .order('published_at', { ascending: false })
      .limit(50);

    if (activeAccountId) {
      query = query.eq('account_id', activeAccountId);
    }

    const { data } = await query;
    setPosts(data || []);
  }, [supabase, activeAccountId]);

  useEffect(() => { load(); }, [load]);

  async function recycle(post: PostWithMetrics) {
    setLoading(post.id);
    const { error } = await supabase.from('posts').insert({
      account_id: post.account_id,
      platform: post.platform,
      caption: post.caption,
      status: 'draft',
      media_type: 'image',
      meta: { recycled_from: post.id },
    });
    if (error) toast.error(error.message);
    else toast.success('Post cloned to drafts!');
    setLoading(null);
  }

  const sorted = [...posts].sort((a, b) => {
    const aRate = a.post_metrics?.[0]?.engagement_rate || 0;
    const bRate = b.post_metrics?.[0]?.engagement_rate || 0;
    return bRate - aRate;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Evergreen Recycling</h1>
        <p className="text-muted-foreground">Clone your top-performing posts to repost them</p>
      </div>

      {!sorted.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No published posts to recycle yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((post, i) => {
            const m = post.post_metrics?.[0];
            return (
              <Card key={post.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-lg font-bold text-muted-foreground w-8">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{post.caption?.substring(0, 100) || 'No caption'}</p>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="capitalize">{post.platform}</span>
                        {m && (
                          <>
                            <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{m.likes}</span>
                            <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{m.comments}</span>
                            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{m.reach}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m && <Badge variant="secondary">{(m.engagement_rate * 100).toFixed(1)}%</Badge>}
                    <Button size="sm" onClick={() => recycle(post)} disabled={loading === post.id}>
                      <Recycle className="h-3.5 w-3.5 mr-1" />
                      {loading === post.id ? 'Cloning...' : 'Recycle'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
