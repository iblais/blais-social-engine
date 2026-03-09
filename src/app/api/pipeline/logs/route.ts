import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const runId = req.nextUrl.searchParams.get('runId');
    if (!runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

    // Verify the run belongs to a channel owned by this user
    const { data: run, error: runError } = await supabase
      .from('pipeline_runs')
      .select('id, pipeline_channels!inner (user_id)')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const channelData = run.pipeline_channels as unknown as { user_id: string };
    if (channelData.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: logs, error } = await supabase
      .from('pipeline_logs')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ logs: logs || [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
