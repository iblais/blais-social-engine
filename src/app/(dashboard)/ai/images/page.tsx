'use client';

import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Download, Sparkles, X, Upload, Image as ImageIcon, Film, Loader2, Check } from 'lucide-react';

// ── Aspect Ratios ──────────────────────────────────────────
const IMAGE_RATIOS = ['Auto', '1:1', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9', '5:4', '4:5', '21:9'] as const;
const VIDEO_RATIOS = ['16:9', '9:16'] as const;
const VIDEO_DURATIONS = ['4', '6', '8'] as const;

// ── Models ─────────────────────────────────────────────────
const IMAGE_MODELS = [
  { id: 'nano-banana-2', label: 'Nano Banana 2', icon: '🍌' },
  { id: 'nano-banana-pro', label: 'Nano Banana Pro', icon: '🍌' },
] as const;

type Mode = 'image' | 'video';
type VideoTab = 'frames' | 'ingredients';

export default function AIImagesPage() {
  const supabase = createClient();

  // ── Shared state ──
  const [mode, setMode] = useState<Mode>('image');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [gallery, setGallery] = useState<Array<{ type: 'image' | 'video'; url: string }>>([]);
  const [selectedResult, setSelectedResult] = useState<{ type: 'image' | 'video'; url: string } | null>(null);

  // ── Image state ──
  const [imageModel, setImageModel] = useState<string>('nano-banana-2');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [aspectRatio, setAspectRatio] = useState('Auto');
  const [imageCount, setImageCount] = useState(1);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const refInputRef = useRef<HTMLInputElement>(null);

  // ── Video state ──
  const [videoTab, setVideoTab] = useState<VideoTab>('frames');
  const [videoRatio, setVideoRatio] = useState<string>('16:9');
  const [videoDuration, setVideoDuration] = useState<string>('8');
  const [startFrame, setStartFrame] = useState<string | null>(null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  const [ingredientImages, setIngredientImages] = useState<string[]>([]);
  const [videoPolling, setVideoPolling] = useState(false);
  const startFrameRef = useRef<HTMLInputElement>(null);
  const endFrameRef = useRef<HTMLInputElement>(null);
  const ingredientRef = useRef<HTMLInputElement>(null);

  // ── Helpers ──
  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  function handleRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (referenceImages.length + files.length > 10) { toast.error('Max 10 reference images'); return; }
    files.forEach(async (file) => {
      const url = await fileToDataUrl(file);
      setReferenceImages(prev => [...prev, url].slice(0, 10));
    });
    if (e.target) e.target.value = '';
  }

  async function handleFrameUpload(e: React.ChangeEvent<HTMLInputElement>, target: 'start' | 'end') {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await fileToDataUrl(file);
    if (target === 'start') setStartFrame(url);
    else setEndFrame(url);
    if (e.target) e.target.value = '';
  }

  function handleIngredientUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (ingredientImages.length + files.length > 3) { toast.error('Max 3 ingredient images'); return; }
    files.forEach(async (file) => {
      const url = await fileToDataUrl(file);
      setIngredientImages(prev => [...prev, url].slice(0, 3));
    });
    if (e.target) e.target.value = '';
  }

  // ── Save to Media Library ──
  async function saveToMediaLibrary(dataUrl: string, type: 'image' | 'video') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const ext = type === 'video' ? 'mp4' : 'png';
      const fileName = `ai-${type}-${Date.now()}.${ext}`;
      const storagePath = `library/${fileName}`;

      // Convert data URL to blob
      const res = await fetch(dataUrl);
      const blob = await res.blob();

      const { error: uploadErr } = await supabase.storage.from('media').upload(storagePath, blob, {
        contentType: type === 'video' ? 'video/mp4' : 'image/png',
      });
      if (uploadErr) { console.error('Upload error:', uploadErr.message); return; }

      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(storagePath);

      await supabase.from('media_assets').insert({
        user_id: user.id,
        file_name: fileName,
        storage_path: storagePath,
        url: publicUrl,
        media_type: type,
        file_size: blob.size,
        folder: 'ai-generated',
      });
    } catch (err) {
      console.error('Auto-save error:', err);
    }
  }

  // ── Generate Image ──
  async function generateImage() {
    if (!prompt.trim()) { toast.error('Enter a prompt'); return; }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        prompt,
        model: imageModel,
        count: imageCount,
        referenceImages: referenceImages.length ? referenceImages : undefined,
      };
      if (aspectRatio !== 'Auto') body.aspectRatio = aspectRatio;

      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newImages = (data.images as string[]).map(url => ({ type: 'image' as const, url }));
      setGallery(prev => [...newImages, ...prev].slice(0, 30));
      if (newImages[0]) setSelectedResult(newImages[0]);

      // Auto-save all generated images to media library
      let savedCount = 0;
      for (const img of data.images as string[]) {
        await saveToMediaLibrary(img, 'image');
        savedCount++;
      }
      toast.success(`${newImages.length} image${newImages.length > 1 ? 's' : ''} generated & saved to Media Library`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Generate Video ──
  async function generateVideo() {
    if (!prompt.trim()) { toast.error('Enter a prompt'); return; }
    setLoading(true);
    setVideoPolling(true);
    try {
      const body: Record<string, unknown> = {
        prompt,
        aspectRatio: videoRatio,
        duration: videoDuration,
        resolution: '720p',
      };
      if (videoTab === 'frames') {
        if (startFrame) body.startFrame = startFrame;
        if (endFrame) body.endFrame = endFrame;
      } else if (ingredientImages.length) {
        body.startFrame = ingredientImages[0]; // Use first ingredient as reference
      }

      const res = await fetch('/api/ai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Start polling
      const operationName = data.operationName;
      toast.info('Video generation started. This may take a few minutes...');

      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch('/api/ai/video', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationName }),
          });
          const pollData = await pollRes.json();

          if (pollData.done) {
            clearInterval(pollInterval);
            setVideoPolling(false);
            setLoading(false);

            if (pollData.error) {
              toast.error(pollData.error);
            } else if (pollData.videoUri) {
              const videoEntry = { type: 'video' as const, url: pollData.videoUri };
              setGallery(prev => [videoEntry, ...prev].slice(0, 30));
              setSelectedResult(videoEntry);
              toast.success('Video generated!');
            }
          }
        } catch {
          clearInterval(pollInterval);
          setVideoPolling(false);
          setLoading(false);
          toast.error('Failed to check video status');
        }
      }, 10000);
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
      setVideoPolling(false);
    }
  }

  function downloadItem(url: string, type: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-${type}-${Date.now()}.${type === 'video' ? 'mp4' : 'png'}`;
    link.click();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">AI Media Studio</h1>
        <p className="text-muted-foreground">Generate images and videos with Nano Banana 2 & Veo 3.1</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* ── Left Panel: Controls ── */}
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex bg-muted rounded-lg p-1">
            <button
              onClick={() => setMode('image')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'image' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              <ImageIcon className="h-4 w-4" /> Image
            </button>
            <button
              onClick={() => setMode('video')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'video' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              <Film className="h-4 w-4" /> Video
            </button>
          </div>

          {mode === 'image' ? (
            /* ── IMAGE CONTROLS ── */
            <Card>
              <CardContent className="pt-4 space-y-4">
                {/* Orientation */}
                <div className="flex bg-muted rounded-lg p-1">
                  <button
                    onClick={() => setOrientation('landscape')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                      orientation === 'landscape' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    ▬ Landscape
                  </button>
                  <button
                    onClick={() => setOrientation('portrait')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                      orientation === 'portrait' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    ▮ Portrait
                  </button>
                </div>

                {/* Aspect Ratio */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Aspect Ratio</Label>
                  <div className="flex flex-wrap gap-1">
                    {IMAGE_RATIOS.map(r => (
                      <button
                        key={r}
                        onClick={() => setAspectRatio(r)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                          aspectRatio === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Count */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Count</Label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => setImageCount(n)}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                          imageCount === n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        x{n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Model</Label>
                  <div className="space-y-1">
                    {IMAGE_MODELS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setImageModel(m.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                          imageModel === m.id ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <span>{m.icon}</span> {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference images */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Reference Images</Label>
                    <span className="text-[10px] text-muted-foreground">{referenceImages.length}/10</span>
                  </div>
                  {referenceImages.length > 0 && (
                    <div className="grid grid-cols-5 gap-1">
                      {referenceImages.map((img, i) => (
                        <div key={i} className="relative aspect-square rounded overflow-hidden border">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))}
                            className="absolute top-0 right-0 bg-black/70 text-white rounded-bl w-4 h-4 flex items-center justify-center">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {referenceImages.length < 10 && (
                    <button onClick={() => refInputRef.current?.click()}
                      className="w-full py-2 border-2 border-dashed rounded-lg text-xs text-muted-foreground hover:bg-muted/50 flex items-center justify-center gap-1">
                      <Upload className="h-3 w-3" /> Upload References
                    </button>
                  )}
                  <input ref={refInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleRefUpload} />
                </div>
              </CardContent>
            </Card>
          ) : (
            /* ── VIDEO CONTROLS ── */
            <Card>
              <CardContent className="pt-4 space-y-4">
                {/* Frames / Ingredients tabs */}
                <div className="flex bg-muted rounded-lg p-1">
                  <button
                    onClick={() => setVideoTab('frames')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                      videoTab === 'frames' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    {} Frames
                  </button>
                  <button
                    onClick={() => setVideoTab('ingredients')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                      videoTab === 'ingredients' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    🧩 Ingredients
                  </button>
                </div>

                {videoTab === 'frames' ? (
                  /* Start / End frames */
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Start frame</Label>
                      {startFrame ? (
                        <div className="relative aspect-video rounded overflow-hidden border">
                          <img src={startFrame} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => setStartFrame(null)}
                            className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full w-4 h-4 flex items-center justify-center">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startFrameRef.current?.click()}
                          className="w-full aspect-video border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50">
                          <ImageIcon className="h-5 w-5 mb-1" />
                          <span className="text-[10px]">Optional</span>
                        </button>
                      )}
                      <input ref={startFrameRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => handleFrameUpload(e, 'start')} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">End frame</Label>
                      {endFrame ? (
                        <div className="relative aspect-video rounded overflow-hidden border">
                          <img src={endFrame} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => setEndFrame(null)}
                            className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full w-4 h-4 flex items-center justify-center">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => endFrameRef.current?.click()}
                          className="w-full aspect-video border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50">
                          <ImageIcon className="h-5 w-5 mb-1" />
                          <span className="text-[10px]">Optional</span>
                        </button>
                      )}
                      <input ref={endFrameRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => handleFrameUpload(e, 'end')} />
                    </div>
                  </div>
                ) : (
                  /* Ingredients — reference images for video */
                  <div className="space-y-1.5">
                    <Label className="text-xs">Drop or upload up to 3 images</Label>
                    {ingredientImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {ingredientImages.map((img, i) => (
                          <div key={i} className="relative aspect-square rounded overflow-hidden border">
                            <img src={img} alt="" className="w-full h-full object-cover" />
                            <button onClick={() => setIngredientImages(prev => prev.filter((_, j) => j !== i))}
                              className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full w-4 h-4 flex items-center justify-center">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {ingredientImages.length < 3 && (
                      <button onClick={() => ingredientRef.current?.click()}
                        className="w-full py-3 border-2 border-dashed rounded-lg text-xs text-muted-foreground hover:bg-muted/50 flex items-center justify-center gap-1">
                        <Upload className="h-3 w-3" /> Upload Images
                      </button>
                    )}
                    <input ref={ingredientRef} type="file" accept="image/*" multiple className="hidden" onChange={handleIngredientUpload} />
                  </div>
                )}

                {/* Video aspect ratio */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Aspect Ratio</Label>
                  <div className="flex gap-1">
                    {VIDEO_RATIOS.map(r => (
                      <button
                        key={r}
                        onClick={() => setVideoRatio(r)}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                          videoRatio === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Duration</Label>
                  <div className="flex gap-1">
                    {VIDEO_DURATIONS.map(d => (
                      <button
                        key={d}
                        onClick={() => setVideoDuration(d)}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                          videoDuration === d ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resolution + Model info */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="bg-muted px-2 py-0.5 rounded">720p</span>
                  <span className="bg-muted px-2 py-0.5 rounded">Veo 3.1</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Prompt + Generate ── */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  className="min-h-[80px]"
                  placeholder={mode === 'image'
                    ? 'Describe the image you want to create...'
                    : 'Describe the scene you imagine, with details...'}
                />
              </div>
              <Button
                onClick={mode === 'image' ? generateImage : generateVideo}
                disabled={loading}
                className="w-full bg-[#CCFF00] hover:bg-[#BBEE00] text-black font-bold"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{videoPolling ? 'Generating video...' : 'Generating...'}</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />Generate</>
                )}
              </Button>
              {mode === 'image' && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="bg-muted px-1.5 py-0.5 rounded">{IMAGE_MODELS.find(m => m.id === imageModel)?.label}</span>
                  <span className="bg-muted px-1.5 py-0.5 rounded">{aspectRatio}</span>
                  <span className="bg-muted px-1.5 py-0.5 rounded">x{imageCount}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right Panel: Results ── */}
        <div className="space-y-4">
          {/* Main result display */}
          {selectedResult ? (
            <Card>
              <CardContent className="pt-4">
                <div className="relative">
                  {selectedResult.type === 'image' ? (
                    <img src={selectedResult.url} alt="Generated" className="w-full rounded-lg" />
                  ) : (
                    <video src={selectedResult.url} controls className="w-full rounded-lg" />
                  )}
                  <Button size="sm" className="absolute top-2 right-2"
                    onClick={() => downloadItem(selectedResult.url, selectedResult.type)}>
                    <Download className="h-3.5 w-3.5 mr-1" />Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-20 text-center">
                {mode === 'image' ? (
                  <>
                    <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground font-medium">Start creating or drop media</p>
                    <p className="text-xs text-muted-foreground mt-1">Text-to-image or image-to-image with references</p>
                  </>
                ) : (
                  <>
                    <Film className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground font-medium">Create videos with Veo 3.1</p>
                    <p className="text-xs text-muted-foreground mt-1">Text-to-video, frames-to-video, or ingredients</p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Gallery */}
          {gallery.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">History</p>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {gallery.map((item, i) => (
                  <div
                    key={i}
                    className={`relative aspect-square rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity ${
                      selectedResult?.url === item.url ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedResult(item)}
                  >
                    {item.type === 'image' ? (
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Film className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    {item.type === 'video' && (
                      <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 rounded">Video</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
