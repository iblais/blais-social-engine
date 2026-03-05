'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Recycle, Heart, MessageCircle, Eye, Sparkles, Loader2 } from 'lucide-react';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';

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
  const { accountIds, activeBrandId } = useBrandAccounts();
  const supabase = createClient();

  const load = useCallback(async () => {
    let query = supabase
      .from('posts')
      .select('id, caption, platform, account_id, published_at, post_metrics(likes, comments, reach, engagement_rate)')
      .eq('status', 'posted')
      .order('published_at', { ascending: false })
      .limit(50);

    if (activeBrandId && accountIds.length) {
      query = query.in('account_id', accountIds);
    }

    const { data } = await query;
    setPosts(data || []);
  }, [supabase, activeBrandId, accountIds]);

  useEffect(() => { load(); }, [load]);

  async function reimagine(post: PostWithMetrics) {
    setLoading(post.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Not authenticated'); setLoading(null); return; }

      // Use AI to create a fresh new caption inspired by the original
      const res = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: `Create a completely fresh and new caption inspired by this high-performing post. DO NOT copy it — reimagine the same theme/topic with a new angle, new hooks, and fresh language. Original post: "${post.caption?.substring(0, 500)}"`,
          platform: post.platform,
          includeHashtags: true,
          includeEmojis: true,
          includeCTA: true,
        }),
      });

      let newCaption: string;
      if (res.ok) {
        const data = await res.json();
        newCaption = data.caption;
      } else {
        // Fallback if AI fails — still create a draft but with original caption as starting point
        newCaption = post.caption || '';
        toast.info('AI unavailable — created draft with original caption for editing');
      }

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        account_id: post.account_id,
        platform: post.platform,
        caption: newCaption,
        status: 'draft',
        media_type: 'image',
        meta: { evergreen_from: post.id, ai_reimagined: res.ok },
      });

      if (error) toast.error(error.message);
      else toast.success('New AI-reimagined post created as draft!');
    } catch (err) {
      toast.error((err as Error).message);
    }
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
        <p className="text-muted-foreground">AI reimagines your top posts as fresh new content</p>
      </div>

      {!sorted.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No published posts to recycle yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((post, i) => {
            const m = post.post_metrics?.[0];
            const isLoading = loading === post.id;
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
                    <Button size="sm" onClick={() => reimagine(post)} disabled={isLoading}>
                      {isLoading ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Creating...</>
                      ) : (
                        <><Sparkles className="h-3.5 w-3.5 mr-1" />Reimagine</>
                      )}
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
