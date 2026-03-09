'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBrandAccounts } from '@/lib/hooks/use-brand-accounts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Upload,
  Trash2,
  Film,
  FolderOpen,
  LayoutGrid,
  List,
  Check,
  ImagePlus,
  X,
  ArrowUpDown,
} from 'lucide-react';
import type { MediaAsset } from '@/types/database';

type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'largest' | 'smallest';
type ViewMode = 'grid' | 'list';

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dragCounter = useRef(0);
  const { activeBrandId } = useBrandAccounts();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const load = useCallback(async () => {
    let query = supabase.from('media_assets').select('*');

    // Apply sorting
    switch (sortBy) {
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'name-asc':
        query = query.order('file_name', { ascending: true });
        break;
      case 'name-desc':
        query = query.order('file_name', { ascending: false });
        break;
      case 'largest':
        query = query.order('file_size', { ascending: false });
        break;
      case 'smallest':
        query = query.order('file_size', { ascending: true });
        break;
    }

    if (filter) query = query.ilike('file_name', `%${filter}%`);
    if (activeBrandId) {
      query = query.eq('brand_id', activeBrandId);
    }
    const { data } = await query.limit(100);
    setAssets(data || []);
  }, [supabase, filter, sortBy, activeBrandId]);

  useEffect(() => { load(); }, [load]);

  // Clear selection when assets change
  useEffect(() => {
    setSelectedIds(prev => {
      const assetIdSet = new Set(assets.map(a => a.id));
      const filtered = new Set([...prev].filter(id => assetIdSet.has(id)));
      if (filtered.size !== prev.size) return filtered;
      return prev;
    });
  }, [assets]);

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    let successCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({ current: i + 1, total: files.length });
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
        brand_id: activeBrandId || null,
      });
      successCount++;
    }

    toast.success(`${successCount} file(s) uploaded`);
    setUploading(false);
    setUploadProgress(null);
    load();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
    e.target.value = '';
  }

  // Drag-and-drop handlers
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (!files.length) {
      toast.error('Only image and video files are supported');
      return;
    }
    await uploadFiles(files);
  }

  async function deleteAsset(asset: MediaAsset) {
    if (!confirm(`Delete "${asset.file_name}"?`)) return;
    await supabase.storage.from('media').remove([asset.storage_path]);
    await supabase.from('media_assets').delete().eq('id', asset.id);
    toast.success('Deleted');
    load();
  }

  async function deleteSelected() {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} item(s)?`)) return;

    const toDelete = assets.filter(a => selectedIds.has(a.id));
    const storagePaths = toDelete.map(a => a.storage_path);

    await supabase.storage.from('media').remove(storagePaths);
    const ids = toDelete.map(a => a.id);
    await supabase.from('media_assets').delete().in('id', ids);

    toast.success(`${ids.length} item(s) deleted`);
    setSelectedIds(new Set());
    load();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(assets.map(a => a.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function useInCompose(urls: string[]) {
    const param = urls.map(u => encodeURIComponent(u)).join(',');
    router.push(`/compose?media=${param}`);
  }

  function addSelectedToCompose() {
    const urls = assets.filter(a => selectedIds.has(a.id)).map(a => a.url);
    useInCompose(urls);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <div
      className="space-y-4 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-4 border-dashed border-primary rounded-2xl p-16 text-center">
            <Upload className="h-16 w-16 mx-auto text-primary mb-4" />
            <p className="text-2xl font-semibold text-primary">Drop files to upload</p>
            <p className="text-muted-foreground mt-2">Images and videos only</p>
          </div>
        </div>
      )}

      {/* Upload progress bar */}
      {uploadProgress && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span>Uploading {uploadProgress.current} of {uploadProgress.total}...</span>
              <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
            </div>
            <div className="h-2 bg-primary/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Left: Title + count */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Media Library</h1>
          <Badge variant="secondary" className="text-sm">{assets.length} items</Badge>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Search..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-48"
          />

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-44">
              <ArrowUpDown className="h-4 w-4 mr-2 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
              <SelectItem value="name-desc">Name Z-A</SelectItem>
              <SelectItem value="largest">Largest first</SelectItem>
              <SelectItem value="smallest">Smallest first</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Select all / deselect */}
          {assets.length > 0 && (
            <Button variant="outline" size="sm" onClick={hasSelection ? deselectAll : selectAll}>
              {hasSelection ? 'Deselect' : 'Select All'}
            </Button>
          )}

          <label>
            <Button asChild disabled={uploading}>
              <span><Upload className="h-4 w-4 mr-2" />{uploading ? 'Uploading...' : 'Upload'}</span>
            </Button>
            <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} />
          </label>
        </div>
      </div>

      {/* Empty state */}
      {!assets.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No media yet. Upload images or videos to get started.</p>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {assets.map(asset => {
            const isSelected = selectedIds.has(asset.id);
            return (
              <Card
                key={asset.id}
                className={`group overflow-hidden cursor-pointer transition-all ${
                  isSelected ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => toggleSelect(asset.id)}
              >
                <div className="relative aspect-square bg-muted">
                  {asset.media_type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="h-8 w-8 text-muted-foreground" />
                    </div>
                  ) : (
                    <img src={asset.url} alt={asset.file_name} className="w-full h-full object-cover" />
                  )}

                  {/* Selection checkbox */}
                  <div
                    className={`absolute top-1.5 left-1.5 z-10 h-6 w-6 rounded border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-white/70 bg-black/30 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isSelected && <Check className="h-4 w-4" />}
                  </div>

                  {/* Hover overlay with actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="bg-black/60 hover:bg-blue-600 text-white h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); useInCompose([asset.url]); }}
                      title="Use in Post"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); deleteAsset(asset); }}
                      className="bg-black/60 hover:bg-red-600 text-white h-7 w-7"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <CardContent className="p-2">
                  <p className="text-xs truncate">{asset.file_name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(asset.file_size)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2rem_1fr_6rem_6rem_5rem_5rem] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
            <div />
            <div>Filename</div>
            <div>Type</div>
            <div>Size</div>
            <div>Date</div>
            <div className="text-right">Actions</div>
          </div>
          {assets.map(asset => {
            const isSelected = selectedIds.has(asset.id);
            return (
              <div
                key={asset.id}
                className={`group grid grid-cols-[2rem_1fr_6rem_6rem_5rem_5rem] gap-2 px-3 py-2 items-center border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors ${
                  isSelected ? 'bg-primary/5' : ''
                }`}
                onClick={() => toggleSelect(asset.id)}
              >
                {/* Checkbox */}
                <div
                  className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </div>

                {/* Filename with thumbnail */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded bg-muted flex-shrink-0 overflow-hidden">
                    {asset.media_type === 'video' ? (
                      <div className="h-full w-full flex items-center justify-center">
                        <Film className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ) : (
                      <img src={asset.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <span className="text-sm truncate">{asset.file_name}</span>
                </div>

                {/* Type */}
                <div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {asset.media_type}
                  </Badge>
                </div>

                {/* Size */}
                <div className="text-xs text-muted-foreground">{formatSize(asset.file_size)}</div>

                {/* Date */}
                <div className="text-xs text-muted-foreground">{formatDate(asset.created_at)}</div>

                {/* Actions */}
                <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-blue-500"
                    onClick={(e) => { e.stopPropagation(); useInCompose([asset.url]); }}
                    title="Use in Post"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-500"
                    onClick={(e) => { e.stopPropagation(); deleteAsset(asset); }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating selection action bar */}
      {hasSelection && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-lg px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <Badge variant="secondary" className="text-sm font-medium">
            {selectedIds.size} selected
          </Badge>
          <Button size="sm" onClick={addSelectedToCompose}>
            <ImagePlus className="h-4 w-4 mr-2" />
            Add to Compose ({selectedIds.size})
          </Button>
          <Button size="sm" variant="destructive" onClick={deleteSelected}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={deselectAll}>
            <X className="h-4 w-4 mr-2" />
            Deselect All
          </Button>
        </div>
      )}
    </div>
  );
}
