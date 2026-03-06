'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Upload,
  Download,
  Loader2,
  X,
  Image as ImageIcon,
  Check,
  Archive,
} from 'lucide-react';

const PRESETS: Record<string, { width: number; height: number; label: string }> = {
  instagram_post: { width: 1080, height: 1080, label: 'Instagram Post (1:1)' },
  instagram_story: { width: 1080, height: 1920, label: 'Instagram Story (9:16)' },
  facebook_post: { width: 1200, height: 630, label: 'Facebook Post' },
  twitter_post: { width: 1600, height: 900, label: 'Twitter/X (16:9)' },
  youtube_thumbnail: { width: 1280, height: 720, label: 'YouTube Thumbnail' },
  pinterest_pin: { width: 1000, height: 1500, label: 'Pinterest Pin (2:3)' },
  linkedin_post: { width: 1200, height: 627, label: 'LinkedIn Post' },
  tiktok_cover: { width: 1080, height: 1920, label: 'TikTok Cover (9:16)' },
};

type FitMode = 'cover' | 'contain' | 'fill';

interface ResizedImage {
  originalName: string;
  preset: string;
  label: string;
  width: number;
  height: number;
  url: string;
  storagePath: string;
  size: number;
}

export default function ImageResizerPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set(Object.keys(PRESETS)));
  const [fitMode, setFitMode] = useState<FitMode>('cover');
  const [bgColor, setBgColor] = useState('#000000');
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ResizedImage[]>([]);
  const [zipping, setZipping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => f.type.startsWith('image/')).slice(0, 10);
    if (imageFiles.length < newFiles.length) {
      toast.error('Only image files accepted (max 10)');
    }
    setFiles(imageFiles);
    setResults([]);
    const urls = imageFiles.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove('border-primary');
    const dropped = Array.from(e.dataTransfer.files);
    handleFiles(dropped);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    dropRef.current?.classList.add('border-primary');
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dropRef.current?.classList.remove('border-primary');
  }

  function togglePreset(key: string) {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedPresets(new Set(Object.keys(PRESETS)));
  }

  function selectNone() {
    setSelectedPresets(new Set());
  }

  async function handleResize() {
    if (!files.length) return toast.error('Upload at least one image');
    if (!selectedPresets.size) return toast.error('Select at least one preset');

    setProcessing(true);
    setResults([]);

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    formData.append('presets', Array.from(selectedPresets).join(','));
    formData.append('fit', fitMode);
    formData.append('bgColor', bgColor);

    try {
      const res = await fetch('/api/media/resize', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resize failed');
      setResults(data.results);
      toast.success(`${data.results.length} images resized`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProcessing(false);
    }
  }

  async function downloadAll() {
    if (!results.length) return;
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (const img of results) {
        const res = await fetch(img.url);
        const blob = await res.blob();
        const name = `${img.originalName.replace(/\.[^.]+$/, '')}_${img.preset}.jpg`;
        zip.file(name, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resized_images_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Zip downloaded');
    } catch (err) {
      toast.error('Failed to create zip: ' + (err as Error).message);
    } finally {
      setZipping(false);
    }
  }

  function clearAll() {
    previews.forEach(URL.revokeObjectURL);
    setFiles([]);
    setPreviews([]);
    setResults([]);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      {!files.length ? (
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors hover:border-primary"
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Drop images here or click to upload</p>
          <p className="text-xs text-muted-foreground mt-1">Up to 10 images. JPG, PNG, WebP supported.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">{files.length} image(s) selected</p>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {previews.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={files[i]?.name}
                  className="h-20 w-20 object-cover rounded-md flex-shrink-0"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preset Selection */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Platform Sizes</Label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>All</Button>
              <Button variant="ghost" size="sm" onClick={selectNone}>None</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => togglePreset(key)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-left text-sm transition-colors ${
                  selectedPresets.has(key)
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  selectedPresets.has(key) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
                }`}>
                  {selectedPresets.has(key) && <Check className="h-3 w-3" />}
                </div>
                <div>
                  <p className="font-medium leading-tight">{preset.label}</p>
                  <p className="text-xs text-muted-foreground">{preset.width} x {preset.height}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-sm">Fit Mode</Label>
              <div className="flex gap-1">
                {(['cover', 'contain', 'fill'] as FitMode[]).map((mode) => (
                  <Button
                    key={mode}
                    variant={fitMode === mode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFitMode(mode)}
                  >
                    {mode === 'cover' ? 'Crop to Fill' : mode === 'contain' ? 'Letterbox' : 'Stretch'}
                  </Button>
                ))}
              </div>
            </div>
            {fitMode === 'contain' && (
              <div className="space-y-1">
                <Label className="text-sm">Background Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-10 h-9 p-1 cursor-pointer"
                  />
                  <Input
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-24 h-9"
                    placeholder="#000000"
                  />
                </div>
              </div>
            )}
            <Button
              onClick={handleResize}
              disabled={processing || !files.length || !selectedPresets.size}
              className="ml-auto"
            >
              {processing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Resizing...</>
              ) : (
                <><ImageIcon className="h-4 w-4 mr-2" /> Resize {files.length} Image{files.length !== 1 ? 's' : ''}</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{results.length} resized images</p>
            <Button onClick={downloadAll} disabled={zipping} variant="outline" size="sm">
              {zipping ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating ZIP...</>
              ) : (
                <><Archive className="h-4 w-4 mr-2" /> Download All (ZIP)</>
              )}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {results.map((img, i) => (
              <Card key={i} className="overflow-hidden">
                <div className="relative aspect-square bg-muted">
                  <img src={img.url} alt={img.label} className="w-full h-full object-contain" />
                </div>
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-medium truncate">{img.label}</p>
                  <p className="text-xs text-muted-foreground">{img.width} x {img.height} &middot; {formatSize(img.size)}</p>
                  <a href={img.url} download={`${img.originalName.replace(/\.[^.]+$/, '')}_${img.preset}.jpg`}>
                    <Button variant="ghost" size="sm" className="w-full mt-1">
                      <Download className="h-3 w-3 mr-1" /> Download
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
