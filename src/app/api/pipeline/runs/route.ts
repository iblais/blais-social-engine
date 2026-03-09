import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const channelId = req.nextUrl.searchParams.get('channelId');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);

    let query = supabase
      .from('pipeline_runs')
      .select(`
        *,
        pipeline_channels!inner (name, slug, user_id)
      `)
      .eq('pipeline_channels.user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (channelId) {
      query = query.eq('channel_id', channelId);
    }

    const { data: runs, error } = await query;

    if (error) throw error;

    return NextResponse.json({ runs: runs || [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { channelId, config } = await req.json();
    if (!channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 });

    // Verify the channel belongs to this user
    const { data: channel, error: channelError } = await supabase
      .from('pipeline_channels')
      .select('id')
      .eq('id', channelId)
      .eq('user_id', user.id)
      .single();

    if (channelError || !channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const { data: run, error } = await supabase
      .from('pipeline_runs')
      .insert({
        user_id: user.id,
        channel_id: channelId,
        status: 'pending',
        config: config || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Verify the run belongs to a channel owned by this user
    const { data: run, error: runError } = await supabase
      .from('pipeline_runs')
      .select('channel_id, pipeline_channels!inner (user_id)')
      .eq('id', id)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const channelData = run.pipeline_channels as unknown as { user_id: string };
    if (channelData.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { error } = await supabase
      .from('pipeline_runs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
