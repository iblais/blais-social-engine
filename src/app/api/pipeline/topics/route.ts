import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const channelId = req.nextUrl.searchParams.get('channelId');
    const runId = req.nextUrl.searchParams.get('runId');
    const status = req.nextUrl.searchParams.get('status');

    let query = supabase
      .from('scouted_topics')
      .select('*')
      .eq('user_id', user.id)
      .order('total_score', { ascending: false });

    if (channelId) {
      query = query.eq('channel_id', channelId);
    }

    if (runId) {
      query = query.eq('run_id', runId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: topics, error } = await query;

    if (error) throw error;

    return NextResponse.json({ topics: topics || [] });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, status, script, research_brief } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (script !== undefined) updates.script = script;
    if (research_brief !== undefined) updates.research_brief = research_brief;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('scouted_topics')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ topic: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
