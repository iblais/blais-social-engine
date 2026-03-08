import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const YT_API = 'https://www.googleapis.com/youtube/v3';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId, updates } = await req.json();
  if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  if (!updates?.length) return NextResponse.json({ error: 'updates array is required' }, { status: 400 });

  // Get YouTube account
  const { data: account } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('platform', 'youtube')
    .single();

  if (!account) return NextResponse.json({ error: 'YouTube account not found' }, { status: 404 });
  if (!account.access_token) return NextResponse.json({ error: 'No OAuth token for this account' }, { status: 400 });

  let updated = 0;
  let failed = 0;
  const errors: { videoId: string; error: string }[] = [];

  for (const update of updates as { videoId: string; title?: string; description?: string; tags?: string[] }[]) {
    try {
      // First GET the video's current snippet
      const getRes = await fetch(
        `${YT_API}/videos?part=snippet&id=${update.videoId}`,
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      );
      if (!getRes.ok) throw new Error(`Failed to fetch video ${update.videoId}: ${getRes.status}`);
      const getData = await getRes.json();

      const video = getData.items?.[0];
      if (!video) throw new Error(`Video ${update.videoId} not found`);

      const currentSnippet = video.snippet as Record<string, unknown>;

      // Merge updates into existing snippet
      const updatedSnippet: Record<string, unknown> = {
        title: update.title ?? currentSnippet.title,
        description: update.description ?? currentSnippet.description,
        tags: update.tags ?? currentSnippet.tags,
        categoryId: currentSnippet.categoryId,
      };

      // PUT update
      const putRes = await fetch(
        `${YT_API}/videos?part=snippet`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${account.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: update.videoId,
            snippet: updatedSnippet,
          }),
        }
      );

      if (!putRes.ok) {
        const errBody = await putRes.json().catch(() => ({}));
        throw new Error(
          (errBody as Record<string, { message?: string }>)?.error?.message || `YouTube API error: ${putRes.status}`
        );
      }

      updated++;
    } catch (err) {
      failed++;
      errors.push({ videoId: update.videoId, error: (err as Error).message });
      console.error(`YouTube bulk-update error for ${update.videoId}:`, (err as Error).message);
    }
  }

  return NextResponse.json({ updated, failed, errors });
}
