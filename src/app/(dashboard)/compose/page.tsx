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
import { ImagePlus, Clock, Save, Send, Trash2, ArrowLeft, Check, Sparkles } from 'lucide-react';
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
  const [libraryMedia, setLibraryMedia] = useState<{ url: string; path: string; type: string; size: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPost, setLoadingPost] = useState(false);
  const [aiCaptionLoading, setAiCaptionLoading] = useState(false);
  const [firstComment, setFirstComment] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  // Multi-platform: which accounts are enabled for this post
  const [enabledAccountIds, setEnabledAccountIds] = useState<Set<string>>(new Set());
  // Per-platform post type
  const [postTypes, setPostTypes] = useState<Record<string, string>>({});
  // Which platform preview is shown
  const [previewPlatform, setPreviewPlatform] = useState<string>('instagram');

  const { accounts: brandAccounts } = useBrandAccounts();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

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
        if (post.first_comment) setFirstComment(post.first_comment);
        if (post.post_type) {
          setPostTypes((prev) => ({ ...prev, [post.account_id]: post.post_type }));
        }
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

  // Load media from library (?media=url1,url2,...)
  useEffect(() => {
    const mediaParam = searchParams.get('media');
    if (!mediaParam || searchParams.get('id')) return;
    const urls = mediaParam.split(',').map(decodeURIComponent).filter(Boolean);
    if (!urls.length) return;
    (async () => {
      const { data } = await supabase.from('media_assets').select('url, storage_path, media_type, file_size').in('url', urls);
      if (!data?.length) return;
      const ordered = urls.map(u => data.find(d => d.url === u)).filter(Boolean) as typeof data;
      const lib = ordered.map(d => ({ url: d.url, path: d.storage_path, type: d.media_type, size: d.file_size }));
      setLibraryMedia(lib);
      setMediaPreviews(lib.map(l => l.url));
    })();
  }, [searchParams, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!files.length) return;
    setMediaFiles((prev) => [...prev, ...files]);
    const urls = files.map((f) => URL.createObjectURL(f));
    setMediaPreviews((prev) => [...prev, ...urls]);
  }

  function removeMedia(index: number) {
    const liveExisting = existingMedia.filter((m) => !removedMediaIds.includes(m.id));
    if (index < liveExisting.length) {
      setRemovedMediaIds((prev) => [...prev, liveExisting[index].id]);
    } else {
      const libIndex = index - liveExisting.length;
      if (libIndex < libraryMedia.length) {
        setLibraryMedia((prev) => prev.filter((_, i) => i !== libIndex));
      } else {
        const fileIndex = libIndex - libraryMedia.length;
        setMediaFiles((prev) => prev.filter((_, i) => i !== fileIndex));
      }
    }
    // Revoke blob URL to free memory
    const url = mediaPreviews[index];
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  // Check if a preview URL is a video (blob from video file, or existing video media)
  function isVideoPreview(index: number): boolean {
    const liveExisting = existingMedia.filter((m) => !removedMediaIds.includes(m.id));
    if (index < liveExisting.length) return liveExisting[index].media_type === 'video';
    const libIndex = index - liveExisting.length;
    if (libIndex < libraryMedia.length) return libraryMedia[libIndex].type === 'video';
    const fileIndex = libIndex - libraryMedia.length;
    return mediaFiles[fileIndex]?.type?.startsWith('video') || false;
  }

  // AI caption generation — analyzes uploaded images with Gemini vision
  async function generateAICaption() {
    setAiCaptionLoading(true);
    try {
      // Collect image URLs for AI vision — convert blob URLs to data URLs, pass public URLs as-is
      const imageData: string[] = [];
      const liveExisting = existingMedia.filter((m) => !removedMediaIds.includes(m.id));
      for (let i = 0; i < mediaPreviews.length; i++) {
        const src = mediaPreviews[i];
        if (src.startsWith('blob:')) {
          // Convert blob to data URL for the API (only for images, skip videos)
          if (!isVideoPreview(i)) {
            const fileIndex = i - liveExisting.length;
            if (fileIndex >= 0 && mediaFiles[fileIndex]) {
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target?.result as string);
                reader.readAsDataURL(mediaFiles[fileIndex]);
              });
              imageData.push(dataUrl);
            }
          }
        } else {
          imageData.push(src); // public URLs from existing media
        }
      }

      const res = await fetch('/api/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: caption || undefined,
          platform: PLATFORM_META[previewPlatform]?.label || 'Instagram',
          includeHashtags: true,
          includeEmojis: true,
          includeCTA: true,
          images: imageData.length ? imageData : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCaption(data.caption);
      toast.success('AI caption generated!');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAiCaptionLoading(false);
    }
  }

  // Get active char limit
  const activeCharLimit = useMemo(() => {
    const meta = PLATFORM_META[previewPlatform];
    return meta?.charLimit || 2200;
  }, [previewPlatform]);

  async function handleSubmit(status: 'draft' | 'scheduled' | 'now') {
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
    setUploadProgress(mediaFiles.length ? 'Uploading media...' : 'Saving...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Not authenticated'); setLoading(false); return; }

      const totalMedia = existingMedia.filter((m) => !removedMediaIds.includes(m.id)).length + libraryMedia.length + mediaFiles.length;
      // "now" = schedule in the past so the cron picks it up immediately
      const dbStatus = status === 'now' ? 'scheduled' : status;
      const scheduledIso = status === 'now'
        ? new Date(Date.now() - 60_000).toISOString()
        : status === 'scheduled' ? new Date(scheduledAt).toISOString() : null;

      // Detect media type based on content and platform
      function getMediaType(platform: string): string {
        const hasVideo = mediaFiles.some(f => f.type.startsWith('video')) ||
          existingMedia.filter(m => !removedMediaIds.includes(m.id)).some(m => m.media_type === 'video') ||
          libraryMedia.some(l => l.type === 'video');
        if (hasVideo) return 'video';
        if (totalMedia > 1 && platform === 'instagram') return 'carousel';
        return 'image';
      }

      // Upload media files ONCE (shared across all posts)
      const uploadedMedia = mediaFiles.length > 0 ? await uploadMediaOnce(user.id) : [];
      setUploadProgress('Saving posts...');

      if (editId) {
        // Update the original post with the first enabled account
        const originalAccId = enabled[0];
        const originalAcc = brandAccounts.find((a) => a.id === originalAccId);
        if (!originalAcc) {
          toast.error('Account not found — it may have been disconnected. Reconnect in Settings > Accounts.');
          setLoading(false);
          return;
        }
        const { error } = await supabase.from('posts').update({
          caption,
          first_comment: firstComment || null,
          media_type: getMediaType(originalAcc.platform),
          post_type: postTypes[originalAcc.id] || 'post',
          status: dbStatus,
          scheduled_at: scheduledIso,
          account_id: originalAcc.id,
          platform: originalAcc.platform,
        }).eq('id', editId);
        if (error) throw error;

        // Handle removed media
        for (const mediaId of removedMediaIds) {
          const media = existingMedia.find((m) => m.id === mediaId);
          if (media?.storage_path) await supabase.storage.from('media').remove([media.storage_path]);
          await supabase.from('post_media').delete().eq('id', mediaId);
        }

        // Link library + uploaded media to the original post
        const existingCount = existingMedia.filter((m) => !removedMediaIds.includes(m.id)).length;
        await linkMediaToPost(editId, libraryMedia, existingCount);
        await linkMediaToPost(editId, uploadedMedia, existingCount + libraryMedia.length);

        // Create new posts for any additionally enabled platforms
        const additionalAccIds = enabled.slice(1);
        for (const accId of additionalAccIds) {
          const acc = brandAccounts.find((a) => a.id === accId);
          if (!acc) continue;

          const { data: newPost, error: newErr } = await supabase.from('posts').insert({
            user_id: user.id,
            account_id: accId,
            platform: acc.platform,
            caption,
            first_comment: firstComment || null,
            media_type: getMediaType(acc.platform),
            post_type: postTypes[accId] || 'post',
            status: dbStatus,
            scheduled_at: scheduledIso,
          }).select('id').single();

          if (newErr) {
            console.error(`Failed for ${acc.username}:`, newErr.message);
            continue;
          }

          await linkMediaToPost(newPost.id, libraryMedia, 0);
          await linkMediaToPost(newPost.id, uploadedMedia, libraryMedia.length);
        }

        const totalPlatforms = 1 + additionalAccIds.length;
        toast.success(totalPlatforms > 1
          ? `Updated + scheduled to ${totalPlatforms} platforms!`
          : 'Post updated!');
      } else {
        // Create one post per enabled account
        let created = 0;
        for (const accId of enabled) {
          const acc = brandAccounts.find((a) => a.id === accId);
          if (!acc) continue;

          const { data: post, error: postErr } = await supabase.from('posts').insert({
            user_id: user.id,
            account_id: accId,
            platform: acc.platform,
            caption,
            first_comment: firstComment || null,
            media_type: getMediaType(acc.platform),
            post_type: postTypes[accId] || 'post',
            status: dbStatus,
            scheduled_at: scheduledIso,
          }).select('id').single();

          if (postErr) {
            console.error(`Failed for ${acc.username}:`, postErr.message);
            continue;
          }

          await linkMediaToPost(post.id, libraryMedia, 0);
          await linkMediaToPost(post.id, uploadedMedia, libraryMedia.length);
          created++;
        }

        const verb = status === 'now' ? 'Posting now to' : status === 'scheduled' ? 'Scheduled to' : 'Saved to';
        toast.success(`${verb} ${created} platform${created !== 1 ? 's' : ''}!`);
      }

      // If "Post Now", trigger posting immediately via server-side relay
      if (status === 'now') {
        setUploadProgress('Publishing...');
        try {
          await fetch('/api/posts/publish', { method: 'POST' });
        } catch { /* cron will pick it up anyway */ }
      }

      router.push('/queue');
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  }

  // Upload files once to shared storage, return metadata for linking to posts
  async function uploadMediaOnce(userId: string): Promise<{ url: string; path: string; type: string; size: number }[]> {
    const uploaded: { url: string; path: string; type: string; size: number }[] = [];
    const timestamp = Date.now();
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      const sizeMB = (file.size / 1_048_576).toFixed(1);
      setUploadProgress(`Uploading ${file.name} (${sizeMB} MB)... ${i + 1}/${mediaFiles.length}`);
      const ext = file.name.split('.').pop();
      const storagePath = `shared/${userId}/${timestamp}/${i}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('media').upload(storagePath, file);
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        throw new Error(`Upload failed for ${file.name}: ${uploadError.message}`);
      }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(storagePath);
      uploaded.push({
        url: publicUrl,
        path: storagePath,
        type: file.type.startsWith('video') ? 'video' : 'image',
        size: file.size,
      });
    }
    return uploaded;
  }

  // Link already-uploaded media to a post
  async function linkMediaToPost(postId: string, media: { url: string; path: string; type: string; size: number }[], startIndex: number) {
    for (let i = 0; i < media.length; i++) {
      await supabase.from('post_media').insert({
        post_id: postId,
        media_url: media[i].url,
        storage_path: media[i].path,
        media_type: media[i].type,
        sort_order: startIndex + i,
        file_size: media[i].size,
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
                  <button
                    type="button"
                    onClick={generateAICaption}
                    disabled={aiCaptionLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {aiCaptionLoading ? 'Generating...' : 'AI Caption'}
                  </button>
                </div>
                <span className={`text-xs ${caption.length > activeCharLimit ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                  {caption.length} / {activeCharLimit.toLocaleString()}
                  <span className="ml-1 inline-block w-3 h-3 rounded-full align-middle" style={{ backgroundColor: PLATFORM_META[previewPlatform]?.color || '#888' }} />
                </span>
              </div>
            </CardContent>
          </Card>

          {/* First Comment */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              <Label className="text-xs text-muted-foreground">First Comment (optional)</Label>
              <Textarea
                placeholder="Add a first comment with hashtags or extra context..."
                className="min-h-[60px] resize-y text-sm"
                value={firstComment}
                onChange={(e) => setFirstComment(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Media grid */}
          {mediaPreviews.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {mediaPreviews.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                      {isVideoPreview(i) ? (
                        <video src={src} className="object-cover w-full h-full" muted playsInline />
                      ) : (
                        <img src={src} alt="" className="object-cover w-full h-full" />
                      )}
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
            {loading && uploadProgress && (
              <p className="text-sm text-muted-foreground text-center animate-pulse">{uploadProgress}</p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => handleSubmit('now')} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700">
                <Send className="h-4 w-4 mr-2" />
                {loading ? uploadProgress || 'Posting...' : `Post Now (${enabledAccountIds.size})`}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleSubmit('scheduled')} disabled={loading} className="flex-1" variant="outline">
                <Clock className="h-4 w-4 mr-2" />
                {editId ? 'Update' : `Schedule (${enabledAccountIds.size})`}
              </Button>
              <Button variant="ghost" onClick={() => handleSubmit('draft')} disabled={loading}>
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
                    {isVideoPreview(0) ? (
                      <video src={mediaPreviews[0]} className="w-full h-full object-cover" muted playsInline />
                    ) : (
                      <img src={mediaPreviews[0]} alt="" className="w-full h-full object-cover" />
                    )}
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
            {loading && uploadProgress && (
              <p className="text-sm text-muted-foreground text-center animate-pulse">{uploadProgress}</p>
            )}
            <Button onClick={() => handleSubmit('now')} disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
              <Send className="h-4 w-4 mr-2" />
              {loading ? uploadProgress || 'Posting...' : `Post Now to ${enabledAccountIds.size} platform${enabledAccountIds.size !== 1 ? 's' : ''}`}
            </Button>
            <Button onClick={() => handleSubmit('scheduled')} disabled={loading} className="w-full" variant="outline">
              <Clock className="h-4 w-4 mr-2" />
              {editId ? 'Update & Schedule' : `Schedule to ${enabledAccountIds.size} platform${enabledAccountIds.size !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="ghost" onClick={() => handleSubmit('draft')} disabled={loading} className="w-full">
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
