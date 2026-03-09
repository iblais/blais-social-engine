import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

/**
 * POST /api/posts/publish
 * Triggers the post-due cron internally (server-side) so the client
 * doesn't need CRON_SECRET. Requires authenticated user session cookie.
 */
export async function POST(req: NextRequest) {
  // Verify user is authenticated via cookie
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Call post-due cron internally
  const baseUrl = req.nextUrl.origin;
  const res = await fetch(`${baseUrl}/api/cron/post-due`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });

  const data = await res.json();
  return NextResponse.json(data);
}
