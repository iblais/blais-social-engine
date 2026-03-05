'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ImagePlus, Download, Sparkles } from 'lucide-react';

export default function AIImagesPage() {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('');
  const [image, setImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [gallery, setGallery] = useState<string[]>([]);

  async function generate() {
    if (!prompt.trim()) { toast.error('Enter a prompt'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style }),
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
        <p className="text-muted-foreground">Create images for your posts with Gemini AI</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
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
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={loading} className="w-full">
              <Sparkles className="h-4 w-4 mr-2" />
              {loading ? 'Generating...' : 'Generate Image'}
            </Button>
          </CardContent>
        </Card>

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
