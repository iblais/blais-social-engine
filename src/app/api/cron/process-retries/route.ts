import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Re-queue posts with retry status that have been waiting at least 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: retryPosts, error } = await supabase
    .from('posts')
    .select('id, retry_count, scheduled_at')
    .eq('status', 'retry')
    .lt('updated_at', fiveMinutesAgo)
    .lt('retry_count', 3)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!retryPosts?.length) {
    return NextResponse.json({ message: 'No retries pending', processed: 0 });
  }

  // Set them back to scheduled with the same scheduled_at (or now)
  const ids = retryPosts.map((p) => p.id);

  const { error: updateError } = await supabase
    .from('posts')
    .update({ status: 'scheduled', scheduled_at: new Date().toISOString() })
    .in('id', ids);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Done', processed: ids.length });
}
