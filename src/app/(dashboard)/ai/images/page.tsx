'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ImagePlus, Download, Sparkles, X, Upload } from 'lucide-react';

export default function AIImagesPage() {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('');
  const [image, setImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [gallery, setGallery] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleReferenceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (referenceImages.length + files.length > 10) {
      toast.error('Maximum 10 reference images');
      return;
    }
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReferenceImages((prev) => [...prev, ev.target?.result as string].slice(0, 10));
      };
      reader.readAsDataURL(file);
    });
    if (e.target) e.target.value = '';
  }

  function removeReference(index: number) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function generate() {
    if (!prompt.trim()) { toast.error('Enter a prompt'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          style,
          referenceImages: referenceImages.length ? referenceImages : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImage(data.image);
      setGallery(prev => [data.image, ...prev].slice(0, 20));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function downloadImage(dataUrl: string) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `ai-image-${Date.now()}.png`;
    link.click();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Image Generator</h1>
        <p className="text-muted-foreground">Create and transform images with Gemini AI</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Generate Image</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="min-h-[120px]"
                  placeholder="A cozy coffee shop interior with warm lighting, plants, and a latte art..." />
              </div>
              <div className="space-y-2">
                <Label>Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="photorealistic">Photorealistic</SelectItem>
                    <SelectItem value="minimalist flat design">Minimalist</SelectItem>
                    <SelectItem value="watercolor painting">Watercolor</SelectItem>
                    <SelectItem value="digital art illustration">Digital Art</SelectItem>
                    <SelectItem value="3D render">3D Render</SelectItem>
                    <SelectItem value="vintage retro aesthetic">Vintage</SelectItem>
                    <SelectItem value="neon cyberpunk">Cyberpunk</SelectItem>
                    <SelectItem value="oil painting">Oil Painting</SelectItem>
                    <SelectItem value="anime illustration">Anime</SelectItem>
                    <SelectItem value="pencil sketch">Sketch</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reference images */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Reference Images (optional)</Label>
                  <span className="text-xs text-muted-foreground">{referenceImages.length}/10</span>
                </div>
                <p className="text-xs text-muted-foreground">Upload images as style/composition references for image-to-image generation</p>

                {referenceImages.length > 0 && (
                  <div className="grid grid-cols-5 gap-1.5">
                    {referenceImages.map((img, i) => (
                      <div key={i} className="relative aspect-square rounded-md overflow-hidden border">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeReference(i)}
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] hover:bg-black/80"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {referenceImages.length < 10 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Upload Reference{referenceImages.length > 0 ? 's' : ''}
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleReferenceUpload}
                />
              </div>

              <Button onClick={generate} disabled={loading} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                {loading ? 'Generating...' : referenceImages.length ? 'Generate with References' : 'Generate Image'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {image ? (
            <Card>
              <CardContent className="pt-6">
                <div className="relative">
                  <img src={image} alt="AI Generated" className="w-full rounded-lg" />
                  <Button size="sm" className="absolute top-2 right-2" onClick={() => downloadImage(image)}>
                    <Download className="h-3.5 w-3.5 mr-1" />Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-20 text-center">
                <ImagePlus className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Your generated image will appear here</p>
                <p className="text-xs text-muted-foreground mt-1">Text-to-image or upload references for image-to-image</p>
              </CardContent>
            </Card>
          )}

          {gallery.length > 1 && (
            <div>
              <p className="text-sm font-medium mb-2">Recent Generations</p>
              <div className="grid grid-cols-4 gap-2">
                {gallery.slice(1, 9).map((img, i) => (
                  <img key={i} src={img} alt="" className="rounded-lg cursor-pointer hover:opacity-80 aspect-square object-cover"
                    onClick={() => setImage(img)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
