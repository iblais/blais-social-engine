'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ImagePlus, Clock, Save, Trash2, ArrowLeft } from 'lucide-react';
import type { SocialAccount, ContentPillar, HashtagGroup, PostMedia } from '@/types/database';
import { useAccountStore } from '@/lib/store/account-store';

export default function ComposePage() {
  const [editId, setEditId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [accountId, setAccountId] = useState('');
  const [pillarId, setPillarId] = useState('');
  const [hashtagGroupId, setHashtagGroupId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [existingMedia, setExistingMedia] = useState<PostMedia[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [pillars, setPillars] = useState<ContentPillar[]>([]);
  const [hashtagGroups, setHashtagGroups] = useState<HashtagGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);
  const { activeAccountId } = useAccountStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Load existing post for editing
  useEffect(() => {
    const postId = searchParams.get('id');
    if (!postId) return;

    setEditId(postId);
    setLoadingPost(true);

    (async () => {
      const { data: post } = await supabase
        .from('posts')
        .select('*, post_media(*)')
        .eq('id', postId)
        .single();

      if (post) {
        setCaption(post.caption || '');
        setAccountId(post.account_id);
        setPillarId(post.pillar_id || '');
        setHashtagGroupId(post.hashtag_group_id || '');
        if (post.scheduled_at) {
          const d = new Date(post.scheduled_at);
          const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
          setScheduledAt(local.toISOString().slice(0, 16));
        }
        const media = (post.post_media || []).sort(
          (a: PostMedia, b: PostMedia) => a.sort_order - b.sort_order
        );
        setExistingMedia(media);
        setMediaPreviews(media.map((m: PostMedia) => m.media_url));
      }
      setLoadingPost(false);
    })();
  }, [searchParams, supabase]);

  // Pre-fill date from calendar click (?date=YYYY-MM-DD)
  useEffect(() => {
    const dateParam = searchParams.get('date');
    const postId = searchParams.get('id');
    if (dateParam && !postId && !scheduledAt) {
      setScheduledAt(`${dateParam}T09:00`);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = useCallback(async () => {
    const [{ data: accts }, { data: plrs }, { data: hgs }] = await Promise.all([
      supabase.from('social_accounts').select('*').eq('is_active', true),
      supabase.from('content_pillars').select('*').eq('is_active', true),
      supabase.from('hashtag_groups').select('*').eq('is_active', true),
    ]);
    setAccounts(accts || []);
    setPillars(plrs || []);
    setHashtagGroups(hgs || []);
    if (accts?.length && !accountId && !searchParams.get('id')) {
      const defaultId = activeAccountId && accts.some((a: SocialAccount) => a.id === activeAccountId)
        ? activeAccountId
        : accts[0].id;
      setAccountId(defaultId);
    }
  }, [supabase, accountId, activeAccountId, searchParams]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setMediaFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMediaPreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeMedia(index: number) {
    const existingCount = existingMedia.length - removedMediaIds.length;
    if (index < existingMedia.length && !removedMediaIds.includes(existingMedia[index].id)) {
      // Removing an existing media item
      setRemovedMediaIds((prev) => [...prev, existingMedia[index].id]);
    } else {
      // Removing a newly added file
      const fileIndex = index - existingCount;
      setMediaFiles((prev) => prev.filter((_, i) => i !== fileIndex));
    }
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(status: 'draft' | 'scheduled') {
    if (!accountId) {
      toast.error('Please select an account');
      return;
    }
    if (status === 'scheduled' && !scheduledAt) {
      toast.error('Please select a schedule date');
      return;
    }

    setLoading(true);
    try {
      const account = accounts.find((a) => a.id === accountId);
      const totalMedia = existingMedia.filter((m) => !removedMediaIds.includes(m.id)).length + mediaFiles.length;
      const mediaType = totalMedia > 1 ? 'carousel' : totalMedia === 1 ? 'image' : 'image';

      // Append hashtags to caption
      let fullCaption = caption;
      if (hashtagGroupId) {
        const group = hashtagGroups.find((g) => g.id === hashtagGroupId);
        if (group) {
          fullCaption += '\n\n' + group.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
        }
      }

      const postData = {
        account_id: accountId,
        platform: account?.platform || 'instagram',
        caption: fullCaption,
        media_type: mediaType,
        status,
        scheduled_at: status === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
        pillar_id: pillarId || null,
        hashtag_group_id: hashtagGroupId || null,
      };

      let postId: string;

      if (editId) {
        // Update existing post
        const { error: updateError } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', editId);
        if (updateError) throw updateError;
        postId = editId;

        // Remove deleted media
        for (const mediaId of removedMediaIds) {
          const media = existingMedia.find((m) => m.id === mediaId);
          if (media?.storage_path) {
            await supabase.storage.from('media').remove([media.storage_path]);
          }
          await supabase.from('post_media').delete().eq('id', mediaId);
        }
      } else {
        // Create new post
        const { data: post, error: postError } = await supabase
          .from('posts')
          .insert(postData)
          .select()
          .single();
        if (postError) throw postError;
        postId = post.id;
      }

      // Upload new media files
      const existingCount = existingMedia.filter((m) => !removedMediaIds.includes(m.id)).length;
      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const ext = file.name.split('.').pop();
        const storagePath = `posts/${postId}/${existingCount + i}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(storagePath, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(storagePath);

        await supabase.from('post_media').insert({
          post_id: postId,
          media_url: publicUrl,
          storage_path: storagePath,
          media_type: file.type.startsWith('video') ? 'video' : 'image',
          sort_order: existingCount + i,
          file_size: file.size,
        });
      }

      toast.success(editId
        ? 'Post updated!'
        : status === 'scheduled' ? 'Post scheduled!' : 'Draft saved!'
      );
      router.push('/queue');
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!editId) return;
    setLoading(true);
    try {
      // Delete media from storage
      for (const m of existingMedia) {
        if (m.storage_path) {
          await supabase.storage.from('media').remove([m.storage_path]);
        }
      }
      await supabase.from('post_media').delete().eq('post_id', editId);
      await supabase.from('posts').delete().eq('id', editId);
      toast.success('Post deleted');
      router.push('/queue');
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  if (loadingPost) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading post...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            {editId ? 'Edit Post' : 'Compose Post'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {editId ? 'Update caption, schedule, or media' : 'Create and schedule a new post'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-[1fr_280px]">
        {/* Main form */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 sm:pt-6 space-y-4">
              {/* Account selector */}
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        @{a.username} ({a.platform})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!accounts.length && (
                  <p className="text-xs text-muted-foreground">
                    No accounts yet. Add one in Settings &gt; Accounts.
                  </p>
                )}
              </div>

              {/* Caption */}
              <div className="space-y-2">
                <Label>Caption</Label>
                <Textarea
                  placeholder="Write your caption..."
                  className="min-h-[120px] sm:min-h-[150px] resize-y"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {caption.length} / 2,200
                </p>
              </div>

              {/* Media */}
              <div className="space-y-2">
                <Label>Media</Label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {mediaPreviews.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                      <img src={src} alt="" className="object-cover w-full h-full" />
                      <button
                        onClick={() => removeMedia(i)}
                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-black/70 transition-colors"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <label className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mobile: Show schedule + actions inline */}
          <div className="md:hidden space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Button
                onClick={() => handleSubmit('scheduled')}
                disabled={loading}
                className="flex-1"
              >
                <Clock className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : editId ? 'Update & Schedule' : 'Schedule'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSubmit('draft')}
                disabled={loading}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {editId ? 'Save' : 'Draft'}
              </Button>
            </div>
            {editId && (
              <Button variant="destructive" onClick={handleDelete} disabled={loading} className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />Delete Post
              </Button>
            )}
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden md:block space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Content Pillar</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={pillarId} onValueChange={setPillarId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {pillars.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Hashtag Group</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={hashtagGroupId} onValueChange={setHashtagGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {hashtagGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {g.hashtags.length}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => handleSubmit('scheduled')}
              disabled={loading}
              className="w-full"
            >
              <Clock className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : editId ? 'Update & Schedule' : 'Schedule'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSubmit('draft')}
              disabled={loading}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {editId ? 'Save Changes' : 'Save Draft'}
            </Button>
            {editId && (
              <Button variant="destructive" onClick={handleDelete} disabled={loading} className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />Delete Post
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
