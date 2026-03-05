'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ImagePlus, Clock, Save, Trash2, ArrowLeft, Check } from 'lucide-react';
import type { SocialAccount, PostMedia } from '@/types/database';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';

// Platform config
const PLATFORM_META: Record<string, { icon: string; label: string; color: string; charLimit: number; postTypes: { value: string; label: string }[] }> = {
  instagram: { icon: 'IG', label: 'Instagram', color: '#E1306C', charLimit: 2200, postTypes: [{ value: 'post', label: 'Post' }, { value: 'reel', label: 'Reel' }, { value: 'story', label: 'Story' }] },
  facebook:  { icon: 'FB', label: 'Facebook',  color: '#1877F2', charLimit: 16192, postTypes: [{ value: 'post', label: 'Post' }, { value: 'reel', label: 'Reel' }, { value: 'story', label: 'Story' }] },
  twitter:   { icon: 'X',  label: 'Twitter/X', color: '#000000', charLimit: 280, postTypes: [{ value: 'post', label: 'Post' }] },
  youtube:   { icon: 'YT', label: 'YouTube',   color: '#FF0000', charLimit: 5000, postTypes: [{ value: 'video', label: 'Video' }, { value: 'short', label: 'Short' }] },
  tiktok:    { icon: 'TK', label: 'TikTok',    color: '#000000', charLimit: 2200, postTypes: [{ value: 'post', label: 'Post' }] },
  bluesky:   { icon: 'BS', label: 'Bluesky',   color: '#0085FF', charLimit: 300, postTypes: [{ value: 'post', label: 'Post' }] },
  pinterest: { icon: 'PN', label: 'Pinterest',  color: '#E60023', charLimit: 500, postTypes: [{ value: 'pin', label: 'Pin' }] },
  linkedin:  { icon: 'LI', label: 'LinkedIn',   color: '#0A66C2', charLimit: 3000, postTypes: [{ value: 'post', label: 'Post' }] },
};

