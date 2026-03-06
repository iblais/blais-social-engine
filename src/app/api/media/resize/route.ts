import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import sharp from 'sharp';

export const maxDuration = 60;

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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];
  const selectedPresets = (formData.get('presets') as string)?.split(',').filter(Boolean) || Object.keys(PRESETS);
  const fitMode = (formData.get('fit') as string) || 'cover';
  const bgColor = (formData.get('bgColor') as string) || '#000000';

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > 10) {
    return NextResponse.json({ error: 'Max 10 images per batch' }, { status: 400 });
  }

  const validPresets = selectedPresets.filter((p) => PRESETS[p]);
  if (!validPresets.length) {
    return NextResponse.json({ error: 'No valid presets selected' }, { status: 400 });
  }

  const timestamp = Date.now();
  const results: Array<{
    originalName: string;
    preset: string;
    label: string;
    width: number;
    height: number;
    url: string;
    storagePath: string;
    size: number;
  }> = [];

  try {
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const baseName = file.name.replace(/\.[^.]+$/, '');

      for (const presetKey of validPresets) {
        const preset = PRESETS[presetKey];
        const fit = fitMode === 'cover' ? 'cover' : fitMode === 'contain' ? 'contain' : 'fill';

        const resized = await sharp(buffer)
          .resize(preset.width, preset.height, {
            fit,
            background: bgColor,
          })
          .jpeg({ quality: 90 })
          .toBuffer();

        const storagePath = `resized/${user.id}/${timestamp}/${baseName}_${presetKey}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(storagePath, resized, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error(`Upload failed for ${storagePath}:`, uploadError.message);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(storagePath);

        results.push({
          originalName: file.name,
          preset: presetKey,
          label: preset.label,
          width: preset.width,
          height: preset.height,
          url: publicUrl,
          storagePath,
          size: resized.length,
        });
      }
    }

    return NextResponse.json({ results, presets: PRESETS });
  } catch (err) {
    console.error('Resize error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ presets: PRESETS });
}
