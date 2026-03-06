'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Upload,
  Loader2,
  FolderTree,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileImage,
  Clock,
} from 'lucide-react';
import type { Brand } from '@/types/database';

interface FolderTree {
  [brand: string]: { [track: string]: { [batch: string]: number } };
}

interface SortLog {
  id: string;
  file_name: string;
  dest_path: string;
  brand_slug: string;
  track: string;
  batch: string;
  day_num: number;
  created_at: string;
}

export default function FileOrganizerPage() {
  const supabase = createClient();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [tree, setTree] = useState<FolderTree>({});
  const [recent, setRecent] = useState<SortLog[]>([]);
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());

  // Upload state
  const [files, setFiles] = useState<File[]>([]);
  const [selectedBrand, setSelectedBrand] = useState('');
  const [track, setTrack] = useState('TRACK_1');
  const [batch, setBatch] = useState('batch_01');
  const [dayNum, setDayNum] = useState(1);
  const [uploading, setUploading] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [brandsRes, folderRes] = await Promise.all([
      supabase.from('brands').select('*').order('name'),
      fetch('/api/media/organize'),
    ]);
    setBrands(brandsRes.data || []);
    if (folderRes.ok) {
      const data = await folderRes.json();
      setTree(data.tree || {});
      setRecent(data.recent || []);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dropRef.current?.classList.remove('border-primary');
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    setFiles(dropped);
  }

  async function handleUpload() {
    if (!files.length) return toast.error('Drop some files first');
    if (!selectedBrand) return toast.error('Select a brand');

    setUploading(true);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    formData.append('brandSlug', selectedBrand);
    formData.append('track', track);
    formData.append('batch', batch);
    formData.append('dayNum', dayNum.toString());

    try {
      const res = await fetch('/api/media/organize', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${data.count} files organized`);
      setFiles([]);
      loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function toggleBrand(slug: string) {
    setExpandedBrands(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">File Organizer</h1>
        <p className="text-muted-foreground">Sort and organize content files into brand folders</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload & Assign</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drop zone */}
              <div
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('border-primary'); }}
                onDragLeave={(e) => { e.preventDefault(); dropRef.current?.classList.remove('border-primary'); }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-primary"
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {files.length ? `${files.length} file(s) selected` : 'Drop files here or click to browse'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </div>

              {/* File previews */}
              {files.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {files.slice(0, 10).map((f, i) => (
                    <div key={i} className="flex-shrink-0 text-center">
                      {f.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(f)} alt={f.name} className="h-16 w-16 object-cover rounded" />
                      ) : (
                        <div className="h-16 w-16 bg-muted rounded flex items-center justify-center">
                          <FileImage className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground truncate w-16 mt-1">{f.name}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Destination selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Brand</Label>
                  <select
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select brand...</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.slug}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Track</Label>
                  <select
                    value={track}
                    onChange={(e) => setTrack(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="TRACK_1">Track 1</option>
                    <option value="TRACK_2">Track 2</option>
                    <option value="TRACK_3">Track 3</option>
                    <option value="GENERAL">General</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Batch</Label>
                  <select
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={i} value={`batch_${String(i + 1).padStart(2, '0')}`}>
                        Batch {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Day</Label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={dayNum}
                    onChange={(e) => setDayNum(parseInt(e.target.value) || 1)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Path preview */}
              {selectedBrand && (
                <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded">
                  content/{selectedBrand}/{track}/{batch}/D{dayNum}/slide_*.ext
                </p>
              )}

              <Button onClick={handleUpload} disabled={uploading || !files.length || !selectedBrand} className="w-full">
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Organizing...</>
                ) : (
                  <><FolderTree className="h-4 w-4 mr-2" /> Organize {files.length} File{files.length !== 1 ? 's' : ''}</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!recent.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">No files organized yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recent.map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileImage className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{log.file_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-2 font-mono">
                        {log.brand_slug}/{log.track}/{log.batch}/D{log.day_num}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Folder Tree */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" /> Folder Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!Object.keys(tree).length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No organized files yet</p>
            ) : (
              <div className="space-y-1 text-sm">
                {Object.entries(tree).map(([brandSlug, tracks]) => (
                  <div key={brandSlug}>
                    <button
                      onClick={() => toggleBrand(brandSlug)}
                      className="flex items-center gap-1 w-full text-left py-1 hover:bg-muted rounded px-1"
                    >
                      {expandedBrands.has(brandSlug) ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <FolderOpen className="h-3 w-3 text-yellow-500" />
                      <span className="font-medium">{brandSlug}</span>
                    </button>
                    {expandedBrands.has(brandSlug) && (
                      <div className="ml-5 space-y-1">
                        {Object.entries(tracks).map(([trackName, batches]) => (
                          <div key={trackName}>
                            <div className="flex items-center gap-1 py-0.5 text-muted-foreground">
                              <FolderOpen className="h-3 w-3 text-blue-400" />
                              <span>{trackName}</span>
                            </div>
                            <div className="ml-4">
                              {Object.entries(batches).map(([batchName, count]) => (
                                <div key={batchName} className="flex items-center justify-between py-0.5 text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <FolderOpen className="h-3 w-3 text-green-400" />
                                    <span>{batchName}</span>
                                  </div>
                                  <span className="text-xs bg-muted px-1.5 rounded">{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
