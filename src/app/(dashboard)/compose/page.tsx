'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ImagePlus, Send, Clock, Save } from 'lucide-react';
import type { SocialAccount, ContentPillar, HashtagGroup } from '@/types/database';

export default function ComposePage() {
  const [caption, setCaption] = useState('');
  const [accountId, setAccountId] = useState('');
  const [pillarId, setPillarId] = useState('');
  const [hashtagGroupId, setHashtagGroupId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [pillars, setPillars] = useState<ContentPillar[]>([]);
  const [hashtagGroups, setHashtagGroups] = useState<HashtagGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const [{ data: accts }, { data: plrs }, { data: hgs }] = await Promise.all([
      supabase.from('social_accounts').select('*').eq('is_active', true),
      supabase.from('content_pillars').select('*').eq('is_active', true),
      supabase.from('hashtag_groups').select('*').eq('is_active', true),
    ]);
    setAccounts(accts || []);
    setPillars(plrs || []);
    setHashtagGroups(hgs || []);
    if (accts?.length && !accountId) setAccountId(accts[0].id);
  }, [supabase, accountId]);

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
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
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
      const mediaType = mediaFiles.length > 1 ? 'carousel' : 'image';

      // Append hashtags to caption
      let fullCaption = caption;
      if (hashtagGroupId) {
        const group = hashtagGroups.find((g) => g.id === hashtagGroupId);
        if (group) {
          fullCaption += '\n\n' + group.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
        }
      }

      // Create post
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          account_id: accountId,
          platform: account?.platform || 'instagram',
          caption: fullCaption,
          media_type: mediaType,
          status,
          scheduled_at: status === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
          pillar_id: pillarId || null,
          hashtag_group_id: hashtagGroupId || null,
        })
        .select()
        .single();

      if (postError) throw postError;

      // Upload media files
      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const ext = file.name.split('.').pop();
        const storagePath = `posts/${post.id}/${i}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(storagePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(storagePath);

        await supabase.from('post_media').insert({
          post_id: post.id,
          media_url: publicUrl,
          storage_path: storagePath,
          media_type: file.type.startsWith('video') ? 'video' : 'image',
          sort_order: i,
          file_size: file.size,
        });
      }

      toast.success(status === 'scheduled' ? 'Post scheduled!' : 'Draft saved!');
      router.push('/queue');
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compose Post</h1>
        <p className="text-muted-foreground">Create and schedule a new social media post</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        {/* Main form */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
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
                  className="min-h-[150px] resize-y"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {caption.length} / 2,200
                </p>
              </div>

              {/* Media upload */}
              <div className="space-y-2">
                <Label>Media</Label>
                <div className="grid grid-cols-3 gap-2">
                  {mediaPreviews.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                      <img src={src} alt="" className="object-cover w-full h-full" />
                      <button
                        onClick={() => removeMedia(i)}
                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
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
        </div>

        {/* Sidebar options */}
        <div className="space-y-4">
          {/* Schedule */}
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

          {/* Pillar */}
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
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: p.color }}
                        />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Hashtag Group */}
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

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => handleSubmit('scheduled')}
              disabled={loading}
              className="w-full"
            >
              <Clock className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : 'Schedule'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSubmit('draft')}
              disabled={loading}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
