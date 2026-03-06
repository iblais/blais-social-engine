'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Upload, Trash2, Image as ImageIcon, Film, FolderOpen } from 'lucide-react';
import type { MediaAsset } from '@/types/database';

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('');
  const supabase = createClient();

  const load = useCallback(async () => {
    let query = supabase.from('media_assets').select('*').order('created_at', { ascending: false });
    if (filter) query = query.ilike('file_name', `%${filter}%`);
    const { data } = await query.limit(100);
    setAssets(data || []);
  }, [supabase, filter]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);

    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `library/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('media').upload(path, file);
      if (uploadError) { toast.error(`Upload failed: ${uploadError.message}`); continue; }

      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);

      await supabase.from('media_assets').insert({
        file_name: file.name,
        storage_path: path,
        url: publicUrl,
        media_type: file.type.startsWith('video') ? 'video' : 'image',
        file_size: file.size,
      });
    }

    toast.success(`${files.length} file(s) uploaded`);
    setUploading(false);
    load();
    e.target.value = '';
  }

  async function deleteAsset(asset: MediaAsset) {
    await supabase.storage.from('media').remove([asset.storage_path]);
    await supabase.from('media_assets').delete().eq('id', asset.id);
    toast.success('Deleted');
    load();
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Input placeholder="Search..." value={filter} onChange={e => setFilter(e.target.value)} className="w-48" />
        <label>
          <Button asChild disabled={uploading}>
            <span><Upload className="h-4 w-4 mr-2" />{uploading ? 'Uploading...' : 'Upload'}</span>
          </Button>
          <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {!assets.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No media yet. Upload images or videos to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {assets.map(asset => (
            <Card key={asset.id} className="group overflow-hidden">
              <div className="relative aspect-square bg-muted">
                {asset.media_type === 'video' ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="h-8 w-8 text-muted-foreground" />
                  </div>
                ) : (
                  <img src={asset.url} alt={asset.file_name} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button variant="ghost" size="icon" onClick={() => deleteAsset(asset)} className="text-white">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-2">
                <p className="text-xs truncate">{asset.file_name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(asset.file_size)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
