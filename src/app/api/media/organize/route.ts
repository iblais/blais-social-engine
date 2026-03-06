import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];
  const brandSlug = formData.get('brandSlug') as string;
  const track = formData.get('track') as string;
  const batch = formData.get('batch') as string;
  const dayNum = parseInt(formData.get('dayNum') as string) || 1;

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (!brandSlug || !track || !batch) {
    return NextResponse.json({ error: 'Brand, track, and batch are required' }, { status: 400 });
  }

  const results: Array<{ fileName: string; destPath: string; url: string }> = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const slideNum = i + 1;
      const destPath = `content/${brandSlug}/${track}/${batch}/D${dayNum}/slide_${slideNum}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(destPath, file, { upsert: true });

      if (uploadError) {
        console.error(`Upload failed: ${destPath}`, uploadError.message);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(destPath);

      // Log the sort action
      await supabase.from('file_sort_log').insert({
        user_id: user.id,
        file_name: file.name,
        dest_path: destPath,
        brand_slug: brandSlug,
        track,
        batch,
        day_num: dayNum,
      });

      results.push({ fileName: file.name, destPath, url: publicUrl });
    }

    return NextResponse.json({ results, count: results.length });
  } catch (err) {
    console.error('Organize error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const brandSlug = req.nextUrl.searchParams.get('brand');

  try {
    // Get folder structure from file_sort_log
    let query = supabase
      .from('file_sort_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (brandSlug) {
      query = query.eq('brand_slug', brandSlug);
    }

    const { data: logs } = await query.limit(500);

    // Build folder tree from logs
    const tree: Record<string, Record<string, Record<string, number>>> = {};
    for (const log of logs || []) {
      if (!log.brand_slug) continue;
      if (!tree[log.brand_slug]) tree[log.brand_slug] = {};
      const trackKey = log.track || 'unsorted';
      if (!tree[log.brand_slug][trackKey]) tree[log.brand_slug][trackKey] = {};
      const batchKey = log.batch || 'default';
      tree[log.brand_slug][trackKey][batchKey] = (tree[log.brand_slug][trackKey][batchKey] || 0) + 1;
    }

    // Get recent activity
    const recent = (logs || []).slice(0, 20);

    return NextResponse.json({ tree, recent });
  } catch (err) {
    console.error('Organize GET error:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