export default function ComposePage() {
  const [editId, setEditId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [existingMedia, setExistingMedia] = useState<PostMedia[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);

  // Multi-platform: which accounts are enabled for this post
  const [enabledAccountIds, setEnabledAccountIds] = useState<Set<string>>(new Set());
  // Per-platform post type
  const [postTypes, setPostTypes] = useState<Record<string, string>>({});
  // Which platform preview is shown
  const [previewPlatform, setPreviewPlatform] = useState<string>('instagram');

  const { accounts: brandAccounts } = useBrandAccounts();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Auto-enable all brand accounts when brand changes (only for new posts)
  useEffect(() => {
    if (editId || !brandAccounts.length) return;
    const newEnabled = new Set(brandAccounts.map((a) => a.id));
    setEnabledAccountIds(newEnabled);
    // Set default post types
    const types: Record<string, string> = {};
    for (const acc of brandAccounts) {
      const meta = PLATFORM_META[acc.platform];
      if (meta) types[acc.id] = meta.postTypes[0].value;
    }
    setPostTypes(types);
    // Set preview to first platform
    if (brandAccounts[0]) setPreviewPlatform(brandAccounts[0].platform);
  }, [brandAccounts, editId]);

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
        setEnabledAccountIds(new Set([post.account_id]));
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
        setPreviewPlatform(post.platform);
      }
      setLoadingPost(false);
    })();
  }, [searchParams, supabase]);

  // Pre-fill date from calendar
  useEffect(() => {
    const dateParam = searchParams.get('date');
    const postId = searchParams.get('id');
    if (dateParam && !postId && !scheduledAt) {
      setScheduledAt(`${dateParam}T09:00`);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleAccount(id: string) {
    setEnabledAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setPostType(accountId: string, type: string) {
    setPostTypes((prev) => ({ ...prev, [accountId]: type }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setMediaFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setMediaPreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
  }

  function removeMedia(index: number) {
    const liveExisting = existingMedia.filter((m) => !removedMediaIds.includes(m.id));
    if (index < liveExisting.length) {
      setRemovedMediaIds((prev) => [...prev, liveExisting[index].id]);
    } else {
      const fileIndex = index - liveExisting.length;
      setMediaFiles((prev) => prev.filter((_, i) => i !== fileIndex));
    }
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  // Get active char limit
  const activeCharLimit = useMemo(() => {
    const meta = PLATFORM_META[previewPlatform];
    return meta?.charLimit || 2200;
  }, [previewPlatform]);

  async function handleSubmit(status: 'draft' | 'scheduled') {
    const enabled = Array.from(enabledAccountIds);
    if (!enabled.length) {
      toast.error('Select at least one platform');
      return;
    }
    if (status === 'scheduled' && !scheduledAt) {
      toast.error('Pick a schedule date & time');
      return;
    }

    setLoading(true);
    try {
      const totalMedia = existingMedia.filter((m) => !removedMediaIds.includes(m.id)).length + mediaFiles.length;
      const mediaType = totalMedia > 1 ? 'carousel' : totalMedia === 1 ? 'image' : 'image';
      const scheduledIso = status === 'scheduled' ? new Date(scheduledAt).toISOString() : null;

      if (editId) {
        // Update single post
        const acc = brandAccounts.find((a) => enabledAccountIds.has(a.id));
        const { error } = await supabase.from('posts').update({
          caption,
          media_type: mediaType,
          status,
          scheduled_at: scheduledIso,
          account_id: acc?.id || editId,
          platform: acc?.platform || 'instagram',
        }).eq('id', editId);
        if (error) throw error;

        // Handle removed media
        for (const mediaId of removedMediaIds) {
          const media = existingMedia.find((m) => m.id === mediaId);
          if (media?.storage_path) await supabase.storage.from('media').remove([media.storage_path]);
          await supabase.from('post_media').delete().eq('id', mediaId);
        }

        // Upload new files
        const existingCount = existingMedia.filter((m) => !removedMediaIds.includes(m.id)).length;
        await uploadMedia(editId, existingCount);

        toast.success('Post updated!');
      } else {
        // Create one post per enabled account
        let created = 0;
        for (const accId of enabled) {
          const acc = brandAccounts.find((a) => a.id === accId);
          if (!acc) continue;

          const { data: post, error: postErr } = await supabase.from('posts').insert({
            account_id: accId,
            platform: acc.platform,
            caption,
            media_type: mediaType,
            status,
            scheduled_at: scheduledIso,
          }).select('id').single();

          if (postErr) {
            console.error(`Failed for ${acc.username}:`, postErr.message);
            continue;
          }

          await uploadMedia(post.id, 0);
          created++;
        }

        toast.success(`${status === 'scheduled' ? 'Scheduled' : 'Saved'} to ${created} platform${created !== 1 ? 's' : ''}!`);
      }

      router.push('/queue');
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function uploadMedia(postId: string, startIndex: number) {
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      const ext = file.name.split('.').pop();
      const storagePath = `posts/${postId}/${startIndex + i}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('media').upload(storagePath, file);
      if (uploadError) { console.error('Upload error:', uploadError.message); continue; }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(storagePath);
      await supabase.from('post_media').insert({
        post_id: postId,
        media_url: publicUrl,
        storage_path: storagePath,
        media_type: file.type.startsWith('video') ? 'video' : 'image',
        sort_order: startIndex + i,
        file_size: file.size,
      });
    }
  }

  async function handleDelete() {
    if (!editId) return;
    setLoading(true);
    try {
      for (const m of existingMedia) {
        if (m.storage_path) await supabase.storage.from('media').remove([m.storage_path]);
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
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading post...</p></div>;
  }

  const previewAccount = brandAccounts.find((a) => a.platform === previewPlatform);
  const previewUsername = previewAccount?.username || 'you';

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">
          {editId ? 'Edit Post' : 'Create New Post'}
        </h1>
      </div>

      {/* Platform selector bar */}
      <div className="flex items-center gap-1.5 flex-wrap p-2 bg-muted/50 rounded-lg border">
        {brandAccounts.map((acc) => {
          const meta = PLATFORM_META[acc.platform];
          if (!meta) return null;
          const isEnabled = enabledAccountIds.has(acc.id);
          const currentType = postTypes[acc.id] || meta.postTypes[0].value;

          return (
            <div key={acc.id} className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => { toggleAccount(acc.id); setPreviewPlatform(acc.platform); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isEnabled
                    ? 'text-white shadow-sm'
                    : 'text-muted-foreground bg-background border hover:bg-muted'
                }`}
                style={isEnabled ? { backgroundColor: meta.color } : undefined}
              >
                <span className="text-xs font-bold">{meta.icon}</span>
                {isEnabled && <Check className="h-3 w-3" />}
              </button>
              {isEnabled && meta.postTypes.length > 1 && (
                <select
                  value={currentType}
                  onChange={(e) => setPostType(acc.id, e.target.value)}
                  className="text-[10px] bg-background border rounded px-1 py-0.5 h-6"
                >
                  {meta.postTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
        {!brandAccounts.length && (
          <p className="text-sm text-muted-foreground px-2">No accounts connected — go to Settings to connect platforms</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Left: Editor */}
        <div className="space-y-4">
          {/* Caption */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <Textarea
                placeholder="Write your caption..."
                className="min-h-[200px] sm:min-h-[250px] resize-y border-0 shadow-none focus-visible:ring-0 text-base p-0"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              {/* Toolbar row */}
              <div className="flex items-center justify-between border-t pt-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer hover:bg-muted rounded p-1.5 transition-colors">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
                <span className={`text-xs ${caption.length > activeCharLimit ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                  {caption.length} / {activeCharLimit.toLocaleString()}
                  <span className="ml-1 inline-block w-3 h-3 rounded-full align-middle" style={{ backgroundColor: PLATFORM_META[previewPlatform]?.color || '#888' }} />
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Media grid */}
          {mediaPreviews.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {mediaPreviews.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                      <img src={src} alt="" className="object-cover w-full h-full" />
                      <button
                        onClick={() => removeMedia(i)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-black/80"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <label className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Schedule + Actions (mobile) */}
          <div className="lg:hidden space-y-3">
            <Card>
              <CardContent className="pt-4">
                <Label className="text-xs text-muted-foreground mb-1 block">Schedule Date & Time</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Button onClick={() => handleSubmit('scheduled')} disabled={loading} className="flex-1">
                <Clock className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : editId ? 'Update' : `Schedule (${enabledAccountIds.size})`}
              </Button>
              <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={loading}>
                <Save className="h-4 w-4 mr-1" />Draft
              </Button>
            </div>
            {editId && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading} className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />Delete
              </Button>
            )}
          </div>
        </div>

        {/* Right: Preview + Schedule (desktop) */}
        <div className="hidden lg:block space-y-4">
          {/* Platform preview tabs */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-1 mb-3 flex-wrap">
                {Array.from(new Set(brandAccounts.filter((a) => enabledAccountIds.has(a.id)).map((a) => a.platform))).map((plat) => {
                  const meta = PLATFORM_META[plat];
                  if (!meta) return null;
                  return (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => setPreviewPlatform(plat)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        previewPlatform === plat ? 'text-white ring-2 ring-offset-2' : 'text-muted-foreground bg-muted'
                      }`}
                      style={previewPlatform === plat ? { backgroundColor: meta.color, ['--tw-ring-color' as string]: meta.color } : undefined}
                    >
                      {meta.icon}
                    </button>
                  );
                })}
              </div>

              {/* Mock preview */}
              <div className="border rounded-xl p-4 bg-background">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: PLATFORM_META[previewPlatform]?.color || '#888' }}
                  >
                    {(previewUsername[0] || '?').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{previewUsername}</p>
                    <p className="text-[10px] text-muted-foreground">Just now</p>
                  </div>
                </div>

                {/* Media preview */}
                {mediaPreviews.length > 0 && (
                  <div className="mb-3 rounded-lg overflow-hidden border aspect-square max-h-[200px]">
                    <img src={mediaPreviews[0]} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Caption preview */}
                <p className="text-sm whitespace-pre-wrap break-words line-clamp-6">
                  {caption || <span className="text-muted-foreground italic">Your caption here...</span>}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Active platforms summary */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Posting to</p>
              <div className="space-y-1.5">
                {brandAccounts.filter((a) => enabledAccountIds.has(a.id)).map((acc) => {
                  const meta = PLATFORM_META[acc.platform];
                  return (
                    <div key={acc.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta?.color || '#888' }} />
                      <span className="font-medium">{meta?.label}</span>
                      <span className="text-muted-foreground text-xs">{acc.username.startsWith('@') ? acc.username : `@${acc.username}`}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto capitalize">{postTypes[acc.id] || 'post'}</Badge>
                    </div>
                  );
                })}
                {enabledAccountIds.size === 0 && (
                  <p className="text-xs text-muted-foreground">No platforms selected</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <Label className="text-xs text-muted-foreground">Schedule Date & Time</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button onClick={() => handleSubmit('scheduled')} disabled={loading} className="w-full">
              <Clock className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : editId ? 'Update & Schedule' : `Schedule to ${enabledAccountIds.size} platform${enabledAccountIds.size !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={loading} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              {editId ? 'Save Changes' : 'Save as Draft'}
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
